export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AuthForm, AuthShell } from "@/components/AuthForm";
import { login } from "./actions";

export default async function LoginPage() {
  if ((await db.user.count()) === 0) redirect("/setup");
  if (await currentUser()) redirect("/dashboard");
  return (
    <AuthShell title="Sign in to your studio">
      <AuthForm action={login} submit="Sign in">
        <input aria-label="Email" name="email" type="email" placeholder="Email" required className="input" autoFocus />
        <input aria-label="Password" name="password" type="password" placeholder="Password" required className="input" />
      </AuthForm>
    </AuthShell>
  );
}
