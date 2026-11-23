"use client";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Subscribe to a realtime channel as the signed-in user. Postgres changes are filtered by RLS, so the
 * socket must carry the user's JWT before joining, otherwise it joins as anon and receives nothing.
 * Returns a cleanup function for useEffect.
 */
export function subscribeAsUser(supabase: SupabaseClient, name: string, configure: (ch: RealtimeChannel) => RealtimeChannel): () => void {
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  supabase.auth.getSession().then(async ({ data }) => {
    if (cancelled) return;
    if (data.session) await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return;
    channel = configure(supabase.channel(name)).subscribe();
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
    if (session?.access_token) supabase.realtime.setAuth(session.access_token);
  });

  return () => {
    cancelled = true;
    sub.subscription.unsubscribe();
    if (channel) supabase.removeChannel(channel);
  };
}
