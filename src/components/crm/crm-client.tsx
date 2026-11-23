"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, Kanban, MessageCircle, Plus, Search, Table2, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { ContactDrawer } from "@/components/inbox/contact-drawer";
import { STAGES, type Contact, type PipelineStage } from "@/lib/types";
import { cn, errorMessage, formatMoney, normalizePhone, timeAgo } from "@/lib/utils";

type View = "table" | "kanban";

export function CrmClient({ initial }: { initial: Contact[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const [contacts, setContacts] = useState(initial);
  const [view, setView] = useState<View>(params.get("view") === "kanban" ? "kanban" : "table");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<PipelineStage | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        (stage === "all" || c.pipeline_stage === stage) &&
        (!q || [c.name, c.phone, c.email, c.source, ...c.tags].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [contacts, query, stage]);

  const open = contacts.find((c) => c.id === openId) ?? null;

  function switchView(v: View) {
    setView(v);
    router.replace(v === "kanban" ? "/crm?view=kanban" : "/crm", { scroll: false });
  }

  async function moveStage(id: string, to: PipelineStage) {
    const prev = contacts;
    setContacts((l) => l.map((c) => (c.id === id ? { ...c, pipeline_stage: to } : c)));
    const { error } = await supabase.from("contacts").update({ pipeline_stage: to }).eq("id", id);
    if (error) {
      setContacts(prev);
      setError(error.message);
    }
  }

  async function remove(c: Contact) {
    if (!confirm(`Delete ${c.name || c.phone}? This also deletes their conversations.`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    if (error) return setError(error.message);
    setContacts((l) => l.filter((x) => x.id !== c.id));
    if (openId === c.id) setOpenId(null);
  }

  function exportCsv() {
    const head = ["Name", "Phone", "Email", "Stage", "Deal value", "Tags", "Source", "Notes", "Created"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((c) =>
      [c.name, c.phone, c.email, STAGES.find((s) => s.id === c.pipeline_stage)?.label, c.deal_value, c.tags.join("; "), c.source, c.notes, c.created_at].map(esc).join(","),
    );
    const blob = new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ws.name.replace(/\W+/g, "-").toLowerCase()}-contacts.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pipelineValue = filtered.filter((c) => c.pipeline_stage !== "closed").reduce((s, c) => s + Number(c.deal_value), 0);

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        <PageHeader
          title="CRM"
          description={`${contacts.length} contacts · ${formatMoney(pipelineValue)} open pipeline value`}
          actions={
            <>
              <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add contact
              </Button>
            </>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tabs
            value={view}
            onChange={switchView}
            items={[
              { id: "table", label: <><Table2 className="h-3.5 w-3.5" />Table</> },
              { id: "kanban", label: <><Kanban className="h-3.5 w-3.5" />Pipeline</> },
            ]}
          />
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, tag…" className="pl-8" />
          </div>
          {view === "table" && (
            <Select value={stage} onChange={(e) => setStage(e.target.value as PipelineStage | "all")} className="w-40">
              <option value="all">All stages</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          )}
        </div>
        {error && <Notice tone="error" className="mb-3">{error}</Notice>}

        {contacts.length === 0 ? (
          <Card>
            <EmptyState icon={<Users className="h-6 w-6" />} title="No contacts yet" description="Contacts are created automatically from WhatsApp chats, or add one manually." action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add contact</Button>} />
          </Card>
        ) : view === "table" ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-sidebar/40 text-left text-[11px] tracking-wider text-fg-3 uppercase">
                    <th className="px-4 py-2.5 font-medium">Contact</th>
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    <th className="px-4 py-2.5 font-medium">Stage</th>
                    <th className="px-4 py-2.5 font-medium">Tags</th>
                    <th className="px-4 py-2.5 text-right font-medium">Value</th>
                    <th className="px-4 py-2.5 text-right font-medium">Last active</th>
                    <th className="w-20 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((c) => {
                    const st = STAGES.find((s) => s.id === c.pipeline_stage)!;
                    return (
                      <tr key={c.id} onClick={() => setOpenId(c.id)} className={cn("group cursor-pointer hover:bg-card-hover", openId === c.id && "bg-card-hover")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={c.name ?? c.phone} seed={c.id} size={28} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{c.name || "Unknown"}</p>
                              {c.email && <p className="truncate text-[11px] text-fg-3">{c.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="tnum px-4 py-2.5 font-mono text-xs whitespace-nowrap text-fg-2">{c.phone}</td>
                        <td className="px-4 py-2.5">
                          <Badge style={{ color: st.color, borderColor: `${st.color}40`, background: `${st.color}14` }}>{st.label}</Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex max-w-56 flex-wrap gap-1">
                            {c.tags.slice(0, 3).map((t) => (
                              <Badge key={t}>{t}</Badge>
                            ))}
                            {c.tags.length > 3 && <Badge>+{c.tags.length - 3}</Badge>}
                          </div>
                        </td>
                        <td className="tnum px-4 py-2.5 text-right">{formatMoney(c.deal_value)}</td>
                        <td className="tnum px-4 py-2.5 text-right text-xs text-fg-3">{timeAgo(c.last_active_at)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                            <Link href={`/inbox?contact=${c.id}`} onClick={(e) => e.stopPropagation()} className="rounded-md p-1.5 text-fg-3 hover:bg-card hover:text-glow" title="Open chat">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Link>
                            <button onClick={(e) => (e.stopPropagation(), remove(c))} className="rounded-md p-1.5 text-fg-3 hover:bg-card hover:text-danger" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="py-10 text-center text-xs text-fg-3">No contacts match your filters.</p>}
            </div>
          </Card>
        ) : (
          <KanbanBoard contacts={filtered} onMove={moveStage} onOpen={setOpenId} />
        )}
      </div>

      {open && (
        <div className="w-80 shrink-0 border-l border-line bg-sidebar/60">
          <ContactDrawer contact={open} onChange={(c) => setContacts((l) => l.map((x) => (x.id === c.id ? c : x)))} onClose={() => setOpenId(null)} />
        </div>
      )}
      {adding && <AddContact onClose={() => setAdding(false)} onCreated={(c) => (setContacts((l) => [c, ...l]), setAdding(false))} />}
    </div>
  );
}

function KanbanBoard({ contacts, onMove, onOpen }: { contacts: Contact[]; onMove: (id: string, s: PipelineStage) => void; onOpen: (id: string) => void }) {
  const [over, setOver] = useState<PipelineStage | null>(null);
  return (
    <div className="grid min-w-[880px] grid-cols-4 gap-3 overflow-x-auto pb-2">
      {STAGES.map((s) => {
        const items = contacts.filter((c) => c.pipeline_stage === s.id);
        const total = items.reduce((sum, c) => sum + Number(c.deal_value), 0);
        return (
          <div
            key={s.id}
            onDragOver={(e) => (e.preventDefault(), setOver(s.id))}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/contact");
              if (id) onMove(id, s.id);
            }}
            className={cn("flex min-h-[60vh] flex-col rounded-xl border bg-sidebar/50 transition-colors", over === s.id ? "border-glow/50 bg-glow/5" : "border-line")}
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                <span className="text-xs font-semibold">{s.label}</span>
                <span className="tnum rounded bg-white/5 px-1.5 text-[10px] text-fg-3">{items.length}</span>
              </div>
              <span className="tnum text-[11px] text-fg-3">{formatMoney(total)}</span>
            </div>
            <div className="flex-1 space-y-2 p-2">
              {items.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/contact", c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onOpen(c.id)}
                  className="cursor-grab rounded-lg border border-line bg-card p-3 transition-colors hover:border-fg-3/40 hover:bg-card-hover active:cursor-grabbing"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={c.name ?? c.phone} seed={c.id} size={24} />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.name || c.phone}</p>
                  </div>
                  {c.ai_summary && <p className="mt-2 line-clamp-2 text-xs text-fg-2">{c.ai_summary}</p>}
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex gap-1 overflow-hidden">
                      {c.tags.slice(0, 2).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                    <span className="tnum text-xs font-medium">{formatMoney(c.deal_value)}</span>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="py-6 text-center text-[11px] text-fg-3">Drop contacts here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddContact({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Contact) => void }) {
  const ws = useWorkspace();
  const [form, setForm] = useState({ name: "", phone: "", email: "", stage: "new_lead" as PipelineStage, value: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = normalizePhone(form.phone);
    if (!phone) return setError("Enter the phone in international format, e.g. +971 50 123 4567");
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await createClient()
        .from("contacts")
        .insert({ workspace_id: ws.id, name: form.name || null, phone, email: form.email || null, pipeline_stage: form.stage, deal_value: Number(form.value) || 0, source: "Manual" })
        .select("*")
        .single();
      if (error) throw error.code === "23505" ? new Error("A contact with this phone already exists.") : error;
      onCreated(data as Contact);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <Card className="w-full max-w-md p-5" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">Add contact</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" autoFocus /></Field>
          <Field label="WhatsApp phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 50 123 4567" required className="tnum" /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as PipelineStage })}>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Deal value"><Input type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="tnum" /></Field>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading}>Add contact</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
