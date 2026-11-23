"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RepliesChart({ data }: { data: { day: string; ai: number; human: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gAi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gHuman" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid stroke="#1E293B" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#112240", border: "1px solid #1E293B", borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: "#94A3B8" }}
          cursor={{ stroke: "#1E293B" }}
        />
        <Area type="monotone" dataKey="human" name="Human replies" stroke="#2563EB" strokeWidth={2} fill="url(#gHuman)" />
        <Area type="monotone" dataKey="ai" name="AI replies" stroke="#38BDF8" strokeWidth={2.5} fill="url(#gAi)" filter="url(#glow)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
