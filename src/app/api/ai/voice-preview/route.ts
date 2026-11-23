import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";
import { synthesize, ttsConfigured } from "@/lib/ai/voice";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireApiContext();
    if (!ttsConfigured()) throw new ApiError("Voice notes need GEMINI_API_KEY, OPENAI_API_KEY or ELEVENLABS_API_KEY on the server.", 503);
    const { voiceId, text } = (await req.json()) as { voiceId?: string; text?: string };
    const sample = (text?.trim() || "Hi! Thanks for reaching out. I'd be happy to help you book an appointment this week.").slice(0, 300);
    const audio = await synthesize(sample, voiceId);
    const bytes = Buffer.from(audio.base64, "base64");
    const head = bytes.subarray(0, 4).toString("ascii");
    const type = head === "RIFF" ? "audio/wav" : head === "OggS" ? "audio/ogg" : "audio/mpeg";
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": type, "cache-control": "no-store" } });
  } catch (e) {
    return handleApiError(e);
  }
}
