"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Pause, Play } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

const BARS = 36;

function bars(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2654435761) >>> 0;
    const v = (h % 1000) / 1000;
    const env = Math.sin((i / (BARS - 1)) * Math.PI) * 0.55 + 0.45;
    return Math.max(0.15, Math.min(1, v * env + 0.12));
  });
}

export function VoicePlayer({
  id,
  src,
  duration,
  transcript,
  tone,
}: {
  id: string;
  src: string;
  duration?: number | null;
  transcript?: string | null;
  tone: "in" | "out";
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const [showText, setShowText] = useState(false);
  const shape = useMemo(() => bars(id), [id]);
  const total = duration ?? audioRef.current?.duration ?? 0;

  useEffect(() => () => audioRef.current?.pause(), []);

  function ensureAudio() {
    if (audioRef.current) return audioRef.current;
    const a = new Audio(src);
    a.preload = "auto";
    a.ontimeupdate = () => {
      setTime(a.currentTime);
      if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration);
    };
    a.onended = () => {
      setPlaying(false);
      setProgress(0);
      setTime(0);
    };
    a.onwaiting = () => setLoading(true);
    a.onplaying = () => setLoading(false);
    a.onerror = () => {
      setFailed(true);
      setLoading(false);
      setPlaying(false);
    };
    audioRef.current = a;
    return a;
  }

  async function toggle() {
    const a = ensureAudio();
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = ensureAudio();
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (a.duration && isFinite(a.duration)) {
      a.currentTime = p * a.duration;
      setProgress(p);
    }
  }

  const accent = tone === "out" ? "#38BDF8" : "#F1F5F9";
  return (
    <div className="w-64 max-w-full">
      <div className="flex items-center gap-2.5">
        <button
          onClick={toggle}
          disabled={failed}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
            tone === "out" ? "bg-glow/20 text-glow hover:bg-glow/30" : "bg-white/10 text-fg hover:bg-white/15",
          )}
          aria-label={playing ? "Pause voice note" : "Play voice note"}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="flex h-8 flex-1 cursor-pointer items-center gap-[2px]" onClick={seek}>
          {shape.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-full transition-colors"
              style={{ height: `${v * 100}%`, background: i / BARS < progress ? accent : `${accent}40` }}
            />
          ))}
        </div>
        <span className="tnum w-9 text-right text-[11px] text-fg-2">{formatDuration(playing || time ? time : total)}</span>
      </div>
      {failed && <p className="mt-1 text-[11px] text-fg-3">Audio unavailable (WhatsApp engine offline or media expired).</p>}
      {transcript && (
        <div className="mt-2">
          <button onClick={() => setShowText((s) => !s)} className="flex items-center gap-1 text-[11px] font-medium text-fg-2 hover:text-fg">
            <ChevronDown className={cn("h-3 w-3 transition-transform", showText && "rotate-180")} />
            {showText ? "Hide transcript" : "Show transcript"}
          </button>
          {showText && <p className="mt-1.5 rounded-lg bg-black/20 px-2.5 py-2 text-xs leading-relaxed text-fg-2 italic">“{transcript}”</p>}
        </div>
      )}
    </div>
  );
}
