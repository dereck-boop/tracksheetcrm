import { db } from "./db";
import { getTemplate, render, sendTemplate, studioVars, type SendResult } from "./email";
import type { TemplateKey } from "./emailTemplates";
import { fmtDate, money } from "./format";
import { dueNow } from "./invoices";
import { clientPageUrl } from "./clientPage";
import { appUrl } from "./stripe";
import { totals, fromRows } from "./money";

/** A client email filled in from its template, ready to show (and edit) before it goes out. */
export type EmailDraft = { to: string | null; subject: string; body: string; enabled: boolean };

/** Which template an invoice uses and its fill-ins. */
async function invoiceMail(invoiceId: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { contact: true, depositBooking: true } });
  if (!inv) return null;
  const now = dueNow(inv);
  const key: TemplateKey = inv.depositBooking ? "deposit_requested" : now.deposit ? "invoice_deposit" : "invoice_sent";
  const vars = {
    client_name: inv.contact?.firstName,
    number: inv.number,
    amount: money(now.amount),
    total: money(inv.total),
    due_date: fmtDate(inv.dueDate),
    date: inv.depositBooking ? fmtDate(inv.depositBooking.startsAt) : "",
    link: `${appUrl()}/i/${inv.publicToken}`,
    client_page: await clientPageUrl(inv.contactId),
  };
  return { inv, key, vars, to: inv.contact?.email ?? null };
}

async function draft(studioId: string, key: TemplateKey, to: string | null, vars: Record<string, string | null | undefined>): Promise<EmailDraft> {
  const [tpl, base] = await Promise.all([getTemplate(studioId, key), studioVars(studioId)]);
  const fill = { ...base, ...vars };
  return { to, subject: render(tpl.subject, fill), body: render(tpl.body, fill), enabled: tpl.enabled };
}

/** The email "Email to client" would send for this invoice right now. */
export async function invoiceEmailDraft(invoiceId: string): Promise<EmailDraft | null> {
  const m = await invoiceMail(invoiceId);
  return m && draft(m.inv.studioId, m.key, m.to, m.vars);
}

/**
 * Emails an invoice (or booking deposit request) to its client and marks it sent. Never throws.
 * Pass override to send the subject and message as reviewed on the page instead of the template.
 */
export async function sendInvoiceEmail(invoiceId: string, userId?: string | null, override?: { subject: string; text: string } | null): Promise<SendResult & { to?: string | null }> {
  const m = await invoiceMail(invoiceId);
  if (!m) return { sent: false, error: "Invoice not found" };
  const { inv, to } = m;
  if (!to) return { sent: false, error: "the client has no email address. Add one to the contact first.", to };
  const result = await sendTemplate({ studioId: inv.studioId, key: m.key, to, userId, entity: { type: "invoice", id: inv.id }, vars: m.vars, override });
  if (result.sent) await db.invoice.update({ where: { id: inv.id }, data: { sentAt: inv.sentAt ?? new Date(), status: inv.status === "DRAFT" ? "SENT" : inv.status } });
  return { ...result, to };
}

/** Which template a quote uses and its fill-ins. */
async function quoteMail(quoteId: string) {
  const q = await db.quote.findUnique({ where: { id: quoteId }, include: { contact: true, items: true } });
  if (!q) return null;
  const vars = {
    client_name: q.contact?.firstName,
    number: q.number,
    total: money(totals(fromRows(q.items), Number(q.taxRate), q.discount).total),
    link: `${appUrl()}/q/${q.publicToken}`,
  };
  return { q, key: "quote_sent" as const, vars, to: q.contact?.email ?? null };
}

/** The email "Email to client" would send for this quote right now. */
export async function quoteEmailDraft(quoteId: string): Promise<EmailDraft | null> {
  const m = await quoteMail(quoteId);
  return m && draft(m.q.studioId, m.key, m.to, m.vars);
}

/** Emails the quote link to the client and marks it sent. Never throws. */
export async function sendQuoteEmail(quoteId: string, userId?: string | null, override?: { subject: string; text: string } | null): Promise<SendResult & { to?: string | null }> {
  const m = await quoteMail(quoteId);
  if (!m) return { sent: false, error: "Quote not found" };
  const { q, to } = m;
  if (!to) return { sent: false, error: "the client has no email address. Add one to the contact first.", to };
  const result = await sendTemplate({ studioId: q.studioId, key: m.key, to, userId, entity: { type: "quote", id: q.id }, vars: m.vars, override });
  if (result.sent) await db.quote.update({ where: { id: q.id }, data: { status: q.status === "DRAFT" ? "SENT" : q.status, sentAt: q.sentAt ?? new Date() } });
  return { ...result, to };
}
