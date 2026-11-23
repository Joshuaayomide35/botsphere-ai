"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { errorMessage } from "@/lib/utils";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(params.get("next") || "/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          setInfo("Check your inbox and click the confirmation link, then sign in.");
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-base font-semibold">{mode === "login" ? "Sign in to your workspace" : "Create your account"}</h1>
      <p className="mt-1 text-xs text-fg-2">
        {mode === "login" ? "Welcome back. Your AI agents are waiting." : "Launch a WhatsApp AI agent in minutes. No Meta verification."}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3.5">
        {mode === "signup" && (
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" placeholder="Sara Ahmed" />
          </Field>
        )}
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@business.com" />
        </Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}
        <Button type="submit" className="w-full" loading={loading}>
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-fg-2">
        {mode === "login" ? (
          <>
            New to BotSphere? <Link href="/signup" className="text-glow hover:underline">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" className="text-glow hover:underline">Sign in</Link>
          </>
        )}
      </p>
    </Card>
  );
}
