import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Session-less client for machine callers (Evolution webhooks, cron). It only calls the
 * SECURITY DEFINER RPCs that verify the per-channel webhook secret, so no service-role key is needed.
 */
export function createAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
