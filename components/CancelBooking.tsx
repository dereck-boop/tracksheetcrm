"use client";
import { useState } from "react";
import { render } from "@/lib/renderTemplate";
import { cancelBooking } from "@/app/(app)/bookings/actions";

type Template = { subject: string; body: string; enabled: boolean };
type Kind = "cancel" | "noshow";
type Outcome = "policy" | "keep" | "waive";
type Terms = { noticeHours: number; late: boolean; percent: number; sessionTotal: number; fee: number; deposit: number; extra: number };

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);

/** Puts the policy paragraph where the template asks for it, or before the sign-off when an older template has no {{policy_note}}. */
function withNote(body: string, note: string) {
  if (/\{\{\s*policy_note\s*\}\}/.test(body) || !note) return body;
  const i = body.lastIndexOf("\n\nThank you,");
  return i >= 0 ? `${body.slice(0, i)}\n\n${note}${body.slice(i)}` : `${body}\n\n${note}`;
}

/**
 * Cancel a session or mark it a no-show. Shows what the cancellation policy says (late or not,
 * the fee, what the deposit covers), lets the studio apply it, keep just the deposit or let it go,
 * and shows the client email for this one send.
 */
export function CancelBooking({ bookingId, to, started, lateHours, terms, notes, templates, vars }: {
  bookingId: string;
  to: string | null;
  started: boolean;
  lateHours: number;
  terms: Record<Kind, Terms>;
  notes: Record<Kind, Record<Outcome, string>>;
  templates: Record<Kind, Template>;
  vars: Record<string, string>;
}) {
  const [kind, setKind] = useState<Kind>(started ? "noshow" : "cancel");
  const t = terms[kind];
  const defaultOutcome = (k: Kind): Outcome => (terms[k].fee > 0 ? "policy" : terms[k].late && terms[k].deposit ? "keep" : "waive");
  const [outcome, setOutcome] = useState<Outcome>(defaultOutcome(kind));
  const [edited, setEdited] = useState<{ subject: string; body: string } | null>(null);
  const [send, setSend] = useState(Boolean(to) && templates[kind].enabled);
  const tpl = templates[kind];
  const note = notes[kind][outcome];
  const fill = { ...vars, policy_note: note, fee_link: "{{fee_link}}" };
  const subject = edited?.subject ?? render(tpl.subject, fill);
  const body = edited?.body ?? render(withNote(tpl.body, note), fill);

  const chooseKind = (k: Kind) => { setKind(k); setOutcome(defaultOutcome(k)); setEdited(null); setSend(Boolean(to) && templates[k].enabled); };
  const chooseOutcome = (o: Outcome) => { setOutcome(o); setEdited(null); };

  const what = kind === "noshow" ? "a no-show" : t.late ? `late (under ${lateHours} hours' notice)` : "with enough notice";
  const options: { value: Outcome; label: string; hint: string }[] = [
    ...(t.fee > 0 ? [{ value: "policy" as const, label: "Apply the policy", hint: t.extra ? `Keep ${t.deposit ? `the ${usd(t.deposit)} deposit and ` : ""}invoice ${usd(t.extra)}` : `Keep the ${usd(t.deposit)} deposit (covers the ${usd(t.fee)} fee)` }] : []),
    ...(t.deposit ? [{ value: "keep" as const, label: "Keep the deposit only", hint: `Keep ${usd(t.deposit)}, no other charge` }] : []),
    { value: "waive", label: "Let it go", hint: t.deposit ? `No charge; the ${usd(t.deposit)} deposit becomes credit for next time` : "No charge" },
  ];

  return (
    <form action={cancelBooking} className="space-y-4">
      <input type="hidden" name="id" value={bookingId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="outcome" value={outcome} />
      {started && (
        <div className="grid grid-cols-2 gap-2">
          {(["noshow", "cancel"] as Kind[]).map((k) => (
            <button key={k} type="button" onClick={() => chooseKind(k)} className={`rounded-md border px-3 py-2 text-left text-sm ${kind === k ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-gray-300 bg-white hover:bg-gray-50"}`}>
              <span className="block font-medium">{k === "noshow" ? "They didn't show up" : "They cancelled"}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
        {kind === "cancel" && <>Cancelling now gives <strong>{t.noticeHours} hours&apos;</strong> notice, so it&apos;s <strong>{what}</strong>. </>}
        {kind === "noshow" && <>This counts as a <strong>no-show</strong>. </>}
        {t.percent > 0 ? <>Your policy charges {t.percent}% of the {usd(t.sessionTotal)} session: <strong>{usd(t.fee)}</strong>.</> : t.late ? <>Your policy has no fee for this, only the deposit.</> : <>Your policy has no fee for this.</>}
        {t.deposit > 0 && <> They paid a {usd(t.deposit)} deposit.</>}
        {t.sessionTotal === 0 && t.percent > 0 && <span className="block text-xs text-amber-700">The session has no price set, so the fee works out to $0. Set a session total under Edit booking first if you want to charge one.</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => chooseOutcome(o.value)} className={`rounded-md border px-3 py-2 text-left text-sm ${outcome === o.value ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-gray-300 bg-white hover:bg-gray-50"}`}>
            <span className="block font-medium text-gray-900">{o.label}</span>
            <span className="block text-xs text-gray-500">{o.hint}</span>
          </button>
        ))}
      </div>
      <label className="block"><span className="label">Reason (for your records)</span><input name="reason" className="input" placeholder="e.g. Singer sick, band broke up, never showed" /></label>
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sendEmail" checked={send} onChange={(e) => setSend(e.target.checked)} disabled={!to} />
          {to ? <>Email the client at <strong>{to}</strong></> : "No email address for this client"}
        </label>
        {send && (
          <>
            <label className="block"><span className="label">Subject</span><input name="subject" required className="input" value={subject} onChange={(e) => setEdited({ subject: e.target.value, body })} /></label>
            <label className="block"><span className="label">Message</span><textarea name="body" required rows={10} className="input text-sm" value={body} onChange={(e) => setEdited({ subject, body: e.target.value })} /></label>
            <p className="text-xs text-gray-500">{"{{fee_link}}"} becomes the fee invoice&apos;s pay link when it&apos;s sent.{edited && <> <button type="button" className="link" onClick={() => setEdited(null)}>Rebuild from template</button></>}</p>
          </>
        )}
      </div>
      <button className="btn-danger">{kind === "noshow" ? "Mark as no-show" : "Cancel the session"}{send ? " and send email" : ""}</button>
    </form>
  );
}
