import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { totals, type LineItem } from "./money";
import { nextNumber } from "./numbering";

type Tx = Prisma.TransactionClient;

/** Recompute an invoice's total from its items. */
export async function recalcTotal(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true } });
  const t = totals(
    inv.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: i.unitPrice, taxable: i.taxable })),
    Number(inv.taxRate),
    inv.discount,
  );
  await tx.invoice.update({ where: { id: invoiceId }, data: { total: t.total } });
  return recalcPaid(tx, invoiceId);
}

/**
 * Recompute amountPaid and status from payments. Paid deposit invoices confirm their booking.
 * Safe to call repeatedly (webhooks may retry).
 */
export async function recalcPaid(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true, depositBooking: true } });
  const paid = inv.payments.reduce((s, p) => s + p.amount - p.refundedAmount, 0);
  let status = inv.status;
  if (status !== "VOID") {
    if (inv.total > 0 && paid >= inv.total) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else if (status === "PAID" || status === "PARTIAL") status = inv.sentAt ? "SENT" : "DRAFT";
  }
  const updated = await tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid: paid, status, paidAt: status === "PAID" ? inv.paidAt ?? new Date() : null },
  });
  const b = inv.depositBooking;
  // Set when this payment just confirmed a booking, so the caller can email the client.
  let confirmedBookingId: string | null = null;
  if (b && status === "PAID" && !b.depositPaidAt) {
    const confirms = ["REQUESTED", "HOLD"].includes(b.status);
    await tx.booking.update({
      where: { id: b.id },
      data: { depositPaidAt: new Date(), status: confirms ? "CONFIRMED" : b.status },
    });
    if (confirms) confirmedBookingId = b.id;
  }
  return { ...updated, confirmedBookingId };
}

export async function createInvoice(
  studioId: string,
  data: {
    contactId?: string | null;
    projectId?: string | null;
    quoteId?: string | null;
    dueDate?: Date | null;
    notes?: string | null;
    terms?: string | null;
    taxRate?: number;
    discount?: number;
    isDeposit?: boolean;
    sent?: boolean;
    depositPercent?: number | null;
    /** Credit paid booking deposits on the new invoice: true = this client's or project's, or just these bookings'. */
    applyDeposits?: boolean | { bookingIds: string[] };
  },
  items: LineItem[],
) {
  return db.$transaction(async (tx) => {
    const number = await nextNumber(tx, studioId, "invoice");
    const inv = await tx.invoice.create({
      data: {
        studioId,
        number,
        contactId: data.contactId,
        projectId: data.projectId,
        quoteId: data.quoteId,
        dueDate: data.dueDate,
        notes: data.notes,
        terms: data.terms,
        taxRate: data.taxRate ?? 0,
        discount: data.discount ?? 0,
        isDeposit: data.isDeposit ?? false,
        depositPercent: data.depositPercent ?? null,
        status: data.sent ? "SENT" : "DRAFT",
        sentAt: data.sent ? new Date() : null,
        items: { create: items.map((it, i) => ({ ...it, sortOrder: i })) },
      },
    });
    await recalcTotal(tx, inv.id);
    if (data.applyDeposits) {
      // A session invoice only takes that session's own deposit; anything else takes the client's or project's.
      await applyPaidDeposits(tx, inv.id, typeof data.applyDeposits === "object" ? { bookingIds: data.applyDeposits.bookingIds } : { contactId: data.contactId, projectId: data.projectId });
    }
    return inv;
  });
}

export function balance(inv: { total: number; amountPaid: number }) {
  return Math.max(0, inv.total - inv.amountPaid);
}

/** The deposit an invoice asks for, in cents, or 0 when it asks for the full balance. */
export function depositAmount(inv: { total: number; depositPercent: number | null }) {
  return inv.depositPercent ? Math.round((inv.total * inv.depositPercent) / 100) : 0;
}

/** What the pay link charges now: the unpaid part of the deposit until it's covered, then the remaining balance. */
export function dueNow(inv: { total: number; amountPaid: number; depositPercent: number | null }) {
  const deposit = depositAmount(inv);
  if (deposit && inv.amountPaid < deposit) return { amount: Math.min(balance(inv), deposit - inv.amountPaid), deposit: true };
  return { amount: balance(inv), deposit: false };
}

