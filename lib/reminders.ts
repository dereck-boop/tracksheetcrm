import { addDays } from "date-fns";
import { fmtDate, format, parseLocal } from "./format";
import { balance } from "./invoices";

/** Cap so a forgotten invoice doesn't email a client forever. */
export const MAX_REMINDERS = 8;

/** Midnight (studio time) of the day a date falls on. */
const dayOf = (d: Date) => parseLocal(format(d, "yyyy-MM-dd"))!;
const daysBetween = (from: Date, to: Date) => Math.round((dayOf(to).getTime() - dayOf(from).getTime()) / 864e5);

type Inv = { status: string; dueDate: Date | null; sentAt: Date | null; total: number; amountPaid: number; remindersPaused: boolean; lastReminderAt: Date | null; reminderCount: number };
type Rules = { reminderDaysBefore: number; reminderEveryDays: number };

function eligible(inv: Inv) {
  return ["SENT", "PARTIAL"].includes(inv.status) && !!inv.dueDate && !!inv.sentAt && balance(inv) > 0 && !inv.remindersPaused && inv.reminderCount < MAX_REMINDERS;
}

/**
 * Which reminder (if any) an invoice gets today: "upcoming" N days before the due date, "due" on it,
 * then "overdue" every N days after the last one until paid. At most one per day.
 */
export function reminderToday(inv: Inv, rules: Rules, now = new Date()): { kind: "upcoming" | "due" | "overdue"; daysLate: number; daysLeft: number } | null {
  if (!eligible(inv)) return null;
  if (inv.lastReminderAt && daysBetween(inv.lastReminderAt, now) === 0) return null;
  const left = daysBetween(now, inv.dueDate!);
  if (left > 0) return rules.reminderDaysBefore > 0 && left === rules.reminderDaysBefore ? { kind: "upcoming", daysLate: 0, daysLeft: left } : null;
  if (left === 0) return { kind: "due", daysLate: 0, daysLeft: 0 };
  if (rules.reminderEveryDays <= 0) return null;
  const since = inv.lastReminderAt ? daysBetween(inv.lastReminderAt, now) : Infinity;
  return since >= rules.reminderEveryDays ? { kind: "overdue", daysLate: -left, daysLeft: left } : null;
}

/** The day the next reminder goes out, for the invoice page, or null when none is coming. */
export function nextReminder(inv: Inv, rules: Rules, now = new Date()) {
  if (!eligible(inv)) return null;
  const today = dayOf(now);
  for (let i = 0; i <= 90; i++) {
    const day = addDays(today, i);
    // Pretend it's 9am that day, when the daily job runs.
    if (reminderToday(inv, rules, new Date(day.getTime() + 9 * 3600_000))) return i === 0 ? "today" : fmtDate(day);
  }
  return null;
}
