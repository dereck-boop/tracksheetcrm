import Link from "next/link";
import { addMonths } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { format, parseLocal } from "@/lib/format";
import { eventColor, eventsBetween, eventWhen } from "@/lib/events";
import { appUrl } from "@/lib/stripe";
import { EventForm } from "@/components/EventForm";
import { CopyLink } from "@/components/CopyLink";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { createEvent, disableCalendarFeed, resetCalendarFeed } from "./actions";

type Ev = Awaited<ReturnType<typeof eventsBetween>>[number];

export const metadata = { title: "Events" };

/** Release dates, showcases, meetings and closed days, shown here and on the Bookings calendar. */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ date?: string; projectId?: string; kind?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = parseLocal(format(new Date(), "yyyy-MM-dd"))!;
  const [upcoming, past, projects] = await Promise.all([
    eventsBetween(user.studioId, today, addMonths(today, 24)),
    db.event.findMany({
      where: { studioId: user.studioId, endsAt: { lte: today } },
      orderBy: { startsAt: "desc" },
      take: 25,
      include: { project: { select: { id: true, name: true } } },
    }),
    db.project.findMany({ where: { studioId: user.studioId, status: { not: "CLOSED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const months = new Map<string, Ev[]>();
  for (const e of upcoming) {
    const key = format(e.startsAt < today ? today : e.startsAt, "MMMM yyyy");
    months.set(key, [...(months.get(key) ?? []), e]);
  }
  const feed = user.studio.calendarToken ? `${appUrl()}/cal/${user.studio.calendarToken}.ics` : null;
  const isAdmin = user.role === "OWNER" || user.role === "ADMIN";

  return (
    <>
      <PageHeader title="Events" subtitle="Release dates, showcases, meetings and days the studio is closed. They also show on the Bookings calendar." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {upcoming.length === 0 && <div className="card"><Empty>Nothing coming up. Add a release date, showcase or holiday on the right.</Empty></div>}
          {[...months].map(([month, items]) => (
            <Card key={month} title={month}>
              <ul className="divide-y divide-gray-100">{items.map((e) => <EventRow key={e.id} e={e} />)}</ul>
            </Card>
          ))}
          {past.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer px-5 py-3.5 font-semibold text-gray-800">Past events</summary>
              <ul className="divide-y divide-gray-100 px-5 pb-3 opacity-80">{past.map((e) => <EventRow key={e.id} e={e} />)}</ul>
            </details>
          )}
        </div>
        <div className="space-y-6">
          <Card title="New event">
            <EventForm
              values={{ date: sp.date ?? format(new Date(), "yyyy-MM-dd"), projectId: sp.projectId, kind: sp.kind }}
              projects={projects}
              action={createEvent}
              submit="Add event"
              back={sp.projectId ? `/projects/${sp.projectId}` : undefined}
            />
          </Card>
          <Card title="Add to your phone calendar">
            {feed ? (
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">Subscribe to this address in Google Calendar (Other calendars → From URL) or Apple Calendar (File → New Calendar Subscription). It shows your bookings and events and updates on its own, usually within a few hours.</p>
                <input readOnly value={feed} className="input font-mono text-xs" aria-label="Calendar feed address" />
                <div className="flex flex-wrap gap-2">
                  <CopyLink url={feed} label="Copy address" />
                  {isAdmin && <form action={resetCalendarFeed}><button className="btn-secondary">New address</button></form>}
                  {isAdmin && <form action={disableCalendarFeed}><button className="text-xs text-red-500">Turn off</button></form>}
                </div>
                <p className="text-xs text-gray-500">Anyone with this address can see your schedule and client names. If it gets shared by mistake, click New address and the old one stops working.</p>
              </div>
            ) : isAdmin ? (
              <form action={resetCalendarFeed} className="space-y-3 text-sm">
                <p className="text-gray-600">Get a private address you can subscribe to in Google or Apple Calendar to see your bookings and events on your phone.</p>
                <button className="btn-primary">Create calendar address</button>
              </form>
            ) : (
              <p className="text-sm text-gray-500">An owner or admin can turn on the calendar feed here.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function EventRow({ e }: { e: Ev }) {
  return (
    <li className="flex items-start gap-3 py-3 text-sm">
      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: eventColor(e.kind) }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/events/${e.id}`} className="font-medium link">{e.title}</Link>
          <span className="text-xs text-gray-500">{e.kind}</span>
          {e.closed && <Badge tone="red">Studio closed</Badge>}
        </div>
        <div className="text-gray-600">{eventWhen(e)}{e.location && ` · ${e.location}`}</div>
        {e.project && <Link href={`/projects/${e.project.id}`} className="text-xs link">{e.project.name}</Link>}
        {e.notes && <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{e.notes}</div>}
      </div>
    </li>
  );
}
