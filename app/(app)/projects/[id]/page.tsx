import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, fullName, money, titleCase } from "@/lib/format";
import { bookingTone, INACTIVE_BOOKING, invoiceTone, PROJECT_STATUSES, projectTone, quoteTone, TRACK_STAGES } from "@/lib/status";
import { invoiceMilestone } from "../../invoices/actions";
import { NotesPanel } from "@/components/NotesPanel";
import { ProjectForm } from "@/components/ProjectForm";
import { TasksPanel } from "@/components/TasksPanel";
import { Badge, Card, EmailFlash, PageHeader } from "@/components/ui";
import { eventColor, eventWhen } from "@/lib/events";
import {
  addMilestone, addTrack, deleteMilestone, deleteProject, deleteTrack, setProjectStatus, setTrackStage, toggleMilestone, updateProject,
} from "../actions";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ emailed?: string; email_error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const flash = await searchParams;
  const p = await db.project.findFirst({
    where: { id, studioId: user.studioId },
    include: {
      client: true,
      artist: true,
      manager: true,
      milestones: { orderBy: [{ sortOrder: "asc" }], include: { invoice: true } },
      tracks: { orderBy: { sortOrder: "asc" }, },
      bookings: { orderBy: { startsAt: "asc" }, include: { room: true } },
      invoices: { orderBy: { issueDate: "desc" } },
      quotes: { orderBy: { issueDate: "desc" } },
      events: { orderBy: { startsAt: "asc" } },
    },
  });
  if (!p) notFound();
  const path = `/projects/${id}`;
  const invoiced = p.invoices.filter((i) => i.status !== "VOID").reduce((s, i) => s + i.total, 0);
  const paid = p.invoices.reduce((s, i) => s + i.amountPaid, 0);
  const bookedHours = p.bookings.filter((b) => !INACTIVE_BOOKING.includes(b.status)).reduce((s, b) => s + (b.endsAt.getTime() - b.startsAt.getTime()) / 36e5, 0);
  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={[p.type, p.artist?.name, p.client && fullName(p.client)].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/quotes/new?projectId=${id}${p.clientId ? `&contactId=${p.clientId}` : ""}`} className="btn-secondary">New quote</Link>
            <Link href={`/invoices/new?projectId=${id}${p.clientId ? `&contactId=${p.clientId}` : ""}`} className="btn-secondary">New invoice</Link>
            <Link href={`/bookings/new?projectId=${id}${p.clientId ? `&contactId=${p.clientId}` : ""}`} className="btn-primary">Book session</Link>
          </>
        }
      />
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      <div className="mb-6 flex flex-wrap gap-1">
        {PROJECT_STATUSES.map((s) => (
          <form key={s} action={setProjectStatus}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={s} />
            <button className={`rounded-full border px-3 py-1 text-xs ${p.status === s ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}>{titleCase(s)}</button>
          </form>
        ))}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-gray-500">Budget</div><div className="text-lg font-semibold">{p.budget ? money(p.budget) : "—"}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Invoiced / paid</div><div className="text-lg font-semibold">{money(invoiced)} <span className="text-sm font-normal text-gray-500">/ {money(paid)}</span></div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Booked hours</div><div className="text-lg font-semibold">{bookedHours.toFixed(1)}</div></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Milestones">
            <ol className="mb-4 space-y-2">
              {p.milestones.length === 0 && <li className="text-sm text-gray-500">Add milestones like “Tracking complete”, “Mix approval”, “Masters delivered”.</li>}
              {p.milestones.map((m) => (
                <li key={m.id} className="group flex items-center gap-3 text-sm">
                  <form action={toggleMilestone}>
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="projectId" value={id} />
                    <button className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${m.completedAt ? "border-brand-600 bg-brand-600 text-white" : "border-gray-400"}`}>{m.completedAt ? "✓" : ""}</button>
                  </form>
                  <span className={`flex-1 ${m.completedAt ? "text-gray-400 line-through" : ""}`}>{m.title}</span>
                  {m.billAmount && (m.invoice ? (
                    <Link href={`/invoices/${m.invoice.id}`}><Badge tone={m.invoice.status === "PAID" ? "green" : "blue"}>{m.invoice.number} · {m.invoice.status.toLowerCase()}</Badge></Link>
                  ) : (
                    <form action={invoiceMilestone}><input type="hidden" name="milestoneId" value={m.id} /><button className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100">Invoice {money(m.billAmount)}</button></form>
                  ))}
                  <span className={`text-xs ${!m.completedAt && m.dueDate && m.dueDate < new Date() ? "text-red-600" : "text-gray-500"}`}>{fmtDate(m.dueDate)}</span>
                  <form action={deleteMilestone} className="opacity-0 group-hover:opacity-100">
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="projectId" value={id} />
                    <button className="text-xs text-red-500">×</button>
                  </form>
                </li>
              ))}
            </ol>
            <form action={addMilestone} className="grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[1fr_auto_8rem_auto]">
              <input type="hidden" name="projectId" value={id} />
              <input aria-label="Milestone" name="title" required placeholder="Milestone" className="input" />
              <input aria-label="Due date" name="dueDate" type="date" className="input" />
              <input aria-label="Bill $ (opt.)" name="billAmount" placeholder="Bill $ (opt.)" className="input" />
              <button className="btn-secondary">Add</button>
            </form>
          </Card>
          <Card title="Songs / tracks">
            <ul className="mb-4 divide-y divide-gray-100">
              {p.tracks.length === 0 && <li className="text-sm text-gray-500">No songs yet.</li>}
              {p.tracks.map((t, i) => (
                <li key={t.id} className="group flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="w-6 text-gray-400">{i + 1}</span>
                  <span className="flex-1">
                    <Link href={`/projects/${id}/songs/${t.id}`} className="font-medium link">{t.title}</Link>
                  </span>
                  <div className="flex gap-0.5">
                    {TRACK_STAGES.map((s) => (
                      <form key={s} action={setTrackStage}>
                        <input type="hidden" name="id" value={t.id} /><input type="hidden" name="projectId" value={id} /><input type="hidden" name="stage" value={s} />
                        <button title={s} className={`rounded px-2 py-0.5 text-[11px] ${t.stage === s ? "bg-brand-600 text-white" : TRACK_STAGES.indexOf(s) < TRACK_STAGES.indexOf(t.stage) ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"}`}>{s}</button>
                      </form>
                    ))}
                  </div>
                  <form action={deleteTrack} className="opacity-0 group-hover:opacity-100">
                    <input type="hidden" name="id" value={t.id} /><input type="hidden" name="projectId" value={id} />
                    <button className="text-xs text-red-500">×</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addTrack} className="flex gap-2 border-t border-gray-100 pt-3">
              <input type="hidden" name="projectId" value={id} />
              <input aria-label="Song title" name="title" required placeholder="Song title" className="input" />
              <button className="btn-secondary">Add</button>
            </form>
          </Card>
          <Card title="Sessions">
            {p.bookings.length === 0 ? <p className="text-sm text-gray-500">No sessions booked.</p> : (
              <ul className="divide-y divide-gray-100">
                {p.bookings.map((b) => (
                  <li key={b.id} className="flex justify-between py-2 text-sm">
                    <Link href={`/bookings/${b.id}`} className="link">{fmtDateTime(b.startsAt)} · {b.room.name}</Link>
                    <Badge tone={bookingTone[b.status]}>{b.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Release dates & events" actions={<Link href={`/events?projectId=${id}&kind=Release`} className="text-sm link">+ Add</Link>}>
            {p.events.length === 0 ? <p className="text-sm text-gray-500">No release date or events yet.</p> : (
              <ul className="divide-y divide-gray-100">
                {p.events.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: eventColor(e.kind) }} />
                    <Link href={`/events/${e.id}`} className="link">{e.title}</Link>
                    <span className="ml-auto text-gray-500">{e.kind} · {eventWhen(e)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(p.quotes.length > 0 || p.invoices.length > 0) && (
            <Card title="Quotes & invoices">
              <ul className="divide-y divide-gray-100 text-sm">
                {p.quotes.map((q) => (
                  <li key={q.id} className="flex justify-between py-2"><Link href={`/quotes/${q.id}`} className="link">Quote {q.number}</Link><Badge tone={quoteTone[q.status]}>{titleCase(q.status)}</Badge></li>
                ))}
                {p.invoices.map((i) => (
                  <li key={i.id} className="flex justify-between py-2">
                    <Link href={`/invoices/${i.id}`} className="link">Invoice {i.number} · {money(i.total)}</Link>
                    <Badge tone={invoiceTone[i.status]}>{titleCase(i.status)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <NotesPanel parent={{ projectId: id }} path={path} />
        </div>
        <div className="space-y-6">
          <TasksPanel parent={{ projectId: id }} path={path} studioId={user.studioId} />
          <Card title="Details">
            <div className="mb-4 flex items-center gap-2 text-sm"><Badge tone={projectTone[p.status]}>{titleCase(p.status)}</Badge> Manager: {p.manager?.name ?? "—"}</div>
            <ProjectForm studioId={user.studioId} project={p} action={updateProject} submit="Save" />
            <form action={deleteProject} className="mt-4 border-t border-gray-100 pt-4">
              <input type="hidden" name="id" value={id} />
              <button className="btn-danger btn-sm">Delete project</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
