import type Stripe from "stripe";
import { db } from "./db";
import { logActivity } from "./activity";
import { fullName, money } from "./format";
import { balance, recalcPaid } from "./invoices";
import { notifyStudio, sendTemplate } from "./email";
import { emailBooking } from "./bookingEmails";
import { appUrl } from "./stripe";
import { clientPageUrl } from "./clientPage";
import { fillStripeFees } from "./stripeFees";
import { reportError } from "./alerts";

/** Runs one follow-up to a payment; a failure is logged and emailed to the studio instead of stopping the rest. */
async function step(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error(`After-payment step "${label}" failed`, e);
    await reportError(`After a card payment: ${label}`, e);
  }
}

/**
 * Records a paid Stripe Checkout session against its invoice. Called from the webhook and from the
 * client's return to the invoice page, so it is idempotent: payments are keyed by checkout session id.
 * Returns true when this call recorded the payment.
 */
export async function recordCheckoutPayment(session: Stripe.Checkout.Session): Promise<boolean> {
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId || session.payment_status !== "paid" || !session.amount_total) return false;
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { contact: true } });
  if (!inv) return false;
  if (await db.payment.findUnique({ where: { stripeCheckoutSessionId: session.id } })) return false;

  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  let result: Awaited<ReturnType<typeof recalcPaid>>;
  try {
    result = await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          studioId: inv.studioId,
          invoiceId: inv.id,
          amount: session.amount_total!,
          method: "STRIPE",
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: pi,
          reference: pi,
        },
      });
      return recalcPaid(tx, inv.id);
    });
  } catch (e) {
    // The webhook and the return page can race; the unique session id means the other one won.
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
  // The payment is saved. Each follow-up runs on its own: if one fails, the rest still happen and
  // Stripe isn't told the webhook failed (its retry would skip them all, seeing the payment saved).
  const amount = money(session.amount_total);
  await step("activity", () => logActivity({ studioId: inv.studioId, entityType: "invoice", entityId: inv.id, action: "paid", summary: `Stripe payment of ${amount} on ${inv.number}` }));
  // Stripe's fee is recorded on the payment; the daily job retries any not ready yet.
  await step("stripe fee", () => fillStripeFees(inv.studioId, 3));
  await step("notifications", async () => {
    const admins = await db.user.findMany({ where: { studioId: inv.studioId, active: true, role: { in: ["OWNER", "ADMIN"] } } });
    await db.notification.createMany({ data: admins.map((u) => ({ studioId: inv.studioId, userId: u.id, title: `Paid: ${amount} on ${inv.number}`, href: `/invoices/${inv.id}` })) });
  });
  await step("receipt", async () => {
    const r = await sendTemplate({
      studioId: inv.studioId,
      key: "payment_receipt",
      to: inv.contact?.email ?? session.customer_details?.email,
      entity: { type: "invoice", id: inv.id },
      vars: {
        client_name: inv.contact?.firstName ?? session.customer_details?.name?.split(" ")[0],
        number: inv.number,
        amount,
        balance: money(balance(result)),
        link: `${appUrl()}/i/${inv.publicToken}`,
        client_page: await clientPageUrl(inv.contactId),
      },
    });
    if (!r.sent && r.error !== "Template is turned off" && r.error !== "No email address") throw new Error(`Receipt not sent: ${r.error}`);
  });
  await step("studio email", () => notifyStudio(inv.studioId, `Paid: ${amount} on ${inv.number}`, `${inv.contact ? fullName(inv.contact) : "A client"} paid ${amount} by card on invoice ${inv.number}.\n\n${appUrl()}/invoices/${inv.id}`));
  if (result.confirmedBookingId) {
    const bookingId = result.confirmedBookingId;
    await step("booking confirmed email", () => emailBooking(bookingId, "booking_confirmed"));
  }
  return true;
}
