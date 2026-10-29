import { db } from "./db";
import { closedBetween, nextDay } from "./events";
import { format, parseLocal } from "./format";

/** Studio-local days ("2026-11-05") touched by [startsAt, endsAt). */
function daysCovered(startsAt: Date, endsAt: Date) {
  const days: string[] = [];
  const last = format(new Date(Math.max(startsAt.getTime(), endsAt.getTime() - 1)), "yyyy-MM-dd");
  for (let d = format(startsAt, "yyyy-MM-dd"); d <= last && days.length < 400; d = nextDay(d)) days.push(d);
  return days;
}

/** Sessions the studio has accepted (penciled in or confirmed) take the whole day on the booking page. */
const TAKEN = ["HOLD", "CONFIRMED"] as const;

/**
 * Days a client can't request on /book over the next year: closed days for everyone, and days a
 * room already has an accepted session. Day-only requests still waiting on hours don't count.
 */
export async function unavailableDays(studioId: string, roomIds: string[]) {
  const from = parseLocal(format(new Date(), "yyyy-MM-dd"))!;
  const to = new Date(from.getTime() + 366 * 864e5);
  const [closed, sessions] = await Promise.all([
    closedBetween(studioId, from, to),
    db.booking.findMany({
      where: { studioId, roomId: { in: roomIds }, status: { in: [...TAKEN] }, timeTbd: false, startsAt: { lt: to }, endsAt: { gt: from } },
      select: { roomId: true, startsAt: true, endsAt: true },
    }),
  ]);
  const closedDays = [...new Set(closed.flatMap((e) => daysCovered(e.startsAt, e.endsAt)))].sort();
  const booked: Record<string, string[]> = Object.fromEntries(roomIds.map((id) => [id, [] as string[]]));
  for (const s of sessions) booked[s.roomId]!.push(...daysCovered(s.startsAt, s.endsAt));
  for (const id of roomIds) booked[id] = [...new Set(booked[id])].sort();
  return { closed: closedDays, booked };
}

/** Whether `roomId` already has an accepted session on the studio-local day of `day`. */
export async function roomTakenOn(studioId: string, roomId: string, day: Date) {
  const ymd = format(day, "yyyy-MM-dd");
  const n = await db.booking.count({
    where: { studioId, roomId, status: { in: [...TAKEN] }, timeTbd: false, startsAt: { lt: parseLocal(nextDay(ymd))! }, endsAt: { gt: parseLocal(ymd)! } },
  });
  return n > 0;
}
