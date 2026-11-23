import { Bot } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-glow">
            <Bot className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-semibold tracking-tight">BotSphere AI</span>
        </div>
        {children}
      </div>
    </div>
  );
}
