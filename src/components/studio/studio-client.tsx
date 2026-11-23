"use client";
import { useMemo, useState } from "react";
import { BookOpen, Bot, Clock4, Hand, Image as ImageIcon, Mic, Save, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Notice, PageHeader } from "@/components/ui/misc";
import { cn, errorMessage } from "@/lib/utils";
import { LLM_MODELS, type AgentConfig, type HandoverRule, type KnowledgeItem, type MediaItem } from "@/lib/types";
import { KnowledgePanel } from "./knowledge-panel";
import { VoicePanel } from "./voice-panel";
import { MediaPanel } from "./media-panel";
import { SandboxChat } from "./sandbox-chat";

type Tab = "identity" | "knowledge" | "voice" | "handover" | "followups" | "media";

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: "identity", label: "Identity & Prompt", icon: Bot },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "voice", label: "Voice Notes", icon: Mic },
  { id: "handover", label: "Handover Rules", icon: Hand },
  { id: "followups", label: "Follow-ups", icon: Clock4 },
  { id: "media", label: "Media Library", icon: ImageIcon },
];

const TONES = [
  { id: "warm", label: "Warm & friendly" },
  { id: "professional", label: "Professional" },
  { id: "playful", label: "Playful" },
  { id: "direct", label: "Direct" },
  { id: "luxury", label: "Luxury concierge" },
];

