"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { headers } from "next/headers";
import { req, str } from "@/lib/form";
import { dueNow } from "@/lib/invoices";
import { invoiceFromQuote, quoteAgreement } from "@/lib/quotes";
import { sendInvoiceEmail } from "@/lib/invoiceEmail";
import { notifyStudio, sendTemplate } from "@/lib/email";
import { fullName, money } from "@/lib/format";
import { sessionReleaseText } from "@/lib/forms";
import { matchContact, splitLink } from "@/lib/formsSend";
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

const clientIp = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

/** Tell the studio's owners and admins in the app. */
async function notifyAdmins(studioId: string, title: string, href: string) {
  const admins = await db.user.findMany({ where: { studioId, active: true, role: { in: ["OWNER", "ADMIN"] } } });
  await db.notification.createMany({ data: admins.map((u) => ({ studioId, userId: u.id, title, href })) });
}

/**
 * A writer signs their line of a split sheet. A PRO or IPI they add is also saved on their contact
 * when it's blank there. When the last one signs, everyone gets a copy.
 */
async function signSplit(fd: FormData) {
  const token = req(fd, "token");
  const me = await db.trackSplit.findUnique({ where: { token }, include: { track: { include: { project: { include: { artist: true } } } } } });
  if (!me || me.signedAt) return;
  if (fd.get("agree") === null) throw new Error("Please tick the box to agree to the split.");
  const t = me.track;
  const studioId = t.project.studioId;
  const pro = str(fd, "pro") ?? me.pro;
  const ipi = str(fd, "ipi") ?? me.ipi;
  await db.trackSplit.update({ where: { id: me.id }, data: { signedAt: new Date(), signedName: req(fd, "name", "Your name"), signedIp: await clientIp(), pro, ipi } });
  const c = await matchContact(studioId, me.name, me.email);
  if (c && ((!c.pro && pro) || (!c.ipi && ipi))) await db.contact.update({ where: { id: c.id }, data: { pro: c.pro ?? pro, ipi: c.ipi ?? ipi } });
  await logActivity({ studioId, entityType: "project", entityId: t.projectId, action: "signed", summary: `${me.name} signed the split sheet for “${t.title}”` });
  const all = await db.trackSplit.findMany({ where: { trackId: t.id } });
  if (all.every((s) => s.signedAt)) {
    await notifyAdmins(studioId, `Split sheet signed by everyone: ${t.title}`, `/projects/${t.projectId}/songs/${t.id}`);
    for (const s of all) {
      if (s.email) await sendTemplate({ studioId, key: "split_sheet_done", to: s.email, entity: { type: "project", id: t.projectId }, vars: { client_name: s.name.split(" ")[0], song: t.title, artist: t.project.artist?.name ?? t.project.name, link: splitLink(s.token) } });
    }
  }
  revalidatePath(`/split/${token}`);
}

/** A session player signs their release. The exact text they read is saved with the signature. */
async function signRelease(fd: FormData) {
  const token = req(fd, "token");
  const h = await db.sessionHire.findUnique({ where: { token }, include: { contact: true, studio: true, project: { include: { artist: true, client: true } } } });
  if (!h || h.signedAt) return;
  if (fd.get("agree") === null) throw new Error("Please tick the box to agree to the release.");
  const legalName = str(fd, "legalName");
  const address = str(fd, "address");
  if (h.contact && ((!h.contact.legalName && legalName) || (!h.contact.address && address))) {
    await db.contact.update({ where: { id: h.contact.id }, data: { legalName: h.contact.legalName ?? legalName, address: h.contact.address ?? address } });
  }
  const text = sessionReleaseText(h.studio.sessionReleaseText, { ...h, legalName: legalName ?? h.contact?.legalName }, h.project, h.studio.name, (c) => money(c, h.studio.currency));
  await db.sessionHire.update({ where: { id: h.id }, data: { signedAt: new Date(), signedName: req(fd, "name", "Your name"), signedIp: await clientIp(), signedText: text } });
  await logActivity({ studioId: h.studioId, entityType: "project", entityId: h.projectId, action: "signed", summary: `${h.name} signed their session release` });
  await notifyAdmins(h.studioId, `Session release signed: ${h.name}`, `/projects/${h.projectId}`);
  revalidatePath(`/release/${token}`);
}

// Thrown errors show as a message on the page instead of a crash screen.
const respondToQuoteAction = safe(respondToQuote);
const payInvoiceAction = safe(payInvoice);
const signSplitAction = safe(signSplit);
const signReleaseAction = safe(signRelease);
export { respondToQuoteAction as respondToQuote, payInvoiceAction as payInvoice, signSplitAction as signSplit, signReleaseAction as signRelease };
