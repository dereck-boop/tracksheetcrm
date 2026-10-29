"use client";
import { useActionState, useState } from "react";
import type { BookingResult } from "@/app/(app)/bookings/actions";
import { ClientSelect, type NewClientPrefill } from "./ClientSelect";

type Opt = { value: string; label: string };
export type BookingDefaults = {
  id?: string; title?: string; roomId?: string; typeId?: string | null; contactId?: string | null; projectId?: string | null;
  engineerId?: string | null; status?: string; startsAt?: string; endsAt?: string; rate?: string; depositAmount?: string; notes?: string | null;
};

export function BookingForm({ action, defaults, rooms, types, contacts, projects, engineers, statuses, allowRepeat, submit, newClient }: {
  action: (prev: BookingResult, fd: FormData) => Promise<BookingResult>;
  defaults: BookingDefaults;
  rooms: Opt[]; types: Opt[]; contacts: Opt[]; projects: Opt[]; engineers: Opt[]; statuses: string[];
  allowRepeat?: boolean;
  submit: string;
  /** Starting details for "+ New client" (an online request's name, email and phone). */
  newClient?: NewClientPrefill;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  // After an error or conflict React resets the form, so refill it with what was submitted.
  const v: Record<string, string | undefined> = Object.fromEntries(Object.entries({ ...defaults, ...(state?.values ?? {}) }).map(([k, x]) => [k, x ?? undefined]));
  const [repeat, setRepeat] = useState("");
  const sel = (name: string, opts: Opt[], value?: string | null, placeholder?: string, required?: boolean) => (
    <select key={value ?? ""} name={name} defaultValue={value ?? ""} className="input" required={required}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <label className="sm:col-span-2"><span className="label">Title</span><input name="title" required defaultValue={v.title} placeholder="e.g. Wildflowers – drums" className="input" /></label>
      <label><span className="label">Studio</span>{sel("roomId", rooms, v.roomId, undefined, true)}</label>
      <label><span className="label">Session type</span>{sel("typeId", types, v.typeId, "—")}</label>
      <label><span className="label">Starts</span><input name="startsAt" type="datetime-local" required defaultValue={v.startsAt} className="input" /></label>
      <label><span className="label">Ends</span><input name="endsAt" type="datetime-local" required defaultValue={v.endsAt} className="input" /></label>
      <ClientSelect name="contactId" options={contacts} defaultValue={v.contactId} values={state?.values} prefill={newClient} />
      <label><span className="label">Project</span>{sel("projectId", projects, v.projectId, "—")}</label>
      <label><span className="label">Engineer</span>{sel("engineerId", engineers, v.engineerId, "Unassigned")}</label>
      <label><span className="label">Status</span>{sel("status", statuses.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })), v.status ?? "HOLD")}</label>
      <label><span className="label">Session total ($)</span><input name="rate" inputMode="decimal" defaultValue={v.rate} className="input" /></label>
      <label><span className="label">Deposit required ($)</span><input name="depositAmount" inputMode="decimal" defaultValue={v.depositAmount} className="input" /></label>
      {allowRepeat && (
        <div className="grid grid-cols-2 gap-4 sm:col-span-2">
          <label><span className="label">Repeat</span>
            <select name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)} className="input">
              <option value="">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every 2 weeks</option><option value="MONTHLY">Monthly</option>
            </select>
          </label>
          {repeat && <label><span className="label">Number of sessions</span><input name="repeatCount" type="number" min={2} max={52} defaultValue={v.repeatCount ?? 4} className="input" /></label>}
        </div>
      )}
      <label className="sm:col-span-2"><span className="label">Notes</span><textarea name="notes" rows={3} defaultValue={v.notes ?? ""} className="input" /></label>
      {defaults.id && defaults.status === "CONFIRMED" && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="notifyClient" defaultChecked /> Email the client if the time or studio changes</label>
      )}
      {state?.notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:col-span-2">{state.notice}</p>}
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      {state?.conflicts && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
          <p className="font-medium">Scheduling conflicts:</p>
          <ul className="ml-4 list-disc">{state.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="override" /> Book anyway</label>
        </div>
      )}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submit}</button></div>
    </form>
  );
}
