import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { bookingClient, emailBooking } from "@/lib/bookingEmails";
import { notifyStudio, sendEmail, sendTemplate } from "@/lib/email";
import { fmtDate, fmtTime, fullName, inTz, money } from "@/lib/format";
import { balance } from "@/lib/invoices";
import { reminderToday } from "@/lib/reminders";
import { fromRows, totals } from "@/lib/money";
import { clientPageUrl } from "@/lib/clientPage";
import { appUrl } from "@/lib/stripe";
import { adminJobs } from "@/lib/adminJobs";
import { pruneRateLimits } from "@/lib/rateLimit";
import { timingSafeEqual } from "crypto";
import { reportError } from "@/lib/alerts";

/** Compares the cron password without leaking how much of it matched through timing. */
function authorized(header: string | null, secret: string) {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A failed email counts as done only when retrying can't help. */
const settled = (r: { sent: boolean; error?: string }) => r.sent || r.error === "No email address" || r.error === "Template is turned off";

/**
 * Daily job (Vercel Cron, see vercel.json): emails clients a reminder for tomorrow's confirmed
 * sessions, payment reminders for unpaid invoices, one follow-up on unanswered quotes and a thank-you
 * after yesterday's sessions; tells the studio about finished sessions not invoiced yet; and emails
 * each team member their due to-do reminders. Safe to run more than once a day: sent-at stamps stop repeats.
 * A second, later run (?catchup=1, see vercel.json) retries client emails that failed in the morning.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(req.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const catchup = new URL(req.url).searchParams.has("catchup");
  // Each part runs on its own, so one failing doesn't stop the rest of the morning's emails.
  const part = async <T,>(name: string, fn: () => Promise<T>): Promise<T | { [k: string]: string }> => {
    try {
      return await fn();
    } catch (e) {
      console.error(`Daily job part "${name}" failed`, e);
      await reportError(`Daily job: ${name}`, e);
      return { [`${name}Error`]: (e as Error).message };
    }
  };

  // "Tomorrow" in the studio's timezone.
  const today = inTz(new Date());
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);

  const bookings = await db.booking.findMany({
    where: { status: "CONFIRMED", reminderSentAt: null, startsAt: { gte: tomorrow, lt: dayAfter } },
    select: { id: true },
  });
  let reminders = 0;
  for (const b of bookings) {
    const r = await emailBooking(b.id, "booking_reminder");
    // Marked when sent, or when there's nothing to retry (no client email, template off); a failed
    // send stays unmarked so the afternoon catch-up run tries again.
    if (settled(r)) await db.booking.update({ where: { id: b.id }, data: { reminderSentAt: new Date() } });
    if (r.sent) reminders++;
  }

  // To-do reminders: one email per person listing everything whose reminder time has arrived.
  const tasks = await db.task.findMany({
    where: { status: { not: "DONE" }, reminderSentAt: null, remindAt: { lt: tomorrow }, OR: [{ assigneeId: { not: null } }, { createdById: { not: null } }] },
    include: { assignee: true, createdBy: true, project: true },
    orderBy: { remindAt: "asc" },
  });
  const byUser = new Map<string, typeof tasks>();
  // Goes to whoever it's assigned to, else whoever created it.
  for (const t of tasks) {
    const to = (t.assigneeId ?? t.createdById)!;
    byUser.set(to, [...(byUser.get(to) ?? []), t]);
  }
  let digests = 0;
  for (const list of byUser.values()) {
    const user = (list[0]!.assignee ?? list[0]!.createdBy)!;
    if (!user.active) continue;
    const lines = list.map((t) => `• ${t.title}${t.project ? ` (${t.project.name})` : ""}${t.dueDate ? `, due ${fmtDate(t.dueDate)}` : ""}${t.remindAt ? ` [${fmtTime(t.remindAt)}]` : ""}`);
    const r = await sendEmail({
      to: user.email,
      subject: `Your to-dos: ${list.length} reminder${list.length > 1 ? "s" : ""}`,
      text: `Hi ${user.name.split(" ")[0]},\n\n${lines.join("\n")}\n\n${appUrl()}/tasks`,
    });
    if (r.sent) {
      await db.task.updateMany({ where: { id: { in: list.map((t) => t.id) } }, data: { reminderSentAt: new Date() } });
      digests++;
    }
  }

  const billing = await part("billing", billingReminders);
  const sessions = await part("sessions", () => sessionFollowUps(today, catchup));
  // Backups and housekeeping run once a day, in the morning run.
  const admin = catchup ? {} : await part("admin", () => adminJobs(today));
  if (!catchup) await part("rateLimits", () => pruneRateLimits());

  return Response.json({ bookingReminders: reminders, bookingsChecked: bookings.length, todoDigests: digests, ...billing, ...sessions, ...admin });
}

/** Payment reminders (before due, on the due date, then every few days overdue) and quote follow-ups. */
async function billingReminders() {
  const now = new Date();
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIAL"] }, remindersPaused: false, dueDate: { not: null }, sentAt: { not: null }, contact: { email: { not: null } } },
    include: { contact: true, studio: true },
  });
  let invoiceReminders = 0;
  for (const inv of invoices) {
    const r = reminderToday(inv, inv.studio, now);
    if (!r) continue;
    const res = await sendTemplate({
      studioId: inv.studioId,
      key: r.kind === "overdue" ? "invoice_overdue" : "invoice_reminder",
      to: inv.contact!.email,
      entity: { type: "invoice", id: inv.id },
      vars: {
        client_name: inv.contact!.firstName,
        number: inv.number,
        amount: money(balance(inv)),
        due_date: fmtDate(inv.dueDate),
        when: r.kind === "due" ? "today" : `in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`,
        days_late: String(r.daysLate),
        link: `${appUrl()}/i/${inv.publicToken}`,
        client_page: await clientPageUrl(inv.contactId),
      },
    });
    // Count it even if the template is turned off, so a turned-off email isn't retried every morning.
    if (res.sent || res.error === "Template is turned off") {
      await db.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: now, reminderCount: { increment: 1 } } });
      if (res.sent) invoiceReminders++;
    }
  }

  // One follow-up per quote: 3 days before it expires, or 5 days after sending if it never expires.
  const quotes = await db.quote.findMany({
    where: {
      status: "SENT",
      reminderSentAt: null,
      sentAt: { not: null, lt: new Date(now.getTime() - 2 * 864e5) },
      contact: { email: { not: null } },
      OR: [{ validUntil: { gt: now, lt: new Date(now.getTime() + 3 * 864e5) } }, { validUntil: null, sentAt: { lt: new Date(now.getTime() - 5 * 864e5) } }],
    },
    include: { contact: true, items: true },
  });
  let quoteReminders = 0;
  for (const q of quotes) {
    const res = await sendTemplate({
      studioId: q.studioId,
      key: "quote_reminder",
      to: q.contact!.email,
      entity: { type: "quote", id: q.id },
      vars: { client_name: q.contact!.firstName, number: q.number, total: money(totals(fromRows(q.items), Number(q.taxRate), q.discount).total), valid_until: fmtDate(q.validUntil), link: `${appUrl()}/q/${q.publicToken}` },
    });
    if (settled(res)) await db.quote.update({ where: { id: q.id }, data: { reminderSentAt: now } });
    if (res.sent) quoteReminders++;
  }
  return { invoiceReminders, quoteReminders };
}

