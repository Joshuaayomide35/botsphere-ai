"use client";
import { useRef, useState } from "react";
import { Loader2, Mic, MicOff, Play, Repeat, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { VOICES, type VoiceNoteMode } from "@/lib/types";

const MODES: { id: VoiceNoteMode; label: string; desc: string; icon: typeof Mic }[] = [
  { id: "never", label: "Never", desc: "Always reply with text.", icon: MicOff },
  { id: "mirror_user", label: "Mirror customer", desc: "Reply with a voice note when the customer sent one.", icon: Repeat },
  { id: "always", label: "Always", desc: "Every AI reply is a voice note.", icon: Mic },
];

export function VoicePanel({ mode, voiceId, readOnly, onMode, onVoice }: { mode: VoiceNoteMode; voiceId: string | null; readOnly: boolean; onMode: (m: VoiceNoteMode) => void; onVoice: (v: string) => void }) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const custom = voiceId && !VOICES.some((v) => v.id === voiceId) ? voiceId : "";

  async function preview(id: string) {
    audio.current?.pause();
    if (previewing === id) return setPreviewing(null);
    setPreviewing(id);
    setError(null);
    try {
      const res = await fetch("/api/ai/voice-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voiceId: id }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Preview failed");
      const url = URL.createObjectURL(await res.blob());
      audio.current = new Audio(url);
      audio.current.onended = () => setPreviewing(null);
      await audio.current.play();
    } catch (e) {
      setError((e as Error).message);
      setPreviewing(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-fg-2">When should the agent send voice notes?</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={readOnly}
              onClick={() => onMode(m.id)}
              className={cn("rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed", mode === m.id ? "border-glow/50 bg-glow/5" : "border-line hover:bg-card-hover")}
            >
              <m.icon className={cn("h-4 w-4", mode === m.id ? "text-glow" : "text-fg-3")} />
              <p className="mt-2 text-sm font-medium">{m.label}</p>
              <p className="mt-0.5 text-xs text-fg-2">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-fg-2">Voice</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {VOICES.map((v) => (
            <div key={v.id} className={cn("flex items-center gap-3 rounded-xl border p-3", voiceId === v.id ? "border-glow/50 bg-glow/5" : "border-line")}>
              <button type="button" onClick={() => preview(v.id)} className="flex h-9 w-9 items-center justify-center rounded-full bg-glow/15 text-glow hover:bg-glow/25" aria-label={`Preview ${v.label}`}>
                {previewing === v.id ? <Square className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <button type="button" disabled={readOnly} onClick={() => onVoice(v.id)} className="flex-1 text-left disabled:cursor-not-allowed">
                <p className="text-sm font-medium">{v.label}</p>
                <p className="text-xs text-fg-3">{v.hint}</p>
              </button>
              {voiceId === v.id && <span className="text-[11px] font-medium text-glow">Selected</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            defaultValue={custom}
            disabled={readOnly}
            placeholder="Or paste an ElevenLabs voice ID"
            onBlur={(e) => e.target.value.trim() && onVoice(e.target.value.trim())}
            className="max-w-sm font-mono text-xs"
          />
          {custom && (
            <button type="button" onClick={() => preview(custom)} className="text-xs text-glow hover:underline">
              {previewing === custom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Preview"}
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-fg-3">Preset voices use OpenAI TTS. A custom ElevenLabs ID needs ELEVENLABS_API_KEY. Replies are sent as native WhatsApp voice notes.</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
