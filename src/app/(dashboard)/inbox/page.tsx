import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { InboxClient } from "@/components/inbox/inbox-client";
import type { ConversationWithContact, QuickReply } from "@/lib/types";

export const metadata = { title: "Inbox · BotSphere AI" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { workspace } = await getWorkspaceContext();
  const supabase = await createClient();

  const [{ data: convs }, { data: qrs }] = await Promise.all([
    supabase.from("conversations").select("*, contact:contacts(*)").eq("workspace_id", workspace.id).order("last_message_at", { ascending: false }).limit(300),
    supabase.from("quick_replies").select("*").eq("workspace_id", workspace.id).order("shortcut"),
  ]);
  const list = (convs ?? []) as ConversationWithContact[];

  let selected = sp.c ?? null;
  if (!selected && sp.contact) selected = list.find((c) => c.contact_id === sp.contact)?.id ?? null;

  return (
    <div className="h-full">
      <Suspense>
        <InboxClient
          initial={list}
          quickReplies={(qrs ?? []) as QuickReply[]}
          initialSelected={selected}
          initialFilter={sp.filter === "human" ? "human" : sp.filter === "ai" ? "ai" : "all"}
        />
      </Suspense>
    </div>
  );
}
