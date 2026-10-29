import { db } from "./db";
import { fmtDate, fmtTime, fullName } from "./format";
import { sendTemplate } from "./email";
import type { TemplateKey } from "./emailTemplates";

/** Where to reach the client on a booking: its contact, else the online request details. */
export function bookingClient(b: { contact?: { firstName: string; lastName: string | null; email: string | null } | null; requestName: string | null; requestFirstName?: string | null; requestEmail: string | null }) {
  return {
    email: b.contact?.email ?? b.requestEmail,
    name: b.contact ? b.contact.firstName : (b.requestFirstName ?? b.requestName?.split(" ")[0] ?? ""),
    fullName: b.contact ? fullName(b.contact) : (b.requestName ?? ""),
  };
}

/** Sends one of the booking_* templates to the booking's client. Never throws. */
export async function emailBooking(bookingId: string, key: TemplateKey, userId?: string | null, extra: Record<string, string> = {}) {
  const b = await db.booking.findUnique({ where: { id: bookingId }, include: { room: true, contact: true } });
  if (!b) return { sent: false, error: "Booking not found" };
  const client = bookingClient(b);
  return sendTemplate({
    studioId: b.studioId,
    key,
    to: client.email,
    userId,
    entity: { type: "booking", id: b.id },
    vars: { client_name: client.name, room: b.room.name, address: b.room.address ?? "", date: fmtDate(b.startsAt), time: b.timeTbd ? "a time to be confirmed" : fmtTime(b.startsAt), end_time: b.timeTbd ? "" : fmtTime(b.endsAt), ...extra },
  });
}
