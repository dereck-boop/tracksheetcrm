"use client";
import { submitKeeping } from "./keepForm";
import { useActionState } from "react";
import type { TwoStepState } from "@/app/(app)/account/actions";

/** A small form for a two-step login action; shows backup codes once when the action returns them. */
export function TwoStepForm({ action, submit, field, danger = false }: {
  action: (prev: TwoStepState, fd: FormData) => Promise<TwoStepState>;
  submit: string;
  field: "code" | "password";
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state?.codes) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-700"><strong>Save these backup codes</strong> somewhere safe (a password manager, or print them). Each one works once if you lose your phone. You won&apos;t see them again.</p>
        <ul className="grid grid-cols-2 gap-1 rounded-md bg-gray-50 p-3 font-mono text-sm">{state.codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(state.codes!.join("\n"))}>Copy</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => window.print()}>Print</button>
          <a href="/account" className="btn-primary btn-sm">I&apos;ve saved them</a>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={submitKeeping(formAction)} className="flex flex-wrap items-start gap-2">
      {field === "code"
        ? <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="input w-36 font-mono" />
        : <input name="password" type="password" required autoComplete="current-password" placeholder="Your password" className="input w-48" />}
      <button className={danger ? "btn-danger" : "btn-primary"} disabled={pending}>{pending ? "Please wait…" : submit}</button>
      {state?.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
