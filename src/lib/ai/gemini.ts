import "server-only";
import { env } from "@/lib/env";

/**
 * Google Gemini (AI Studio key) for media understanding and speech:
 *  - hear WhatsApp voice notes (.ogg/opus) → transcript
 *  - see images customers send → short description
 *  - speak replies (Gemini TTS) → WAV audio, which Evolution converts to a native voice note
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured() {
  return Boolean(env.geminiKey());
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function generate(model: string, parts: Part[], generationConfig?: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.geminiKey() },
    body: JSON.stringify({ contents: [{ role: "user", parts }], ...(generationConfig ? { generationConfig } : {}) }),
    signal: AbortSignal.timeout(60000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Gemini: ${j.error?.message ?? res.status}`);
  return j.candidates?.[0]?.content?.parts ?? [];
}

const cleanMime = (m: string) => m.split(";")[0].trim() || "application/octet-stream";

export async function geminiTranscribe(audioBase64: string, mimetype: string) {
  const parts = await generate(env.geminiMediaModel(), [
    { text: "Transcribe this WhatsApp voice note exactly, in the language spoken. Output only the transcript text. If it is silent or unintelligible, output: (inaudible)" },
    { inline_data: { mime_type: cleanMime(mimetype), data: audioBase64 } },
  ]);
  return parts.map((p) => p.text ?? "").join("").trim();
}

export async function geminiDescribeImage(imageBase64: string, mimetype: string, caption?: string) {
  const parts = await generate(env.geminiMediaModel(), [
    {
      text: `A customer sent this image to a business on WhatsApp${caption ? ` with the caption "${caption}"` : ""}. Describe what it shows in 1-3 sentences so a sales assistant can respond. Include any readable text, product names, prices, or problems visible.`,
    },
    { inline_data: { mime_type: cleanMime(mimetype), data: imageBase64 } },
  ]);
  return parts.map((p) => p.text ?? "").join("").trim();
}

/** Gemini TTS returns raw 16-bit PCM (24 kHz mono); wrap it in a WAV header. */
export async function geminiSpeak(text: string, voiceName: string) {
  const parts = await generate(
    env.geminiTtsModel(),
    [{ text }],
    { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  );
  const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error("Gemini TTS returned no audio");
  const pcm = Buffer.from(inline.data, "base64");
  const rate = Number(inline.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
  return { base64: pcmToWav(pcm, rate).toString("base64"), durationSec: Math.max(1, Math.round(pcm.length / (rate * 2))) };
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bits = 16) {
  const h = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bits) / 8;
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
