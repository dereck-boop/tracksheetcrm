"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { fmtDate, fmtDateTime, fmtTime, money, toCents } from "@/lib/format";
import { date, int, req, str } from "@/lib/form";
import { applyPaidDeposits, balance, createInvoice as create, recalcPaid, recalcTotal, releaseRemovedCredits } from "@/lib/invoices";
import { parseItems } from "@/lib/money";
import { emailBooking } from "@/lib/bookingEmails";
import { sendTemplate } from "@/lib/email";
import { sendInvoiceEmail } from "@/lib/invoiceEmail";
import { clientPageUrl } from "@/lib/clientPage";
import { emailFlash, reviewed } from "@/lib/flash";
import { appUrl } from "@/lib/stripe";
import { resolveClient } from "@/lib/contacts";
import { sessionLine } from "@/lib/bookingPrice";

const METHODS: PaymentMethod[] = ["STRIPE", "CASH", "CHECK", "BANK_TRANSFER", "VENMO", "PAYPAL", "OTHER"];

async function header(fd: FormData, studioId: string) {
  return {
    contactId: await resolveClient(fd, studioId, "contactId"),
    projectId: str(fd, "projectId"),
    dueDate: date(fd, "dueDate"),
    notes: str(fd, "notes"),
    terms: str(fd, "terms"),
    taxRate: Number(str(fd, "taxRate") ?? 0) || 0,
    discount: toCents(fd.get("discount")) ?? 0,
  };
}

async function own(studioId: string, id: string) {
  const inv = await db.invoice.findFirst({ where: { id, studioId } });
  if (!inv) throw new Error("Invoice not found");
  return inv;
}

async function createInvoice(fd: FormData) {
  const user = await requireRole("ADMIN");
  const items = parseItems(str(fd, "items"));
  if (!items.length) throw new Error("Add at least one line item");
  const inv = await create(user.studioId, { ...(await header(fd, user.studioId)), applyDeposits: true }, items);
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: inv.id, action: "created", summary: `Created invoice ${inv.number}` });
  redirect(`/invoices/${inv.id}`);
}

async function updateInvoice(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  if (inv.status === "VOID") throw new Error("Void invoices can't be edited");
  const items = parseItems(str(fd, "items"));
  if (!items.length) throw new Error("Add at least one line item");
  const data = await header(fd, user.studioId);
  await db.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
    await tx.invoice.update({ where: { id: inv.id }, data: { ...data, items: { create: items.map((it, i) => ({ ...it, sortOrder: i })) } } });
    await recalcTotal(tx, inv.id);
    await releaseRemovedCredits(tx, inv.id);
  });
  revalidatePath(`/invoices/${inv.id}`);
}

/** Credit any paid booking deposits for this invoice's client or project. */
async function applyDeposits(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  if (inv.status === "VOID" || inv.isDeposit) throw new Error("Deposits can't be credited on this invoice");
  const applied = await db.$transaction((tx) => applyPaidDeposits(tx, inv.id, { contactId: inv.contactId, projectId: inv.projectId, includeUpcoming: true }));
  if (applied.length) await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: inv.id, action: "updated", summary: `Credited deposit ${applied.join(", ")} on ${inv.number}` });
  revalidatePath(`/invoices/${inv.id}`);
}

/** Turn the automatic payment reminders off or back on for one invoice. */
async function setReminders(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  await db.invoice.update({ where: { id: inv.id }, data: { remindersPaused: fd.get("paused") === "1" } });
  revalidatePath(`/invoices/${inv.id}`);
}

async function markSent(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  await db.invoice.update({ where: { id: inv.id }, data: { sentAt: inv.sentAt ?? new Date(), status: inv.status === "DRAFT" ? "SENT" : inv.status } });
  revalidatePath(`/invoices/${inv.id}`);
}

async function voidInvoice(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  // A voided bill frees what it billed: credited deposits and sessions.
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } });
    await tx.invoice.updateMany({ where: { depositAppliedToId: inv.id }, data: { depositAppliedToId: null } });
    await tx.booking.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } });
  });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: inv.id, action: "voided", summary: `Voided invoice ${inv.number}` });
  revalidatePath(`/invoices/${inv.id}`);
}

/** Emails the invoice (or booking deposit request) to the client and marks it sent, using the subject and message as reviewed on the page. */
async function emailInvoice(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  const result = await sendInvoiceEmail(inv.id, user.id, reviewed(fd));
  revalidatePath(`/invoices/${inv.id}`);
  redirect(`${str(fd, "back") ?? `/invoices/${inv.id}`}${emailFlash(result, result.to)}`);
}

