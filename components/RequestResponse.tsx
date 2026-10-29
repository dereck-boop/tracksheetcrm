"use client";
import { useState } from "react";
import { render } from "@/lib/renderTemplate";
import { respondToRequest } from "@/app/(app)/bookings/actions";

type Template = { subject: string; body: string; enabled: boolean };
type Decision = "accept" | "confirm" | "decline";
type Room = { id: string; name: string; address: string | null };

/** "2026-11-05" → "Nov 5, 2026", matching fmtDate. */
const dayLabel = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
/** "14:30" → "2:30 PM", matching fmtTime. */
const timeLabel = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return `${h! % 12 || 12}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
};

/** The {{suggestion}} paragraph for a decline: another day and/or another studio. */
function suggestion(date: string, time: string, room: Room | undefined) {
  const when = date ? `${dayLabel(date)}${time ? ` at ${timeLabel(time)}` : ""}` : "";
  const where = room ? `${room.name}${room.address ? ` (${room.address})` : ""}` : "";
  if (when && where) return `Would ${when} at ${where} work for you instead? Reply to this email and I'll get it booked.`;
  if (when) return `Would ${when} work for you instead? Reply to this email and I'll get it booked.`;
  if (where) return `You might want to try ${where} instead. Reply to this email and I'll help you set it up.`;
  return "If another day works for you, just reply to this email and we'll find a time.";
}

/**
 * Accept, confirm or decline a booking request, with the client email shown and editable
 * before it goes out. Edits apply to this one email only, not the saved template.
 */
export function RequestResponse({ bookingId, to, canConfirm, templates, vars, rooms, roomId }: {
  bookingId: string;
  to: string | null;
  canConfirm: boolean;
  templates: Record<Decision, Template>;
  vars: Record<string, string | null | undefined>;
  rooms: Room[];
  roomId: string;
}) {
  const [decision, setDecision] = useState<Decision>("accept");
  const [altDate, setAltDate] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [altRoom, setAltRoom] = useState(false);
  const [otherRoomId, setOtherRoomId] = useState("");
  const [edited, setEdited] = useState<{ subject: string; body: string } | null>(null);

  const tpl = templates[decision];
  const [send, setSend] = useState(Boolean(to) && templates.accept.enabled);
  const fill = { ...vars, suggestion: suggestion(altDate ? date : "", altDate ? time : "", altRoom ? rooms.find((r) => r.id === otherRoomId) : undefined) };
  const subject = edited?.subject ?? render(tpl.subject, fill);
  const body = edited?.body ?? render(tpl.body, fill);

  const choose = (d: Decision) => {
    setDecision(d);
    setEdited(null);
    setSend(Boolean(to) && templates[d].enabled);
  };
  const choices: { value: Decision; label: string; hint: string }[] = [
    { value: "accept", label: "Accept", hint: "Hold the day; you set the hours later" },
    ...(canConfirm ? [{ value: "confirm" as const, label: "Confirm", hint: "Book it at the hours set below" }] : []),
    { value: "decline", label: "Decline", hint: "Optionally suggest another day or studio" },
  ];
  const otherRooms = rooms.filter((r) => r.id !== roomId);

  return (
    <form action={respondToRequest} className="space-y-4">
      <input type="hidden" name="id" value={bookingId} />
      <input type="hidden" name="decision" value={decision} />
      <div className="grid gap-2 sm:grid-cols-3">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => choose(c.value)}
            className={`rounded-md border px-3 py-2 text-left text-sm ${decision === c.value ? (c.value === "decline" ? "border-red-400 bg-red-50 ring-2 ring-red-100" : "border-brand-600 bg-brand-50 ring-2 ring-brand-100") : "border-gray-300 bg-white hover:bg-gray-50"}`}
          >
            <span className="block font-medium text-gray-900">{c.label}</span>
            <span className="block text-xs text-gray-500">{c.hint}</span>
          </button>
        ))}
      </div>

      {decision === "decline" && (
        <div className="space-y-3 rounded-md bg-gray-50 p-3 text-sm">
          <p className="font-medium text-gray-700">Suggest instead (optional)</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={altDate} onChange={(e) => setAltDate(e.target.checked)} /> Another day</label>
          {altDate && (
            <div className="grid gap-2 pl-6 sm:grid-cols-2">
              <label className="block"><span className="label">Day</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="block"><span className="label">Start time (optional)</span><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            </div>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" checked={altRoom} onChange={(e) => setAltRoom(e.target.checked)} disabled={!otherRooms.length} /> Another studio{!otherRooms.length && <span className="text-xs text-gray-500">(add more under Studios)</span>}</label>
          {altRoom && (
            <div className="pl-6">
              <select className="input" value={otherRoomId} onChange={(e) => setOtherRoomId(e.target.value)}>
                <option value="">Choose a studio…</option>
                {otherRooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.address ? ` · ${r.address}` : ""}</option>)}
              </select>
            </div>
          )}
          {edited && <p className="text-xs text-amber-800">You&apos;ve edited the email, so changes here won&apos;t show in it until you rebuild it below.</p>}
        </div>
      )}

      <div className="space-y-3 border-t border-gray-100 pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sendEmail" checked={send} onChange={(e) => setSend(e.target.checked)} disabled={!to} />
          {to ? <>Email the client at <strong>{to}</strong></> : "No email address on this request"}
        </label>
        {send && (
          <>
            <label className="block"><span className="label">Subject</span>
              <input name="subject" required className="input" value={subject} onChange={(e) => setEdited({ subject: e.target.value, body })} />
            </label>
            <label className="block"><span className="label">Message</span>
              <textarea name="body" required rows={10} className="input text-sm" value={body} onChange={(e) => setEdited({ subject, body: e.target.value })} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>Changes here are for this email only. Edit the template in Setup &gt; Client Emails.</span>
              {edited && <button type="button" className="link" onClick={() => setEdited(null)}>Rebuild from template</button>}
            </div>
          </>
        )}
      </div>

      <button className={decision === "decline" ? "btn-danger" : "btn-primary"}>
        {{ accept: "Accept", confirm: "Confirm", decline: "Decline" }[decision]}{send ? " and send email" : " without emailing"}
      </button>
    </form>
  );
}
