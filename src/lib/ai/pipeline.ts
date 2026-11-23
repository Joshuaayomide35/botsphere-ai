import "server-only";
import { createAnonClient } from "@/lib/supabase/anon";
import { evolution, toWaNumber } from "@/lib/adapters/evolution";
import { aiConfigured, generateReply, type AiDecision, type AiPayload } from "@/lib/ai/openrouter";
import { describeImage, synthesize, transcribe, ttsConfigured } from "@/lib/ai/voice";
import { sleep } from "@/lib/utils";

interface Creds {
  instance: string;
  secret: string;
}

const log = (...a: unknown[]) => console.log("[ai]", ...a);

/**
 * Inbound pipeline for one contact message:
 * voice note → transcript, then (if the AI is on duty for this chat) generate, pace, send and record the reply.
 */
export async function handleInbound(
  c: Creds,
  messageId: string,
  waId: string,
  media: "text" | "audio" | "image",
  inline: { base64: string | null; mimetype: string | null; caption?: string } = { base64: null, mimetype: null },
) {
  const db = createAnonClient();

  // Hear voice notes / see images before the AI answers, so it never says "I can't hear/see that".
  if (media === "audio" || media === "image") {
    let understood: string;
    try {
      const file = inline.base64
        ? { base64: inline.base64, mimetype: inline.mimetype ?? (media === "audio" ? "audio/ogg" : "image/jpeg") }
        : await evolution.getMediaBase64(c.instance, waId);
      const bytes = Buffer.from(file.base64, "base64");
      understood =
        media === "audio"
          ? (await transcribe(bytes, file.mimetype)) || "(inaudible)"
          : await describeImage(bytes, file.mimetype, inline.caption || undefined);
    } catch (e) {
      log(`${media} processing failed:`, (e as Error).message);
      understood = media === "audio" ? "(voice note could not be transcribed)" : "(image could not be analysed)";
    }
    await db.rpc("wa_ai_store_transcript", { p_instance: c.instance, p_secret: c.secret, p_message_id: messageId, p_transcript: understood, p_media_url: null });
  }

  if (!aiConfigured()) return;

  // Short debounce so a burst of messages gets one answer (wa_ai_context returns null if a newer message exists).
  await sleep(1500);
  const { data: payload, error } = await db.rpc("wa_ai_context", { p_instance: c.instance, p_secret: c.secret, p_message_id: messageId });
  if (error) return log("context error:", error.message);
  if (!payload) return;
  const p = payload as AiPayload;

  let decision: AiDecision;
  try {
    decision = await generateReply(p, "reply");
  } catch (e) {
    return log("generation failed:", (e as Error).message);
  }
  if (!decision.reply && !decision.handover) return;

  const mode = p.config?.voice_note_mode ?? "never";
  const wantsVoice = !decision.handover && ttsConfigured() && (mode === "always" || (mode === "mirror_user" && p.trigger?.media_type === "audio"));
  await deliver(c, p, decision, decision.handover ? "handover" : "reply", wantsVoice);
}

/** Ghosting follow-up for one conversation claimed by the cron. */
export async function handleFollowUp(c: Creds, conversationId: string) {
  if (!aiConfigured()) return;
  const db = createAnonClient();
  const { data: payload, error } = await db.rpc("wa_ai_follow_up_context", { p_instance: c.instance, p_secret: c.secret, p_conversation: conversationId });
  if (error || !payload) return;
  const p = payload as AiPayload;
  const decision = await generateReply(p, "follow_up");
  if (!decision.reply) return;
  await deliver(c, p, { ...decision, handover: false, sendMedia: [] }, "follow_up", false);
}

async function deliver(c: Creds, p: AiPayload, d: AiDecision, kind: "reply" | "handover" | "follow_up", voice: boolean) {
  const db = createAnonClient();
  const conv = p.conversation_id!;
  const number = toWaNumber(p.contact.phone);

  // Expensive work first, then claim the send slot (the claim also re-checks AI on / human takeover).
  let audio: { base64: string; durationSec: number } | null = null;
  if (voice && d.reply) {
    try {
      audio = await synthesize(d.reply, p.config?.voice_id);
    } catch (e) {
      log("TTS failed, falling back to text:", (e as Error).message);
    }
  }

  const { data: claimed } = await db.rpc("wa_ai_claim_send", { p_instance: c.instance, p_secret: c.secret, p_conversation: conv });
  if (!claimed) return log("send skipped: AI no longer active for", conv);

  let waId: string | null = null;
  if (d.reply) {
    const delay = Math.min(4000, Math.max(2000, p.config?.typing_delay_ms ?? 2500));
    await evolution.sendPresence(c.instance, number, audio ? "recording" : "composing", delay);
    await sleep(delay);
    try {
      waId = audio ? (await evolution.sendAudio(c.instance, number, audio.base64)).id : (await evolution.sendText(c.instance, number, d.reply)).id;
    } catch (e) {
      log("send failed:", (e as Error).message);
      await db.rpc("wa_ai_record", { p_instance: c.instance, p_secret: c.secret, p_conversation: conv, p_kind: "error", p_text: "", p_media: "text", p_duration: null, p_wa_id: null, p_reason: null });
      return;
    }
  }

  await db.rpc("wa_ai_record", {
    p_instance: c.instance,
    p_secret: c.secret,
    p_conversation: conv,
    p_kind: kind,
    p_text: d.reply,
    p_media: audio ? "audio" : "text",
    p_duration: audio?.durationSec ?? null,
    p_wa_id: waId,
    p_reason: d.handoverReason,
  });

  for (const id of d.sendMedia) {
    const item = p.media.find((m) => m.id === id);
    if (!item) continue;
    try {
      const sent = await evolution.sendImage(c.instance, number, item.url, item.mime, item.title);
      await db.rpc("wa_ai_record_media", { p_instance: c.instance, p_secret: c.secret, p_conversation: conv, p_media_id: id, p_wa_id: sent.id });
    } catch (e) {
      log("media send failed:", (e as Error).message);
    }
  }

  if (kind === "handover" && p.business.owner_alert_phone) {
    const who = p.contact.name ? `${p.contact.name} (${p.contact.phone})` : p.contact.phone;
    try {
      await evolution.sendText(
        c.instance,
        toWaNumber(p.business.owner_alert_phone),
        `⚠️ BotSphere: ${who} needs a human.\nReason: ${d.handoverReason ?? "handover rule triggered"}`,
      );
    } catch (e) {
      log("owner alert failed:", (e as Error).message);
    }
  }
}
