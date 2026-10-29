import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { fromRows } from "@/lib/money";
import { quoteAgreement } from "@/lib/quotes";
import { clientPageUrl } from "@/lib/clientPage";
import { DocumentView } from "@/components/DocumentView";
import { PrintButton } from "@/components/PrintButton";
import { respondToQuote } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const q = await db.quote.findUnique({ where: { publicToken: (await params).token }, select: { number: true } });
  return { title: q ? `Quote ${q.number}` : "Quote", robots: { index: false } };
}

export default async function PublicQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await db.quote.findUnique({ where: { publicToken: token }, include: { studio: true, contact: true, invoice: true, items: { orderBy: { sortOrder: "asc" } } } });
  if (!q) notFound();
  const open = ["SENT", "DRAFT"].includes(q.status) && !(q.validUntil && q.validUntil < new Date());
  const agreement = quoteAgreement(q.terms, q.studio.policies);
  const clientPage = await clientPageUrl(q.contactId);
  return (
    <>
      <div className="mb-3 flex justify-end gap-2 print:hidden"><PrintButton /></div>
      <div className="card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <DocumentView kind="Quote" studio={q.studio} number={q.number} contact={q.contact} issueDate={q.issueDate} secondDate={q.validUntil}
          items={fromRows(q.items)} taxRate={Number(q.taxRate)} discount={q.discount} notes={q.notes} terms={q.terms} />
        {q.status === "ACCEPTED" && q.acceptedName && (
          <p className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-600">Accepted by <strong>{q.acceptedName}</strong>{q.acceptedAt && ` on ${fmtDateTime(q.acceptedAt)}`}{q.acceptedTerms && ", agreeing to the terms above"}.</p>
        )}
      </div>
      <div className="mt-6 text-center print:hidden">
        {open ? (
          <form action={respondToQuote} className="mx-auto max-w-md space-y-3 text-left">
            <input type="hidden" name="token" value={token} />
            <label className="block"><span className="label">Your full name</span><input name="acceptedName" required autoComplete="name" className="input" /></label>
            {agreement && (
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" name="agree" required className="mt-1" />
                <span>I agree to the terms{q.studio.policies ? " and studio policies" : ""} shown on this quote.</span>
              </label>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <button name="decision" value="decline" formNoValidate className="btn-secondary">Decline</button>
              <button name="decision" value="accept" className="btn-primary px-6">Accept quote</button>
            </div>
          </form>
        ) : q.status === "ACCEPTED" ? (
          <div className="space-y-3">
            <p className="text-emerald-700">Accepted{q.acceptedAt && ` on ${fmtDate(q.acceptedAt)}`}. Thank you!{!q.invoice && ` ${q.studio.name} will be in touch.`}</p>
            {q.invoice && q.invoice.status !== "VOID" && <Link href={`/i/${q.invoice.publicToken}`} className="btn-primary px-6">View and pay invoice {q.invoice.number}</Link>}
          </div>
        ) : (
          <p className="text-gray-500">This quote is {q.status === "SENT" || q.status === "DRAFT" ? "expired" : titleCase(q.status).toLowerCase()}. Contact {q.studio.email ?? q.studio.name} with any questions.</p>
        )}
        {clientPage && <p className="mt-6 text-sm"><a href={clientPage} className="link">See all your sessions, quotes and invoices</a></p>}
      </div>
    </>
  );
}
