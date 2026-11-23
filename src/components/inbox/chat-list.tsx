"use client";
import { Bot, Hand, Mic, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { cn, timeAgo } from "@/lib/utils";
import type { ConversationWithContact } from "@/lib/types";

export type InboxFilter = "all" | "ai" | "human";

export function ChatList({
  items,
  selectedId,
  onSelect,
  filter,
  onFilter,
  query,
  onQuery,
  counts,
}: {
  items: ConversationWithContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: InboxFilter;
  onFilter: (f: InboxFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  counts: Record<InboxFilter, number>;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search name, phone or message"
            className="h-9 w-full rounded-lg border border-line bg-sidebar/60 pr-3 pl-8 text-sm outline-none placeholder:text-fg-3 focus:border-glow/50"
          />
        </div>
        <Tabs
          value={filter}
          onChange={onFilter}
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
          items={[
            { id: "all", label: "All", count: counts.all },
            { id: "ai", label: "AI Active", count: counts.ai },
            { id: "human", label: "Needs Human", count: counts.human },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && <p className="px-4 py-10 text-center text-xs text-fg-3">No conversations here yet.</p>}
        {items.map((c) => {
          const active = c.id === selectedId;
          const preview = c.last_message_preview ?? "";
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "relative flex w-full items-start gap-3 border-b border-line/60 px-3 py-3 text-left transition-colors",
                active ? "bg-card" : "hover:bg-card/60",
              )}
            >
              {active && <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-glow" />}
              <div className="relative">
                <Avatar name={c.contact?.name ?? c.contact?.phone} seed={c.contact_id} size={38} />
                <span
                  className={cn(
                    "absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-sidebar",
                    c.status === "needs_human" ? "bg-human" : c.ai_enabled ? "bg-ai" : "bg-fg-3",
                  )}
                  title={c.status === "needs_human" ? "Needs human" : c.ai_enabled ? "AI active" : "AI off"}
                >
                  {c.status === "needs_human" ? <Hand className="h-2 w-2 text-black" /> : <Bot className="h-2 w-2 text-black" />}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className={cn("min-w-0 flex-1 truncate text-sm", c.unread_count > 0 ? "font-semibold text-fg" : "font-medium text-fg")}>
                    {c.contact?.name || c.contact?.phone}
                  </p>
                  <span className={cn("tnum shrink-0 text-[11px]", c.unread_count > 0 ? "text-glow" : "text-fg-3")}>{timeAgo(c.last_message_at)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className={cn("flex min-w-0 flex-1 items-center gap-1 truncate text-xs", c.unread_count > 0 ? "text-fg-2" : "text-fg-3")}>
                    {c.last_message_sender === "ai" && <Bot className="h-3 w-3 shrink-0 text-glow" />}
                    {preview.startsWith("🎤") && <Mic className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{preview.replace(/^🎤\s?/, "") || "—"}</span>
                  </p>
                  {c.unread_count > 0 && (
                    <span className="tnum shrink-0 rounded-full bg-brand px-1.5 text-[10px] leading-4 font-semibold text-white">{c.unread_count}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
