import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Workspace } from "@/lib/types";

export const WS_COOKIE = "bs_ws";

export interface WorkspaceContext {
  userId: string;
  email: string;
  fullName: string;
  workspace: Workspace;
  role: MemberRole;
  workspaces: { id: string; name: string; role: MemberRole }[];
}

/** Resolve the signed-in user and their active workspace (cookie, else first). Redirects when missing. */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const list = (memberships ?? [])
    .filter((m) => m.workspace)
    .map((m) => ({ role: m.role as MemberRole, workspace: m.workspace as unknown as Workspace }));
  if (!list.length) redirect("/onboarding");

  const wanted = (await cookies()).get(WS_COOKIE)?.value;
  const active = list.find((m) => m.workspace.id === wanted) ?? list[0];

  const { data: profile } = await supabase.from("member_profiles").select("full_name").eq("id", user.id).maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name || user.email?.split("@")[0] || "You",
    workspace: active.workspace,
    role: active.role,
    workspaces: list.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role })),
  };
});

export function canManage(role: MemberRole) {
  return role === "owner" || role === "admin";
}
