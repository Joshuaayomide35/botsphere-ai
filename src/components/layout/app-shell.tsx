"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Bot, Building2, Check, ChevronDown, ChevronsLeft, ChevronsRight, Inbox, LayoutDashboard, LogOut, Plus,
  QrCode, Search, Settings, Sparkles, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { subscribeAsUser } from "@/lib/supabase/realtime";
import { setGlobalAiPaused, signOut, switchWorkspace } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ui/avatar";
import { CommandPalette } from "./command-palette";
import { WorkspaceProvider, type ClientWorkspace } from "./workspace-provider";
import type { ChannelStatus, MemberRole } from "@/lib/types";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: true },
  { href: "/crm", label: "CRM", icon: Users },
  { href: "/agent-studio", label: "Agent Studio", icon: Sparkles },
  { href: "/connect", label: "WhatsApp Connect", icon: QrCode },
  { href: "/settings", label: "Settings", icon: Settings },
];

export interface ShellProps {
  workspace: ClientWorkspace;
  workspaces: { id: string; name: string; role: MemberRole }[];
  user: { name: string; email: string };
  channel: { status: ChannelStatus; phone: string | null } | null;
  unread: number;
  aiPaused: boolean;
  children: React.ReactNode;
}

export function AppShell(props: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("bs_sidebar") === "1");
    } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("bs_sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <WorkspaceProvider value={props.workspace}>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar {...props} collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar {...props} onSearch={() => setPaletteOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto">{props.children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </WorkspaceProvider>
  );
}

