export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { pendingTwoStep } from "@/lib/auth";
import { AuthForm, AuthShell } from "@/components/AuthForm";
import { verifyTwoStep } from "../actions";

export default async function VerifyPage() {
  if (!(await pendingTwoStep())) redirect("/login");
  return (
    <AuthShell title="Enter the code from your authenticator app">
      <AuthForm action={verifyTwoStep} submit="Sign in">
        <input aria-label="123456" name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="input text-center font-mono text-xl tracking-[0.3em]" />
        <p className="text-xs text-gray-500">Lost your phone? Type one of your backup codes instead (like 7KQ4-M2XD).</p>
      </AuthForm>
    </AuthShell>
  );
}
