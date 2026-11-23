import "server-only";
import { env } from "@/lib/env";
import type { AgentConfig, HandoverRule, MediaType, SenderType } from "@/lib/types";

/** The JSON shape returned by wa_ai_context / wa_ai_follow_up_context / the sandbox. */
export interface AiPayload {
  workspace_id: string;
  conversation_id?: string;
  follow_up_count?: number;
  business: { name: string; timezone: string; owner_alert_phone: string | null };
  contact: { name: string | null; phone: string; stage: string; deal_value: number };
  config: Partial<AgentConfig> | null;
  knowledge: { title: string; content: string }[];
  media: { id: string; title: string; description: string; url: string; mime: string }[];
  history: { sender_type: SenderType; media_type: MediaType; content_text: string | null; transcript_text: string | null; created_at: string }[];
  trigger?: { id: string; media_type: MediaType; wa_message_id: string | null; text: string | null; transcript: string | null };
}

export interface AiDecision {
  reply: string;
  handover: boolean;
  handoverReason: string | null;
  sendMedia: string[];
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function aiConfigured() {
  return Boolean(env.openrouterKey());
}

export async function chatCompletion(messages: ChatMessage[], model: string, opts: { json?: boolean; temperature?: number; maxTokens?: number } = {}) {
  const key = env.openrouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY is not set. Add it to .env.local to enable AI replies.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "BotSphere AI",
    },
    body: JSON.stringify({
      model: model || "openai/gpt-4o-mini",
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 600,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(45000),
  });
  const json = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `OpenRouter request failed (${res.status})`);
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

const TONES: Record<string, string> = {
  warm: "warm, friendly and reassuring",
  professional: "professional, concise and polished",
  playful: "upbeat and playful, with the occasional emoji",
  direct: "direct and efficient, no fluff",
  luxury: "elegant, attentive and premium",
};

function knowledgeBlock(items: AiPayload["knowledge"]) {
  if (!items.length) return "No knowledge base documents were provided. If you don't know something, say a teammate will confirm.";
  let budget = 40000;
  const parts: string[] = [];
  for (const k of items) {
    if (budget <= 0) break;
    const chunk = k.content.slice(0, budget);
    budget -= chunk.length;
    parts.push(`### ${k.title}\n${chunk}`);
  }
  return parts.join("\n\n");
}

export function buildSystemPrompt(p: AiPayload, mode: "reply" | "follow_up" | "draft") {
  const cfg = p.config ?? {};
  const rules = ((cfg.handover_rules ?? []) as HandoverRule[]).filter((r) => r.enabled);
  const now = new Date().toLocaleString("en-GB", { timeZone: p.business.timezone || "UTC", dateStyle: "full", timeStyle: "short" });

  return [
    cfg.system_prompt?.trim() || `You are the WhatsApp assistant for ${p.business.name}.`,
    "",
    `# Identity\nYour name is ${cfg.bot_name || "Assistant"}. You work for ${p.business.name}. Tone: ${TONES[cfg.tone ?? "warm"] ?? cfg.tone}.`,
    `Current local time for the business: ${now} (${p.business.timezone}).`,
    `# Customer\nName: ${p.contact.name ?? "unknown"} · Phone: ${p.contact.phone} · Pipeline stage: ${p.contact.stage}.`,
    `# Knowledge base (the ONLY source of facts about prices, services and policies)\n${knowledgeBlock(p.knowledge)}`,
    p.media.length
      ? `# Media library (images you may send when the customer asks to see something)\n${p.media.map((m) => `- id=${m.id} · ${m.title}${m.description ? ` — ${m.description}` : ""}`).join("\n")}`
      : "",
    mode !== "draft"
      ? `# Handover rules\nHand the chat to a human (set "handover": true) when any of these apply:\n${
          rules.length ? rules.map((r) => `- ${r.label}: ${r.description}`).join("\n") : "- The customer explicitly asks for a human."
        }\nWhen handing over, reply with one short, kind message telling the customer a team member will follow up shortly.`
      : "",
    "# WhatsApp style\n- Plain text, no markdown headings or tables. Short paragraphs.\n- Reply in the customer's language.\n- Never invent facts that are not in the knowledge base.",
    mode === "follow_up"
      ? `# Task\nThe customer stopped replying after your last message. Write ONE short, natural follow-up nudge (max 35 words) to re-engage them. Do not repeat your previous message.${
          cfg.follow_up_message?.trim() ? `\nGuidance from the business: ${cfg.follow_up_message.trim()}` : ""
        }`
      : "",
    mode === "draft"
      ? "# Task\nDraft the next reply a human agent could send to this customer. Output only the message text."
      : `# Output\nRespond with a JSON object only:\n{"reply": string, "handover": boolean, "handover_reason": string | null, "send_media": string[] /* media ids, usually [] */}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function historyToMessages(history: AiPayload["history"]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const h of history) {
    if (h.sender_type === "system") continue;
    const body =
      h.media_type === "audio"
        ? `[voice note] ${h.transcript_text ?? "(no transcript)"}`
        : h.media_type === "image"
          ? `[image] ${h.content_text ?? ""}`
          : (h.content_text ?? "");
    if (!body.trim()) continue;
    const role = h.sender_type === "contact" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${body}`;
    else out.push({ role, content: body });
  }
  return out;
}

function parseDecision(raw: string, mediaIds: Set<string>): AiDecision {
  const m = raw.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : raw) as { reply?: unknown; handover?: unknown; handover_reason?: unknown; send_media?: unknown };
    return {
      reply: String(j.reply ?? "").trim(),
      handover: j.handover === true,
      handoverReason: j.handover_reason ? String(j.handover_reason).slice(0, 200) : null,
      sendMedia: Array.isArray(j.send_media) ? j.send_media.map(String).filter((id) => mediaIds.has(id)).slice(0, 3) : [],
    };
  } catch {
    return { reply: raw.trim(), handover: false, handoverReason: null, sendMedia: [] };
  }
}

/** Generate the next AI turn for a conversation payload. */
export async function generateReply(p: AiPayload, mode: "reply" | "follow_up" = "reply"): Promise<AiDecision> {
  const model = p.config?.llm_model || "openai/gpt-4o-mini";
  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(p, mode) }, ...historyToMessages(p.history)];
  if (messages[messages.length - 1]?.role !== "user") {
    messages.push({ role: "user", content: mode === "follow_up" ? "(The customer has not replied. Write the follow-up now.)" : "(Continue the conversation.)" });
  }
  const raw = await chatCompletion(messages, model, { json: true });
  return parseDecision(raw, new Set(p.media.map((x) => x.id)));
}

export async function draftReply(p: AiPayload, hint?: string) {
  const model = p.config?.llm_model || "openai/gpt-4o-mini";
  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(p, "draft") }, ...historyToMessages(p.history)];
  messages.push({
    role: "user",
    content: hint?.trim() ? `(Draft the agent's reply. The agent started typing: "${hint.trim()}" — improve and complete it.)` : "(Draft the agent's next reply.)",
  });
  return chatCompletion(messages, model, { temperature: 0.6 });
}
