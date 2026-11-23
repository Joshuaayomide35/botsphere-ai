import { createClient } from "@/lib/supabase/server";
import { canManage, getWorkspaceContext } from "@/lib/workspace";
import { evolutionConfigured } from "@/lib/adapters/evolution";
import { ConnectCard } from "./connect-card";

export const metadata = { title: "WhatsApp Connect · BotSphere AI" };

export default async function ConnectPage() {
  const ctx = await getWorkspaceContext();
  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("status, phone_number, profile_name, connected_at")
    .eq("workspace_id", ctx.workspace.id)
    .eq("type", "whatsapp_qr")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <ConnectCard initial={channel} configured={evolutionConfigured()} canManage={canManage(ctx.role)} />
    </div>
  );
}
