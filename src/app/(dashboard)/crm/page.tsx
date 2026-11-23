import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { CrmClient } from "@/components/crm/crm-client";
import type { Contact } from "@/lib/types";

export const metadata = { title: "CRM · BotSphere AI" };

export default async function CrmPage() {
  const { workspace } = await getWorkspaceContext();
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").eq("workspace_id", workspace.id).order("last_active_at", { ascending: false }).limit(2000);
  return (
    <div className="h-full">
      <Suspense>
        <CrmClient key={workspace.id} initial={(data ?? []) as Contact[]} />
      </Suspense>
    </div>
  );
}
