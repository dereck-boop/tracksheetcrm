"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { BookingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { expandRepeat, findConflicts, rruleFor } from "@/lib/bookings";
import { fmtDate, money, toCents, toDateInput } from "@/lib/format";
import { date, int, req, str } from "@/lib/form";
import { BOOKING_STATUSES, INACTIVE_BOOKING } from "@/lib/status";
import { cancelTerms, type CancelOutcome } from "@/lib/cancellations";
import { createInvoice as createInvoiceRecord } from "@/lib/invoices";
import { appUrl } from "@/lib/stripe";
import { resolveClient } from "@/lib/contacts";
import { bookingClient, emailBooking } from "@/lib/bookingEmails";
import { sendEmail } from "@/lib/email";
import { emailFlash } from "@/lib/flash";

export type BookingResult = { error?: string; conflicts?: string[]; notice?: string; values?: Record<string, string> } | null;

/** What was typed, so the form can show it again after React resets it on a returned error. */
const keep = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k, v]) => typeof v === "string" && k !== "override" && !k.startsWith("$")) as [string, string][]);

function fields(fd: FormData) {
  const startsAt = date(fd, "startsAt");
  const endsAt = date(fd, "endsAt");
  if (!startsAt || !endsAt) throw new Error("Start and end are required");
  if (endsAt <= startsAt) throw new Error("End must be after start");
  const status = (str(fd, "status") ?? "HOLD") as BookingStatus;
  return {
    title: req(fd, "title", "Title"),
    roomId: req(fd, "roomId", "Room"),
    typeId: str(fd, "typeId"),
    contactId: str(fd, "contactId"),
    projectId: str(fd, "projectId"),
    engineerId: str(fd, "engineerId"),
    status: BOOKING_STATUSES.includes(status) ? status : "HOLD",
    rate: toCents(fd.get("rate")),
    depositAmount: toCents(fd.get("depositAmount")),
    notes: str(fd, "notes"),
    startsAt,
    endsAt,
  };
}

async function createBooking(_: BookingResult, fd: FormData): Promise<BookingResult> {
  const user = await requireUser();
  let data;
  try { data = fields(fd); } catch (e) { return { error: (e as Error).message, values: keep(fd) }; }
  const repeat = str(fd, "repeat") as "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | null;
  const count = Math.min(Math.max(int(fd, "repeatCount") ?? 1, 1), 52);
  const duration = data.endsAt.getTime() - data.startsAt.getTime();
  const starts = repeat ? expandRepeat(data.startsAt, repeat, count) : [data.startsAt];

  if (fd.get("override") !== "on") {
    const conflicts = (
      await Promise.all(starts.map((s) => findConflicts({ studioId: user.studioId, roomId: data.roomId, engineerId: data.engineerId, startsAt: s, endsAt: new Date(s.getTime() + duration) })))
    ).flat();
    if (conflicts.length) return { conflicts, values: keep(fd) };
  }
  // Create an inline "New client" only once the booking is going ahead.
  try { data.contactId = await resolveClient(fd, user.studioId, "contactId"); } catch (e) { return { error: (e as Error).message, values: keep(fd) }; }

  const series = repeat ? await db.bookingSeries.create({ data: { studioId: user.studioId, rrule: rruleFor(repeat, count) } }) : null;
  const created = await db.$transaction(
    starts.map((s) =>
      db.booking.create({
        data: { ...data, studioId: user.studioId, seriesId: series?.id, startsAt: s, endsAt: new Date(s.getTime() + duration) },
      }),
    ),
  );
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "booking", entityId: created[0]!.id, action: "created", summary: `Booked “${data.title}”${created.length > 1 ? ` (${created.length} sessions)` : ""}` });
  redirect(`/bookings/${created[0]!.id}`);
}

async function updateBooking(_: BookingResult, fd: FormData): Promise<BookingResult> {
  const user = await requireUser();
  const id = req(fd, "id");
  let data;
  try { data = fields(fd); } catch (e) { return { error: (e as Error).message, values: keep(fd) }; }
  if (fd.get("override") !== "on") {
    const conflicts = await findConflicts({ studioId: user.studioId, roomId: data.roomId, engineerId: data.engineerId, startsAt: data.startsAt, endsAt: data.endsAt, excludeId: id });
    if (conflicts.length) return { conflicts, values: keep(fd) };
  }
  try { data.contactId = await resolveClient(fd, user.studioId, "contactId"); } catch (e) { return { error: (e as Error).message, values: keep(fd) }; }
  const before = await db.booking.findFirst({ where: { id, studioId: user.studioId } });
  if (!before) return { error: "Booking not found" };
  const moved = before.startsAt.getTime() !== data.startsAt.getTime() || before.endsAt.getTime() !== data.endsAt.getTime() || before.roomId !== data.roomId;
  // Moving a set session to another day counts as a reschedule (adjusting the hours doesn't).
  const rescheduled = toDateInput(before.startsAt) !== toDateInput(data.startsAt) && ["HOLD", "CONFIRMED"].includes(before.status);
  // Saving the form sets the hours on a day-only online request.
  await db.booking.update({ where: { id }, data: { ...data, timeTbd: false, ...(rescheduled ? { rescheduleCount: { increment: 1 } } : {}) } });
  // A client added to an online request inherits how they found the studio.
  revalidatePath(`/bookings/${id}`);
  if (moved && data.status === "CONFIRMED" && fd.get("notifyClient") === "on") {
    const r = await emailBooking(id, "booking_changed", user.id);
    return { notice: r.sent ? "Saved, and the client was emailed the new time." : `Saved. Email not sent: ${r.error}` };
  }
  return { notice: "Saved." };
}

