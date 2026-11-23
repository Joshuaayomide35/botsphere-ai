"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Clock, Save, Trash2, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Notice, PageHeader } from "@/components/ui/misc";
import { errorMessage, normalizePhone } from "@/lib/utils";
import type { DayHours, MemberRole, OfficeHours, QuickReply, Weekday, Workspace } from "@/lib/types";

const DAYS: { id: Weekday; label: string }[] = [
  { id: "mon", label: "Monday" },
  { id: "tue", label: "Tuesday" },
  { id: "wed", label: "Wednesday" },
  { id: "thu", label: "Thursday" },
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
];

type TeamRow = { id: string; role: string; name: string | null; email: string | null; isYou: boolean };

export function SettingsClient({ workspace, role, quickReplies, team }: { workspace: Workspace; role: MemberRole; quickReplies: QuickReply[]; team: TeamRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const canManage = role === "owner" || role === "admin";
  const [ws, setWs] = useState({
    name: workspace.name,
    industry: workspace.industry ?? "",
    timezone: workspace.timezone,
    owner_alert_phone: workspace.owner_alert_phone ?? "",
  });
  const [hours, setHours] = useState<OfficeHours>(workspace.office_hours_json ?? {});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function saveWorkspace() {
    setSaving(true);
    setMsg(null);
    try {
      const phone = ws.owner_alert_phone.trim() ? normalizePhone(ws.owner_alert_phone) : null;
      if (ws.owner_alert_phone.trim() && !phone) throw new Error("Alert phone must be in international format, e.g. +971 50 123 4567");
      try {
        new Intl.DateTimeFormat("en", { timeZone: ws.timezone });
      } catch {
        throw new Error(`Unknown timezone “${ws.timezone}”. Use an IANA name like Asia/Dubai.`);
      }
      const { error } = await supabase
        .from("workspaces")
        .update({ name: ws.name.trim(), industry: ws.industry.trim() || null, timezone: ws.timezone.trim(), owner_alert_phone: phone, office_hours_json: hours })
        .eq("id", workspace.id);
      if (error) throw error;
      setMsg({ tone: "success", text: "Workspace settings saved." });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  function setDay(d: Weekday, patch: Partial<DayHours>) {
    setHours((h) => ({ ...h, [d]: { open: false, from: "09:00", to: "18:00", ...(h[d] ?? {}), ...patch } }));
  }

  async function deleteWorkspace() {
    if (prompt(`Type the workspace name to permanently delete it and all its data:\n${workspace.name}`) !== workspace.name) return;
    const { error } = await supabase.from("workspaces").delete().eq("id", workspace.id);
    if (error) return setMsg({ tone: "error", text: error.message });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <PageHeader
        title="Settings"
        description="Workspace profile, office hours, alerts, quick replies and team."
        actions={canManage && <Button onClick={saveWorkspace} loading={saving}><Save className="h-4 w-4" />Save settings</Button>}
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-glow" />Workspace</span>} />
        <fieldset disabled={!canManage} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Business name"><Input value={ws.name} maxLength={80} onChange={(e) => setWs({ ...ws, name: e.target.value })} /></Field>
          <Field label="Industry"><Input value={ws.industry} onChange={(e) => setWs({ ...ws, industry: e.target.value })} /></Field>
          <Field label="Timezone" hint="IANA name, e.g. Asia/Dubai, Europe/London"><Input value={ws.timezone} onChange={(e) => setWs({ ...ws, timezone: e.target.value })} /></Field>
          <Field label="Owner alert WhatsApp number" hint="Gets a 2-line WhatsApp alert whenever the AI hands a chat to a human.">
            <Input value={ws.owner_alert_phone} onChange={(e) => setWs({ ...ws, owner_alert_phone: e.target.value })} placeholder="+971 50 123 4567" className="tnum" />
          </Field>
        </fieldset>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Clock className="h-4 w-4 text-glow" />Office hours & AI schedule</span>}
          description="Used for after-hours mode and to time follow-ups."
        />
        <fieldset disabled={!canManage} className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-line p-4">
            <div>
              <p className="text-sm font-medium">After-hours mode</p>
              <p className="mt-0.5 text-xs text-fg-2">When on, the AI only replies outside the office hours below; your team handles chats during the day. When off, the AI replies 24/7.</p>
            </div>
            <Switch checked={Boolean(hours.after_hours_only)} onCheckedChange={(v) => setHours((h) => ({ ...h, after_hours_only: v }))} disabled={!canManage} label="After-hours mode" />
          </div>
          <div className="divide-y divide-line rounded-lg border border-line">
            {DAYS.map((d) => {
              const h = hours[d.id] ?? { open: false, from: "09:00", to: "18:00" };
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Switch checked={h.open} onCheckedChange={(v) => setDay(d.id, { open: v })} disabled={!canManage} tone="brand" label={d.label} />
                  <span className="w-24 text-sm">{d.label}</span>
                  {h.open ? (
                    <div className="flex items-center gap-2">
                      <Input type="time" value={h.from} onChange={(e) => setDay(d.id, { from: e.target.value })} className="tnum h-8 w-28" />
                      <span className="text-xs text-fg-3">to</span>
                      <Input type="time" value={h.to} onChange={(e) => setDay(d.id, { to: e.target.value })} className="tnum h-8 w-28" />
                    </div>
                  ) : (
                    <span className="text-xs text-fg-3">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      </Card>

      <QuickRepliesCard initial={quickReplies} workspaceId={workspace.id} canEdit />

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-glow" />Team</span>} description="Teammates sign up with their own account; an owner or admin then adds them." />
        <div className="divide-y divide-line">
          {team.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={m.name ?? m.email} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name ?? "Teammate"} {m.isYou && <span className="text-xs text-fg-3">(you)</span>}</p>
                <p className="truncate text-xs text-fg-3">{m.email}</p>
              </div>
              <Badge tone={m.role === "owner" ? "glow" : m.role === "admin" ? "brand" : "default"} className="capitalize">{m.role}</Badge>
            </div>
          ))}
        </div>
      </Card>

      {role === "owner" && (
        <Card className="border-danger/30">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-medium text-danger">Delete workspace</p>
              <p className="text-xs text-fg-2">Permanently deletes contacts, conversations, knowledge and settings.</p>
            </div>
            <Button variant="danger" onClick={deleteWorkspace}><Trash2 className="h-4 w-4" />Delete workspace</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function QuickRepliesCard({ initial, workspaceId }: { initial: QuickReply[]; workspaceId: string; canEdit: boolean }) {
  const supabase = createClient();
  const [items, setItems] = useState(initial);
  const [shortcut, setShortcut] = useState("/");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const sc = shortcut.trim().toLowerCase();
    if (!/^\/[a-z0-9_-]{1,30}$/.test(sc)) return setError("Shortcut must look like /prices (letters, numbers, - or _).");
    if (!content.trim()) return setError("Reply text is required.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.from("quick_replies").insert({ workspace_id: workspaceId, shortcut: sc, content_text: content.trim() }).select("*").single();
    setBusy(false);
    if (error) return setError(error.code === "23505" ? "That shortcut already exists." : error.message);
    setItems((l) => [...l, data as QuickReply].sort((a, b) => a.shortcut.localeCompare(b.shortcut)));
    setShortcut("/");
    setContent("");
  }

  async function update(q: QuickReply, text: string) {
    if (text === q.content_text || !text.trim()) return;
    const { error } = await supabase.from("quick_replies").update({ content_text: text.trim() }).eq("id", q.id);
    if (error) setError(error.message);
    else setItems((l) => l.map((x) => (x.id === q.id ? { ...x, content_text: text.trim() } : x)));
  }

  async function remove(q: QuickReply) {
    const { error } = await supabase.from("quick_replies").delete().eq("id", q.id);
    if (error) return setError(error.message);
    setItems((l) => l.filter((x) => x.id !== q.id));
  }

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Zap className="h-4 w-4 text-glow" />Quick replies</span>} description="Type the shortcut in the Inbox composer to insert the text." />
      <div className="divide-y divide-line">
        {items.map((q) => (
          <div key={q.id} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-1.5 w-28 shrink-0 font-mono text-sm text-glow">{q.shortcut}</span>
            <Textarea defaultValue={q.content_text} onBlur={(e) => update(q, e.target.value)} className="min-h-10 flex-1 text-xs" rows={2} />
            <button onClick={() => remove(q)} className="mt-1.5 rounded-md p-1.5 text-fg-3 hover:text-danger" aria-label={`Delete ${q.shortcut}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-start gap-3 bg-sidebar/40 px-5 py-4">
          <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} className="w-28 font-mono" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Reply text…" className="min-h-10 flex-1 text-xs" rows={2} />
          <Button onClick={add} loading={busy} size="md">Add</Button>
        </div>
        {error && <div className="px-5 py-3"><Notice tone="error">{error}</Notice></div>}
      </div>
    </Card>
  );
}
