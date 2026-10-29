import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { fmtDate, fullName, inTz, money, titleCase } from "@/lib/format";
import { balance, isOverdue } from "@/lib/invoices";
import { invoiceTone } from "@/lib/status";
import { Badge, Empty, PageHeader } from "@/components/ui";

const FILTERS = { open: "Open", overdue: "Overdue", draft: "Drafts", paid: "Paid", all: "All" } as const;
type F = keyof typeof FILTERS;

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireRolePage("ADMIN");
  const { f: raw } = await searchParams;
  const f: F = raw && raw in FILTERS ? (raw as F) : "open";
  const now = new Date();
  const where: Prisma.InvoiceWhereInput = { studioId: user.studioId };
  if (f === "open") where.status = { in: ["SENT", "PARTIAL"] };
  if (f === "overdue") Object.assign(where, { status: { in: ["SENT", "PARTIAL"] }, dueDate: { lt: now } });
  if (f === "draft") where.status = "DRAFT";
  if (f === "paid") where.status = "PAID";
  const [invoices, open, payments] = await Promise.all([
    db.invoice.findMany({ where, orderBy: { issueDate: "desc" }, include: { contact: true, project: true }, take: 300 }),
    db.invoice.findMany({ where: { studioId: user.studioId, status: { in: ["SENT", "PARTIAL"] } }, select: { total: true, amountPaid: true, dueDate: true, status: true } }),
    db.payment.aggregate({ where: { studioId: user.studioId, receivedAt: { gte: monthStart() } }, _sum: { amount: true, refundedAmount: true } }),
  ]);
  const outstanding = open.reduce((s, i) => s + balance(i), 0);
  const overdue = open.filter(isOverdue).reduce((s, i) => s + balance(i), 0);
  return (
    <>
      <PageHeader title="Invoices" actions={<><Link href="/invoices/import" className="btn-secondary">Import history</Link><Link href="/invoices/new" className="btn-primary">New invoice</Link></>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><div className="text-sm text-gray-500">Outstanding</div><div className="mt-1 font-display text-3xl">{money(outstanding)}</div></div>
        <div className="card p-5"><div className="text-sm text-gray-500">Overdue</div><div className={`mt-1 font-display text-3xl ${overdue ? "text-red-600" : ""}`}>{money(overdue)}</div></div>
        <div className="card p-5"><div className="text-sm text-gray-500">Received this month</div><div className="mt-1 font-display text-3xl">{money((payments._sum.amount ?? 0) - (payments._sum.refundedAmount ?? 0))}</div></div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        {(Object.keys(FILTERS) as F[]).map((k) => (
          <Link key={k} href={`/invoices?f=${k}`} className={`rounded-full border px-3 py-1 text-xs ${f === k ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"}`}>{FILTERS[k]}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {invoices.length === 0 ? <Empty>No invoices here.</Empty> : (
          <table className="data-table">
            <thead><tr><th>Number</th><th>Client</th><th>Project</th><th>Status</th><th>Issued</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/invoices/${i.id}`} className="font-medium link">{i.number}</Link>{i.isDeposit && <span className="ml-1.5"><Badge tone="purple">deposit</Badge></span>}</td>
                  <td>{i.contact ? fullName(i.contact) : "—"}</td>
                  <td>{i.project?.name}</td>
                  <td>{isOverdue(i) ? <Badge tone="red">Overdue</Badge> : <Badge tone={invoiceTone[i.status]}>{titleCase(i.status)}</Badge>}</td>
                  <td>{fmtDate(i.issueDate)}</td>
                  <td>{fmtDate(i.dueDate)}</td>
                  <td className="text-right tabular-nums">{money(i.total)}</td>
                  <td className="text-right tabular-nums">{i.status === "VOID" ? "—" : money(balance(i))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function monthStart() {
  const d = inTz(Date.now());
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime());
}
