import Link from "next/link";
import { cookies } from "next/headers";
import { addDays, addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { format, fmtDate, fmtDateTime, inTz, parseLocal } from "@/lib/format";
import { bookingTone, INACTIVE_BOOKING } from "@/lib/status";
import { eventColor, eventsBetween } from "@/lib/events";
import { Badge, PageHeader } from "@/components/ui";
import { RememberView } from "./RememberView";
import { BookingPageLink } from "@/components/BookingPageLink";

const START_HOUR = 8;
const END_HOUR = 24;
const HOUR_PX = 44;

const VIEWS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "3month", label: "3 Months" },
] as const;
type View = (typeof VIEWS)[number]["key"];
const isView = (v: string | undefined): v is View => VIEWS.some((x) => x.key === v);

export const metadata = { title: "Bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  // No view in the URL → the one last used (remembered in a cookie), else week.
  const saved = (await cookies()).get("bookingsView")?.value;
  const view: View = isView(sp.view) ? sp.view : isView(saved) ? saved : "week";
  const anchor = inTz((sp.date && parseLocal(sp.date)) || Date.now());
  anchor.setHours(0, 0, 0, 0);

  const monthCount = view === "3month" ? 3 : 1;
  const firstMonth = startOfMonth(anchor);
  const months = Array.from({ length: monthCount }, (_, i) => addMonths(firstMonth, i));
  const first =
    view === "day" ? anchor
    : view === "week" ? startOfWeek(anchor, { weekStartsOn: 1 })
    : startOfWeek(firstMonth, { weekStartsOn: 1 });
  const rangeEnd =
    view === "day" ? addDays(first, 1)
    : view === "week" ? addDays(first, 7)
    : addDays(endOfWeek(endOfMonth(months[months.length - 1]!), { weekStartsOn: 1 }), 1);
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(first, i)) : [first];

  const [rooms, bookings, requests, events] = await Promise.all([
    db.room.findMany({ where: { studioId: user.studioId, active: true }, orderBy: { sortOrder: "asc" } }),
    db.booking.findMany({
      where: { studioId: user.studioId, startsAt: { lt: rangeEnd }, endsAt: { gt: first }, status: { notIn: INACTIVE_BOOKING } },
      include: { room: true, type: true, contact: true, engineer: true },
      orderBy: { startsAt: "asc" },
    }),
    db.booking.findMany({ where: { studioId: user.studioId, status: "REQUESTED" }, orderBy: { startsAt: "asc" }, include: { room: true } }),
    eventsBetween(user.studioId, first, rangeEnd),
  ]);
  const eventsOn = (d: Date) => events.filter((e) => e.startsAt < addDays(d, 1) && e.endsAt > d);

  // Day view: one column per room. Week view: one column per day.
  const columns = view === "day"
    ? rooms.map((r) => ({ key: r.id, label: r.name, items: bookings.filter((b) => b.roomId === r.id), day: first }))
    : days.map((d) => ({ key: d.toISOString(), label: format(d, "EEE d"), items: bookings.filter((b) => inTz(b.startsAt).getDate() === d.getDate() && b.startsAt < addDays(d, 1)), day: d }));

  const ymd = (d: Date) => format(d, "yyyy-MM-dd");
  const prev = view === "day" ? addDays(anchor, -1) : view === "week" ? addDays(first, -7) : addMonths(firstMonth, -monthCount);
  const next = view === "day" ? addDays(anchor, 1) : view === "week" ? addDays(first, 7) : addMonths(firstMonth, monthCount);
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const top = (d: Date, day: Date) => {
    const t = inTz(d);
    const mins = t < day ? 0 : (t.getHours() - START_HOUR) * 60 + t.getMinutes();
    return Math.max(0, (mins / 60) * HOUR_PX);
  };
  const today = ymd(new Date());
  const subtitle =
    view === "day" ? format(first, "EEEE, MMMM d, yyyy")
    : view === "week" ? `${format(first, "MMM d")} – ${format(addDays(first, 6), "MMM d, yyyy")}`
    : view === "month" ? format(firstMonth, "MMMM yyyy")
    : `${format(months[0]!, "MMMM")} – ${format(months[2]!, "MMMM yyyy")}`;

  return (
    <>
      <RememberView view={view} />
      <PageHeader
        title="Bookings"
        subtitle={subtitle}
        actions={
          <>
            <div className="flex overflow-hidden rounded-md border border-gray-300 bg-white text-sm">
              <Link href={`/bookings?view=${view}&date=${ymd(prev)}`} className="px-3 py-2 hover:bg-gray-50" aria-label="Previous">‹</Link>
              <Link href={`/bookings?view=${view}`} className="border-x border-gray-300 px-3 py-2 hover:bg-gray-50">Today</Link>
              <Link href={`/bookings?view=${view}&date=${ymd(next)}`} className="px-3 py-2 hover:bg-gray-50" aria-label="Next">›</Link>
            </div>
            <form action="/bookings" className="flex overflow-hidden rounded-md border border-gray-300 bg-white text-sm">
              <input type="hidden" name="view" value={view} />
              <input type="date" name="date" defaultValue={ymd(anchor)} className="border-0 px-2 py-1.5 text-sm" aria-label="Jump to date" />
              <button className="border-l border-gray-300 px-3 py-2 hover:bg-gray-50">Go</button>
            </form>
            <div className="flex overflow-hidden rounded-md border border-gray-300 bg-white text-sm">
              {VIEWS.map((v) => (
                <Link key={v.key} href={`/bookings?view=${v.key}&date=${ymd(anchor)}`} className={`px-3 py-2 ${view === v.key ? "bg-brand-600 text-white" : "hover:bg-gray-50"}`}>{v.label}</Link>
              ))}
            </div>
            <Link href="/bookings/new" className="btn-primary">New booking</Link>
          </>
        }
      />

      <div className="mb-4"><BookingPageLink slug={user.studio.slug} compact /></div>

      {requests.length > 0 && (
        <div className="card mb-6 border-violet-200 p-4">
          <div className="mb-2 text-sm font-semibold text-violet-800">{requests.length} booking request{requests.length > 1 && "s"} waiting</div>
          <ul className="space-y-1 text-sm">
            {requests.map((r) => (
              <li key={r.id}><Link href={`/bookings/${r.id}`} className="link">{r.requestName ?? r.title}</Link> · {r.timeTbd ? `${fmtDate(r.startsAt)}, hours not set` : fmtDateTime(r.startsAt)} · {r.room.name}</li>
            ))}
          </ul>
        </div>
      )}

      {view !== "day" && rooms.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-600">
          {rooms.map((r) => <span key={r.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />{r.name}</span>)}
        </div>
      )}

      {view === "month" || view === "3month" ? (
        <div className="space-y-4">
          {months.map((m) => (
            <MonthGrid key={m.toISOString()} month={m} bookings={bookings} events={events} today={today} compact={view === "3month"} />
          ))}
        </div>
      ) : (
        <>
        {view === "day" && eventsOn(first).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">{eventsOn(first).map((e) => <EventChip key={e.id} e={e} />)}</div>
        )}
        <div className="card overflow-x-auto">
          <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(0, 1fr))` }}>
            <div className="border-b border-gray-200" />
            {columns.map((c) => (
              <div key={c.key} className={`border-b border-l border-gray-200 px-2 py-2 text-center text-sm font-medium ${view === "week" && ymd(c.day) === today ? "bg-brand-50 text-brand-700" : "text-gray-700"}`}>
                {view === "week" ? <Link href={`/bookings?view=day&date=${ymd(c.day)}`}>{c.label}</Link> : c.label}
              </div>
            ))}
            {view === "week" && events.length > 0 && (
              <>
                <div className="border-b border-gray-200 pr-2 pt-1 text-right text-[10px] text-gray-400">events</div>
                {columns.map((c) => (
                  <div key={c.key} className="min-w-0 space-y-0.5 border-b border-l border-gray-200 p-1">
                    {eventsOn(c.day).map((e) => <EventChip key={e.id} e={e} />)}
                  </div>
                ))}
              </>
            )}
            <div className="relative">
              {hours.map((h) => (
                <div key={h} className="pr-2 text-right text-[11px] text-gray-400" style={{ height: HOUR_PX }}>
                  {h % 12 === 0 ? 12 : h % 12}{h < 12 ? "am" : "pm"}
                </div>
              ))}
            </div>
            {columns.map((c) => (
              <div key={c.key} className="relative border-l border-gray-200" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h) => (
                  <Link
                    key={h}
                    href={`/bookings/new?start=${ymd(c.day)}T${String(h).padStart(2, "0")}:00${view === "day" ? `&roomId=${c.key}` : ""}`}
                    className="block border-b border-gray-100 hover:bg-brand-50/50"
                    style={{ height: HOUR_PX }}
                    aria-label="New booking"
                  />
                ))}
                {withLanes(c.items).map(({ item: b, lane, lanes }) => {
                  const y = top(b.startsAt, c.day);
                  const bottom = b.endsAt >= addDays(c.day, 1) ? hours.length * HOUR_PX : top(b.endsAt, c.day);
                  const h = Math.max(22, bottom - y);
                  const color = view === "day" ? b.type?.color ?? b.room.color : b.room.color;
                  return (
                    <Link
                      key={b.id}
                      href={`/bookings/${b.id}`}
                      className={`absolute overflow-hidden rounded-md px-2 py-1 text-xs text-[#fff] shadow-sm hover:opacity-90 ${b.status === "HOLD" || b.status === "REQUESTED" ? "opacity-70 ring-2 ring-[#fff] ring-inset [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,.15)_6px,rgba(255,255,255,.15)_12px)]" : ""}`}
                      style={{ top: y, height: h, background: color, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                    >
                      <div className="truncate font-semibold">{b.title}</div>
                      <div className="truncate opacity-90">{b.timeTbd ? "Hours not set" : `${format(b.startsAt, "h:mma")}–${format(b.endsAt, "h:mma")}`}{view === "week" && ` · ${b.room.name}`}</div>
                      {b.engineer && <div className="truncate opacity-80">{b.engineer.name}</div>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        </>
      )}
      <p className="mt-3 text-xs text-gray-500">
        {view === "day" || view === "week" ? "Click an empty slot to book it." : "Hover a day and click + to book it, or click the date to open that day."} Faded blocks are holds or requests. Rounded chips are <Link href="/events" className="link">events</Link>. <Badge tone={bookingTone.CONFIRMED}>Confirmed</Badge>
      </p>
    </>
  );
}

type CalBooking = {
  id: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  timeTbd: boolean;
  room: { name: string; color: string };
};

/** One month as a Mon–Sun grid. Each day lists its bookings; the date opens that day. */
function MonthGrid({ month, bookings, events, today, compact }: { month: Date; bookings: CalBooking[]; events: CalEvent[]; today: string; compact: boolean }) {
  const ymd = (d: Date) => format(d, "yyyy-MM-dd");
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const cells: Date[] = [];
  for (let d = startOfWeek(month, { weekStartsOn: 1 }); d <= end; d = addDays(d, 1)) cells.push(d);
  const max = compact ? 3 : 5;

  return (
    <div className="card overflow-hidden">
      {compact && (
        <Link href={`/bookings?view=month&date=${ymd(month)}`} className="block border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">
          {format(month, "MMMM yyyy")}
        </Link>
      )}
      <div className="grid grid-cols-7 border-b border-gray-200 text-center text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === month.getMonth();
          const dayEnd = addDays(d, 1);
          // In the 3-month view the spill-over days belong to the next/previous grid, so leave them empty there.
          const items = compact && !inMonth ? [] : bookings.filter((b) => b.startsAt < dayEnd && b.endsAt > d);
          const dayEvents = compact && !inMonth ? [] : events.filter((e) => e.startsAt < dayEnd && e.endsAt > d);
          return (
            <div key={key} className={`group min-w-0 border-b border-gray-100 p-1 ${i % 7 ? "border-l" : ""} ${compact ? "min-h-16" : "min-h-28"} ${inMonth ? "" : "bg-gray-50/70"}`}>
              <div className="flex items-center justify-between">
                <Link href={`/bookings?view=day&date=${key}`} className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${key === today ? "bg-brand-600 font-semibold text-white" : inMonth ? "text-gray-700 hover:bg-gray-200" : "text-gray-400 hover:bg-gray-200"}`}>
                  {d.getDate()}
                </Link>
                <Link href={`/bookings/new?start=${key}T10:00`} className="rounded px-1.5 text-sm leading-5 text-gray-400 opacity-0 hover:bg-brand-50 hover:text-brand-700 group-hover:opacity-100 focus:opacity-100" aria-label={`New booking on ${key}`}>+</Link>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.map((e) => <EventChip key={e.id} e={e} />)}
                {items.slice(0, Math.max(1, max - dayEvents.length)).map((b) => (
                  <Link
                    key={b.id}
                    href={`/bookings/${b.id}`}
                    title={`${b.title} · ${b.timeTbd ? "hours not set" : `${format(b.startsAt, "h:mma")}–${format(b.endsAt, "h:mma")}`} · ${b.room.name}`}
                    className={`block truncate rounded px-1 py-0.5 text-[11px] leading-tight text-[#fff] hover:opacity-90 ${b.status === "HOLD" || b.status === "REQUESTED" ? "opacity-60" : ""}`}
                    style={{ background: b.room.color }}
                  >
                    {!compact && !b.timeTbd && <span className="opacity-90">{format(b.startsAt, "h:mma").toLowerCase()} </span>}
                    {b.title}
                  </Link>
                ))}
                {items.length > Math.max(1, max - dayEvents.length) && (
                  <Link href={`/bookings?view=day&date=${key}`} className="block px-1 text-[11px] text-gray-500 hover:text-brand-700">+{items.length - Math.max(1, max - dayEvents.length)} more</Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type CalEvent = { id: string; title: string; kind: string; startsAt: Date; endsAt: Date; allDay: boolean; closed: boolean };

/** An event on the calendar: outlined in its kind's color, so it reads differently from bookings. */
function EventChip({ e }: { e: CalEvent }) {
  const color = eventColor(e.kind);
  return (
    <Link
      href={`/events/${e.id}`}
      title={`${e.kind}: ${e.title}${e.closed ? " (studio closed)" : ""}`}
      className="block truncate rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight hover:opacity-80"
      style={{ borderColor: color, color, background: `${color}14` }}
    >
      {!e.allDay && <span className="opacity-80">{format(e.startsAt, "h:mma").toLowerCase()} </span>}
      {e.closed && "Closed: "}{e.title}
    </Link>
  );
}

/** Side-by-side layout for overlapping bookings: each overlap cluster splits the column into lanes. */
function withLanes<T extends { startsAt: Date; endsAt: Date }>(items: T[]) {
  const out: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: Date[] = [];
  let clusterEnd = 0;
  const flush = () => {
    cluster.forEach((c) => (c.lanes = laneEnds.length));
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (cluster.length && item.startsAt.getTime() >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startsAt);
    if (lane === -1) lane = laneEnds.push(item.endsAt) - 1;
    else laneEnds[lane] = item.endsAt;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.endsAt.getTime());
  }
  flush();
  return out;
}
