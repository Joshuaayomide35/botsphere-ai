"use client";
import { useRef, useState } from "react";
import { FileText, Globe, Loader2, Trash2, Type, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, Notice } from "@/components/ui/misc";
import type { KnowledgeItem } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type Mode = "file" | "text" | "url";

export function KnowledgePanel({ initial, readOnly }: { initial: KnowledgeItem[]; readOnly: boolean }) {
  const [items, setItems] = useState(initial);
  const [mode, setMode] = useState<Mode>("file");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function add(body: BodyInit, json: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge", { method: "POST", body, headers: json ? { "content-type": "application/json" } : undefined });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to add");
      setItems((l) => [j.item, ...l]);
      setTitle("");
      setContent("");
      setUrl("");
      if (j.item.status === "failed") setError(`Saved, but text extraction failed: ${j.item.error}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onFile(f?: File | null) {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    add(fd, false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function toggle(it: KnowledgeItem, on: boolean) {
    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, is_active: on } : x)));
    const { error } = await supabase.from("knowledge_items").update({ is_active: on }).eq("id", it.id);
    if (error) setItems((l) => l.map((x) => (x.id === it.id ? it : x)));
  }

  async function remove(it: KnowledgeItem) {
    if (!confirm(`Delete “${it.title}”?`)) return;
    const { error } = await supabase.from("knowledge_items").delete().eq("id", it.id);
    if (error) return setError(error.message);
    if (it.type === "pdf" || (it.type === "text" && it.file_url)) await supabase.storage.from("knowledge").remove([it.file_url!]);
    setItems((l) => l.filter((x) => x.id !== it.id));
  }

  const totalChars = items.filter((i) => i.is_active).reduce((s, i) => s + (i.content_extracted?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      {!readOnly && (
        <div className="rounded-xl border border-line bg-sidebar/40 p-4">
          <Tabs
            value={mode}
            onChange={setMode}
            items={[
              { id: "file", label: <><Upload className="h-3.5 w-3.5" />Upload file</> },
              { id: "text", label: <><Type className="h-3.5 w-3.5" />Paste text</> },
              { id: "url", label: <><Globe className="h-3.5 w-3.5" />Website URL</> },
            ]}
          />
          <div className="mt-4">
            {mode === "file" && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => (e.preventDefault(), onFile(e.dataTransfer.files[0]))}
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-8 text-center hover:border-glow/50 hover:bg-glow/5"
              >
                {busy ? <Loader2 className="h-6 w-6 animate-spin text-glow" /> : <Upload className="h-6 w-6 text-glow" />}
                <p className="mt-2 text-sm font-medium">{busy ? "Uploading and extracting text…" : "Drop a PDF, TXT or Markdown file"}</p>
                <p className="mt-1 text-xs text-fg-3">Price lists, FAQs, menus, policies · up to 20 MB</p>
                <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
            )}
            {mode === "text" && (
              <div className="space-y-3">
                <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opening hours & prices" /></Field>
                <Field label="Content"><Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-36" placeholder="Paste FAQs, prices, policies…" /></Field>
                <Button onClick={() => add(JSON.stringify({ type: "text", title, content }), true)} loading={busy} disabled={!title.trim() || !content.trim()}>Add to knowledge base</Button>
              </div>
            )}
            {mode === "url" && (
              <div className="space-y-3">
                <Field label="Page URL" hint="We fetch the page once and save its text. Re-add it to refresh."><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourbusiness.com/pricing" /></Field>
                <Button onClick={() => add(JSON.stringify({ type: "url", url }), true)} loading={busy} disabled={!url.trim()}>Import page</Button>
              </div>
            )}
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-fg-2">{items.length} sources</p>
          <p className="tnum text-[11px] text-fg-3">{totalChars.toLocaleString()} characters active</p>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No knowledge yet" description="Without knowledge the agent won't quote prices or policies; it will offer a human instead." />
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-sidebar text-glow">
                  {it.type === "url" ? <Globe className="h-4 w-4" /> : it.type === "pdf" ? <FileText className="h-4 w-4" /> : <Type className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  <p className="truncate text-[11px] text-fg-3">
                    {it.type.toUpperCase()} · {(it.content_extracted?.length ?? 0).toLocaleString()} chars · added {timeAgo(it.created_at)}
                    {it.type === "url" && it.file_url ? ` · ${it.file_url}` : ""}
                  </p>
                </div>
                {it.status === "failed" && <Badge tone="danger" title={it.error ?? ""}>Failed</Badge>}
                <Switch checked={it.is_active} onCheckedChange={(v) => toggle(it, v)} disabled={readOnly} label="Active" />
                {!readOnly && (
                  <button onClick={() => remove(it)} className="rounded-md p-1.5 text-fg-3 hover:bg-card-hover hover:text-danger" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