/** Ask for a deposit (a % of the total) on the pay link before the rest, or clear it to ask for the full balance. */
async function setInvoiceDeposit(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  const percent = fd.get("clear") ? null : int(fd, "depositPercent");
  if (percent != null && (percent < 1 || percent > 99)) throw new Error("Deposit must be between 1% and 99%");
  await db.invoice.update({ where: { id: inv.id }, data: { depositPercent: percent } });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: inv.id, action: "updated", summary: percent ? `Asked for a ${percent}% deposit on ${inv.number}` : `Removed the deposit on ${inv.number}` });
  revalidatePath(`/invoices/${inv.id}`);
}

async function recordPayment(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  const amount = toCents(fd.get("amount"));
  if (!amount || amount <= 0) throw new Error("Enter a payment amount");
  const method = (str(fd, "method") ?? "OTHER") as PaymentMethod;
  const receivedAt = date(fd, "receivedAt") ?? new Date();
  const result = await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        studioId: user.studioId,
        invoiceId: inv.id,
        amount,
        method: METHODS.includes(method) ? method : "OTHER",
        receivedAt,
        reference: str(fd, "reference"),
      },
    });
    return recalcPaid(tx, inv.id);
  });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: inv.id, action: "paid", summary: `Recorded ${money(amount)} on ${inv.number}` });
  if (result.confirmedBookingId) {
    await emailBooking(result.confirmedBookingId, "booking_confirmed", user.id);
  }
  if (fd.get("sendReceipt") !== null) {
    const contact = inv.contactId ? await db.contact.findUnique({ where: { id: inv.contactId } }) : null;
    const r = await sendTemplate({
      studioId: user.studioId,
      key: "payment_receipt",
      to: contact?.email,
      userId: user.id,
      entity: { type: "invoice", id: inv.id },
      vars: { client_name: contact?.firstName, number: inv.number, amount: money(amount), balance: money(balance(result)), link: `${appUrl()}/i/${inv.publicToken}`, client_page: await clientPageUrl(inv.contactId) },
    });
    revalidatePath(`/invoices/${inv.id}`);
    redirect(`/invoices/${inv.id}${emailFlash(r, contact?.email)}`);
  }
  revalidatePath(`/invoices/${inv.id}`);
}

async function deletePayment(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  const p = await db.payment.findFirst({ where: { id: req(fd, "paymentId"), invoiceId: inv.id } });
  if (!p) return;
  if (p.stripePaymentIntentId) throw new Error("Refund Stripe payments in your Stripe dashboard");
  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: p.id } });
    await recalcPaid(tx, inv.id);
  });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: inv.id, action: "payment_removed", summary: `Removed payment of ${money(p.amount)} (${fmtDateTime(p.receivedAt)}) from ${inv.number}` });
  revalidatePath(`/invoices/${inv.id}`);
}

async function deleteInvoice(fd: FormData) {
  const user = await requireRole("ADMIN");
  const inv = await own(user.studioId, req(fd, "id"));
  if (inv.status !== "DRAFT" || inv.amountPaid > 0) throw new Error("Only unpaid drafts can be deleted. Void it instead.");
  await db.invoice.delete({ where: { id: inv.id } });
  redirect("/invoices");
}

/** Bill a project milestone: draft invoice for its amount, linked back to the milestone. */
async function invoiceMilestone(fd: FormData) {
  const user = await requireRole("ADMIN");
  const m = await db.milestone.findFirst({ where: { id: req(fd, "milestoneId"), project: { studioId: user.studioId } }, include: { project: true } });
  if (!m || !m.billAmount) throw new Error("Milestone has no bill amount");
  if (m.invoiceId) redirect(`/invoices/${m.invoiceId}`);
  const studio = await db.studio.findUniqueOrThrow({ where: { id: user.studioId } });
  const inv = await create(
    user.studioId,
    { contactId: m.project.clientId, projectId: m.projectId, dueDate: new Date(Date.now() + 14 * 864e5), taxRate: Number(studio.defaultTaxRate), terms: studio.invoiceTerms },
    [{ description: `${m.project.name}: ${m.title}`, quantity: 1, unitPrice: m.billAmount, taxable: true }],
  );
  await db.milestone.update({ where: { id: m.id }, data: { invoiceId: inv.id } });
  redirect(`/invoices/${inv.id}`);
}