/**
 * Thank-you emails for recent sessions (yesterday's, plus any from the two days before that didn't
 * go out), and a note to the studio about yesterday's sessions not invoiced yet (morning run only).
 */
async function sessionFollowUps(today: Date, catchup = false) {
  const yesterday = addDays(today, -1);
  const sessions = await db.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "COMPLETED"] },
      endsAt: { lt: today },
      OR: [{ endsAt: { gte: yesterday } }, { endsAt: { gte: addDays(today, -3) }, followUpSentAt: null }],
    },
    include: { contact: true, room: true, studio: true, project: { include: { invoices: { where: { status: { not: "VOID" } }, select: { createdAt: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  let followUps = 0;
  const unbilled = new Map<string, typeof sessions>();
  for (const b of sessions) {
    if (!b.followUpSentAt) {
      const client = bookingClient(b);
      const res = await sendTemplate({
        studioId: b.studioId,
        key: "session_followup",
        to: client.email,
        entity: { type: "booking", id: b.id },
        vars: { client_name: client.name, room: b.room.name, date: fmtDate(b.startsAt), booking_link: `${appUrl()}/book/${b.studio.slug}`, client_page: await clientPageUrl(b.contactId) },
      });
      if (settled(res)) await db.booking.update({ where: { id: b.id }, data: { followUpSentAt: new Date() } });
      if (res.sent) followUps++;
    }
    if (catchup || b.endsAt < yesterday) continue;
    // Billed on its own invoice, or its project was invoiced after the session started: nothing to flag.
    if (!b.contactId && !b.requestEmail) continue; // internal time (maintenance, own projects)
    const billed = b.invoiceId || b.project?.invoices.some((i) => i.createdAt >= b.startsAt);
    if (!billed) unbilled.set(b.studioId, [...(unbilled.get(b.studioId) ?? []), b]);
  }
  for (const [studioId, list] of unbilled) {
    const lines = list.map((b) => `• ${b.title} (${b.room.name}${b.contact ? `, ${fullName(b.contact)}` : ""}): ${appUrl()}/bookings/${b.id}`);
    await notifyStudio(studioId, `${list.length} session${list.length > 1 ? "s" : ""} from yesterday not invoiced yet`, `These finished yesterday and aren't on an invoice yet. Open one and click "Create invoice for this session":\n\n${lines.join("\n")}`);
  }
  return { sessionFollowUps: followUps, unbilledSessions: [...unbilled.values()].reduce((n, l) => n + l.length, 0) };
}
