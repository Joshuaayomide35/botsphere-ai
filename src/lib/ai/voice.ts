import "server-only";
import { env } from "@/lib/env";
import { VOICES } from "@/lib/types";

/** Speech-to-text for inbound WhatsApp voice notes (.ogg/opus). Deepgram if configured, else OpenAI Whisper. */
export async function transcribe(audio: Buffer, mimetype = "audio/ogg"): Promise<string> {
  if (env.deepgramKey()) {
    const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&detect_language=true", {
      method: "POST",
      headers: { authorization: `Token ${env.deepgramKey()}`, "content-type": mimetype.split(";")[0] },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(60000),
    });
    const j = (await res.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] }; err_msg?: string };
    if (!res.ok) throw new Error(j.err_msg ?? `Deepgram failed (${res.status})`);
    return j.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  }
  if (env.openaiKey()) {
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
  }
  throw new Error("No speech-to-text provider configured (set OPENAI_API_KEY or DEEPGRAM_API_KEY).");
}

export function ttsConfigured() {
  return Boolean(env.openaiKey() || env.elevenlabsKey());
}

/**
 * Text-to-speech for outbound voice notes. Returns base64 audio; Evolution converts it to a native
 * WhatsApp PTT (.ogg/opus). voice_id is either one of our preset ids or a raw ElevenLabs voice id.
 */
export async function synthesize(text: string, voiceId?: string | null): Promise<{ base64: string; durationSec: number }> {
  const durationSec = Math.max(1, Math.round(text.split(/\s+/).length / 2.6));
  const preset = VOICES.find((v) => v.id === voiceId);

  if (env.elevenlabsKey() && voiceId && !preset) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": env.elevenlabsKey(), "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`ElevenLabs failed (${res.status}): ${await res.text()}`);
    return { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), durationSec };
  }
  if (env.openaiKey()) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${env.openaiKey()}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: preset?.openai ?? "nova", input: text, response_format: "opus" }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`OpenAI TTS failed (${res.status}): ${await res.text()}`);
    return { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), durationSec };
  }
  throw new Error("No text-to-speech provider configured (set OPENAI_API_KEY or ELEVENLABS_API_KEY).");
}
