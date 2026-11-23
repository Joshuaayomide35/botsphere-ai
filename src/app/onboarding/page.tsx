import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Create workspace · BotSphere AI" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { count } = await supabase.from("workspace_members").select("id", { count: "exact", head: true }).eq("user_id", user.id);

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]" />
      <OnboardingForm hasWorkspaces={(count ?? 0) > 0} />
    </div>
  );
}
