import Link from "next/link";
import { addDays, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { canSeeMoney, requireUser } from "@/lib/auth";
import { ago, fmtTime, format, fullName, inTz, money, parseLocal } from "@/lib/format";
import { bookingTone, INACTIVE_BOOKING } from "@/lib/status";
import { eventColor, eventsBetween, eventWhen } from "@/lib/events";
import { RevenueChart, type RevenuePoint } from "@/components/RevenueChart";
import { Badge, Card } from "@/components/ui";

const RANGES = { week: "This week", month: "This month", year: "This year" } as const;
type Range = keyof typeof RANGES;

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string; year?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const range: Range = sp.range && sp.range in RANGES ? (sp.range as Range) : "week";
  const now = inTz(Date.now());
  const from = range === "week" ? startOfWeek(now, { weekStartsOn: 1 }) : range === "month" ? startOfMonth(now) : startOfYear(now);
  const year = Number(sp.year) || now.getFullYear();
  const yearStart = parseLocal(`${year}-01-01`)!;
  const yearEnd = parseLocal(`${year + 1}-01-01`)!;
  const todayStart = inTz(now.getTime());
  todayStart.setHours(0, 0, 0, 0);
  const sid = user.studioId;

  const [requests, upcoming, openInv, pastDue, received, yrPayments, yrInvoices, yrQuotes, today, tasks, activity, comingUp] = await Promise.all([
    db.booking.count({ where: { studioId: sid, status: "REQUESTED" } }),
    db.booking.count({ where: { studioId: sid, status: { in: ["HOLD", "CONFIRMED"] }, startsAt: { gte: now } } }),
    db.invoice.aggregate({ where: { studioId: sid, status: { in: ["SENT", "PARTIAL"] } }, _count: true, _sum: { total: true, amountPaid: true } }),
    db.invoice.aggregate({ where: { studioId: sid, status: { in: ["SENT", "PARTIAL"] }, dueDate: { lt: now } }, _count: true, _sum: { total: true, amountPaid: true } }),
    db.payment.aggregate({ where: { studioId: sid, receivedAt: { gte: from } }, _sum: { amount: true, refundedAmount: true } }),
    db.payment.findMany({ where: { studioId: sid, receivedAt: { gte: yearStart, lt: yearEnd } }, select: { amount: true, refundedAmount: true, receivedAt: true } }),
    db.invoice.findMany({ where: { studioId: sid, status: { not: "VOID" }, issueDate: { gte: yearStart, lt: yearEnd } }, select: { total: true, issueDate: true } }),
    db.quote.findMany({ where: { studioId: sid, issueDate: { gte: yearStart, lt: yearEnd } }, include: { items: true } }),
    db.booking.findMany({
      where: { studioId: sid, startsAt: { lt: addDays(todayStart, 1) }, endsAt: { gt: todayStart }, status: { notIn: INACTIVE_BOOKING } },
      orderBy: { startsAt: "asc" },
      include: { room: true, contact: true, engineer: true },
    }),
    db.task.findMany({ where: { studioId: sid, assigneeId: user.id, status: { not: "DONE" } }, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, take: 6 }),
    db.activity.findMany({ where: { studioId: sid }, orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
    eventsBetween(sid, todayStart, addDays(todayStart, 21)),
  ]);

  const months: RevenuePoint[] = Array.from({ length: 12 }, (_, m) => ({ month: format(new Date(Date.UTC(year, m, 15)), "MMM"), payments: 0, invoices: 0, quotes: 0 }));
  const bucket = (d: Date) => months[inTz(d).getMonth()]!;
  yrPayments.forEach((p) => (bucket(p.receivedAt).payments += (p.amount - p.refundedAmount) / 100));
  yrInvoices.forEach((i) => (bucket(i.issueDate).invoices += i.total / 100));
  yrQuotes.forEach((q) => (bucket(q.issueDate).quotes += q.items.reduce((s, it) => s + Number(it.quantity) * it.unitPrice, 0) / 100));

  const openBalance = (openInv._sum.total ?? 0) - (openInv._sum.amountPaid ?? 0);
  const pastDueBalance = (pastDue._sum.total ?? 0) - (pastDue._sum.amountPaid ?? 0);

  const seesMoney = canSeeMoney(user.role);
  const todayCard = (
    <Card title="Today" actions={<Link href="/bookings?view=day" className="font-mono text-[10.5px] lowercase tracking-[0.08em] text-gray-500 hover:text-black">calendar →</Link>}>
      {today.length === 0 ? <p className="text-sm text-gray-500">No bookings today.</p> : (
        <ul className="space-y-4">
          {today.map((b) => (
            <li key={b.id} className="flex gap-3.5 text-sm">
              <div className="w-[62px] shrink-0 whitespace-nowrap pt-0.5 font-mono text-[10.5px] lowercase leading-[1.7] text-gray-500">
                {b.timeTbd ? "hours tbd" : <>{fmtTime(b.startsAt)}<br />{fmtTime(b.endsAt)}</>}
              </div>
              <div className="min-w-0 flex-1 border-l-2 pl-3.5" style={{ borderColor: b.room.color }}>
                <div className="flex items-start gap-2">
                  <Link href={`/bookings/${b.id}`} className="font-bold hover:underline">{b.title}</Link>
                  <span className="ml-auto"><Badge tone={bookingTone[b.status]}>{b.status.toLowerCase()}</Badge></span>
                </div>
                <div className="text-[13px] text-gray-600">{b.room.name}{b.engineer && ` · ${b.engineer.name}`}{b.contact && ` · ${fullName(b.contact)}`}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {comingUp.length > 0 && (
        <div className="mt-5 border-t border-dashed border-gray-200 pt-4">
          <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] lowercase tracking-[0.08em] text-gray-500">
            events, next 3 weeks <Link href="/events" className="hover:text-black">all →</Link>
          </div>
          <ul className="space-y-1.5 text-sm">
            {comingUp.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: eventColor(e.kind) }} />
                <Link href={`/events/${e.id}`} className="link">{e.title}</Link>
                <span className="font-mono text-[10.5px] text-gray-500">{eventWhen(e)}{e.closed && " · closed"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10.5px] lowercase tracking-[0.08em] text-gray-500">dashboard</span>
        <span className="flex-1" />
        <div className="flex gap-0.5 rounded-full border border-gray-200 bg-white p-[3px] text-[12.5px]">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <Link key={r} href={`/dashboard?range=${r}`} className={`rounded-full px-3 py-1 ${r === range ? "bg-black text-white" : "text-gray-600 hover:text-black"}`}>{RANGES[r]}</Link>
          ))}
        </div>
        <Link href="/bookings/new" className="btn-primary">+ New booking</Link>
      </div>

      <div className="mb-7 flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="text-[clamp(42px,5.4vw,66px)] leading-[0.95]">{format(now, "MMMM")} <span className="text-gray-300">{format(now, "yyyy")}</span></h1>
        <p className="mb-1.5 text-sm text-gray-600">
          {format(now, "EEEE 'the' do")}. Welcome back, {user.name.split(" ")[0]}.{" "}
          {today.length === 0 ? "Nothing booked today." : `${today.length} session${today.length === 1 ? "" : "s"} today.`}
        </p>
      </div>

      <section aria-label="At a glance" className="mb-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {seesMoney && (<>
          <div className="card px-5 py-[18px]">
            <div className="text-[13px] text-gray-500">Received {RANGES[range].toLowerCase()}</div>
            <div className="mt-1 font-display text-[38px] leading-[1.05] tracking-[-0.02em]">{money((received._sum.amount ?? 0) - (received._sum.refundedAmount ?? 0))}</div>
            <Link href="/invoices" className="font-mono text-[10.5px] lowercase tracking-[0.08em] text-gray-500 hover:text-black">{received._sum.amount ? "view payments →" : "no payments yet"}</Link>
          </div>
          <div className="card px-5 py-[18px]">
            <div className="text-[13px] text-gray-500">Waiting to be paid</div>
            <div className="mt-1 font-display text-[38px] leading-[1.05] tracking-[-0.02em]">{money(openBalance)}</div>
            <Link href="/invoices" className="font-mono text-[10.5px] lowercase tracking-[0.08em] text-gray-500 hover:text-black">{openInv._count} open invoice{openInv._count === 1 ? "" : "s"} →</Link>
          </div>
          <div className="card px-5 py-[18px]">
            <div className="flex items-center gap-1.5 text-[13px] text-gray-500"><AlertTriangle className="h-3.5 w-3.5" />Past due</div>
            <div className={`mt-1 font-display text-[38px] leading-[1.05] tracking-[-0.02em] ${pastDue._count ? "text-ember-text" : ""}`}>{pastDue._count ? money(pastDueBalance) : "—"}</div>
            <Link href="/invoices" className={`font-mono text-[10.5px] lowercase tracking-[0.08em] hover:text-black ${pastDue._count ? "text-ember-text" : "text-gray-500"}`}>{pastDue._count ? `${pastDue._count} overdue →` : "all clear"}</Link>
          </div>
        </>)}
        <Link href="/bookings" className={`card block px-5 py-[18px] ${seesMoney ? "" : "sm:col-span-2 xl:col-span-4"}`}>
          <div className="text-[13px] text-gray-500">Booking requests waiting</div>
          <div className={`mt-1 font-display text-[38px] leading-[1.05] tracking-[-0.02em] ${requests ? "text-ember-text" : ""}`}>{String(requests).padStart(2, "0")}</div>
          <div className="mt-1.5 font-mono text-[10.5px] lowercase tracking-[0.08em] text-gray-500">{upcoming} upcoming session{upcoming === 1 ? "" : "s"} →</div>
        </Link>
      </section>

      {seesMoney && (<>
      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Card
          title="Monthly revenue"
          actions={
            <div className="flex items-center gap-1 text-sm">
              <Link href={`/dashboard?range=${range}&year=${year - 1}`} className="btn-secondary btn-sm" aria-label="Previous year">‹</Link>
              <span className="px-2 font-mono text-[11px]">{year}</span>
              <Link href={`/dashboard?range=${range}&year=${year + 1}`} className="btn-secondary btn-sm" aria-label="Next year">›</Link>
            </div>
          }
        >
          <RevenueChart data={months} />
        </Card>
        {todayCard}
      </div>

      </>)}

      <div className="grid gap-3.5 lg:grid-cols-2">
        {!seesMoney && todayCard}
        <Card title="My to-dos" actions={<Link href="/tasks" className="text-sm link">All →</Link>}>
          {tasks.length === 0 ? <p className="text-sm text-gray-500">Nothing assigned to you.</p> : (
            <ul className="space-y-1.5 text-sm">
              {tasks.map((t) => (
                <li key={t.id} className="flex justify-between"><span>{t.title}</span><span className={`text-xs ${t.dueDate && t.dueDate < now ? "text-red-600" : "text-gray-500"}`}>{t.dueDate ? format(t.dueDate, "MMM d") : ""}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent activity">
          {activity.length === 0 ? <p className="text-sm text-gray-500">No activity yet.</p> : (
            <ul className="space-y-2 text-sm">
              {activity.map((a) => <li key={a.id}>{activityHref(a) ? <Link href={activityHref(a)!} className="text-gray-800 hover:text-brand-700 hover:underline">{a.summary}</Link> : <span className="text-gray-800">{a.summary}</span>} <span className="text-xs text-gray-400">· {a.user?.name ?? "Web"} · {ago(a.createdAt)}</span></li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

const ACTIVITY_ROUTES: Record<string, string> = {
  contact: "contacts", artist: "artists", project: "projects",
  booking: "bookings", quote: "quotes", invoice: "invoices", event: "events",
};

/** Where a Recent activity line should link, or null when the record type has no page. */
function activityHref(a: { entityType: string; entityId: string }) {
  const base = ACTIVITY_ROUTES[a.entityType];
  return base ? `/${base}/${a.entityId}` : null;
}
