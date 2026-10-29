import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { INACTIVE_BOOKING } from "@/lib/status";
import { format, fullName } from "@/lib/format";
import { appUrl } from "@/lib/stripe";

/** iCalendar feed of bookings and events for Google / Apple Calendar, at the studio's secret /cal/<token>.ics. */
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const token = (await params).file.replace(/\.ics$/, "");
  const studio = token ? await db.studio.findUnique({ where: { calendarToken: token } }) : null;
  if (!studio) return new Response("Not found", { status: 404 });

  const from = addDays(new Date(), -90);
  const to = addDays(new Date(), 400);
  const [bookings, events] = await Promise.all([
    db.booking.findMany({
      where: { studioId: studio.id, startsAt: { lt: to }, endsAt: { gt: from }, status: { notIn: INACTIVE_BOOKING } },
      include: { room: true, contact: true, engineer: true },
      orderBy: { startsAt: "asc" },
    }),
    db.event.findMany({ where: { studioId: studio.id, startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: "asc" } }),
  ]);
  const base = appUrl();
  const stamp = utc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TrackSheet CRM//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(studio.name)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const b of bookings) {
    const who = b.contact ? fullName(b.contact) : b.requestName;
    const status = b.status === "REQUESTED" ? "Request" : b.status === "HOLD" ? "Hold" : null;
    lines.push(
      "BEGIN:VEVENT",
      `UID:booking-${b.id}@studio-crm`,
      `DTSTAMP:${stamp}`,
      // Day-only requests have no real hours yet, so show them as all-day.
      ...(b.timeTbd ? [`DTSTART;VALUE=DATE:${day(b.startsAt)}`, `DTEND;VALUE=DATE:${day(addDays(b.startsAt, 1))}`] : [`DTSTART:${utc(b.startsAt)}`, `DTEND:${utc(b.endsAt)}`]),
      `SUMMARY:${text(`${status ? `${status}: ` : ""}${b.title}`)}`,
      `LOCATION:${text([b.room.name, b.room.address].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${text([who && `Client: ${who}`, b.engineer && `Engineer: ${b.engineer.name}`, b.timeTbd && "Hours not set yet", `${base}/bookings/${b.id}`].filter(Boolean).join("\n"))}`,
      `STATUS:${b.status === "CONFIRMED" || b.status === "COMPLETED" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
    );
  }
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:event-${e.id}@studio-crm`,
      `DTSTAMP:${stamp}`,
      ...(e.allDay ? [`DTSTART;VALUE=DATE:${day(e.startsAt)}`, `DTEND;VALUE=DATE:${day(e.endsAt)}`] : [`DTSTART:${utc(e.startsAt)}`, `DTEND:${utc(e.endsAt)}`]),
      `SUMMARY:${text(e.kind === "Closed" || e.kind === "Other" ? e.title : `${e.kind}: ${e.title}`)}`,
      ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
      `DESCRIPTION:${text([e.closed && "Studio closed", e.notes, `${base}/events/${e.id}`].filter(Boolean).join("\n"))}`,
      ...(e.allDay ? ["TRANSP:TRANSPARENT"] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Studio-local calendar date, for all-day entries. */
const day = (d: Date) => format(d, "yyyyMMdd");
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines over 75 bytes continue on the next line after a space (RFC 5545). */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}
