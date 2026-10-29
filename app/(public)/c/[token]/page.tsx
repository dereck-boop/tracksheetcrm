import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, fmtTime, money } from "@/lib/format";
import { balance, isOverdue } from "@/lib/invoices";
import { fromRows, totals } from "@/lib/money";
import { TRACK_STAGES } from "@/lib/status";
import { Badge } from "@/components/ui";

export const metadata = { title: "Your studio page", robots: { index: false } };
export const dynamic = "force-dynamic";

const SESSION_LABEL: Record<string, { label: string; tone: "green" | "amber" | "purple" | "teal" }> = {
  REQUESTED: { label: "Requested", tone: "purple" },
  HOLD: { label: "Penciled in", tone: "amber" },
  CONFIRMED: { label: "Confirmed", tone: "green" },
  COMPLETED: { label: "Done", tone: "teal" },
};

/** A client's private page: sessions, what they owe and have paid, quotes, and where their projects are at. */
export default async function ClientPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await db.contact.findUnique({ where: { portalToken: token }, include: { studio: true, artists: { select: { artistId: true } } } });
  if (!c) notFound();
  const now = new Date();
  const artistIds = c.artists.map((a) => a.artistId);
  const [bookings, invoices, quotes, projects] = await Promise.all([
    db.booking.findMany({
      where: { contactId: c.id, status: { in: ["REQUESTED", "HOLD", "CONFIRMED", "COMPLETED"] } },
      include: { room: true, depositInvoice: true },
      orderBy: { startsAt: "asc" },
    }),
    db.invoice.findMany({ where: { contactId: c.id, status: { in: ["SENT", "PARTIAL", "PAID"] } }, orderBy: { issueDate: "desc" } }),
    db.quote.findMany({ where: { contactId: c.id, status: { in: ["SENT", "ACCEPTED"] } }, include: { items: true }, orderBy: { issueDate: "desc" } }),
    db.project.findMany({
      where: { studioId: c.studioId, status: { not: "CLOSED" }, OR: [{ clientId: c.id }, ...(artistIds.length ? [{ artistId: { in: artistIds } }] : [])] },
      include: { tracks: { orderBy: { sortOrder: "asc" } }, milestones: { orderBy: { sortOrder: "asc" } }, artist: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const upcoming = bookings.filter((b) => b.endsAt >= now && b.status !== "COMPLETED");
  const past = bookings.filter((b) => b.endsAt < now || b.status === "COMPLETED").reverse().slice(0, 8);
  const open = invoices.filter((i) => balance(i) > 0 && i.status !== "PAID");
  const owed = open.reduce((s, i) => s + balance(i), 0);
  const paid = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const s = c.studio;

  return (
    <div className="space-y-6">
      <div className="card p-6 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.logoUrl && <img src={s.logoUrl} alt="" className="mb-3 max-h-14 max-w-[200px] object-contain" />}
        <div className="font-display text-lg text-black">{s.name}</div>
        <h1 className="mt-1 text-3xl text-black">Hi {c.firstName}</h1>
        <p className="mt-1 text-sm text-gray-500">Everything with {s.name} in one place. This page is private to you and always up to date.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4"><div className="text-xs text-gray-500">Balance due</div><div className={`font-display text-2xl ${owed ? "text-gray-900" : "text-emerald-700"}`}>{money(owed)}</div></div>
          <div className="rounded-lg bg-gray-50 p-4"><div className="text-xs text-gray-500">Paid so far</div><div className="font-display text-2xl text-gray-900">{money(paid)}</div></div>
          <div className="rounded-lg bg-gray-50 p-4"><div className="text-xs text-gray-500">Upcoming sessions</div><div className="font-display text-2xl text-gray-900">{upcoming.length}</div></div>
        </div>
      </div>

      {open.length > 0 && (
        <Section title="To pay">
          {open.map((i) => (
            <Row key={i.id}>
              <span>
                Invoice {i.number} · {money(i.total)}{i.amountPaid > 0 && <span className="text-gray-500"> ({money(i.amountPaid)} paid)</span>}
                <span className="ml-2">{isOverdue(i) ? <Badge tone="red">overdue</Badge> : i.dueDate && <span className="text-xs text-gray-500">due {fmtDate(i.dueDate)}</span>}</span>
              </span>
              <Link href={`/i/${i.publicToken}`} className="btn-primary btn-sm">Pay {money(balance(i))}</Link>
            </Row>
          ))}
        </Section>
      )}

      <Section title="Upcoming sessions" action={<Link href={`/book/${s.slug}`} className="text-sm link">Request a session →</Link>}>
        {upcoming.length === 0 ? <p className="text-sm text-gray-500">Nothing booked right now.</p> : upcoming.map((b) => {
          const st = SESSION_LABEL[b.status]!;
          const depositDue = b.depositInvoice && !b.depositPaidAt && b.depositInvoice.status !== "VOID";
          return (
            <Row key={b.id}>
              <span>
                <strong>{fmtDate(b.startsAt)}</strong>{b.timeTbd ? " · time to be confirmed" : ` · ${fmtTime(b.startsAt)} to ${fmtTime(b.endsAt)}`} · {b.room.name}
                {b.room.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(b.room.address)}`} target="_blank" rel="noreferrer" className="ml-1 text-xs link">{b.room.address}</a>}
                <span className="ml-2"><Badge tone={st.tone}>{st.label}</Badge></span>
              </span>
              {depositDue && <Link href={`/i/${b.depositInvoice!.publicToken}`} className="btn-primary btn-sm">Pay deposit</Link>}
            </Row>
          );
        })}
      </Section>

      {projects.length > 0 && (
        <Section title="Your projects">
          <div className="space-y-5">
            {projects.map((p) => {
              const done = p.tracks.filter((t) => t.stage === "Done").length;
              return (
                <div key={p.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium text-gray-900">{p.name}{p.artist && <span className="font-normal text-gray-500"> · {p.artist.name}</span>}</div>
                    <span className="text-xs text-gray-500">{p.status.replace("_", " ").toLowerCase()}{p.dueDate && ` · target ${fmtDate(p.dueDate)}`}</span>
                  </div>
                  {p.tracks.length > 0 && (
                    <>
                      <p className="mt-1 text-xs text-gray-500">{done} of {p.tracks.length} {p.tracks.length === 1 ? "song" : "songs"} finished</p>
                      <ul className="mt-2 space-y-1.5">
                        {p.tracks.map((t) => {
                          const step = Math.max(0, TRACK_STAGES.indexOf(t.stage));
                          return (
                            <li key={t.id} className="text-sm">
                              <div className="flex justify-between"><span>{t.title}</span><span className="text-xs text-gray-500">{t.stage}</span></div>
                              <div className="mt-1 flex gap-1" aria-hidden>
                                {TRACK_STAGES.map((st, n) => <span key={st} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-brand-500" : "bg-gray-200"}`} />)}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  {p.milestones.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {p.milestones.map((m) => (
                        <li key={m.id} className={m.completedAt ? "text-gray-400 line-through" : "text-gray-700"}>
                          {m.completedAt ? "✓" : "○"} {m.title}{m.dueDate && !m.completedAt && <span className="text-xs text-gray-500"> · {fmtDate(m.dueDate)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {quotes.length > 0 && (
        <Section title="Quotes">
          {quotes.map((q) => (
            <Row key={q.id}>
              <span>Quote {q.number} · {money(totals(fromRows(q.items), Number(q.taxRate), q.discount).total)} <span className="ml-2"><Badge tone={q.status === "ACCEPTED" ? "green" : "amber"}>{q.status === "ACCEPTED" ? "accepted" : "waiting for you"}</Badge></span></span>
              <Link href={`/q/${q.publicToken}`} className="btn-secondary btn-sm">{q.status === "ACCEPTED" ? "View" : "Review"}</Link>
            </Row>
          ))}
        </Section>
      )}

      {invoices.length > open.length && (
        <Section title="Paid invoices">
          {invoices.filter((i) => !open.includes(i)).map((i) => (
            <Row key={i.id}>
              <span>Invoice {i.number} · {money(i.total)} <span className="text-xs text-gray-500">{i.paidAt ? `paid ${fmtDate(i.paidAt)}` : ""}</span></span>
              <Link href={`/i/${i.publicToken}`} className="text-sm link">Receipt</Link>
            </Row>
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past sessions">
          {past.map((b) => <Row key={b.id}><span>{fmtDate(b.startsAt)} · {b.room.name}</span></Row>)}
        </Section>
      )}

      <p className="text-center text-sm text-gray-500">Questions? Reply to any email from us{s.email && <> or write to <a href={`mailto:${s.email}`} className="link">{s.email}</a></>}{s.phone && <>, or call {s.phone}</>}.</p>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg text-black">{title}</h2>{action}</div>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">{children}</div>;
}
