"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { switchWorkspace } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { errorMessage } from "@/lib/utils";

const INDUSTRIES = ["Dental clinic", "Medical clinic", "Real estate", "Restaurant", "Beauty & spa", "E-commerce", "Education", "Agency", "Other"];

export function OnboardingForm({ hasWorkspaces }: { hasWorkspaces: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [seed, setSeed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: id, error } = await supabase.rpc("create_workspace", { p_name: name, p_industry: industry, p_timezone: timezone });
      if (error) throw error;
      if (seed) await supabase.rpc("seed_demo_contacts", { p_workspace: id });
      await switchWorkspace(id as string);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card className="relative w-full max-w-md p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-sidebar text-glow">
        <Building2 className="h-5 w-5" />
      </div>
      <h1 className="text-base font-semibold">Create your workspace</h1>
      <p className="mt-1 text-xs text-fg-2">One workspace per business. You can invite teammates later.</p>
      <form onSubmit={submit} className="mt-5 space-y-3.5">
        <Field label="Business name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Smile Dental Studio" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Industry">
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRIES.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </Select>
          </Field>
          <Field label="Timezone">
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
          <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="accent-[#2563EB]" />
          Load 12 sample CRM contacts so I can explore
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="w-full" loading={loading}>
          Create workspace
        </Button>
        {hasWorkspaces && (
          <Link href="/" className="block text-center text-xs text-fg-2 hover:text-fg">
            Back to dashboard
          </Link>
        )}
      </form>
    </Card>
  );
}
