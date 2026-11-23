"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, LogOut, QrCode, RefreshCw, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import type { ChannelStatus } from "@/lib/types";

type Initial = { status: ChannelStatus; phone_number: string | null; profile_name: string | null; connected_at: string | null } | null;
type State = "idle" | "loading" | "qr" | "connected" | "disconnected";

async function api(action: string) {
  const res = await fetch("/api/whatsapp/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as { state?: string; qr?: string | null; phone?: string | null; profileName?: string | null };
}

export function ConnectCard({ initial, configured, canManage }: { initial: Initial; configured: boolean; canManage: boolean }) {
  const ws = useWorkspace();
  const [state, setState] = useState<State>(initial?.status === "connected" ? "connected" : "disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState(initial?.phone_number ?? null);
  const [profile, setProfile] = useState(initial?.profile_name ?? null);
  const [connectedAt, setConnectedAt] = useState(initial?.connected_at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qrAge, setQrAge] = useState(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };

  const markConnected = useCallback((p: string | null | undefined, name: string | null | undefined) => {
    stopPolling();
    setState("connected");
    setQr(null);
    if (p) setPhone(p);
    if (name) setProfile(name);
    setConnectedAt((c) => c ?? new Date().toISOString());
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setBusy("start");
    setState("loading");
    try {
      const r = await api("start");
      if (r.state === "open") return markConnected(r.phone, r.profileName);
      setQr(r.qr ?? null);
      setQrAge(0);
      setState("qr");
      stopPolling();
      let ticks = 0;
      poll.current = setInterval(async () => {
        ticks++;
        setQrAge((a) => a + 3);
        try {
          const s = await api("status");
          if (s.state === "open") markConnected(s.phone, s.profileName);
          else if (ticks % 10 === 0) {
            const fresh = await api("start");
            if (fresh.state === "open") markConnected(fresh.phone, fresh.profileName);
            else {
              setQr(fresh.qr ?? null);
              setQrAge(0);
            }
          }
          if (ticks > 100) {
            stopPolling();
            setState("disconnected");
            setError("QR code expired. Click “Generate QR code” to try again.");
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    } catch (e) {
      setError((e as Error).message);
      setState("disconnected");
    } finally {
      setBusy(null);
    }
  }, [markConnected]);

  useEffect(() => stopPolling, []);

  // Live status from the Evolution webhook (connection.update → channels row).
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`connect:${ws.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "channels", filter: `workspace_id=eq.${ws.id}` }, (p) => {
        const row = p.new as { status: ChannelStatus; phone_number: string | null; profile_name: string | null };
        if (row.status === "connected") markConnected(row.phone_number, row.profile_name);
        if (row.status === "disconnected" && !poll.current) setState("disconnected");
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ws.id, markConnected]);

  async function act(action: "restart" | "logout") {
    setBusy(action);
    setError(null);
    try {
      await api(action);
      if (action === "logout") {
        setState("disconnected");
        setPhone(null);
        setProfile(null);
        setConnectedAt(null);
      } else {
        const s = await api("status");
        if (s.state === "open") markConnected(s.phone, s.profileName);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const statusBadge = {
    connected: <Badge tone="ai"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai" />Connected</Badge>,
    qr: <Badge tone="human">Waiting for scan</Badge>,
    loading: <Badge tone="glow">Starting…</Badge>,
    idle: <Badge>Idle</Badge>,
    disconnected: <Badge tone="danger">Disconnected</Badge>,
  }[state];

  return (
    <>
      <PageHeader title="WhatsApp Connect" description="Link a WhatsApp number by scanning a QR code. No Meta verification needed." />
      {!configured && (
        <Notice tone="warn" className="mb-4">
          The WhatsApp engine isn&apos;t configured yet. Start Evolution API with <code className="font-mono">docker compose up -d</code> in the{" "}
          <code className="font-mono">docker/</code> folder, then set <code className="font-mono">EVOLUTION_API_URL</code> and{" "}
          <code className="font-mono">EVOLUTION_API_KEY</code> in <code className="font-mono">.env.local</code> and restart the app.
        </Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="relative overflow-hidden lg:col-span-3">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-96 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
          <div className="relative flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <QrCode className="h-4 w-4 text-glow" /> WhatsApp number
            </div>
            {statusBadge}
          </div>
          <div className="relative flex flex-col items-center px-6 py-10 text-center">
            {state === "connected" ? (
              <>
                <div className="relative">
                  <Avatar name={profile ?? phone ?? "WA"} size={72} />
                  <CheckCircle2 className="absolute -right-1 -bottom-1 h-6 w-6 rounded-full bg-card text-ai" />
                </div>
                <p className="mt-4 text-lg font-semibold">{profile ?? "WhatsApp Business"}</p>
                <p className="tnum font-mono text-sm text-fg-2">{phone ?? "Number hidden"}</p>
                {connectedAt && <p className="mt-1 text-xs text-fg-3">Connected {timeAgo(connectedAt)} ago</p>}
                <p className="mt-4 max-w-sm text-xs text-fg-2">
                  Incoming chats now stream into the Inbox in real time. Keep the phone online occasionally so the session stays linked.
                </p>
              </>
            ) : state === "qr" || state === "loading" ? (
              <>
                <div className={cn("relative rounded-2xl border border-line bg-white p-3 shadow-[0_0_60px_-15px_#38BDF8]", state === "loading" && "opacity-60")}>
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="WhatsApp QR code" className="h-64 w-64" />
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
                <p className="mt-4 text-sm font-medium">Scan with WhatsApp on your phone</p>
                <p className="tnum mt-1 text-xs text-fg-3">
                  {state === "qr" ? `Checking every 3s · QR refreshes automatically (${qrAge}s)` : "Starting the WhatsApp engine…"}
                </p>
              </>
            ) : (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-line bg-sidebar">
                  <WifiOff className="h-8 w-8 text-fg-3" />
                </div>
                <p className="mt-4 text-base font-semibold">No WhatsApp number linked</p>
                <p className="mt-1 max-w-sm text-xs text-fg-2">Generate a QR code and scan it from WhatsApp → Linked devices.</p>
              </>
            )}
            {error && <Notice tone="error" className="mt-5 max-w-md text-left">{error}</Notice>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {state !== "connected" && (
                <Button onClick={start} loading={busy === "start"} disabled={!canManage || !configured}>
                  <QrCode className="h-4 w-4" /> {state === "qr" ? "New QR code" : "Generate QR code"}
                </Button>
              )}
              {state === "connected" && (
                <>
                  <Button variant="secondary" onClick={() => act("restart")} loading={busy === "restart"} disabled={!canManage}>
                    <RefreshCw className="h-4 w-4" /> Restart session
                  </Button>
                  <Button variant="danger" onClick={() => confirm("Disconnect this WhatsApp number?") && act("logout")} loading={busy === "logout"} disabled={!canManage}>
                    <LogOut className="h-4 w-4" /> Disconnect
                  </Button>
                </>
              )}
            </div>
            {!canManage && <p className="mt-3 text-xs text-fg-3">Only owners and admins can change the WhatsApp connection.</p>}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold">How to link</h3>
          <ol className="mt-4 space-y-4">
            {[
              ["Open WhatsApp", "On the phone with your business number."],
              ["Go to Linked devices", "Settings → Linked devices → Link a device."],
              ["Scan the QR code", "Point your phone at the code on the left."],
              ["Done", "Chats appear in the Inbox and your AI agent starts replying."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-sidebar text-xs text-glow">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium">{t}</p>
                  <p className="text-xs text-fg-2">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 space-y-3 border-t border-line pt-5 text-xs text-fg-2">
            <p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-ai" /> Works with regular WhatsApp and WhatsApp Business. No Meta developer app.</p>
            <p className="flex gap-2"><Smartphone className="h-4 w-4 shrink-0 text-glow" /> Replies you send from your phone are detected and pause the AI for that chat.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
