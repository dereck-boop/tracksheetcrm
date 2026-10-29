import { db } from "./db";
import { money } from "./format";
import { sessionLine } from "./bookingPrice";

export type CancelKind = "cancel" | "noshow";
export type CancelOutcome = "policy" | "keep" | "waive";

type Rules = { lateCancelHours: number; lateCancelFeePercent: number; noShowFeePercent: number };

/**
 * What the studio's policy says about cancelling this booking now (or marking it a no-show):
 * whether it's late, the fee, how much of it the paid deposit covers and what's left to invoice.
 */
export function cancelTerms(
  b: Parameters<typeof sessionLine>[0] & { depositPaidAt: Date | null; depositInvoice: { amountPaid: number } | null; depositAmount: number | null },
  rules: Rules,
  kind: CancelKind,
  now = new Date(),
) {
  const noticeHours = Math.max(0, Math.floor((b.startsAt.getTime() - now.getTime()) / 3_600_000));
  const late = kind === "noshow" || noticeHours < rules.lateCancelHours;
  const percent = kind === "noshow" ? rules.noShowFeePercent : late ? rules.lateCancelFeePercent : 0;
  const sessionTotal = sessionLine(b).total;
  const fee = Math.round((sessionTotal * percent) / 100);
  const deposit = b.depositPaidAt ? (b.depositInvoice?.amountPaid ?? b.depositAmount ?? 0) : 0;
  return { noticeHours, late, percent, sessionTotal, fee, deposit, extra: Math.max(0, fee - deposit) };
}

export type CancelTerms = ReturnType<typeof cancelTerms>;

/** The paragraph for the client email explaining what happens to their money. "{{fee_link}}" is filled in once the fee invoice exists. */
export function policyNote(t: CancelTerms, kind: CancelKind, outcome: CancelOutcome, rules: Rules) {
  const what = kind === "noshow" ? "missed sessions" : `cancellations with less than ${rules.lateCancelHours} hours' notice`;
  if (outcome === "policy" && t.fee > 0) {
    const share = `As our policy says, ${what} are charged ${t.percent}% of the session (${money(t.fee)}).`;
    if (t.extra === 0) return `${share} Your ${money(t.deposit)} deposit covers that, so there's nothing more to pay.`;
    return `${share}${t.deposit ? ` Your ${money(t.deposit)} deposit covers part of it.` : ""} The ${money(t.extra)} balance is on this invoice:\n{{fee_link}}`;
  }
  if ((outcome === "policy" || outcome === "keep") && t.deposit) return `As our policy says, the ${money(t.deposit)} deposit is kept for ${what}.`;
  if (t.deposit) return `Your ${money(t.deposit)} deposit carries over as credit toward your next session.`;
  return "";
}

/** How reliable a client has been: late cancels, no-shows and reschedules across all their bookings. */
export async function clientHistory(contactId: string | null, lateHours: number) {
  if (!contactId) return null;
  const rows = await db.booking.findMany({ where: { contactId }, select: { status: true, cancelNoticeHours: true, rescheduleCount: true } });
  const lateCancels = rows.filter((r) => r.status === "CANCELLED" && r.cancelNoticeHours != null && r.cancelNoticeHours < lateHours).length;
  const noShows = rows.filter((r) => r.status === "NO_SHOW").length;
  const reschedules = rows.reduce((s, r) => s + r.rescheduleCount, 0);
  const cancels = rows.filter((r) => r.status === "CANCELLED").length;
  return { sessions: rows.length, cancels, lateCancels, noShows, reschedules, any: lateCancels + noShows + reschedules + cancels > 0 };
}

export function historyLine(h: NonNullable<Awaited<ReturnType<typeof clientHistory>>>) {
  const parts = [
    h.noShows && `${h.noShows} no-show${h.noShows > 1 ? "s" : ""}`,
    h.lateCancels && `${h.lateCancels} late cancel${h.lateCancels > 1 ? "s" : ""}`,
    h.cancels - h.lateCancels > 0 && `${h.cancels - h.lateCancels} other cancel${h.cancels - h.lateCancels > 1 ? "s" : ""}`,
    h.reschedules && `${h.reschedules} reschedule${h.reschedules > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return `${parts.join(", ")} across ${h.sessions} booking${h.sessions === 1 ? "" : "s"}`;
}
