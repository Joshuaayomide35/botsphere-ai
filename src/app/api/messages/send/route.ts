import { NextResponse, type NextRequest } from "next/server";
import { evolution, evolutionConfigured, toWaNumber } from "@/lib/adapters/evolution";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Human reply from the Inbox. Sending also pauses the AI for this chat (human takeover). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireApiContext();
    const { conversationId, text } = (await req.json()) as { conversationId?: string; text?: string };
    const body = text?.trim();
    if (!conversationId || !body) throw new ApiError("conversationId and text are required");
    if (body.length > 4000) throw new ApiError("Message is too long");

    const { data: conv } = await ctx.supabase
      .from("conversations")
      .select("id, workspace_id, ai_enabled, status, channel_id, contact:contacts(phone)")
      .eq("id", conversationId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!conv) throw new ApiError("Conversation not found", 404);

    const channelQuery = ctx.supabase.from("channels").select("instance_id, status");
    const { data: channel } = conv.channel_id
      ? await channelQuery.eq("id", conv.channel_id).maybeSingle()
      : await channelQuery.eq("workspace_id", ctx.workspaceId).eq("type", "whatsapp_qr").maybeSingle();
    if (!evolutionConfigured()) throw new ApiError("The WhatsApp engine is not configured on the server.", 503);
    if (!channel?.instance_id || channel.status !== "connected") throw new ApiError("WhatsApp is not connected. Link a number on the WhatsApp Connect page.", 409);

    const phone = (conv.contact as unknown as { phone: string } | null)?.phone;
    if (!phone) throw new ApiError("Contact has no phone number");

    const sent = await evolution.sendText(channel.instance_id, toWaNumber(phone), body).catch((e: Error) => {
      throw new ApiError(`WhatsApp send failed: ${e.message}`, 502);
    });

    const now = new Date().toISOString();
    // The fromMe webhook echo may already have stored this message; the unique wa id makes this idempotent.
    let message = null;
    const ins = await ctx.supabase
      .from("messages")
      .insert({ workspace_id: ctx.workspaceId, conversation_id: conv.id, sender_type: "human", content_text: body, media_type: "text", wa_message_id: sent.id, created_at: now })
      .select("*")
      .maybeSingle();
    if (ins.data) message = ins.data;
    else if (sent.id) message = (await ctx.supabase.from("messages").select("*").eq("workspace_id", ctx.workspaceId).eq("wa_message_id", sent.id).maybeSingle()).data;

    await ctx.supabase
      .from("conversations")
      .update({
        ai_enabled: false,
        status: conv.status === "needs_human" ? "open" : conv.status,
        last_message_at: now,
        last_message_preview: body.slice(0, 200),
        last_message_sender: "human",
        unread_count: 0,
      })
      .eq("id", conv.id);
    if (conv.ai_enabled) {
      await ctx.supabase.from("messages").insert({
        workspace_id: ctx.workspaceId,
        conversation_id: conv.id,
        sender_type: "system",
        content_text: "You replied · AI paused for this chat",
        created_at: new Date(Date.now() + 1).toISOString(),
      });
    }

    return NextResponse.json({ ok: true, message });
  } catch (e) {
    return handleApiError(e);
  }
}
