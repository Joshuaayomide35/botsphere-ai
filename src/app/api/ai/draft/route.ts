import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";
import { aiConfigured, draftReply } from "@/lib/ai/openrouter";
import { buildUserPayload } from "@/lib/ai/payload";

export const dynamic = "force-dynamic";

/** Inbox "Draft with AI" co-pilot. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireApiContext();
    if (!aiConfigured()) throw new ApiError("AI is not configured. Set OPENROUTER_API_KEY on the server.", 503);
    const { conversationId, hint } = (await req.json()) as { conversationId?: string; hint?: string };
    if (!conversationId) throw new ApiError("conversationId is required");
    const payload = await buildUserPayload(ctx.supabase, ctx.workspaceId, { conversationId });
    const text = await draftReply(payload, hint);
    return NextResponse.json({ text });
  } catch (e) {
    return handleApiError(e);
  }
}
