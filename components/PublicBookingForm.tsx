"use client";
import { submitKeeping } from "./keepForm";
import { useActionState, useEffect, useRef, useState } from "react";
import { requestBooking } from "@/app/book/[slug]/actions";
import { resetTurnstile, Turnstile } from "./Turnstile";

type Opt = { value: string; label: string };
/** Days that can't be requested: closed for everyone, or already booked in a given studio. */
export type Unavailable = { closed: string[]; booked: Record<string, string[]> };

function Field({ label, optional, wide, children }: { label: string; optional?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="text-xs font-normal text-gray-400">Optional</span>}
      </span>
      {children}
    </label>
  );
}

const MAX_DAYS = 10;

/** One or more preferred days; "+ Add another day" adds a date picker, × removes one. */
function DaysField({ today, unavailable, roomId, roomName }: { today: string; unavailable?: Unavailable; roomId: string; roomName: string }) {
  const [days, setDays] = useState([0]);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const next = useRef(1);
  // Why a picked day can't be requested, checked as soon as it's picked (the server checks again).
  const problem = (day: string | undefined) => {
    if (!day || !unavailable) return "";
    if (unavailable.closed.includes(day)) return "The studio is closed that day. Please choose another.";
    if (unavailable.booked[roomId]?.includes(day)) return `${roomName || "The studio"} is already booked that day. Please choose another.`;
    return "";
  };
  return (
    <div>
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-gray-700">
        {days.length > 1 ? "Preferred days" : "Preferred day"}
      </span>
      <div className="space-y-2">
        {days.map((key, i) => (
          <div key={key}>
          <div className="flex items-center gap-2">
            <input name="date" type="date" min={today} required aria-label={`Day ${i + 1}`} className={input}
              ref={(el) => { if (el) el.setCustomValidity(problem(picked[key])); }}
              onChange={(e) => setPicked({ ...picked, [key]: e.target.value })} aria-invalid={Boolean(problem(picked[key]))} />
            {days.length > 1 && (
              <button type="button" onClick={() => setDays(days.filter((k) => k !== key))} aria-label={`Remove day ${i + 1}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
            )}
          </div>
          {problem(picked[key]) && <p className="mt-1 text-sm text-red-700">{problem(picked[key])}</p>}
          </div>
        ))}
      </div>
      {days.length < MAX_DAYS && (
        <button type="button" onClick={() => setDays([...days, next.current++])}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-600">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-600/40 text-base leading-none">+</span>
          Add another day
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-4 flex w-full items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em] text-brand-700">
        {title}
        <span className="h-px flex-1 bg-gray-100" />
      </legend>
      {children}
    </fieldset>
  );
}

const input = "w-full rounded border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-gray-400 focus:border-black focus:ring-4 focus:ring-accent/50";

export function PublicBookingForm({ slug, rooms, services, today, embedded, unavailable, turnstileSiteKey }: { slug: string; rooms: Opt[]; services: string[]; today: string; embedded?: boolean; unavailable?: Unavailable; turnstileSiteKey?: string | null }) {
  const [state, action, pending] = useActionState(requestBooking, null);
  const ref = useRef<HTMLDivElement>(null);

  // Inside an iframe, tell the host page (embed.js) how tall we are so it can resize.
  useEffect(() => {
    if (!embedded || !ref.current || window.parent === window) return;
    // Measure the form itself: the document is never shorter than the frame, so it couldn't shrink.
    const post = () => window.parent.postMessage({ type: "studio-form-height", height: ref.current!.getBoundingClientRect().bottom }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(ref.current);
    post();
    return () => ro.disconnect();
  }, [embedded, state]);
  // A Turnstile answer only works once, so get a fresh one when the form comes back with an error.
  useEffect(() => { if (state?.error) resetTurnstile(); }, [state]);

  return <div ref={ref}>{state?.ok ? <Received /> : <Fields slug={slug} rooms={rooms} services={services} today={today} action={action} pending={pending} error={state?.error} unavailable={unavailable} turnstileSiteKey={turnstileSiteKey} />}</div>;
}

function Received() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-xl text-brand-600">✓</span>
      <p className="mt-4 font-display text-2xl">Request received</p>
      <p className="mt-2 max-w-xs text-sm text-gray-500">Thanks! We&apos;ll confirm your day and session details by email shortly.</p>
    </div>
  );
}

function Fields({ slug, rooms, services, today, action, pending, error, unavailable, turnstileSiteKey }: { slug: string; rooms: Opt[]; services: string[]; today: string; action: (fd: FormData) => void; pending: boolean; error?: string; unavailable?: Unavailable; turnstileSiteKey?: string | null }) {
  const [roomId, setRoomId] = useState(rooms[0]?.value ?? "");
  return (
    <form onSubmit={submitKeeping(action)} className="space-y-8">
      <input type="hidden" name="slug" value={slug} />
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Section title="About you">
        <Field label="First name"><input name="firstName" required maxLength={80} autoComplete="given-name" className={input} /></Field>
        <Field label="Last name"><input name="lastName" required maxLength={80} autoComplete="family-name" className={input} /></Field>
        <Field label="Email"><input name="email" type="email" required maxLength={200} autoComplete="email" className={input} /></Field>
        <Field label="Phone number" optional><input name="phone" type="tel" maxLength={40} autoComplete="tel" className={input} /></Field>
      </Section>
      <Section title="Your project">
        <Field label="Artist / band / project name" wide><input name="artist" required maxLength={120} className={input} /></Field>
        <Field label="Instagram / social media link" wide><input name="social" required maxLength={300} placeholder="@yourname or a link" className={input} /></Field>
        <Field label="Service requested">
          <select name="service" required defaultValue="" className={input}>
            <option value="" disabled>Choose a service…</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <DaysField today={today} unavailable={unavailable} roomId={roomId} roomName={rooms.find((r) => r.value === roomId)?.label ?? ""} />
        {rooms.length > 1 ? (
          <Field label="Studio" wide>
            <select name="roomId" required className={input} value={roomId} onChange={(e) => setRoomId(e.target.value)}>{rooms.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </Field>
        ) : (
          <input type="hidden" name="roomId" value={rooms[0]?.value ?? ""} />
        )}
        <Field label="Message" wide><textarea name="notes" rows={4} required maxLength={4000} placeholder="Tell us about the songs, timeline, references…" className={input} /></Field>
      </Section>
      <Turnstile siteKey={turnstileSiteKey} />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      <div className="space-y-3">
        <button className="btn-primary w-full py-3 text-[15px]" disabled={pending}>
          {pending ? "Sending…" : "Request this session"}
        </button>
        <p className="text-center text-xs text-gray-400">No payment now. We&apos;ll confirm before anything is booked.</p>
      </div>
    </form>
  );
}
