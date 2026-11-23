import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign up · BotSphere AI" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
