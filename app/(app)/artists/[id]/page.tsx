import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { projectTone } from "@/lib/status";
import { NotesPanel } from "@/components/NotesPanel";
import { Badge, Card, EmailFlash, Field, PageHeader } from "@/components/ui";
import { addMember, deleteArtist, removeMember, updateArtist } from "../actions";

export default async function ArtistPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ emailed?: string; email_error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const flash = await searchParams;
  const a = await db.artist.findFirst({
    where: { id, studioId: user.studioId },
    include: { members: { include: { contact: true } }, projects: { orderBy: { createdAt: "desc" } } },
  });
  if (!a) notFound();
  const contacts = await db.contact.findMany({ where: { studioId: user.studioId }, orderBy: { firstName: "asc" } });
  return (
    <>
      <PageHeader title={a.name} subtitle={[a.kind, a.genre].filter(Boolean).join(" · ")}
        actions={<Link href={`/projects/new?artistId=${id}`} className="btn-primary">New project</Link>} />
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Members">
            <ul className="mb-4 divide-y divide-gray-100">
              {a.members.length === 0 && <li className="text-sm text-gray-500">No members linked.</li>}
              {a.members.map((m) => (
                <li key={m.contactId} className="flex items-center justify-between py-2 text-sm">
                  <span><Link href={`/contacts/${m.contactId}`} className="link">{fullName(m.contact)}</Link>{m.role && <span className="text-gray-500"> · {m.role}</span>}</span>
                  <form action={removeMember}>
                    <input type="hidden" name="artistId" value={id} /><input type="hidden" name="contactId" value={m.contactId} />
                    <button className="text-xs text-red-500">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addMember} className="flex flex-wrap gap-2">
              <input type="hidden" name="artistId" value={id} />
              <select aria-label="Member to add" name="contactId" required className="input w-auto">
                <option value="">Choose contact…</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
              </select>
              <input aria-label="Role (vocals, guitar…)" name="role" placeholder="Role (vocals, guitar…)" className="input w-48" />
              <button className="btn-secondary">Add member</button>
            </form>
          </Card>
          <Card title="Projects">
            {a.projects.length === 0 ? <p className="text-sm text-gray-500">No projects yet.</p> :
              a.projects.map((p) => (
                <div key={p.id} className="flex justify-between py-1.5 text-sm">
                  <Link href={`/projects/${p.id}`} className="link">{p.name}</Link>
                  <Badge tone={projectTone[p.status]}>{p.status.replace("_", " ")}</Badge>
                </div>
              ))}
          </Card>
          <NotesPanel parent={{ artistId: id }} path={`/artists/${id}`} />
        </div>
        <Card title="Details">
          <form action={updateArtist} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <Field label="Name"><input name="name" required defaultValue={a.name} className="input" /></Field>
            <Field label="Kind"><input name="kind" defaultValue={a.kind} className="input" /></Field>
            <Field label="Genre"><input name="genre" defaultValue={a.genre ?? ""} className="input" /></Field>
            <Field label="Website"><input name="website" defaultValue={a.website ?? ""} className="input" /></Field>
            <Field label="Notes"><textarea name="notes" rows={3} defaultValue={a.notes ?? ""} className="input" /></Field>
            <button className="btn-primary">Save</button>
          </form>
          <form action={deleteArtist} className="mt-4 border-t border-gray-100 pt-4">
            <input type="hidden" name="id" value={id} />
            <button className="btn-danger btn-sm">Delete</button>
          </form>
        </Card>
      </div>
    </>
  );
}
