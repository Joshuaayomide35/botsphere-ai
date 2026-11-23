import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";
import { synthesize, ttsConfigured } from "@/lib/ai/voice";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireApiContext();
    if (!ttsConfigured()) throw new ApiError("Voice notes need OPENAI_API_KEY or ELEVENLABS_API_KEY on the server.", 503);
    const { voiceId, text } = (await req.json()) as { voiceId?: string; text?: string };
    const sample = (text?.trim() || "Hi! Thanks for reaching out. I'd be happy to help you book an appointment this week.").slice(0, 300);
    const audio = await synthesize(sample, voiceId);
    const bytes = Buffer.from(audio.base64, "base64");
    const isMp3 = bytes[0] === 0x49 || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": isMp3 ? "audio/mpeg" : "audio/ogg", "cache-control": "no-store" } });
  } catch (e) {
    return handleApiError(e);
  }
}
