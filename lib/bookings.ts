import { db } from "./db";
import { fmtDateTime, inTz } from "./format";
import { closedBetween, eventWhen } from "./events";
import { INACTIVE_BOOKING } from "./status";


/** Bookings that overlap [start, end) in the same room or with the same engineer, and closed days on Events. */
export async function findConflicts(opts: {
  studioId: string;
  roomId: string;
  engineerId?: string | null;
  startsAt: Date;
  endsAt: Date;
  excludeId?: string;
}) {
  const conflicts = await db.booking.findMany({
    where: {
      studioId: opts.studioId,
      id: opts.excludeId ? { not: opts.excludeId } : undefined,
      status: { notIn: INACTIVE_BOOKING },
      timeTbd: false, // a day-only request has no real hours yet
      startsAt: { lt: opts.endsAt },
      endsAt: { gt: opts.startsAt },
      OR: [{ roomId: opts.roomId }, ...(opts.engineerId ? [{ engineerId: opts.engineerId }] : [])],
    },
    include: { room: true, engineer: true },
  });
  const closed = await closedBetween(opts.studioId, opts.startsAt, opts.endsAt);
  return [
    ...closed.map((e) => `The studio is closed ${eventWhen(e)} (“${e.title}” on Events)`),
    ...conflicts.map((c) =>
      c.roomId === opts.roomId
        ? `${c.room.name} is booked ${fmtDateTime(c.startsAt)} (“${c.title}”)`
        : `${c.engineer?.name} is engineering “${c.title}” at ${fmtDateTime(c.startsAt)}`,
    ),
  ];
}

/** Expand a simple repeat rule into occurrence start times, keeping the studio wall-clock time across DST. */
export function expandRepeat(start: Date, freq: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY", count: number) {
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = inTz(start);
    if (freq === "DAILY") d.setDate(d.getDate() + i);
    if (freq === "WEEKLY") d.setDate(d.getDate() + 7 * i);
    if (freq === "BIWEEKLY") d.setDate(d.getDate() + 14 * i);
    if (freq === "MONTHLY") d.setMonth(d.getMonth() + i);
    out.push(new Date(d.getTime()));
  }
  return out;
}

export function rruleFor(freq: string, count: number) {
  return freq === "BIWEEKLY" ? `FREQ=WEEKLY;INTERVAL=2;COUNT=${count}` : `FREQ=${freq};COUNT=${count}`;
}
