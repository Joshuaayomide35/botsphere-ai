import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConfig } from "@/lib/types";
import type { AiPayload } from "./openrouter";

/** Build an AI payload with the signed-in user's session (RLS-scoped). Used by the sandbox and the draft co-pilot. */
export async function buildUserPayload(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { conversationId?: string; configOverride?: Partial<AgentConfig> } = {},
): Promise<AiPayload> {
  const [{ data: ws }, { data: cfg }, { data: knowledge }, { data: media }] = await Promise.all([
    supabase.from("workspaces").select("name, timezone, owner_alert_phone").eq("id", workspaceId).single(),
    supabase.from("agent_configs").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("knowledge_items").select("title, content_extracted, updated_at").eq("workspace_id", workspaceId).eq("is_active", true).eq("status", "ready").order("updated_at", { ascending: false }),
    supabase.from("media_items").select("id, title, description, public_url, mime_type").eq("workspace_id", workspaceId).eq("is_active", true).order("created_at", { ascending: false }).limit(40),
  ]);
  if (!ws) throw new Error("Workspace not found");

  let contact: AiPayload["contact"] = { name: "Test Customer", phone: "+10000000000", stage: "new_lead", deal_value: 0 };
  let history: AiPayload["history"] = [];
  if (opts.conversationId) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, contact:contacts(name, phone, pipeline_stage, deal_value)")
      .eq("id", opts.conversationId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const k = conv.contact as unknown as { name: string | null; phone: string; pipeline_stage: string; deal_value: number };
    contact = { name: k.name, phone: k.phone, stage: k.pipeline_stage, deal_value: k.deal_value };
    const { data: msgs } = await supabase
      .from("messages")
      .select("sender_type, media_type, content_text, transcript_text, created_at")
      .eq("conversation_id", opts.conversationId)
      .neq("sender_type", "system")
      .order("created_at", { ascending: false })
      .limit(15);
    history = ((msgs ?? []) as AiPayload["history"]).reverse();
  }

  return {
    workspace_id: workspaceId,
    conversation_id: opts.conversationId,
    business: { name: ws.name, timezone: ws.timezone, owner_alert_phone: ws.owner_alert_phone },
    contact,
    config: { ...(cfg ?? {}), ...(opts.configOverride ?? {}) },
    knowledge: (knowledge ?? []).filter((k) => k.content_extracted).map((k) => ({ title: k.title, content: (k.content_extracted as string).slice(0, 60000) })),
    media: (media ?? []).map((m) => ({ id: m.id, title: m.title, description: m.description, url: m.public_url, mime: m.mime_type })),
    history,
  };
}
