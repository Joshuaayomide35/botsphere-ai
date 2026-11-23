import "server-only";
import { env } from "@/lib/env";
import { VOICES } from "@/lib/types";
import { geminiConfigured, geminiDescribeImage, geminiSpeak, geminiTranscribe } from "./gemini";

/**
 * Hearing (speech-to-text) for inbound WhatsApp voice notes (.ogg/opus).
 * Order: Gemini (GEMINI_API_KEY) → Deepgram → OpenAI Whisper.
 */
export async function transcribe(audio: Buffer, mimetype = "audio/ogg"): Promise<string> {
  const errors: string[] = [];
  if (geminiConfigured()) {
    try {
      return await geminiTranscribe(audio.toString("base64"), mimetype);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (env.deepgramKey()) {
    try {
      const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&detect_language=true", {
        method: "POST",
        headers: { authorization: `Token ${env.deepgramKey()}`, "content-type": mimetype.split(";")[0] },
        body: new Uint8Array(audio),
        signal: AbortSignal.timeout(60000),
      });
      const j = (await res.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] }; err_msg?: string };
      if (!res.ok) throw new Error(j.err_msg ?? `Deepgram failed (${res.status})`);
      return j.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (env.openaiKey()) {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: mimetype.split(";")[0] }), "voice.ogg");
      form.append("model", "whisper-1");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${env.openaiKey()}` },
        body: form,
        signal: AbortSignal.timeout(60000),
      });
      const j = (await res.json()) as { text?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(j.error?.message ?? `Whisper failed (${res.status})`);
      return j.text?.trim() ?? "";
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors.length ? errors.join(" | ") : "No speech-to-text provider configured (set GEMINI_API_KEY, or OPENAI_API_KEY / DEEPGRAM_API_KEY).");
}

/** Seeing: a short description of an image a customer sent. Gemini direct, else an OpenRouter vision model. */
export async function describeImage(image: Buffer, mimetype: string, caption?: string): Promise<string> {
  if (geminiConfigured()) return geminiDescribeImage(image.toString("base64"), mimetype, caption);
  if (!env.openrouterKey()) throw new Error("No vision provider configured (set GEMINI_API_KEY or OPENROUTER_API_KEY).");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.openrouterKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.openrouterVisionModel(),
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `A customer sent this image to a business on WhatsApp${caption ? ` with the caption "${caption}"` : ""}. Describe what it shows in 1-3 sentences, including any readable text, products, prices or problems.` },
            { type: "image_url", image_url: { url: `data:${mimetype.split(";")[0]};base64,${image.toString("base64")}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const j = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(j.error?.message ?? `OpenRouter vision failed (${res.status})`);
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

export function ttsConfigured() {
  return Boolean(geminiConfigured() || env.openaiKey() || env.elevenlabsKey());
}

/**
 * Speaking: text-to-speech for outbound voice notes. Returns base64 audio; Evolution converts it to a native
 * WhatsApp voice note. Order: custom ElevenLabs voice id → Gemini TTS → OpenAI TTS.
 */
export async function synthesize(text: string, voiceId?: string | null): Promise<{ base64: string; durationSec: number }> {
  const durationSec = Math.max(1, Math.round(text.split(/\s+/).length / 2.6));
  const preset = VOICES.find((v) => v.id === voiceId);
  const errors: string[] = [];

  if (env.elevenlabsKey() && voiceId && !preset) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": env.elevenlabsKey(), "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) return { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), durationSec };
    errors.push(`ElevenLabs failed (${res.status})`);
  }
  if (geminiConfigured()) {
    try {
      return await geminiSpeak(text, preset?.gemini ?? "Kore");
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (env.openaiKey()) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${env.openaiKey()}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: preset?.openai ?? "nova", input: text, response_format: "opus" }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) return { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), durationSec };
    errors.push(`OpenAI TTS failed (${res.status})`);
  }
  throw new Error(errors.length ? errors.join(" | ") : "No text-to-speech provider configured (set GEMINI_API_KEY, OPENAI_API_KEY or ELEVENLABS_API_KEY).");
}