async function setBookingStatus(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  const status = req(fd, "status") as BookingStatus;
  if (!BOOKING_STATUSES.includes(status)) throw new Error("Unknown status");
  const before = await db.booking.findFirst({ where: { id, studioId: user.studioId }, include: { contact: true } });
  if (!before) throw new Error("Booking not found");
  if (status === "CONFIRMED" && before.timeTbd) throw new Error("Set the session hours (Edit booking) before confirming");
  await db.booking.update({ where: { id }, data: { status } });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "booking", entityId: id, action: "status_changed", summary: `Booking ${status.toLowerCase()}` });
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
  const key = status === "CONFIRMED" ? "booking_confirmed" : status === "CANCELLED" ? "booking_cancelled" : null;
  if (key && before.status !== status && before.startsAt > new Date()) {
    const r = await emailBooking(id, key, user.id);
    redirect(`/bookings/${id}${emailFlash(r, before.contact?.email ?? before.requestEmail)}`);
  }
}

const RESPONSES = { accept: "HOLD", confirm: "CONFIRMED", decline: "DECLINED" } as const;

/**
 * Answers a booking request: accept as a hold, confirm, or decline. The email is the one
 * shown (and maybe edited) on the page; it isn't saved back to the template.
 */
async function respondToRequest(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  const decision = req(fd, "decision") as keyof typeof RESPONSES;
  const status = RESPONSES[decision];
  if (!status) throw new Error("Choose accept or decline");
  const b = await db.booking.findFirst({ where: { id, studioId: user.studioId }, include: { contact: true } });
  if (!b) throw new Error("Booking not found");
  if (status === "CONFIRMED" && b.timeTbd) throw new Error("Set the session hours (Edit booking) before confirming");
  await db.booking.update({ where: { id }, data: { status } });
  const verb = decision === "decline" ? "Declined" : decision === "confirm" ? "Confirmed" : "Accepted as a hold";
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "booking", entityId: id, action: "status_changed", summary: `${verb}: booking request` });
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
  if (fd.get("sendEmail") !== "on") redirect(`/bookings/${id}`);
  const to = bookingClient(b).email;
  const subject = req(fd, "subject", "Subject");
  const text = req(fd, "body", "Message");
  const r = to ? await sendEmail({ to, subject, text, replyTo: user.studio.email }) : { sent: false, error: "No email address" };
  if (r.sent) await logActivity({ studioId: user.studioId, userId: user.id, entityType: "booking", entityId: id, action: "emailed", summary: `Emailed ${to}: ${subject}` });
  redirect(`/bookings/${id}${emailFlash(r, to)}`);
}

async function markDepositPaid(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  const before = await db.booking.findFirst({ where: { id, studioId: user.studioId }, include: { contact: true } });
  if (!before) throw new Error("Booking not found");
  await db.booking.update({ where: { id }, data: { depositPaidAt: new Date(), status: "CONFIRMED" } });
  revalidatePath(`/bookings/${id}`);
  if (before.status !== "CONFIRMED" && before.startsAt > new Date()) {
    const r = await emailBooking(id, "booking_confirmed", user.id);
    redirect(`/bookings/${id}${emailFlash(r, before.contact?.email ?? before.requestEmail)}`);
  }
}

async function deleteBooking(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  const scope = str(fd, "scope");
  const b = await db.booking.findFirst({ where: { id, studioId: user.studioId } });
  if (!b) redirect("/bookings");
  const where = scope === "future" && b.seriesId ? { seriesId: b.seriesId, startsAt: { gte: b.startsAt } } : { id };
  await db.booking.deleteMany({ where });
  redirect("/bookings");
}

/**
 * Cancels a booking or marks it a no-show, applying the cancellation policy the way the studio
 * chose: "policy" keeps the deposit and invoices any fee beyond it, "keep" keeps only the deposit,
 * "waive" lets it go (a paid deposit then carries over as credit). The email is the one shown on
 * the page; {{fee_link}} in it becomes the fee invoice's pay link.
 */
