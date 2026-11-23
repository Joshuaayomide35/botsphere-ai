import { NextResponse, type NextRequest } from "next/server";
import { evolution, evolutionConfigured, jidToPhone } from "@/lib/adapters/evolution";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";

type Action = "start" | "status" | "restart" | "logout";

/** WhatsApp Connect: create the workspace's Evolution instance, fetch QR codes, poll status, restart or disconnect. */
export async function POST(req: NextRequest) {
  try {
    const { action } = (await req.json().catch(() => ({}))) as { action?: Action };
    const ctx = await requireApiContext({ manage: action !== "status" });
    if (!evolutionConfigured()) {
      throw new ApiError("Evolution API is not configured. Add EVOLUTION_API_URL and EVOLUTION_API_KEY to .env.local and restart the app.", 503);
    }

    const { data: prepared, error } = await ctx.supabase.rpc("wa_prepare_channel", { p_workspace: ctx.workspaceId }).single();
    if (error) throw new ApiError(error.message, 403);
    const { channel_id, instance_name, webhook_secret } = prepared as { channel_id: string; instance_name: string; webhook_secret: string };

    const setStatus = (patch: Record<string, unknown>) => ctx.supabase.from("channels").update(patch).eq("id", channel_id);

    switch (action) {
      case "start": {
        let qr: string | null = null;
        if (!(await evolution.instanceExists(instance_name))) {
          const created = await evolution.createInstance(instance_name, webhook_secret);
          qr = created.qrcode?.base64 ?? null;
        } else {
          await evolution.setWebhook(instance_name, webhook_secret);
        }
        const state = await evolution.connectionState(instance_name);
        if (state === "open") return NextResponse.json(await syncConnected(instance_name, setStatus));
        if (!qr) qr = (await evolution.connect(instance_name)).base64 ?? null;
        await setStatus({ status: "qr_pending" });
        return NextResponse.json({ state: "connecting", qr });
      }
      case "status": {
        if (!(await evolution.instanceExists(instance_name))) return NextResponse.json({ state: "close" });
        const state = await evolution.connectionState(instance_name);
        if (state === "open") return NextResponse.json(await syncConnected(instance_name, setStatus));
        return NextResponse.json({ state });
      }
      case "restart": {
        await evolution.restart(instance_name);
        return NextResponse.json({ ok: true });
      }
      case "logout": {
        try {
          await evolution.logout(instance_name);
        } catch {
          /* already logged out */
        }
        await setStatus({ status: "disconnected", phone_number: null, profile_name: null });
        return NextResponse.json({ state: "close" });
      }
      default:
        throw new ApiError("Unknown action");
    }
  } catch (e) {
    return handleApiError(e);
  }
}

async function syncConnected(instance: string, setStatus: (p: Record<string, unknown>) => PromiseLike<unknown>) {
  const info = await evolution.fetchInstance(instance).catch(() => ({ ownerJid: null, profileName: null, status: null }));
  const phone = jidToPhone(info.ownerJid);
  await setStatus({ status: "connected", phone_number: phone, profile_name: info.profileName, connected_at: new Date().toISOString() });
  return { state: "open", phone, profileName: info.profileName };
}
