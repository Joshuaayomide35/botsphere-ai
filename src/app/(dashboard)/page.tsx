import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Bot, MessagesSquare, Mic, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { RepliesChart } from "@/components/dashboard/replies-chart";
import { STAGES, type Contact } from "@/lib/types";
import { formatMoney, timeAgo } from "@/lib/utils";

export const metadata = { title: "Overview · BotSphere AI" };

export default async function OverviewPage() {
  const { workspace } = await getWorkspaceContext();
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 86400_000);
  since.setHours(0, 0, 0, 0);
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();

  const [activeRes, msgsRes, leadsRes, leadsCountRes, humanRes] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).neq("status", "closed").gte("last_message_at", dayAgo),
    supabase
      .from("messages")
      .select("conversation_id, sender_type, media_type, created_at")
      .eq("workspace_id", workspace.id)
      .in("sender_type", ["ai", "human"])
      .gte("created_at", since.toISOString())
      .limit(10000),
    supabase.from("contacts").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).gte("created_at", since.toISOString()),
    supabase
      .from("conversations")
      .select("id, last_message_preview, last_message_at, contact:contacts(name, phone)")
      .eq("workspace_id", workspace.id)
      .eq("status", "needs_human")
      .order("last_message_at", { ascending: false })
      .limit(6),
  ]);

  const msgs = msgsRes.data ?? [];
  const days: { key: string; day: string; ai: number; human: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    days.push({ key: d.toDateString(), day: d.toLocaleDateString(undefined, { weekday: "short" }), ai: 0, human: 0 });
  }
  const byConv = new Map<string, { ai: boolean; human: boolean }>();
  let voiceNotes = 0;
  for (const m of msgs) {
    const bucket = days.find((d) => d.key === new Date(m.created_at).toDateString());
    if (bucket) bucket[m.sender_type as "ai" | "human"]++;
    if (m.sender_type === "ai" && m.media_type === "audio") voiceNotes++;
    const c = byConv.get(m.conversation_id) ?? { ai: false, human: false };
    c[m.sender_type as "ai" | "human"] = true;
    byConv.set(m.conversation_id, c);
  }
  const handled = [...byConv.values()];
  const resolution = handled.length ? Math.round((handled.filter((c) => c.ai && !c.human).length / handled.length) * 100) : 0;

  const kpis = [
    { label: "Active chats", sub: "last 24 hours", value: String(activeRes.count ?? 0), icon: MessagesSquare },
    { label: "AI resolution rate", sub: "chats with no human reply · 7d", value: handled.length ? `${resolution}%` : "—", icon: Bot },
    { label: "Voice notes sent", sub: "by the AI · 7d", value: String(voiceNotes), icon: Mic },
    { label: "Leads captured", sub: "new contacts · 7d", value: String(leadsCountRes.count ?? 0), icon: UserPlus },
  ];

  const needsHuman = (humanRes.data ?? []) as unknown as { id: string; last_message_preview: string | null; last_message_at: string; contact: { name: string | null; phone: string } }[];
  const leads = (leadsRes.data ?? []) as Contact[];

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader title={`Good to see you 👋`} description={`Here's how ${workspace.name}'s AI agent is performing.`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="relative overflow-hidden p-5">
            <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-glow/10 blur-2xl" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-fg-2">{k.label}</p>
              <k.icon className="h-4 w-4 text-glow" />
            </div>
            <p className="tnum mt-3 text-3xl font-semibold tracking-tight">{k.value}</p>
            <p className="mt-1 text-[11px] text-fg-3">{k.sub}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="AI vs. human replies"
            description="Messages sent in the last 7 days"
            action={
              <div className="flex items-center gap-3 text-[11px] text-fg-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-glow shadow-[0_0_8px_#38BDF8]" />AI</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Human</span>
              </div>
            }
          />
          <div className="p-3">
            <RepliesChart data={days.map(({ day, ai, human }) => ({ day, ai, human }))} />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title={<span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-human" />Needs human attention</span>}
            description="AI paused and handed these over"
            action={<Link href="/inbox?filter=human" className="text-xs text-glow hover:underline">Open</Link>}
          />
          <div className="flex-1 divide-y divide-line">
            {needsHuman.length === 0 ? (
              <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="All clear" description="No chats are waiting for a human." />
            ) : (
              needsHuman.map((c) => (
                <Link key={c.id} href={`/inbox?c=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-card-hover">
                  <Avatar name={c.contact?.name ?? c.contact?.phone} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.contact?.name || c.contact?.phone}</p>
                    <p className="truncate text-xs text-fg-2">{c.last_message_preview}</p>
                  </div>
                  <span className="tnum text-[11px] text-fg-3">{timeAgo(c.last_message_at)}</span>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent leads" description="Newest contacts across all channels" action={<Link href="/crm" className="inline-flex items-center gap-1 text-xs text-glow hover:underline">View CRM <ArrowUpRight className="h-3 w-3" /></Link>} />
        {leads.length === 0 ? (
          <EmptyState title="No leads yet" description="Connect WhatsApp and new conversations will show up here automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-fg-3 uppercase">
                  <th className="px-5 py-2.5 font-medium">Contact</th>
                  <th className="px-5 py-2.5 font-medium">Phone</th>
                  <th className="px-5 py-2.5 font-medium">Stage</th>
                  <th className="px-5 py-2.5 font-medium">Source</th>
                  <th className="px-5 py-2.5 text-right font-medium">Value</th>
                  <th className="px-5 py-2.5 text-right font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leads.map((c) => {
                  const st = STAGES.find((s) => s.id === c.pipeline_stage)!;
                  return (
                    <tr key={c.id} className="hover:bg-card-hover">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={c.name ?? c.phone} size={26} />
                          <span className="font-medium">{c.name || "Unknown"}</span>
                        </div>
                      </td>
                      <td className="tnum px-5 py-2.5 font-mono text-xs text-fg-2">{c.phone}</td>
                      <td className="px-5 py-2.5">
                        <Badge style={{ color: st.color, borderColor: `${st.color}40`, background: `${st.color}14` }}>{st.label}</Badge>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-fg-2">{c.source ?? "—"}</td>
                      <td className="tnum px-5 py-2.5 text-right">{formatMoney(c.deal_value)}</td>
                      <td className="tnum px-5 py-2.5 text-right text-xs text-fg-3">{timeAgo(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
