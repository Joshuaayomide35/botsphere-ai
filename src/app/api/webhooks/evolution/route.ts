import { after, NextResponse, type NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { evolution, jidToPhone, parseMessageUpsert } from "@/lib/adapters/evolution";
import { handleInbound } from "@/lib/ai/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Evolution API webhook. Authenticated by the per-channel secret in ?token= plus the instance name;
 * both are verified inside SECURITY DEFINER RPCs, so this route only needs the anon key.
 */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("token");
  if (!secret) return NextResponse.json({ error: "missing token" }, { status: 401 });

  let body: { event?: string; instance?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const event = String(body.event ?? "").toLowerCase().replace(/_/g, ".");
  const instance = String(body.instance ?? "");
  if (!instance) return NextResponse.json({ ok: true, ignored: "no instance" });

  const db = createAnonClient();

  try {
    if (event === "connection.update") {
      const d = (body.data ?? {}) as { state?: string; wuid?: string; profileName?: string };
      let phone = jidToPhone(d.wuid);
      let profile = d.profileName ?? null;
      if (d.state === "open" && !phone) {
        const info = await evolution.fetchInstance(instance).catch(() => null);
        phone = jidToPhone(info?.ownerJid);
        profile ??= info?.profileName ?? null;
      }
      const { error } = await db.rpc("wa_webhook_connection", { p_instance: instance, p_secret: secret, p_state: d.state ?? "close", p_phone: phone, p_profile_name: profile });
      if (error) return rpcError(error);
      return NextResponse.json({ ok: true });
    }

    if (event === "messages.upsert") {
      const msg = parseMessageUpsert(body.data);
      if (!msg) return NextResponse.json({ ok: true, ignored: "unsupported message" });
      const { data: id, error } = await db.rpc("wa_webhook_message", {
        p_instance: instance,
        p_secret: secret,
        p_wa_id: msg.waId,
        p_phone: msg.phone,
        p_jid: msg.jid,
        p_push_name: msg.pushName,
        p_from_me: msg.fromMe,
        p_text: msg.text,
        p_media: msg.media,
        p_duration: msg.durationSec,
        p_ts: msg.timestamp,
      });
      if (error) return rpcError(error);
      if (id && !msg.fromMe) {
        after(() => handleInbound({ instance, secret }, id as string, msg.waId, msg.media).catch((e) => console.error("[ai] pipeline", e)));
      }
      return NextResponse.json({ ok: true, id });
    }

    return NextResponse.json({ ok: true, ignored: event });
  } catch (e) {
    console.error("[webhook]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function rpcError(error: { code?: string; message: string }) {
  const status = error.code === "42501" ? 401 : error.code === "22023" ? 422 : 500;
  if (status === 500) console.error("[webhook] rpc", error);
  return NextResponse.json({ error: error.message }, { status });
}
