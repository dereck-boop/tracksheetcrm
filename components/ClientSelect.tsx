"use client";
import { useEffect, useRef, useState } from "react";

export const NEW_CLIENT = "__new";

/**
 * Client dropdown with a "New client" choice that opens inline fields.
 * Server actions turn the submitted fields into a contact via resolveClient().
 */
export type NewClientPrefill = { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; notes?: string | null };

export function ClientSelect({ name, options, defaultValue, placeholder = "—", label = "Client", values, prefill }: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  label?: string;
  /** Previously submitted form values, to refill the inline new-client fields. */
  values?: Record<string, string>;
  /** Details to start the new-client fields with, e.g. from an online booking request. */
  prefill?: NewClientPrefill;
}) {
  // The select is uncontrolled and keyed on the saved value: React 19 resets a form after its action
  // runs, and a controlled select (or one whose defaultValue changed) would snap back to "—", so the
  // next save would wipe the client.
  const initial = values?.[name] ?? defaultValue ?? "";
  const [isNew, setIsNew] = useState(initial === NEW_CLIENT);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setIsNew(initial === NEW_CLIENT);
  }
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setTimeout(() => setIsNew(ref.current?.value === NEW_CLIENT));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  const start = (field: keyof NewClientPrefill) => values?.[`${name}_${field}`] ?? prefill?.[field] ?? undefined;
  return (
    <>
      <label className="block">
        <span className="label">{label}</span>
        <select key={initial} ref={ref} name={name} defaultValue={initial} onChange={(e) => setIsNew(e.target.value === NEW_CLIENT)} className="input">
          <option value="">{placeholder}</option>
          <option value={NEW_CLIENT}>+ New client…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {isNew && (
        <div className="col-span-full grid gap-3 rounded-lg border border-dashed border-gray-300 p-4 sm:grid-cols-4">
          <input name={`${name}_firstName`} defaultValue={start("firstName")} placeholder="First name" required autoFocus className="input" />
          <input name={`${name}_lastName`} defaultValue={start("lastName")} placeholder="Last name" className="input" />
          <input name={`${name}_email`} defaultValue={start("email")} type="email" placeholder="Email" className="input" />
          <input name={`${name}_phone`} defaultValue={start("phone")} type="tel" placeholder="Phone" className="input" />
          {start("notes") && <input type="hidden" name={`${name}_notes`} value={start("notes")} />}
        </div>
      )}
    </>
  );
}
