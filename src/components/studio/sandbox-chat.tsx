"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, FlaskConical, Hand, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string; handover?: string | null; images?: { url: string; title: string }[] };

export function SandboxChat({ config }: { config: AgentConfig }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/test-sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), config }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test failed");
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content: json.reply || "(no reply)",
          handover: json.handover ? json.handoverReason || "Handover triggered" : null,
          images: (json.media ?? []).map((x: { url: string; title: string }) => ({ url: x.url, title: x.title })),
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-[640px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="h-4 w-4 text-glow" /> Test chat
        </div>
        <Button variant="ghost" size="sm" onClick={() => (setMsgs([]), setError(null))} disabled={!msgs.length}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-sidebar/40 p-4">
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-glow shadow-[0_0_30px_-8px_#38BDF8]">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <p className="mt-3 text-sm font-medium">Chat with {config.bot_name || "your agent"}</p>
            <p className="mt-1 max-w-60 text-xs text-fg-3">Pretend to be a customer. Try a price question, a booking request or asking for a human.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {["How much does whitening cost?", "Can I book for tomorrow?", "I want to talk to a real person"].map((s) => (
                <button key={s} onClick={() => setText(s)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg-2 hover:border-glow/40 hover:text-fg">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap", m.role === "user" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-glow/20 bg-[#0f2a4d]")}>
              {m.content}
              {m.images?.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.url} src={img.url} alt={img.title} className="mt-2 max-h-40 rounded-lg" />
              ))}
            </div>
            {m.handover && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-human/30 bg-human/10 px-2 py-0.5 text-[10px] text-human">
                <Hand className="h-3 w-3" /> Handover: {m.handover}
              </span>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-card px-3 py-2.5" style={{ width: 56 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-glow" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}
        {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-[#fecaca]">{error}</p>}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message as a customer…"
          className="h-10 flex-1 rounded-xl border border-line bg-canvas px-3.5 text-sm outline-none placeholder:text-fg-3 focus:border-glow/50"
        />
        <Button onClick={send} disabled={!text.trim()} loading={busy} className="h-10 w-10 p-0" aria-label="Send test message">
          {!busy && <Send className="h-4 w-4" />}
        </Button>
      </div>
    </Card>
  );
}