export function isOverdue(inv: { status: string; dueDate: Date | null }) {
  return ["SENT", "PARTIAL"].includes(inv.status) && !!inv.dueDate && inv.dueDate < new Date();
}

const creditLabel = (number: string) => `Deposit paid (${number})`;

/**
 * Credits paid booking deposits on an invoice: each becomes a "Deposit paid (INV-…)" line that
 * takes its amount off, and is marked as used so it is never credited twice. Picks up deposits for
 * the given bookings, the same project, or the same client. Returns the deposit invoice numbers applied.
 */
export async function applyPaidDeposits(tx: Tx, invoiceId: string, match: { contactId?: string | null; projectId?: string | null; bookingIds?: string[]; includeUpcoming?: boolean }) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true } });
  if (inv.isDeposit) return [];
  const or = [
    ...(match.bookingIds?.length ? [{ depositBooking: { id: { in: match.bookingIds } } }] : []),
    ...(match.projectId ? [{ projectId: match.projectId }] : []),
    // By client alone, skip deposits holding a session that hasn't happened yet (unless asked): they belong to that session's bill.
    ...(match.contactId
      ? [{ contactId: match.contactId, ...(match.includeUpcoming ? {} : { OR: [{ depositBooking: null }, { depositBooking: { startsAt: { lt: new Date() } } }] }) }]
      : []),
  ];
  if (!or.length) return [];
  const deposits = await tx.invoice.findMany({
    where: { studioId: inv.studioId, isDeposit: true, status: "PAID", depositAppliedToId: null, depositForfeited: false, id: { not: invoiceId }, OR: or },
    orderBy: { issueDate: "asc" },
  });
  if (!deposits.length) return [];
  let sort = inv.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
  for (const d of deposits) {
    await tx.invoiceItem.create({ data: { invoiceId, description: creditLabel(d.number), quantity: 1, unitPrice: -d.amountPaid, taxable: false, sortOrder: ++sort } });
    await tx.invoice.update({ where: { id: d.id }, data: { depositAppliedToId: invoiceId } });
  }
  await recalcTotal(tx, invoiceId);
  return deposits.map((d) => d.number);
}

/** After an invoice's lines are edited: a deposit whose credit line was deleted becomes available again. */
export async function releaseRemovedCredits(tx: Tx, invoiceId: string) {
  const [credited, items] = await Promise.all([
    tx.invoice.findMany({ where: { depositAppliedToId: invoiceId }, select: { id: true, number: true } }),
    tx.invoiceItem.findMany({ where: { invoiceId }, select: { description: true } }),
  ]);
  const gone = credited.filter((d) => !items.some((i) => i.description.includes(`(${d.number})`)));
  if (gone.length) await tx.invoice.updateMany({ where: { id: { in: gone.map((d) => d.id) } }, data: { depositAppliedToId: null } });
}

/** Paid booking deposits for this client or project that haven't been credited on an invoice yet. */
export function unappliedDeposits(studioId: string, match: { contactId?: string | null; projectId?: string | null; excludeId?: string }) {
  const or = [...(match.contactId ? [{ contactId: match.contactId }] : []), ...(match.projectId ? [{ projectId: match.projectId }] : [])];
  if (!or.length) return Promise.resolve([]);
  return db.invoice.findMany({ where: { studioId, isDeposit: true, status: "PAID", depositAppliedToId: null, depositForfeited: false, id: { not: match.excludeId }, OR: or }, orderBy: { issueDate: "asc" } });
}

/**
 * The studio's deposit rule for a new invoice: the deposit % from Settings on jobs at or over the
 * no-deposit amount. Returns null for "charge the full balance".
 */
export function defaultDepositPercent(studio: { depositPercent: number; depositMinimum: number }, total: number, descriptions: string[]) {
  if (!studio.depositPercent || studio.depositPercent >= 100) return null;
  if (total < studio.depositMinimum) return null;
  return studio.depositPercent;
}
