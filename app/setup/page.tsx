export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthForm, AuthShell } from "@/components/AuthForm";
import { setup } from "./actions";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <AuthShell title="Welcome! Set up your studio">
      <AuthForm action={setup} submit="Create studio">
        <input aria-label="Studio name" name="studio" placeholder="Studio name" required className="input" autoFocus />
        <input aria-label="Your name" name="name" placeholder="Your name" required className="input" />
        <input aria-label="Email" name="email" type="email" placeholder="Email" required className="input" />
        <input aria-label="Password (10+ characters)" name="password" type="password" placeholder="Password (10+ characters)" required minLength={10} className="input" />
        {process.env.SETUP_CODE && <input aria-label="Setup code" name="code" placeholder="Setup code (the SETUP_CODE you chose)" required autoComplete="off" className="input" />}
        <label className="flex items-start gap-2 text-sm text-gray-600">
          <input type="checkbox" name="demo" className="mt-1" />
          <span>Add sample clients, bookings, projects and invoices so I can try it out. Leave this off for your real studio.</span>
        </label>
      </AuthForm>
    </AuthShell>
  );
}
