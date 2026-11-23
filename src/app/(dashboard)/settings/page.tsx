import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { SettingsClient } from "./settings-client";
import type { QuickReply } from "@/lib/types";

export const metadata = { title: "Settings · BotSphere AI" };

export default async function SettingsPage() {
  const ctx = await getWorkspaceContext();
  const supabase = await createClient();
  const [{ data: qrs }, { data: members }] = await Promise.all([
    supabase.from("quick_replies").select("*").eq("workspace_id", ctx.workspace.id).order("shortcut"),
    supabase.from("workspace_members").select("id, role, user_id, created_at").eq("workspace_id", ctx.workspace.id).order("created_at"),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("member_profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const team = (members ?? []).map((m) => {
    const p = profiles?.find((x) => x.id === m.user_id);
    return { id: m.id, role: m.role as string, name: p?.full_name ?? null, email: p?.email ?? null, isYou: m.user_id === ctx.userId };
  });

  return <SettingsClient key={ctx.workspace.id} workspace={ctx.workspace} role={ctx.role} quickReplies={(qrs ?? []) as QuickReply[]} team={team} />;
}
