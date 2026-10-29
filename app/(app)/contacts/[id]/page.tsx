import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, fullName, money } from "@/lib/format";
import { bookingTone, projectTone } from "@/lib/status";
import { ContactForm } from "@/components/ContactForm";
import { NotesPanel } from "@/components/NotesPanel";
import { TasksPanel } from "@/components/TasksPanel";
import { Badge, Card, EmailFlash, PageHeader } from "@/components/ui";
import { nameDistance } from "@/lib/mergeContacts";
import { clientPageUrl } from "@/lib/clientPage";
import { CopyLink } from "@/components/CopyLink";
import { clientHistory, historyLine } from "@/lib/cancellations";
import { addContactToArtist, deleteContact, emailClientPage, mergeContact, removeContactFromArtist, resetClientPage, updateContact } from "../actions";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ merged?: string; emailed?: string; email_error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { merged, emailed, email_error } = await searchParams;
  const contact = await db.contact.findFirst({
    where: { id, studioId: user.studioId },
    include: {
      artists: { include: { artist: true } },
      projects: { orderBy: { createdAt: "desc" } },
      bookings: { orderBy: { startsAt: "desc" }, take: 10, include: { room: true } },
      invoices: { orderBy: { issueDate: "desc" }, take: 10 },
    },
  });
  if (!contact) notFound();
  const path = `/contacts/${id}`;
  const clientPage = await clientPageUrl(id);
  const history = await clientHistory(id, user.studio.lateCancelHours);
  const [others, artists] = await Promise.all([
    db.contact.findMany({ where: { studioId: user.studioId, id: { not: id } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    db.artist.findMany({ where: { studioId: user.studioId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  // Likely duplicates first: same email, or a name a typo or two away.
  const name = fullName(contact);
  const ranked = others
    .map((o) => ({ ...o, d: contact.email && o.email?.toLowerCase() === contact.email.toLowerCase() ? -1 : nameDistance(name, fullName(o)) }))
    .sort((a, b) => a.d - b.d || fullName(a).localeCompare(fullName(b)));
  const soloLinked = contact.artists.some((a) => a.artist.name.toLowerCase() === name.toLowerCase());
  return (
    <>
      <PageHeader
        title={fullName(contact)}
        subtitle={[contact.role, contact.email, contact.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/projects/new?clientId=${id}`} className="btn-secondary">New project</Link>
            <Link href={`/bookings/new?contactId=${id}`} className="btn-primary">Book session</Link>
          </>
        }
      />
      <EmailFlash emailed={emailed} error={email_error} />
      {merged && <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">Merged {merged} into this contact. Their bookings, invoices, projects and notes are all here now.</div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Client page">
            <p className="mb-3 text-sm text-gray-600">A private page for {contact.firstName}: upcoming sessions, quotes, invoices with what&apos;s been paid, and project progress. Linked from every invoice and quote they get.</p>
            <div className="flex flex-wrap gap-2">
              <CopyLink url={clientPage} label="Copy client page link" />
              <a href={clientPage} target="_blank" rel="noreferrer" className="btn-secondary">Open it</a>
              <form action={emailClientPage}><input type="hidden" name="id" value={id} /><button className="btn-secondary" disabled={!contact.email}>Email it to {contact.firstName}</button></form>
              <form action={resetClientPage}><input type="hidden" name="id" value={id} /><button className="text-xs link">Make a new link (old one stops working)</button></form>
            </div>
          </Card>
          <Card title="Project history">
            {contact.projects.length === 0 ? <p className="text-sm text-gray-500">No projects yet.</p> : (
              <ul className="divide-y divide-gray-100">
                {contact.projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/projects/${p.id}`} className="link">{p.name}</Link>
                    <Badge tone={projectTone[p.status]}>{p.status.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent bookings">
            {history?.any && <p className={`mb-3 rounded-md p-2 text-xs ${history.noShows || history.lateCancels ? "bg-amber-50 text-amber-900" : "bg-gray-50 text-gray-600"}`}>{historyLine(history)}.</p>}
            {contact.bookings.length === 0 ? <p className="text-sm text-gray-500">No bookings yet.</p> : (
              <ul className="divide-y divide-gray-100">
                {contact.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/bookings/${b.id}`} className="link">{fmtDateTime(b.startsAt)} · {b.room.name}</Link>
                    <Badge tone={bookingTone[b.status]}>{b.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {contact.invoices.length > 0 && (
            <Card title="Invoices">
              <ul className="divide-y divide-gray-100">
                {contact.invoices.map((i) => (
                  <li key={i.id} className="flex justify-between py-2 text-sm">
                    <Link href={`/invoices/${i.id}`} className="link">{i.number} · {fmtDate(i.issueDate)}</Link>
                    <span>{money(i.total)} · {i.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <NotesPanel parent={{ contactId: id }} path={path} />
        </div>
        <div className="space-y-6">
          <TasksPanel parent={{ contactId: id }} path={path} studioId={user.studioId} />
          <Card title="Bands & artists">
            <ul className="mb-3 divide-y divide-gray-100">
              {contact.artists.length === 0 && <li className="pb-2 text-sm text-gray-500">Not linked to any band or artist yet.</li>}
              {contact.artists.map((a) => (
                <li key={a.artistId} className="flex items-center justify-between py-1.5 text-sm">
                  <span><Link href={`/artists/${a.artistId}`} className="link">{a.artist.name}</Link>{a.role && <span className="text-gray-500"> · {a.role}</span>}</span>
                  <form action={removeContactFromArtist}>
                    <input type="hidden" name="contactId" value={id} /><input type="hidden" name="artistId" value={a.artistId} />
                    <button className="text-xs text-red-500">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addContactToArtist} className="space-y-2">
              <input type="hidden" name="contactId" value={id} />
              <input aria-label="Band or artist name" name="artistName" required list="contact-artists" placeholder="Band or artist name" className="input" />
              <datalist id="contact-artists">{artists.map((a) => <option key={a.id} value={a.name} />)}</datalist>
              <div className="flex gap-2">
                <input aria-label="Role (vocals, guitar…)" name="role" placeholder="Role (vocals, guitar…)" className="input" />
                <button className="btn-secondary shrink-0">Add</button>
              </div>
            </form>
            {!soloLinked && (
              <form action={addContactToArtist} className="mt-2">
                <input type="hidden" name="contactId" value={id} />
                <button className="text-xs link">+ Add {name} as a solo artist</button>
              </form>
            )}
          </Card>
          <Card title="Details">
            <ContactForm studioId={user.studioId} contact={contact} action={updateContact} submit="Save" />
            <form action={deleteContact} className="mt-4 border-t border-gray-100 pt-4">
              <input type="hidden" name="id" value={id} />
              <button className="btn-danger btn-sm">Delete contact</button>
            </form>
          </Card>
          {ranked.length > 0 && (
            <Card title="Merge a duplicate">
              <p className="mb-3 text-sm text-gray-600">Spelled someone twice? Pick the duplicate. Everything attached to it moves onto {name}, any blank details here are filled in from it, and the duplicate is deleted.</p>
              <form action={mergeContact} className="space-y-2">
                <input type="hidden" name="keepId" value={id} />
                <select aria-label="Duplicate contact to merge" name="dupId" required className="input" defaultValue="">
                  <option value="" disabled>Choose the duplicate…</option>
                  {ranked.map((o) => <option key={o.id} value={o.id}>{fullName(o)}{o.email ? ` · ${o.email}` : ""}{o.d <= 3 ? " (similar)" : ""}</option>)}
                </select>
                <label className="flex items-start gap-2 text-xs text-gray-600"><input type="checkbox" required className="mt-0.5" /> I understand the duplicate will be deleted after its records move here.</label>
                <button className="btn-secondary btn-sm">Merge into {name}</button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
