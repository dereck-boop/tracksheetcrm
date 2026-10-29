import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { createArtist } from "./actions";

export const metadata = { title: "Artists" };

export default async function ArtistsPage() {
  const user = await requireUser();
  const artists = await db.artist.findMany({
    where: { studioId: user.studioId },
    orderBy: { name: "asc" },
    include: { members: { include: { contact: true } }, _count: { select: { projects: true } } },
  });
  const contacts = await db.contact.findMany({ where: { studioId: user.studioId }, orderBy: { firstName: "asc" } });
  return (
    <>
      <PageHeader title="Artists / Groups" subtitle="The acts you work with. Link the people from Contacts to each one, and one person can be in several acts." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {artists.length === 0 ? <Empty>No artists yet. Add one here, or from a contact&apos;s page under Bands &amp; artists.</Empty> : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Kind</th><th>Genre</th><th>Members</th><th>Projects</th></tr></thead>
              <tbody>
                {artists.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/artists/${a.id}`} className="font-medium link">{a.name}</Link></td>
                    <td>{a.kind}</td><td>{a.genre}</td><td className="text-sm">{a.members.map((m, i) => <span key={m.contactId}>{i > 0 && ", "}<Link href={`/contacts/${m.contactId}`} className="link">{fullName(m.contact)}</Link></span>)}</td><td>{a._count.projects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Card title="Add artist or group">
          <form action={createArtist} className="space-y-3">
            <input aria-label="Name" name="name" required placeholder="Name" className="input" />
            <select aria-label="Type" name="kind" className="input"><option>Artist</option><option>Band</option><option>Group</option><option>Duo</option><option>Choir</option><option>Podcast</option></select>
            <input aria-label="Genre" name="genre" placeholder="Genre" className="input" />
            <select aria-label="Main contact" name="contactId" className="input" defaultValue="">
              <option value="">Link a contact (optional)</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
            </select>
            <button className="btn-primary">Add</button>
          </form>
        </Card>
      </div>
    </>
  );
}
