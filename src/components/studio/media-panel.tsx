"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Notice } from "@/components/ui/misc";
import type { MediaItem } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function MediaPanel({ initial, readOnly }: { initial: MediaItem[]; readOnly: boolean }) {
  const ws = useWorkspace();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        if (!TYPES.includes(f.type)) throw new Error(`${f.name}: only JPG, PNG or WebP images`);
        if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name}: larger than 10 MB`);
        const ext = f.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${ws.id}/${crypto.randomUUID()}.${ext}`;
        const { error: up } = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
        if (up) throw up;
        const publicUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
        const { data, error } = await supabase
          .from("media_items")
          .insert({ workspace_id: ws.id, title: f.name.replace(/\.[^.]+$/, "").slice(0, 120), storage_path: path, public_url: publicUrl, mime_type: f.type, size_bytes: f.size })
          .select("*")
          .single();
        if (error) throw error;
        setItems((l) => [data as MediaItem, ...l]);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function patch(it: MediaItem, p: Partial<MediaItem>) {
    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, ...p } : x)));
    const { error } = await supabase.from("media_items").update(p).eq("id", it.id);
    if (error) {
      setItems((l) => l.map((x) => (x.id === it.id ? it : x)));
      setError(error.message);
    }
  }

  async function remove(it: MediaItem) {
    if (!confirm(`Delete “${it.title}”?`)) return;
    const { error } = await supabase.from("media_items").delete().eq("id", it.id);
    if (error) return setError(error.message);
    await supabase.storage.from("media").remove([it.storage_path]);
    setItems((l) => l.filter((x) => x.id !== it.id));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-2">Product photos, menus or before/after images. The AI sends one when a customer asks to see something, using the title and description to choose.</p>
      {!readOnly && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-sm text-fg-2 hover:border-glow/50 hover:bg-glow/5 hover:text-fg"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 text-glow" />}
          {busy ? "Uploading…" : "Upload images (JPG, PNG, WebP · 10 MB max)"}
          <input ref={fileRef} type="file" multiple accept={TYPES.join(",")} className="hidden" onChange={(e) => upload(e.target.files)} />
        </button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {items.length === 0 ? (
        <EmptyState icon={<ImagePlus className="h-5 w-5" />} title="No media yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <div key={it.id} className="flex gap-3 rounded-xl border border-line p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.public_url} alt={it.title} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input defaultValue={it.title} disabled={readOnly} onBlur={(e) => e.target.value.trim() && e.target.value !== it.title && patch(it, { title: e.target.value.trim().slice(0, 120) })} className="h-7 text-xs font-medium" />
                <Input defaultValue={it.description} disabled={readOnly} placeholder="Description for the AI" onBlur={(e) => e.target.value !== it.description && patch(it, { description: e.target.value.slice(0, 500) })} className="h-7 text-xs" />
                <div className="flex items-center justify-between">
                  <Switch checked={it.is_active} disabled={readOnly} onCheckedChange={(v) => patch(it, { is_active: v })} label="Active" />
                  {!readOnly && (
                    <button onClick={() => remove(it)} className="rounded-md p-1 text-fg-3 hover:text-danger" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