async function cancelBooking(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  const kind = str(fd, "kind") === "noshow" ? "noshow" : "cancel";
  const outcome = (["policy", "keep", "waive"].includes(str(fd, "outcome") ?? "") ? str(fd, "outcome") : "waive") as CancelOutcome;
  const b = await db.booking.findFirst({ where: { id, studioId: user.studioId }, include: { contact: true, room: true, service: true, depositInvoice: true } });
  if (!b) throw new Error("Booking not found");
  if (INACTIVE_BOOKING.includes(b.status)) redirect(`/bookings/${id}`);
  const t = cancelTerms(b, user.studio, kind);
  const keepDeposit = outcome !== "waive" && t.deposit > 0 && b.depositInvoiceId;

  let feeInvoice: { id: string; number: string; publicToken: string } | null = null;
  if (outcome === "policy" && t.extra > 0) {
    const contactId = b.contactId ?? (await bookingContactFor(user.studioId, b));
    const what = kind === "noshow" ? "Missed session" : "Late cancellation";
    const inv = await createInvoiceRecord(
      user.studioId,
      { contactId, projectId: b.projectId, dueDate: new Date(Date.now() + 7 * 864e5), sent: true, terms: user.studio.policies, notes: t.deposit ? `${money(t.deposit)} deposit already kept toward this fee.` : null },
      [{ description: `${what} fee: ${b.title} (${b.room.name}, ${fmtDate(b.startsAt)}), ${t.percent}% of ${money(t.sessionTotal)}${t.deposit ? ` less ${money(t.deposit)} deposit kept` : ""}`, quantity: 1, unitPrice: t.extra, taxable: false }],
    );
    feeInvoice = inv;
  }
  await db.$transaction([
    db.booking.update({
      where: { id },
      data: { status: kind === "noshow" ? "NO_SHOW" : "CANCELLED", cancelledAt: new Date(), cancelNoticeHours: kind === "noshow" ? 0 : t.noticeHours, cancelReason: str(fd, "reason"), feeInvoiceId: feeInvoice?.id },
    }),
    ...(keepDeposit ? [db.invoice.update({ where: { id: b.depositInvoiceId! }, data: { depositForfeited: true } })] : []),
  ]);
  const summary = `${kind === "noshow" ? "No-show" : `Cancelled with ${t.noticeHours}h notice`}${keepDeposit ? `, ${money(t.deposit)} deposit kept` : ""}${feeInvoice ? `, fee invoice ${feeInvoice.number}` : ""}`;
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "booking", entityId: id, action: "status_changed", summary });
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
  if (fd.get("sendEmail") !== "on") redirect(`/bookings/${id}`);
  const to = bookingClient(b).email;
  const link = feeInvoice ? `${appUrl()}/i/${feeInvoice.publicToken}` : "";
  const subject = req(fd, "subject", "Subject");
  const text = req(fd, "body", "Message").replace(/\{\{\s*fee_link\s*\}\}/g, link);
  const r = to ? await sendEmail({ to, subject, text, replyTo: user.studio.email }) : { sent: false, error: "No email address" };
  if (r.sent) {
    await logActivity({ studioId: user.studioId, userId: user.id, entityType: "booking", entityId: id, action: "emailed", summary: `Emailed ${to}: ${subject}` });
    if (feeInvoice) await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: feeInvoice.id, action: "emailed", summary: `Emailed ${to} with the ${kind === "noshow" ? "no-show" : "cancellation"} notice` });
  }
  redirect(`/bookings/${id}${emailFlash(r, to)}`);
}

/** The booking's contact, made from the online request details when it has none. */
async function bookingContactFor(studioId: string, b: { requestEmail: string | null; requestFirstName: string | null; requestLastName: string | null; requestName: string | null; requestPhone: string | null; id: string }) {
  if (!b.requestEmail) return null;
  const existing = await db.contact.findFirst({ where: { studioId, email: { equals: b.requestEmail, mode: "insensitive" } } });
  const c = existing ?? (await db.contact.create({ data: { studioId, firstName: b.requestFirstName ?? b.requestName?.split(" ")[0] ?? b.requestEmail, lastName: b.requestLastName, email: b.requestEmail.toLowerCase(), phone: b.requestPhone, source: "Booking page" } }));
  await db.booking.update({ where: { id: b.id }, data: { contactId: c.id } });
  return c.id;
}

// Thrown errors show as a message on the page instead of a crash screen.
const createBookingAction = safe(createBooking);
const updateBookingAction = safe(updateBooking);
const setBookingStatusAction = safe(setBookingStatus);
const respondToRequestAction = safe(respondToRequest);
const markDepositPaidAction = safe(markDepositPaid);
const deleteBookingAction = safe(deleteBooking);
const cancelBookingAction = safe(cancelBooking);
export { createBookingAction as createBooking, updateBookingAction as updateBooking, setBookingStatusAction as setBookingStatus, respondToRequestAction as respondToRequest, markDepositPaidAction as markDepositPaid, deleteBookingAction as deleteBooking, cancelBookingAction as cancelBooking };
