import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { StudioClient } from "@/components/studio/studio-client";
import { Notice } from "@/components/ui/misc";
import type { AgentConfig, KnowledgeItem, MediaItem } from "@/lib/types";

export const metadata = { title: "Agent Studio · BotSphere AI" };

export default async function AgentStudioPage() {
  const { workspace } = await getWorkspaceContext();
  const supabase = await createClient();
  const [{ data: config }, { data: knowledge }, { data: media }] = await Promise.all([
    supabase.from("agent_configs").select("*").eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("knowledge_items").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    supabase.from("media_items").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
  ]);
  if (!config) return <div className="p-6"><Notice tone="error">This workspace has no agent configuration.</Notice></div>;
  return <StudioClient key={workspace.id} config={config as AgentConfig} knowledge={(knowledge ?? []) as KnowledgeItem[]} media={(media ?? []) as MediaItem[]} />;
}
