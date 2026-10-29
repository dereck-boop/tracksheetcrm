import Link from "next/link";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { fmtDate, fullName, money, titleCase } from "@/lib/format";
import { fromRows, totals } from "@/lib/money";
import { quoteTone } from "@/lib/status";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Quotes" };

export default async function QuotesPage() {
  const user = await requireRolePage("ADMIN");
  const quotes = await db.quote.findMany({
    where: { studioId: user.studioId },
    orderBy: { issueDate: "desc" },
    include: { contact: true, project: true, items: true },
    take: 300,
  });
  return (
    <>
      <PageHeader title="Quotes" actions={<Link href="/quotes/new" className="btn-primary">New quote</Link>} />
      <div className="card overflow-x-auto">
        {quotes.length === 0 ? <Empty action={<Link href="/quotes/new" className="btn-primary">Create a quote</Link>}>No quotes yet.</Empty> : (
          <table className="data-table">
            <thead><tr><th>Number</th><th>Client</th><th>Project</th><th>Status</th><th>Issued</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td><Link href={`/quotes/${q.id}`} className="font-medium link">{q.number}</Link></td>
                  <td>{q.contact ? fullName(q.contact) : "—"}</td>
                  <td>{q.project?.name}</td>
                  <td><Badge tone={quoteTone[q.status]}>{titleCase(q.status)}</Badge></td>
                  <td>{fmtDate(q.issueDate)}</td>
                  <td className="text-right tabular-nums">{money(totals(fromRows(q.items), Number(q.taxRate), q.discount).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
