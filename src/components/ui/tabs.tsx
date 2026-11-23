"use client";
import { cn } from "@/lib/utils";

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: React.ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-sidebar/60 p-0.5", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === it.id ? "bg-card text-fg shadow-[inset_0_0_0_1px_#1E293B]" : "text-fg-2 hover:text-fg",
          )}
        >
          {it.label}
          {typeof it.count === "number" && (
            <span className={cn("tnum rounded px-1 text-[10px]", value === it.id ? "bg-brand/20 text-glow" : "bg-white/5 text-fg-3")}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
