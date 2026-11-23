import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";
import { aiConfigured, generateReply } from "@/lib/ai/openrouter";
import { buildUserPayload } from "@/lib/ai/payload";
import type { AgentConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Agent Studio test chat: runs the real prompt/knowledge pipeline against unsaved settings. Nothing is sent or stored. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireApiContext();
    if (!aiConfigured()) throw new ApiError("AI is not configured. Set OPENROUTER_API_KEY in .env.local and restart the app.", 503);
    const { messages, config } = (await req.json()) as {
      messages?: { role: "user" | "assistant"; content: string }[];
      config?: Partial<AgentConfig>;
    };
    if (!messages?.length) throw new ApiError("messages are required");

    const payload = await buildUserPayload(ctx.supabase, ctx.workspaceId, { configOverride: pickConfig(config) });
    const now = Date.now();
    payload.history = messages.slice(-15).map((m, i) => ({
      sender_type: m.role === "user" ? "contact" : "ai",
      media_type: "text",
      content_text: String(m.content).slice(0, 4000),
      transcript_text: null,
      created_at: new Date(now - (messages.length - i) * 1000).toISOString(),
    }));
    const d = await generateReply(payload, "reply");
    return NextResponse.json({
      reply: d.reply,
      handover: d.handover,
      handoverReason: d.handoverReason,
      media: payload.media.filter((m) => d.sendMedia.includes(m.id)),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

function pickConfig(c?: Partial<AgentConfig>): Partial<AgentConfig> | undefined {
  if (!c) return undefined;
  const { bot_name, system_prompt, tone, llm_model, voice_note_mode, handover_rules } = c;
  return Object.fromEntries(Object.entries({ bot_name, system_prompt, tone, llm_model, voice_note_mode, handover_rules }).filter(([, v]) => v !== undefined));
}
