import type Stripe from "stripe";
import { db } from "@/lib/db";
import { balance, recalcPaid } from "@/lib/invoices";
import { logActivity } from "@/lib/activity";
import { sendTemplate } from "@/lib/email";
import { money } from "@/lib/format";
import { recordCheckoutPayment } from "@/lib/payments";
import { appUrl, stripe } from "@/lib/stripe";

/**
 * Stripe webhook. Subscribe to: checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded.
 * Idempotent: payments are keyed by checkout session id, so retries never double-count.
 */
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response("Stripe not configured", { status: 501 });

  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await recordCheckoutPayment(event.data.object);
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    const payment = pi ? await db.payment.findUnique({ where: { stripePaymentIntentId: pi } }) : null;
    if (payment && charge.amount_refunded > payment.refundedAmount) {
      const inv = await db.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount: charge.amount_refunded } });
        return recalcPaid(tx, payment.invoiceId);
      });
      // Only the newly refunded part, so a second partial refund reports its own amount.
      const amount = money(charge.amount_refunded - payment.refundedAmount);
      const contact = inv.contactId ? await db.contact.findUnique({ where: { id: inv.contactId } }) : null;
      await logActivity({ studioId: inv.studioId, entityType: "invoice", entityId: inv.id, action: "refunded", summary: `Refunded ${amount} on ${inv.number}` });
      await sendTemplate({
        studioId: inv.studioId,
        key: "refund_notice",
        to: contact?.email ?? charge.billing_details?.email,
        entity: { type: "invoice", id: inv.id },
        vars: { client_name: contact?.firstName ?? charge.billing_details?.name?.split(" ")[0], number: inv.number, amount, balance: money(balance(inv)), link: `${appUrl()}/i/${inv.publicToken}` },
      });
    }
  }

  return Response.json({ received: true });
}
