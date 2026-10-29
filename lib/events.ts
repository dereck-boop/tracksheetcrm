import { db } from "./db";
import { format, parseLocal } from "./format";

export { EVENT_KINDS, eventColor } from "./eventKinds";

/** Events overlapping [from, to). */
export function eventsBetween(studioId: string, from: Date, to: Date) {
  return db.event.findMany({
    where: { studioId, startsAt: { lt: to }, endsAt: { gt: from } },
    orderBy: [{ startsAt: "asc" }],
    include: { project: { select: { id: true, name: true } } },
  });
}

/** "2026-12-31" → "2027-01-01" (calendar days, so DST changes don't matter). */
export function nextDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
}

/** Closed-day events overlapping [from, to). */
export function closedBetween(studioId: string, from: Date, to: Date) {
  return db.event.findMany({ where: { studioId, closed: true, startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: "asc" } });
}

/** The closed-day event covering the studio-local day of `day`, if any. */
export async function closedOn(studioId: string, day: Date) {
  const ymd = format(day, "yyyy-MM-dd");
  return (await closedBetween(studioId, parseLocal(ymd)!, parseLocal(nextDay(ymd))!))[0] ?? null;
}

/** "Fri Oct 24" / "Oct 24 – 27" / "Oct 24, 7:00 PM – 10:00 PM" in the studio timezone. */
export function eventWhen(e: { startsAt: Date; endsAt: Date; allDay: boolean }) {
  if (e.allDay) {
    const last = new Date(e.endsAt.getTime() - 1);
    const a = format(e.startsAt, "EEE MMM d");
    return format(last, "yyyy-MM-dd") === format(e.startsAt, "yyyy-MM-dd") ? a : `${a} – ${format(last, "EEE MMM d")}`;
  }
  const sameDay = format(e.endsAt, "yyyy-MM-dd") === format(e.startsAt, "yyyy-MM-dd");
  return `${format(e.startsAt, "EEE MMM d, h:mm a")} – ${format(e.endsAt, sameDay ? "h:mm a" : "EEE MMM d, h:mm a")}`;
}
