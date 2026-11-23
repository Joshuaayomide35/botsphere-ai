import { after, NextResponse, type NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { handleFollowUp } from "@/lib/ai/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every minute by pg_cron (public.bs_cron_tick) when follow-ups are due.
 * The x-cron-secret is verified inside cron_claim_follow_ups against the Vault secret.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return NextResponse.json({ error: "missing secret" }, { status: 401 });

  const db = createAnonClient();
  const { data, error } = await db.rpc("cron_claim_follow_ups", { p_cron_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 401 : 500 });

  const jobs = (data ?? []) as { conversation_id: string; instance_name: string; webhook_secret: string }[];
  after(async () => {
    for (const j of jobs) {
      await handleFollowUp({ instance: j.instance_name, secret: j.webhook_secret }, j.conversation_id).catch((e) => console.error("[follow-up]", e));
    }
  });
  return NextResponse.json({ ok: true, claimed: jobs.length });
}
