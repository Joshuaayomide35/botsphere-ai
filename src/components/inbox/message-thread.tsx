"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, CheckCheck, Loader2, PanelRightOpen, Send, Sparkles, User, Zap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Notice } from "@/components/ui/misc";
import { cn, clockTime } from "@/lib/utils";
import type { ConversationWithContact, Message, QuickReply } from "@/lib/types";
import { VoicePlayer } from "./voice-player";

export function MessageThread({
  conversation,
  messages,
  loading,
  quickReplies,
  onToggleAi,
  onSend,
  onBack,
  drawerOpen,
  onOpenDrawer,
}: {
  conversation: ConversationWithContact;
  messages: Message[];
  loading: boolean;
  quickReplies: QuickReply[];
  onToggleAi: (on: boolean) => void;
  onSend: (text: string) => Promise<void>;
  onBack: () => void;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrIndex, setQrIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText("");
    setError(null);
  }, [conversation.id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation.id]);

  const slash = text.startsWith("/") && !text.includes(" ") ? text.toLowerCase() : null;
  const matches = useMemo(() => (slash ? quickReplies.filter((q) => q.shortcut.startsWith(slash)).slice(0, 6) : []), [slash, quickReplies]);
  useEffect(() => setQrIndex(0), [slash]);

  function applyQuickReply(q: QuickReply) {
    setText(q.content_text);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(t);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, hint: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Draft failed");
      setText(json.text);
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  const c = conversation.contact;
  let lastDay = "";

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 md:px-4">
        <button onClick={onBack} className="rounded-md p-1.5 text-fg-2 hover:bg-card md:hidden" aria-label="Back to chats">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar name={c?.name ?? c?.phone} seed={conversation.contact_id} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c?.name || c?.phone}</p>
          <p className="tnum truncate font-mono text-[11px] text-fg-3">{c?.phone}</p>
        </div>
        {conversation.status === "needs_human" && <Badge tone="human" className="hidden sm:inline-flex">Needs human</Badge>}
        <div className={cn("flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", conversation.ai_enabled ? "border-ai/30 bg-ai/10 text-ai" : "border-line bg-card text-fg-2")}>
          <Bot className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{conversation.ai_enabled ? "AI on" : "AI off"}</span>
          <Switch checked={conversation.ai_enabled} onCheckedChange={onToggleAi} label="AI for this chat" />
        </div>
        {!drawerOpen && (
          <button onClick={onOpenDrawer} className="rounded-md p-1.5 text-fg-2 hover:bg-card hover:text-fg" title="Contact details">
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.06) 1px, transparent 0)", backgroundSize: "22px 22px" }}
      >
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-fg-3" />
          </div>
        )}
        <div className="mx-auto max-w-3xl space-y-2">
          {messages.map((m) => {
            const day = new Date(m.created_at).toDateString();
            const divider = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {divider && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full border border-line bg-sidebar px-3 py-0.5 text-[11px] text-fg-3">
                      {new Date(m.created_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </div>
                )}
                <Bubble m={m} />
              </div>
            );
          })}
          {!loading && messages.length === 0 && <p className="py-10 text-center text-xs text-fg-3">No messages yet.</p>}
        </div>
      </div>

      <div className="relative shrink-0 border-t border-line bg-sidebar/40 p-3">
        {matches.length > 0 && (
          <div className="absolute right-3 bottom-full left-3 mb-2 overflow-hidden rounded-xl border border-line bg-card shadow-2xl">
            <p className="flex items-center gap-1 border-b border-line px-3 py-1.5 text-[10px] font-medium tracking-wider text-fg-3 uppercase"><Zap className="h-3 w-3" />Quick replies</p>
            {matches.map((q, i) => (
              <button
                key={q.id}
                onMouseDown={(e) => (e.preventDefault(), applyQuickReply(q))}
                className={cn("flex w-full gap-3 px-3 py-2 text-left text-xs", i === qrIndex ? "bg-card-hover" : "")}
              >
                <span className="font-mono text-glow">{q.shortcut}</span>
                <span className="truncate text-fg-2">{q.content_text}</span>
              </button>
            ))}
          </div>
        )}
        {error && <Notice tone="error" className="mb-2">{error}</Notice>}
        {conversation.ai_enabled && (
          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-fg-3">
            <Bot className="h-3 w-3 text-ai" /> The AI is replying in this chat. Sending a message yourself pauses it.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (matches.length) {
                if (e.key === "ArrowDown") return e.preventDefault(), setQrIndex((i) => (i + 1) % matches.length);
                if (e.key === "ArrowUp") return e.preventDefault(), setQrIndex((i) => (i - 1 + matches.length) % matches.length);
                if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), applyQuickReply(matches[qrIndex]);
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Type a message · “/” for quick replies · Shift+Enter for a new line"
            className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm outline-none placeholder:text-fg-3 focus:border-glow/50"
          />
          <Button variant="secondary" onClick={draft} loading={drafting} title="Draft a reply with AI" className="h-10">
            {!drafting && <Sparkles className="h-4 w-4 text-glow" />}
            <span className="hidden lg:inline">Draft with AI</span>
          </Button>
          <Button onClick={send} loading={sending} disabled={!text.trim()} className="h-10 w-10 p-0" aria-label="Send">
            {!sending && <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  if (m.sender_type === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full border border-human/25 bg-human/10 px-3 py-1 text-[11px] text-human">{m.content_text}</span>
      </div>
    );
  }
  const out = m.sender_type !== "contact";
  const mediaSrc = m.media_url && /^https?:/.test(m.media_url) ? m.media_url : `/api/media/${m.id}`;
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed sm:max-w-[70%]",
          out
            ? m.sender_type === "ai"
              ? "rounded-br-md border border-glow/20 bg-[#0f2a4d] text-fg"
              : "rounded-br-md bg-brand text-white"
            : "rounded-bl-md border border-line bg-card text-fg",
        )}
      >
        {out && (
          <p className={cn("mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase", m.sender_type === "ai" ? "text-glow" : "text-white/70")}>
            {m.sender_type === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {m.sender_type === "ai" ? "AI Agent" : "Human"}
          </p>
        )}
        {m.media_type === "audio" ? (
          <VoicePlayer id={m.id} src={mediaSrc} duration={m.duration_sec} transcript={m.transcript_text} tone={out ? "out" : "in"} />
        ) : m.media_type === "image" ? (
          <div className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaSrc} alt={m.content_text ?? "Image"} className="max-h-72 rounded-lg" loading="lazy" />
            {m.content_text && <p className="whitespace-pre-wrap">{m.content_text}</p>}
          </div>
        ) : (
          <p className="break-words whitespace-pre-wrap">{m.content_text}</p>
        )}
        <p className={cn("tnum mt-1 flex items-center justify-end gap-1 text-[10px]", out && m.sender_type === "human" ? "text-white/60" : "text-fg-3")}>
          {clockTime(m.created_at)}
          {out && <CheckCheck className="h-3 w-3" />}
        </p>
      </div>
    </div>
  );
}
