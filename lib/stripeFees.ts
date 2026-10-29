import { db } from "./db";
import { stripe } from "./stripe";

/** What Stripe kept as its fee on a card payment, in cents, or null if it isn't known yet. */
async function feeFor(paymentIntentId: string) {
  const s = stripe();
  if (!s) return null;
  const pi = await s.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
  const charge = pi.latest_charge;
  const bt = charge && typeof charge === "object" ? charge.balance_transaction : null;
  return bt && typeof bt === "object" ? bt.fee : null;
}

/**
 * Fills in Stripe's fee on card payments that don't have it yet (newest first), so the invoice shows
 * what you actually received. Never throws. Returns how many were filled in.
 */
export async function fillStripeFees(studioId?: string, limit = 50) {
  if (!stripe()) return 0;
  const missing = await db.payment.findMany({
    where: { ...(studioId ? { studioId } : {}), method: "STRIPE", feeAmount: null, stripePaymentIntentId: { not: null } },
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: { id: true, stripePaymentIntentId: true },
  });
  let n = 0;
  for (const p of missing) {
    try {
      const fee = await feeFor(p.stripePaymentIntentId!);
      if (fee != null) {
        await db.payment.update({ where: { id: p.id }, data: { feeAmount: fee } });
        n++;
      }
    } catch (e) {
      console.error("Stripe fee lookup failed", p.id, (e as Error).message);
    }
  }
  return n;
}
