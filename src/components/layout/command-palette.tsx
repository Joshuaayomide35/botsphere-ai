"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, FileText, Search, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-provider";

const PAGES = [
  { label: "Overview", href: "/" },
  { label: "Inbox", href: "/inbox" },
  { label: "Needs human attention", href: "/inbox?filter=human" },
  { label: "CRM · Contacts table", href: "/crm" },
  { label: "CRM · Kanban pipeline", href: "/crm?view=kanban" },
  { label: "Agent Studio", href: "/agent-studio" },
  { label: "WhatsApp Connect", href: "/connect" },
  { label: "Settings", href: "/settings" },
];

type Item = { kind: "page" | "contact"; label: string; sub?: string; href: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) {
      setContacts([]);
      return;
    }
    const t = setTimeout(async () => {
      const safe = term.replace(/[%,()]/g, " ");
      const { data } = await createClient()
        .from("contacts")
        .select("id, name, phone")
        .eq("workspace_id", ws.id)
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(6);
      setContacts((data ?? []).map((c) => ({ kind: "contact", label: c.name || c.phone, sub: c.phone, href: `/inbox?contact=${c.id}` })));
    }, 150);
    return () => clearTimeout(t);
  }, [q, open, ws.id]);

  if (!open) return null;
  const pages: Item[] = PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).map((p) => ({ kind: "page", ...p }));
  const items = [...contacts, ...pages];

  const go = (it?: Item) => {
    if (!it) return;
    onClose();
    router.push(it.href);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-fg-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") (e.preventDefault(), setIdx((i) => Math.min(i + 1, items.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setIdx((i) => Math.max(i - 1, 0)));
              if (e.key === "Enter") go(items[idx]);
            }}
            placeholder="Search contacts by name or phone, or jump to a page…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-fg-3">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 && <p className="px-3 py-6 text-center text-xs text-fg-3">No results</p>}
          {items.map((it, i) => (
            <button
              key={`${it.kind}-${it.href}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(it)}
              className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === idx ? "bg-card-hover" : "")}
            >
              {it.kind === "contact" ? <User className="h-4 w-4 text-glow" /> : <FileText className="h-4 w-4 text-fg-3" />}
              <span className="flex-1 truncate">{it.label}</span>
              {it.sub && <span className="tnum text-xs text-fg-3">{it.sub}</span>}
              {i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-fg-3" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
