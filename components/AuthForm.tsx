"use client";
import { submitKeeping } from "./keepForm";
import { useActionState, useEffect, useRef } from "react";

type Action = (prev: string | null, fd: FormData) => Promise<string | null>;

export function AuthForm({ action, submit, children }: { action: Action; submit: string; children: React.ReactNode }) {
  const [error, formAction, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  // After a successful password change, don't leave the passwords sitting in the fields.
  useEffect(() => { if (error?.startsWith("Password updated")) form.current?.reset(); }, [error]);
  return (
    <form ref={form} onSubmit={submitKeeping(formAction)} className="space-y-4">
      {children}
      {error && <p className={`rounded-md px-3 py-2 text-sm ${error.startsWith("Password updated") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Please wait…" : submit}
      </button>
    </form>
  );
}

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-side px-4">
      <div className="w-full max-w-sm rounded-md bg-white p-8 shadow-xl">
        <div className="mb-1 font-display text-2xl tracking-tight text-black">TrackSheet CRM</div>
        <h1 className="mb-6 font-sans text-sm tracking-normal text-gray-500">{title}</h1>
        {children}
      </div>
    </main>
  );
}
