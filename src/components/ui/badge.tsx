import { cn } from "@/lib/utils";

type Tone = "default" | "ai" | "human" | "danger" | "glow" | "brand";
const tones: Record<Tone, string> = {
  default: "bg-white/5 text-fg-2 border-line",
  ai: "bg-ai/10 text-ai border-ai/25",
  human: "bg-human/10 text-human border-human/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  glow: "bg-glow/10 text-glow border-glow/25",
  brand: "bg-brand/15 text-[#93c5fd] border-brand/30",
};

export function Badge({ tone = "default", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", className)} />;
}
