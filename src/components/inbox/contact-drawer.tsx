"use client";
import { useEffect, useState } from "react";
import { Mail, Phone, Sparkles, Tag, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Select, Textarea, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { STAGES, type Contact, type PipelineStage } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

export function ContactDrawer({ contact, onChange, onClose }: { contact: Contact; onChange: (c: Contact) => void; onClose: () => void }) {
  const [notes, setNotes] = useState(contact.notes);
  const [tag, setTag] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => setNotes(contact.notes), [contact.id, contact.notes]);

  async function patch(p: Partial<Contact>, label = "Saved") {
    const next = { ...contact, ...p };
    onChange(next);
    const { error } = await createClient().from("contacts").update(p).eq("id", contact.id);
    if (error) {
      onChange(contact);
      setSaved(`Error: ${error.message}`);
    } else setSaved(label);
    setTimeout(() => setSaved(null), 1800);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-xs font-semibold tracking-wider text-fg-3 uppercase">Contact</p>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] text-ai">{saved}</span>}
          <button onClick={onClose} className="rounded-md p-1 text-fg-3 hover:bg-card-hover hover:text-fg" aria-label="Close contact panel">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex flex-col items-center text-center">
          <Avatar name={contact.name ?? contact.phone} seed={contact.id} size={56} />
          <p className="mt-2 font-semibold">{contact.name || "Unknown"}</p>
          <p className="tnum flex items-center gap-1 font-mono text-xs text-fg-2"><Phone className="h-3 w-3" />{contact.phone}</p>
          {contact.email && <p className="flex items-center gap-1 text-xs text-fg-2"><Mail className="h-3 w-3" />{contact.email}</p>}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-2">Pipeline stage</p>
          <Select value={contact.pipeline_stage} onChange={(e) => patch({ pipeline_stage: e.target.value as PipelineStage })}>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </Select>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-2">Deal value</p>
          <Input
            type="number"
            min={0}
            defaultValue={contact.deal_value}
            key={contact.id}
            onBlur={(e) => Number(e.target.value) !== Number(contact.deal_value) && patch({ deal_value: Math.max(0, Number(e.target.value) || 0) })}
            className="tnum"
          />
          <p className="mt-1 text-[11px] text-fg-3">Currently {formatMoney(contact.deal_value)}</p>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-fg-2"><Tag className="h-3 w-3" />Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md border border-line bg-sidebar px-2 py-0.5 text-[11px]">
                {t}
                <button onClick={() => patch({ tags: contact.tags.filter((x) => x !== t) })} className="text-fg-3 hover:text-danger" aria-label={`Remove ${t}`}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tag.trim()) {
                  e.preventDefault();
                  if (!contact.tags.includes(tag.trim())) patch({ tags: [...contact.tags, tag.trim().slice(0, 30)] });
                  setTag("");
                }
              }}
              placeholder="+ Add tag"
              className="h-6 w-24 rounded-md bg-transparent px-1 text-[11px] outline-none placeholder:text-fg-3 focus:bg-sidebar"
            />
          </div>
        </div>

        {contact.ai_summary && (
          <div className="rounded-lg border border-glow/20 bg-glow/5 p-3">
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-glow"><Sparkles className="h-3 w-3" />AI summary</p>
            <p className="text-xs leading-relaxed text-fg-2">{contact.ai_summary}</p>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-2">Internal notes</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== contact.notes && patch({ notes }, "Notes saved")}
            placeholder="Only your team can see these notes…"
            className="min-h-28 text-xs"
          />
        </div>

        <div className="space-y-1 border-t border-line pt-4 text-[11px] text-fg-3">
          <p>Source: <span className="text-fg-2">{contact.source ?? "—"}</span></p>
          <p>Created: <span className="tnum text-fg-2">{new Date(contact.created_at).toLocaleString()}</span></p>
        </div>
      </div>
    </div>
  );
}
