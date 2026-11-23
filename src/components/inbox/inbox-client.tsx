"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { subscribeAsUser } from "@/lib/supabase/realtime";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { Contact, Conversation, ConversationWithContact, Message, QuickReply } from "@/lib/types";
import { ChatList, type InboxFilter } from "./chat-list";
import { MessageThread } from "./message-thread";
import { ContactDrawer } from "./contact-drawer";

const CONV_SELECT = "*, contact:contacts(*)";

export function InboxClient({
  initial,
  quickReplies,
  initialSelected,
  initialFilter,
}: {
  initial: ConversationWithContact[];
  quickReplies: QuickReply[];
  initialSelected: string | null;
  initialFilter: InboxFilter;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [convs, setConvs] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => setConvs(initial), [initial]);

  // React to ?c= changes (e.g. from the overview or command palette).
  useEffect(() => {
    const c = params.get("c");
    if (c) setSelectedId(c);
  }, [params]);

  const upsertConv = useCallback(async (row: Conversation) => {
    let found = false;
    setConvs((list) => {
      const i = list.findIndex((c) => c.id === row.id);
      if (i === -1) return list;
      found = true;
      const next = [...list];
      next[i] = { ...next[i], ...row };
      return next;
    });
    if (!found) {
      const { data } = await supabase.from("conversations").select(CONV_SELECT).eq("id", row.id).maybeSingle();
      if (data) setConvs((list) => (list.some((c) => c.id === data.id) ? list : [data as ConversationWithContact, ...list]));
    }
  }, [supabase]);

  // Realtime: conversation list, contacts and the open thread.
  useEffect(() => {
    return subscribeAsUser(supabase, `inbox:${ws.id}`, (ch) =>
      ch
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${ws.id}` }, (p) => {
        if (p.eventType === "DELETE") setConvs((l) => l.filter((c) => c.id !== (p.old as { id: string }).id));
        else upsertConv(p.new as Conversation);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `workspace_id=eq.${ws.id}` }, (p) => {
        const m = p.new as Message;
        if (!m?.id || m.conversation_id !== selectedRef.current) return;
        setMessages((list) => {
          const i = list.findIndex((x) => x.id === m.id);
          if (i === -1) return [...list, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
          const next = [...list];
          next[i] = { ...next[i], ...m };
          return next;
        });
        if (m.sender_type === "contact") {
          supabase.from("conversations").update({ unread_count: 0 }).eq("id", m.conversation_id).then(() => {});
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contacts", filter: `workspace_id=eq.${ws.id}` }, (p) => {
        const ct = p.new as Contact;
        setConvs((l) => l.map((c) => (c.contact_id === ct.id ? { ...c, contact: { ...c.contact, ...ct } } : c)));
      }),
    );
  }, [supabase, ws.id, upsertConv]);

  // Load the open thread.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingMsgs(true);
    setMessages([]);
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setMessages(((data ?? []) as Message[]).reverse());
      setLoadingMsgs(false);
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedId);
      setConvs((l) => l.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  const counts = useMemo(
    () => ({
      all: convs.length,
      ai: convs.filter((c) => c.ai_enabled && c.status !== "needs_human").length,
      human: convs.filter((c) => c.status === "needs_human").length,
    }),
    [convs],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return convs
      .filter((c) => (filter === "ai" ? c.ai_enabled && c.status !== "needs_human" : filter === "human" ? c.status === "needs_human" : true))
      .filter((c) => !q || [c.contact?.name, c.contact?.phone, c.last_message_preview].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  }, [convs, filter, query]);

  const selected = convs.find((c) => c.id === selectedId) ?? null;

  function select(id: string) {
    setSelectedId(id);
    router.replace(`/inbox?c=${id}`, { scroll: false });
  }

  async function toggleAi(on: boolean) {
    if (!selected) return;
    const patch = on ? { ai_enabled: true, status: selected.status === "needs_human" ? "open" : selected.status } : { ai_enabled: false };
    setConvs((l) => l.map((c) => (c.id === selected.id ? { ...c, ...patch } as ConversationWithContact : c)));
    const { error } = await supabase.from("conversations").update(patch).eq("id", selected.id);
    if (error) setConvs((l) => l.map((c) => (c.id === selected.id ? selected : c)));
  }

  async function send(text: string) {
    if (!selected) return;
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: selected.id, text }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to send");
    if (json.message) setMessages((l) => (l.some((m) => m.id === json.message.id) ? l : [...l, json.message]));
    setConvs((l) => l.map((c) => (c.id === selected.id ? { ...c, ai_enabled: false, last_message_preview: text, last_message_sender: "human", last_message_at: new Date().toISOString() } : c)));
  }

  function updateContact(ct: Contact) {
    setConvs((l) => l.map((c) => (c.contact_id === ct.id ? { ...c, contact: ct } : c)));
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className={cn("w-full shrink-0 border-r border-line bg-sidebar/40 md:w-80", selected && "hidden md:block")}>
        <ChatList items={visible} selectedId={selectedId} onSelect={select} filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} counts={counts} />
      </div>
      <div className={cn("min-w-0 flex-1", !selected && "hidden md:block")}>
        {selected ? (
          <MessageThread
            conversation={selected}
            messages={messages}
            loading={loadingMsgs}
            quickReplies={quickReplies}
            onToggleAi={toggleAi}
            onSend={send}
            onBack={() => setSelectedId(null)}
            drawerOpen={drawerOpen}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<MessagesSquare className="h-6 w-6" />}
              title={convs.length ? "Select a conversation" : "Your inbox is empty"}
              description={convs.length ? "Pick a chat on the left to read and reply." : "Connect WhatsApp and new chats will appear here in real time."}
            />
          </div>
        )}
      </div>
      {selected && drawerOpen && selected.contact && (
        <div className="hidden w-80 shrink-0 border-l border-line bg-sidebar/40 xl:block">
          <ContactDrawer contact={selected.contact} onChange={updateContact} onClose={() => setDrawerOpen(false)} />
        </div>
      )}
    </div>
  );
}
