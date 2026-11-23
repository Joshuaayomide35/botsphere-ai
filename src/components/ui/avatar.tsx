import { cn, initials } from "@/lib/utils";

const palette = ["#2563EB", "#0EA5E9", "#7C3AED", "#DB2777", "#059669", "#D97706", "#0891B2", "#4F46E5"];

export function Avatar({ name, seed, size = 36, className }: { name?: string | null; seed?: string; size?: number; className?: string }) {
  const key = seed ?? name ?? "";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const color = palette[h % palette.length];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${color}, ${color}99)` }}
    >
      {initials(name, "#")}
    </span>
  );
}
