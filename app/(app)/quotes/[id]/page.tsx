import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { financeOptions } from "@/lib/financeOptions";
import { fmtDateTime, titleCase, toDateInput } from "@/lib/format";
import { editorRows, fromRows } from "@/lib/money";
import { quoteTone } from "@/lib/status";
import { appUrl } from "@/lib/stripe";
import { CopyLink } from "@/components/CopyLink";
import { EmailPreview } from "@/components/EmailPreview";
import { quoteEmailDraft } from "@/lib/invoiceEmail";
import { DocumentView } from "@/components/DocumentView";
import { FinanceForm } from "@/components/FinanceForm";
import { Badge, Card, EmailFlash, PageHeader } from "@/components/ui";
import { convertQuote, deleteQuote, emailQuote, setQuoteStatus, updateQuote } from "../actions";

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ emailed?: string; email_error?: string }> }) {
  const user = await requireRolePage("ADMIN");
  const { id } = await params;
  const flash = await searchParams;
  const q = await db.quote.findFirst({
    where: { id, studioId: user.studioId },
    include: { contact: true, items: { orderBy: { sortOrder: "asc" } }, invoice: true, studio: true },
  });
  if (!q) notFound();
  const [opts, emailDraft] = await Promise.all([financeOptions(user.studioId), q.invoice ? null : quoteEmailDraft(q.id)]);
  const status = (s: string, label: string, cls = "btn-secondary") => (
    <form action={setQuoteStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={s} /><button className={cls}>{label}</button></form>
  );
  return (
    <>
      <PageHeader
        title={`Quote ${q.number}`}
        subtitle={<Badge tone={quoteTone[q.status]}>{titleCase(q.status)}</Badge>}
        actions={
          <>
            <CopyLink url={`${appUrl()}/q/${q.publicToken}`} />
            {emailDraft && <EmailPreview action={emailQuote} id={id} draft={emailDraft} className="btn-secondary" />}
            {q.status === "DRAFT" && status("SENT", "Mark as sent")}
            {q.invoice ? (
              <Link href={`/invoices/${q.invoice.id}`} className="btn-primary">Open invoice {q.invoice.number}</Link>
            ) : (
              <form action={convertQuote}><input type="hidden" name="id" value={id} /><button className="btn-primary">Convert to invoice</button></form>
            )}
          </>
        }
      />
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Preview">
          {/* The client-facing paper stays light in both themes. */}
          <div className="qh-app rounded-lg p-5 sm:p-7" data-theme="light">
            <DocumentView kind="Quote" studio={q.studio} number={q.number} contact={q.contact} issueDate={q.issueDate} secondDate={q.validUntil}
              items={fromRows(q.items)} taxRate={Number(q.taxRate)} discount={q.discount} notes={q.notes} terms={q.terms} />
          </div>
          {q.status === "ACCEPTED" && (
            <div className="mt-6 border-t border-dashed border-gray-200 pt-4 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Acceptance record</p>
              {q.acceptedName ? (
                <>
                  <p>Accepted by <strong>{q.acceptedName}</strong>{q.acceptedAt && ` on ${fmtDateTime(q.acceptedAt)}`}{q.acceptedIp && ` from ${q.acceptedIp}`}.</p>
                  {q.acceptedTerms && <details className="mt-2"><summary className="cursor-pointer text-gray-600">Terms they agreed to</summary><p className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-3 text-gray-700">{q.acceptedTerms}</p></details>}
                </>
              ) : <p className="text-gray-500">Marked accepted{q.acceptedAt && ` on ${fmtDateTime(q.acceptedAt)}`} (not signed on the client page).</p>}
            </div>
          )}
        </Card>
        <div className="space-y-6">
          {q.status !== "ACCEPTED" && (
            <Card title="Edit">
              <FinanceForm kind="quote" id={id} action={updateQuote} opts={opts} submit="Save quote"
                values={{ contactId: q.contactId, projectId: q.projectId, date: toDateInput(q.validUntil), notes: q.notes, terms: q.terms, taxRate: q.taxRate.toString(), discount: q.discount ? String(q.discount / 100) : "", items: editorRows(q.items) }} />
            </Card>
          )}
          <Card title="More">
            <div className="flex flex-wrap gap-2">
              {["SENT", "DRAFT"].includes(q.status) && status("DECLINED", "Mark declined")}
              {["SENT", "DRAFT"].includes(q.status) && status("EXPIRED", "Mark expired")}
              {!q.invoice && (
                <form action={deleteQuote}><input type="hidden" name="id" value={id} /><button className="btn-danger">Delete quote</button></form>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-500">Send the client link by email or text. Your client can review and accept the quote there.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
