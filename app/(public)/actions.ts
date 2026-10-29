"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { fullName } from "@/lib/format";
import { headers } from "next/headers";
import { req, str } from "@/lib/form";
import { dueNow } from "@/lib/invoices";
import { invoiceFromQuote, quoteAgreement } from "@/lib/quotes";
import { sendInvoiceEmail } from "@/lib/invoiceEmail";
import { notifyStudio } from "@/lib/email";
import { appUrl, stripe } from "@/lib/stripe";

/**
 * The client accepts or declines a quote. Accepting records the name they typed and the terms they
 * agreed to; then, unless the studio turned it off, the invoice is created and emailed right away.
 */
async function respondToQuote(fd: FormData) {
  const token = req(fd, "token");
  const accept = fd.get("decision") === "accept";
  const q = await db.quote.findUnique({ where: { publicToken: token }, include: { studio: true, contact: true } });
  if (!q || !["SENT", "DRAFT"].includes(q.status)) return;
  if (q.validUntil && q.validUntil < new Date() && accept) throw new Error("This quote has expired. Please contact the studio.");
  const agreed = quoteAgreement(q.terms, q.studio.policies);
  const name = str(fd, "acceptedName");
  if (accept && !name) throw new Error("Please type your name to accept.");
  if (accept && agreed && fd.get("agree") === null) throw new Error("Please tick the box to agree to the terms.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await db.quote.update({
    where: { id: q.id },
    // A draft the client answered was clearly sent (by a copied link), so it gets a sent date too.
    data: { sentAt: q.sentAt ?? new Date(), ...(accept ? { status: "ACCEPTED", acceptedAt: new Date(), acceptedName: name, acceptedTerms: agreed, acceptedIp: ip } : { status: "DECLINED" }) },
  });
  const who = name ?? (q.contact ? fullName(q.contact) : "The client");
  await logActivity({ studioId: q.studioId, entityType: "quote", entityId: q.id, action: accept ? "accepted" : "declined", summary: accept ? `${who} accepted quote ${q.number}` : `Client declined quote ${q.number}` });
  const admins = await db.user.findMany({ where: { studioId: q.studioId, active: true, role: { in: ["OWNER", "ADMIN"] } } });
  await db.notification.createMany({ data: admins.map((u) => ({ studioId: q.studioId, userId: u.id, title: `Quote ${q.number} ${accept ? "accepted" : "declined"}`, href: `/quotes/${q.id}` })) });

  let invoiceNote = "";
  if (accept && q.studio.autoInvoiceOnAccept) {
    // The acceptance is already saved; a problem making the invoice must not show the client an error.
    try {
      const { invoice, created } = await invoiceFromQuote(q.id);
      if (created) await logActivity({ studioId: q.studioId, entityType: "invoice", entityId: invoice.id, action: "created", summary: `Invoice ${invoice.number} created automatically from accepted quote ${q.number}` });
      const r = await sendInvoiceEmail(invoice.id);
      invoiceNote = `\n\nInvoice ${invoice.number} was created${r.sent ? ` and emailed to ${r.to}` : `, but not emailed (${r.error})`}:\n${appUrl()}/invoices/${invoice.id}`;
    } catch (e) {
      console.error("Auto-invoice failed", e);
      invoiceNote = `\n\nThe invoice couldn't be created automatically (${(e as Error).message}). Use "Convert to invoice" on the quote.`;
    }
  }
  await notifyStudio(
    q.studioId,
    `Quote ${q.number} ${accept ? "accepted" : "declined"}`,
    `${accept ? `${who} accepted` : `${q.contact ? fullName(q.contact) : "The client"} declined`} quote ${q.number}.${invoiceNote}\n\n${appUrl()}/quotes/${q.id}`,
  );
  revalidatePath(`/q/${token}`);
}

/** Start a Stripe Checkout session for what's due now: the deposit if one is asked for and unpaid, else the remaining balance. */
async function payInvoice(fd: FormData) {
  const s = stripe();
  if (!s) throw new Error("Online payments aren't set up yet");
  const token = req(fd, "token");
  const inv = await db.invoice.findUnique({ where: { publicToken: token }, include: { contact: true, studio: true } });
  if (!inv || !["SENT", "PARTIAL", "DRAFT"].includes(inv.status)) redirect(`/i/${token}`);
  const { amount, deposit } = dueNow(inv);
  if (amount < 50) redirect(`/i/${token}`); // Stripe minimum is $0.50
  // A draft being paid was clearly sent (by a copied link): mark it sent so reminders and reports see it.
  if (inv.status === "DRAFT") await db.invoice.update({ where: { id: inv.id }, data: { status: "SENT", sentAt: inv.sentAt ?? new Date() } });
  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: inv.studio.currency.toLowerCase(),
        unit_amount: amount,
        product_data: { name: `${inv.studio.name} · Invoice ${inv.number}${inv.isDeposit || deposit ? " (deposit)" : ""}` },
      },
    }],
    customer_email: inv.contact?.email ?? undefined,
    client_reference_id: inv.id,
    metadata: { invoiceId: inv.id, studioId: inv.studioId },
    payment_intent_data: { metadata: { invoiceId: inv.id, studioId: inv.studioId }, description: `Invoice ${inv.number}${inv.contact ? ` · ${fullName(inv.contact)}` : ""}` },
    success_url: `${appUrl()}/i/${token}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/i/${token}`,
  });
  redirect(session.url!);
}

// Thrown errors show as a message on the page instead of a crash screen.
const respondToQuoteAction = safe(respondToQuote);
const payInvoiceAction = safe(payInvoice);
export { respondToQuoteAction as respondToQuote, payInvoiceAction as payInvoice };