function useLiveUnread(initial: number, workspaceId: string) {
  const [unread, setUnread] = useState(initial);
  useEffect(() => setUnread(initial), [initial]);
  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const { data } = await supabase.from("conversations").select("unread_count").eq("workspace_id", workspaceId).gt("unread_count", 0);
      setUnread((data ?? []).reduce((s, r) => s + (r.unread_count as number), 0));
    };
    return subscribeAsUser(supabase, `unread:${workspaceId}`, (ch) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspaceId}` }, refresh),
    );
  }, [workspaceId]);
  return unread;
}

function Sidebar({ workspace, workspaces, user, unread: initialUnread, collapsed, onToggle }: ShellProps & { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const unread = useLiveUnread(initialUnread, workspace.id);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-line", collapsed ? "justify-center" : "gap-2.5 px-4")}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-glow shadow-[0_0_24px_-6px_#38BDF8]">
          <Bot className="h-4.5 w-4.5 text-white" />
        </span>
        {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">BotSphere AI</span>}
      </div>

      <div className={cn("border-b border-line p-2", collapsed && "flex justify-center")}>
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} collapsed={collapsed} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex h-9 items-center rounded-lg text-sm transition-colors",
                collapsed ? "justify-center" : "gap-3 px-3",
                active ? "bg-brand/15 text-fg" : "text-fg-2 hover:bg-card hover:text-fg",
              )}
            >
              {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-glow" />}
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-glow")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {item.badge && unread > 0 && (
                <span
                  className={cn(
                    "tnum rounded-full bg-brand px-1.5 text-[10px] leading-4 font-semibold text-white",
                    collapsed ? "absolute top-1 right-1.5" : "ml-auto",
                  )}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-2">
        <div className={cn("flex items-center gap-2.5 rounded-lg p-1.5", collapsed && "justify-center")}>
          <Avatar name={user.name} size={28} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-[11px] text-fg-3">{user.email}</p>
            </div>
          )}
          {!collapsed && (
            <form action={signOut}>
              <button title="Sign out" className="rounded-md p-1.5 text-fg-3 hover:bg-card hover:text-fg">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
        <button
          onClick={onToggle}
          className={cn("mt-1 flex h-8 w-full items-center rounded-lg text-xs text-fg-3 hover:bg-card hover:text-fg", collapsed ? "justify-center" : "gap-2 px-3")}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}

function WorkspaceSwitcher({ current, workspaces, collapsed }: { current: ClientWorkspace; workspaces: ShellProps["workspaces"]; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center rounded-lg text-left hover:bg-card", collapsed ? "justify-center p-1.5" : "gap-2.5 p-2")}
        title={current.name}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-card text-[11px] font-bold text-glow">
          {current.name.slice(0, 2).toUpperCase()}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{current.name}</span>
              <span className="block text-[10px] text-fg-3 capitalize">{current.role}</span>
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-fg-3", pending && "animate-pulse")} />
          </>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-xl border border-line bg-card p-1 shadow-2xl shadow-black/50">
          <p className="px-2 py-1.5 text-[10px] font-medium tracking-wider text-fg-3 uppercase">Workspaces</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setOpen(false);
                if (w.id !== current.id)
                  start(async () => {
                    await switchWorkspace(w.id);
                    router.refresh();
                  });
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-card-hover"
            >
              <Building2 className="h-3.5 w-3.5 text-fg-3" />
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === current.id && <Check className="h-3.5 w-3.5 text-glow" />}
            </button>
          ))}
          <Link href="/onboarding" className="mt-1 flex items-center gap-2 rounded-lg border-t border-line px-2 py-2 text-xs text-fg-2 hover:bg-card-hover hover:text-fg">
            <Plus className="h-3.5 w-3.5" /> New workspace
          </Link>
        </div>
      )}
    </div>
  );
}

function TopBar({ workspace, channel, aiPaused, onSearch }: ShellProps & { onSearch: () => void }) {
  const [paused, setPaused] = useState(aiPaused);
  const [status, setStatus] = useState(channel);
  const [pending, start] = useTransition();
  useEffect(() => setPaused(aiPaused), [aiPaused]);
  useEffect(() => setStatus(channel), [channel]);

  useEffect(() => {
    const supabase = createClient();
    return subscribeAsUser(supabase, `channel-status:${workspace.id}`, (ch) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: "channels", filter: `workspace_id=eq.${workspace.id}` }, (p) => {
        const row = p.new as { status?: ChannelStatus; phone_number?: string | null };
        if (row?.status) setStatus({ status: row.status, phone: row.phone_number ?? null });
      }),
    );
  }, [workspace.id]);

  const pill = useMemo(() => {
    const s = status?.status ?? "disconnected";
    return {
      connected: { label: "WhatsApp Connected", cls: "border-ai/30 bg-ai/10 text-ai", dot: "bg-ai animate-pulse" },
      qr_pending: { label: "Waiting for QR scan", cls: "border-human/30 bg-human/10 text-human", dot: "bg-human" },
      disconnected: { label: "WhatsApp Disconnected", cls: "border-danger/30 bg-danger/10 text-danger", dot: "bg-danger" },
    }[s];
  }, [status]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur md:px-6">
      <button
        onClick={onSearch}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-sidebar/60 px-3 text-sm text-fg-3 hover:border-fg-3/40"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 truncate text-left">Search contacts, chats, pages…</span>
        <kbd className="hidden rounded border border-line px-1.5 text-[10px] sm:inline">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-3">
        <Link href="/connect" className={cn("hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium md:inline-flex", pill.cls)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", pill.dot)} />
          {pill.label}
          {status?.status === "connected" && status.phone && <span className="tnum text-fg-2">{status.phone}</span>}
        </Link>
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
            paused ? "border-human/30 bg-human/10 text-human" : "border-line bg-card text-fg-2",
          )}
          title={workspace.canManage ? "Pause or resume AI replies in every chat" : "Only owners and admins can change this"}
        >
          <span className="hidden sm:inline">{paused ? "AI paused" : "AI active"}</span>
          <Switch
            checked={!paused}
            disabled={!workspace.canManage || pending}
            label="Global AI"
            onCheckedChange={(on) => {
              setPaused(!on);
              start(async () => {
                const r = await setGlobalAiPaused(!on);
                if ("error" in r) setPaused(on);
              });
            }}
          />
        </div>
      </div>
    </header>
  );
}