export function StudioClient({ config: initial, knowledge, media }: { config: AgentConfig; knowledge: KnowledgeItem[]; media: MediaItem[] }) {
  const ws = useWorkspace();
  const [tab, setTab] = useState<Tab>("identity");
  const [saved, setSaved] = useState(initial);
  const [cfg, setCfg] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(saved), [cfg, saved]);
  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const readOnly = !ws.canManage;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const { id: _id, workspace_id: _ws, ...fields } = cfg;
      const { data, error } = await createClient().from("agent_configs").update(fields).eq("workspace_id", ws.id).select("*").single();
      if (error) throw error;
      setSaved(data as AgentConfig);
      setCfg(data as AgentConfig);
      setMsg({ tone: "success", text: "Agent settings saved. New messages use them immediately." });
    } catch (e) {
      setMsg({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  function updateRule(i: number, patch: Partial<HandoverRule>) {
    set("handover_rules", cfg.handover_rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-6">
      <PageHeader
        title="Agent Studio"
        description="Shape how your AI agent talks, what it knows and when it hands over to your team."
        actions={
          <>
            {dirty && <span className="text-xs text-human">Unsaved changes</span>}
            <Button variant="ghost" onClick={() => setCfg(saved)} disabled={!dirty || saving}>Discard</Button>
            <Button onClick={save} loading={saving} disabled={!dirty || readOnly}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </>
        }
      />
      {readOnly && <Notice tone="warn" className="mb-4">You have agent access. Only owners and admins can change these settings; you can still use the test chat.</Notice>}
      {msg && <Notice tone={msg.tone} className="mb-4">{msg.text}</Notice>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="min-w-0">
          <div className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex items-center gap-2 rounded-t-lg px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                  tab === t.id ? "text-fg" : "text-fg-2 hover:text-fg",
                )}
              >
                <t.icon className={cn("h-3.5 w-3.5", tab === t.id && "text-glow")} />
                {t.label}
                {tab === t.id && <span className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-glow" />}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "identity" && (
              <fieldset disabled={readOnly} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Agent name">
                    <Input value={cfg.bot_name} maxLength={40} onChange={(e) => set("bot_name", e.target.value)} />
                  </Field>
                  <Field label="Tone">
                    <Select value={cfg.tone} onChange={(e) => set("tone", e.target.value)}>
                      {TONES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="AI model (OpenRouter)">
                    <Select value={cfg.llm_model} onChange={(e) => set("llm_model", e.target.value)}>
                      {!LLM_MODELS.some((m) => m.id === cfg.llm_model) && <option value={cfg.llm_model}>{cfg.llm_model}</option>}
                      {LLM_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="System prompt" hint={`${cfg.system_prompt.length.toLocaleString()} / 20,000 characters. Facts belong in the Knowledge Base; keep this about goals, style and rules.`}>
                  <Textarea value={cfg.system_prompt} maxLength={20000} onChange={(e) => set("system_prompt", e.target.value)} className="min-h-72 font-mono text-[13px]" />
                </Field>
                <Field label={`Typing delay · ${(cfg.typing_delay_ms / 1000).toFixed(1)}s`} hint="The agent shows “typing…” or “recording…” for 2–4 seconds before replying, so it feels human and protects the number from bans.">
                  <input type="range" min={2000} max={4000} step={250} value={Math.min(4000, Math.max(2000, cfg.typing_delay_ms))} onChange={(e) => set("typing_delay_ms", Number(e.target.value))} className="w-full accent-[#38BDF8]" />
                </Field>
              </fieldset>
            )}

            {tab === "knowledge" && <KnowledgePanel initial={knowledge} readOnly={readOnly} />}

            {tab === "voice" && <VoicePanel mode={cfg.voice_note_mode} voiceId={cfg.voice_id} readOnly={readOnly} onMode={(m) => set("voice_note_mode", m)} onVoice={(v) => set("voice_id", v)} />}

            {tab === "handover" && (
              <fieldset disabled={readOnly} className="space-y-3">
                <p className="text-xs text-fg-2">When a rule fires, the AI sends one polite holding message, pauses itself for that chat, marks it “Needs human” and alerts the owner on WhatsApp (set the alert number in Settings).</p>
                {cfg.handover_rules.map((r, i) => (
                  <div key={r.id} className={cn("rounded-lg border p-3 transition-colors", r.enabled ? "border-human/30 bg-human/5" : "border-line")}>
                    <div className="flex items-center gap-3">
                      <Switch checked={r.enabled} tone="human" onCheckedChange={(v) => updateRule(i, { enabled: v })} label={r.label} disabled={readOnly} />
                      <Input value={r.label} onChange={(e) => updateRule(i, { label: e.target.value })} className="h-8 flex-1 border-transparent bg-transparent font-medium" />
                      <button type="button" onClick={() => set("handover_rules", cfg.handover_rules.filter((_, j) => j !== i))} className="text-xs text-fg-3 hover:text-danger">Remove</button>
                    </div>
                    <Input value={r.description} onChange={(e) => updateRule(i, { description: e.target.value })} placeholder="Describe when this applies…" className="mt-2 h-8 text-xs" />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => set("handover_rules", [...cfg.handover_rules, { id: `custom_${Date.now()}`, label: "Custom rule", description: "", enabled: true }])}
                >
                  + Add rule
                </Button>
              </fieldset>
            )}

            {tab === "followups" && (
              <fieldset disabled={readOnly} className="space-y-5">
                <div className="flex items-start justify-between gap-4 rounded-lg border border-line p-4">
                  <div>
                    <p className="text-sm font-medium">Smart ghosting follow-ups</p>
                    <p className="mt-1 text-xs text-fg-2">If a lead stops replying after the AI&apos;s last message, the AI sends a short, natural nudge. Only between 09:00 and 20:00 in your timezone, never to closed deals, and the count resets when they reply.</p>
                  </div>
                  <Switch checked={cfg.follow_up_enabled} onCheckedChange={(v) => set("follow_up_enabled", v)} disabled={readOnly} label="Follow-ups" />
                </div>
                <div className={cn("grid gap-4 sm:grid-cols-2", !cfg.follow_up_enabled && "opacity-50")}>
                  <Field label="Wait before following up" hint="1 to 168 hours">
                    <div className="flex items-center gap-2">
                      <Input type="number" min={1} max={168} value={cfg.follow_up_after_hours} onChange={(e) => set("follow_up_after_hours", Math.min(168, Math.max(1, Number(e.target.value) || 1)))} className="tnum w-24" />
                      <span className="text-xs text-fg-2">hours</span>
                    </div>
                  </Field>
                  <Field label="Maximum follow-ups per silence" hint="1 to 5">
                    <Select value={cfg.follow_up_max} onChange={(e) => set("follow_up_max", Number(e.target.value))}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Guidance for the follow-up message (optional)" className="sm:col-span-2">
                    <Textarea value={cfg.follow_up_message} maxLength={1000} onChange={(e) => set("follow_up_message", e.target.value)} placeholder="e.g. Mention we have two slots left this week and offer a 10% first-visit discount." />
                  </Field>
                </div>
              </fieldset>
            )}

            {tab === "media" && <MediaPanel initial={media} readOnly={readOnly} />}
          </div>
        </Card>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <SandboxChat config={cfg} />
          <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-fg-3"><Sparkles className="h-3 w-3 text-glow" />The test chat uses your unsaved settings and saved knowledge. Nothing is sent to WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}