/** The booking's client contact, creating one from the online request details if needed. */
async function bookingContact(
  studioId: string,
  b: { contactId: string | null; requestEmail: string | null; requestName: string | null; requestFirstName: string | null; requestLastName: string | null; requestPhone: string | null; requestArtist: string | null; requestSocial: string | null },
) {
  if (b.contactId || !b.requestEmail) return b.contactId;
  const existing = await db.contact.findFirst({ where: { studioId, email: { equals: b.requestEmail, mode: "insensitive" } } });
  if (existing) return existing.id;
  const [first, ...rest] = (b.requestName ?? b.requestEmail).split(" ");
  const notes = [b.requestArtist && `Artist / project: ${b.requestArtist}`, b.requestSocial && `Social: ${b.requestSocial}`].filter(Boolean).join("\n") || null;
  return (await db.contact.create({
    data: { studioId, firstName: b.requestFirstName ?? first!, lastName: b.requestFirstName ? b.requestLastName : rest.join(" ") || null, email: b.requestEmail, phone: b.requestPhone, notes, source: "Booking page" },
  })).id;
}

/** Create (or open) the deposit invoice for a booking. Ensures the booking has a client contact. */
async function createDepositInvoice(fd: FormData) {
  const user = await requireRole("ADMIN");
  const b = await db.booking.findFirst({ where: { id: req(fd, "bookingId"), studioId: user.studioId }, include: { room: true } });
  if (!b || !b.depositAmount) throw new Error("Set a deposit amount on the booking first");
  if (b.depositInvoiceId) redirect(`/invoices/${b.depositInvoiceId}`);
  const contactId = await bookingContact(user.studioId, b);
  const inv = await create(
    user.studioId,
    { contactId, projectId: b.projectId, isDeposit: true, sent: true, dueDate: b.startsAt, terms: "Deposit holds your session date. It is taken off your final invoice." },
    [{ description: `Booking deposit: ${b.title} (${b.room.name}, ${fmtDateTime(b.startsAt)})`, quantity: 1, unitPrice: b.depositAmount, taxable: false }],
  );
  await db.booking.update({ where: { id: b.id }, data: { depositInvoiceId: inv.id, contactId } });
  redirect(`/bookings/${b.id}`);
}

/**
 * Bill a session: a draft invoice priced from the booking (its quoted rate, else the price list or
 * studio rate × hours), with the session's paid deposit taken off. The booking is marked billed.
 */
async function invoiceBooking(fd: FormData) {
  const user = await requireRole("ADMIN");
  const b = await db.booking.findFirst({ where: { id: req(fd, "bookingId"), studioId: user.studioId }, include: { room: true, service: true } });
  if (!b) throw new Error("Booking not found");
  if (b.invoiceId) redirect(`/invoices/${b.invoiceId}`);
  const label = `${b.title}: ${b.room.name}, ${fmtDate(b.startsAt)}${b.timeTbd ? "" : `, ${fmtTime(b.startsAt)} to ${fmtTime(b.endsAt)}`}`;
  const { quantity, unitPrice, taxable } = sessionLine(b);
  const item = { quantity, unitPrice };
  const contactId = await bookingContact(user.studioId, b);
  const studio = user.studio;
  const inv = await create(
    user.studioId,
    { contactId, projectId: b.projectId, dueDate: new Date(Date.now() + 14 * 864e5), taxRate: Number(studio.defaultTaxRate), terms: studio.invoiceTerms, applyDeposits: { bookingIds: [b.id] } },
    [{ description: label, ...item, taxable }],
  );
  await db.booking.update({ where: { id: b.id }, data: { invoiceId: inv.id, contactId } });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: inv.id, action: "created", summary: `Invoiced session “${b.title}” on ${inv.number}` });
  redirect(`/invoices/${inv.id}`);
}

// Thrown errors show as a message on the page instead of a crash screen.
const createInvoiceAction = safe(createInvoice);
const updateInvoiceAction = safe(updateInvoice);
const applyDepositsAction = safe(applyDeposits);
const setRemindersAction = safe(setReminders);
const markSentAction = safe(markSent);
const voidInvoiceAction = safe(voidInvoice);
const emailInvoiceAction = safe(emailInvoice);
const setInvoiceDepositAction = safe(setInvoiceDeposit);
const recordPaymentAction = safe(recordPayment);
const deletePaymentAction = safe(deletePayment);
const deleteInvoiceAction = safe(deleteInvoice);
const invoiceMilestoneAction = safe(invoiceMilestone);
const createDepositInvoiceAction = safe(createDepositInvoice);
const invoiceBookingAction = safe(invoiceBooking);
export { createInvoiceAction as createInvoice, updateInvoiceAction as updateInvoice, applyDepositsAction as applyDeposits, setRemindersAction as setReminders, markSentAction as markSent, voidInvoiceAction as voidInvoice, emailInvoiceAction as emailInvoice, setInvoiceDepositAction as setInvoiceDeposit, recordPaymentAction as recordPayment, deletePaymentAction as deletePayment, deleteInvoiceAction as deleteInvoice, invoiceMilestoneAction as invoiceMilestone, createDepositInvoiceAction as createDepositInvoice, invoiceBookingAction as invoiceBooking };
