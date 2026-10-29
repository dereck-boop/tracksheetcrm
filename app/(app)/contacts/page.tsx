import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const contacts = await db.contact.findMany({
    where: {
      studioId: user.studioId,
      ...(q && {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      }),
    },
    orderBy: [{ firstName: "asc" }],
    include: { _count: { select: { projects: true } } },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Contacts" subtitle={`${contacts.length} shown`} actions={<><Link href="/contacts/import" className="btn-secondary">Import CSV</Link><Link href="/contacts/new" className="btn-primary">New contact</Link></>} />
      <form className="mb-4"><input aria-label="Search name, email or phone" name="q" defaultValue={q} placeholder="Search name, email or phone…" className="input max-w-md" /></form>
      <div className="card overflow-x-auto">
        {contacts.length === 0 ? (
          <Empty action={<Link href="/contacts/new" className="btn-primary">Add your first contact</Link>}>No contacts found.</Empty>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Projects</th></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/contacts/${c.id}`} className="font-medium link">{fullName(c)}</Link></td>
                  <td>{c.email}</td>
                  <td>{c.phone}</td>
                  <td>{c.role && <Badge>{c.role}</Badge>}</td>
                  <td>{c._count.projects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
