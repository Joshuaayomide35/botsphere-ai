import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      {icon && <div className="mb-1 rounded-xl border border-line bg-sidebar/60 p-3 text-glow">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-sm text-xs text-fg-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "error" | "success" | "warn"; children: React.ReactNode; className?: string }) {
  const t = {
    info: "border-glow/25 bg-glow/5 text-[#bae6fd]",
    error: "border-danger/30 bg-danger/10 text-[#fecaca]",
    success: "border-ai/30 bg-ai/10 text-[#a7f3d0]",
    warn: "border-human/30 bg-human/10 text-[#fde68a]",
  }[tone];
  return <div className={cn("rounded-lg border px-3 py-2 text-xs leading-relaxed", t, className)}>{children}</div>;
}
