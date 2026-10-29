"use client";
import { useState } from "react";
import { EVENT_KINDS } from "@/lib/eventKinds";
import { Field } from "./ui";

export type EventValues = {
  id?: string;
  title?: string;
  kind?: string;
  date?: string; // yyyy-MM-dd
  endDate?: string; // last day, yyyy-MM-dd
  startTime?: string; // HH:mm
  endTime?: string;
  allDay?: boolean;
  closed?: boolean;
  location?: string | null;
  notes?: string | null;
  projectId?: string | null;
};

export function EventForm({ values = {}, projects, action, submit, back }: {
  values?: EventValues;
  projects: { id: string; name: string }[];
  action: (fd: FormData) => Promise<void>;
  submit: string;
  back?: string;
}) {
  const [kind, setKind] = useState(values.kind ?? "Release");
  const [allDay, setAllDay] = useState(values.allDay ?? true);
  const hint = EVENT_KINDS.find((k) => k.kind === kind)?.hint;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <Field label="Title" className="sm:col-span-2"><input name="title" required defaultValue={values.title} placeholder="e.g. “Lantern” release, Holiday, Listening party" className="input" /></Field>
      <Field label="Kind" className="sm:col-span-2">
        <select
          name="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            if (e.target.value === "Closed" || e.target.value === "Release") setAllDay(true);
          }}
          className="input"
        >
          {EVENT_KINDS.map((k) => <option key={k.kind}>{k.kind}</option>)}
        </select>
        {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      <Field label={allDay ? "First day" : "Date"}><input name="date" type="date" required defaultValue={values.date} className="input" /></Field>
      <Field label={allDay ? "Last day (if more than one)" : "End date (if it runs past midnight)"}><input name="endDate" type="date" defaultValue={values.endDate !== values.date ? values.endDate : ""} className="input" /></Field>
      {!allDay && (
        <>
          <Field label="Starts"><input name="startTime" type="time" required defaultValue={values.startTime ?? "19:00"} className="input" /></Field>
          <Field label="Ends"><input name="endTime" type="time" defaultValue={values.endTime} className="input" /></Field>
        </>
      )}
      <Field label="Location" className="sm:col-span-2"><input name="location" defaultValue={values.location ?? ""} placeholder="Studio A, venue, Zoom link…" className="input" /></Field>
      <Field label="Project (optional)" className="sm:col-span-2">
        <select key={values.projectId ?? ""} name="projectId" defaultValue={values.projectId ?? ""} className="input">
          <option value="">—</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={values.notes ?? ""} className="input" /></Field>
      {kind === "Closed" ? (
        <p className="text-sm text-gray-600 sm:col-span-2">The online booking page won&rsquo;t take requests on these days, and new bookings warn you.</p>
      ) : (
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="closed" defaultChecked={values.closed} className="mt-1" />
          <span>Studio is closed for this (no online booking requests, and new bookings warn you)</span>
        </label>
      )}
      <div className="sm:col-span-2"><button className="btn-primary">{submit}</button></div>
    </form>
  );
}
