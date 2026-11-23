import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { canManage, getWorkspaceContext } from "@/lib/workspace";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getWorkspaceContext();
  const supabase = await createClient();
  const [{ data: channel }, { data: unreadRows }] = await Promise.all([
    supabase.from("channels").select("status, phone_number").eq("workspace_id", ctx.workspace.id).eq("type", "whatsapp_qr").maybeSingle(),
    supabase.from("conversations").select("unread_count").eq("workspace_id", ctx.workspace.id).gt("unread_count", 0),
  ]);
  const unread = (unreadRows ?? []).reduce((s, r) => s + (r.unread_count as number), 0);

  return (
    <AppShell
      key={ctx.workspace.id}
      workspace={{
        id: ctx.workspace.id,
        name: ctx.workspace.name,
        timezone: ctx.workspace.timezone,
        role: ctx.role,
        canManage: canManage(ctx.role),
        userId: ctx.userId,
      }}
      workspaces={ctx.workspaces}
      user={{ name: ctx.fullName, email: ctx.email }}
      channel={channel ? { status: channel.status, phone: channel.phone_number } : null}
      unread={unread}
      aiPaused={ctx.workspace.global_ai_paused}
    >
      {children}
    </AppShell>
  );
}
