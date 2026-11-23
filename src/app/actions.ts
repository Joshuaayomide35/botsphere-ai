"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WS_COOKIE, getWorkspaceContext, canManage } from "@/lib/workspace";

export async function switchWorkspace(id: string) {
  (await cookies()).set(WS_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(WS_COOKIE);
  redirect("/login");
}

export async function setGlobalAiPaused(paused: boolean) {
  const ctx = await getWorkspaceContext();
  if (!canManage(ctx.role)) return { error: "Only owners and admins can pause the AI." };
  const supabase = await createClient();
  const { error } = await supabase.from("workspaces").update({ global_ai_paused: paused }).eq("id", ctx.workspace.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
