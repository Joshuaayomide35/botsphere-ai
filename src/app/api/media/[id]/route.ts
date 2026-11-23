import { NextResponse, type NextRequest } from "next/server";
import { evolution } from "@/lib/adapters/evolution";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Streams a WhatsApp voice note / image for the Inbox, fetched on demand from Evolution API. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireApiContext();
    const { data: msg } = await ctx.supabase
      .from("messages")
      .select("wa_message_id, media_url, conversation:conversations(channel_id)")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!msg) throw new ApiError("Not found", 404);
    if (msg.media_url && /^https?:/.test(msg.media_url)) return NextResponse.redirect(msg.media_url);
    if (!msg.wa_message_id) throw new ApiError("No media for this message", 404);

    const { data: channel } = await ctx.supabase.from("channels").select("instance_id").eq("workspace_id", ctx.workspaceId).eq("type", "whatsapp_qr").maybeSingle();
    if (!channel?.instance_id) throw new ApiError("WhatsApp is not connected", 409);

    const file = await evolution.getMediaBase64(channel.instance_id, msg.wa_message_id).catch(() => {
      throw new ApiError("Media unavailable", 404);
    });
    const bytes = Buffer.from(file.base64, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": file.mimetype.split(";")[0] || "application/octet-stream",
        "content-length": String(bytes.length),
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
