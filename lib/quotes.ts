import { db } from "./db";
import { createInvoice, defaultDepositPercent } from "./invoices";
import { fromRows, totals } from "./money";

/**
 * Turns a quote into an invoice (or returns the one it already has). Carries the lines, notes and
 * terms over, applies the deposit rule and credits paid booking deposits for the client/project.
 */
export async function invoiceFromQuote(quoteId: string) {
  const q = await db.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { items: { orderBy: { sortOrder: "asc" } }, invoice: true, studio: true } });
  if (q.invoice) return { invoice: q.invoice, created: false };
  const items = fromRows(q.items);
  const total = totals(items, Number(q.taxRate), q.discount).total;
  const invoice = await createInvoice(
    q.studioId,
    {
      contactId: q.contactId,
      projectId: q.projectId,
      quoteId: q.id,
      notes: q.notes,
      terms: q.terms ?? q.studio.invoiceTerms,
      taxRate: Number(q.taxRate),
      discount: q.discount,
      dueDate: new Date(Date.now() + 14 * 864e5),
      depositPercent: defaultDepositPercent(q.studio, total, items.map((i) => i.description)),
      applyDeposits: true,
    },
    items,
  );
  return { invoice, created: true };
}

/** What the client agrees to when accepting: the quote's terms plus the studio's policies (null when there are none). */
export function quoteAgreement(terms: string | null, policies: string | null) {
  return [terms, policies].map((t) => t?.trim()).filter(Boolean).join("\n\n") || null;
}
