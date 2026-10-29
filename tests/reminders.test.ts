import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderToday } from "../lib/reminders";
import { parseLocal } from "../lib/format";

const rules = { reminderDaysBefore: 3, reminderEveryDays: 7 };
const base = { status: "SENT", sentAt: new Date("2026-10-01T12:00:00Z"), total: 50000, amountPaid: 0, remindersPaused: false, lastReminderAt: null, reminderCount: 0 };
const at9 = (ymd: string) => new Date(parseLocal(ymd)!.getTime() + 9 * 3600_000);

test("reminder 3 days before, on the due date, then weekly overdue", () => {
  const inv = { ...base, dueDate: parseLocal("2026-11-10")! };
  assert.equal(reminderToday(inv, rules, at9("2026-11-07"))?.kind, "upcoming");
  assert.equal(reminderToday(inv, rules, at9("2026-11-08")), null);
  assert.equal(reminderToday(inv, rules, at9("2026-11-10"))?.kind, "due");
  const late = { ...inv, lastReminderAt: at9("2026-11-10") };
  assert.equal(reminderToday(late, rules, at9("2026-11-14")), null);
  assert.equal(reminderToday(late, rules, at9("2026-11-17"))?.kind, "overdue");
});

test("never two reminders on the same day, and none once paid or paused", () => {
  const inv = { ...base, dueDate: parseLocal("2026-11-10")! };
  assert.equal(reminderToday({ ...inv, lastReminderAt: at9("2026-11-10") }, rules, at9("2026-11-10")), null);
  assert.equal(reminderToday({ ...inv, amountPaid: 50000 }, rules, at9("2026-11-10")), null);
  assert.equal(reminderToday({ ...inv, remindersPaused: true }, rules, at9("2026-11-10")), null);
});
