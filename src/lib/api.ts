import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { WS_COOKIE, canManage } from "@/lib/workspace";
import type { MemberRole } from "@/lib/types";

export interface ApiContext {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  role: MemberRole;
  canManage: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Auth + active-workspace resolution for route handlers. RLS still enforces every query. */
export async function requireApiContext(opts: { manage?: boolean } = {}): Promise<ApiContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("Not signed in", 401);

  const wanted = (await cookies()).get(WS_COOKIE)?.value;
  const { data: rows, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new ApiError(error.message, 500);
  const m = rows?.find((r) => r.workspace_id === wanted) ?? rows?.[0];
  if (!m) throw new ApiError("No workspace", 403);
  const role = m.role as MemberRole;
  if (opts.manage && !canManage(role)) throw new ApiError("Only owners and admins can do this", 403);
  return { supabase, userId: user.id, workspaceId: m.workspace_id, role, canManage: canManage(role) };
}

export function handleApiError(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "Unexpected error";
  console.error("[api]", e);
  return NextResponse.json({ error: msg }, { status: 500 });
}
