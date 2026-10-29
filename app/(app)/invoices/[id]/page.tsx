import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { financeOptions } from "@/lib/financeOptions";
import { ago, fmtDate, fmtDateTime, money, titleCase, toDateInput } from "@/lib/format";
import { balance, depositAmount, dueNow, isOverdue, unappliedDeposits } from "@/lib/invoices";
import { nextReminder } from "@/lib/reminders";
import { editorRows, fromRows } from "@/lib/money";
import { deviceName } from "@/lib/invoiceViews";
import { invoiceTone } from "@/lib/status";
import { appUrl, stripe } from "@/lib/stripe";
import { CopyLink } from "@/components/CopyLink";
import { EmailPreview } from "@/components/EmailPreview";
import { invoiceEmailDraft } from "@/lib/invoiceEmail";
import { DocumentView } from "@/components/DocumentView";
import { FinanceForm } from "@/components/FinanceForm";
import { Badge, Card, EmailFlash, PageHeader } from "@/components/ui";
import { applyDeposits, deleteInvoice, deletePayment, emailInvoice, markSent, recordPayment, setInvoiceDeposit, setReminders, updateInvoice, voidInvoice } from "../actions";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ emailed?: string; email_error?: string }> }) {
  const user = await requireRolePage("ADMIN");
  const { id } = await params;
  const flash = await searchParams;
  const inv = await db.invoice.findFirst({
    where: { id, studioId: user.studioId },
    include: { contact: true, project: true, quote: true, depositBooking: true, depositCredits: true, depositAppliedTo: true, items: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { receivedAt: "desc" } }, views: { orderBy: { viewedAt: "desc" } }, studio: true },
  });
  if (!inv) notFound();
  const [opts, deposits] = await Promise.all([
    financeOptions(user.studioId),
    inv.isDeposit || inv.status === "VOID" ? [] : unappliedDeposits(user.studioId, { contactId: inv.contactId, projectId: inv.projectId, excludeId: inv.id }),
  ]);
  const emailDraft = inv.status !== "PAID" && inv.status !== "VOID" ? await invoiceEmailDraft(inv.id) : null;
  const due = balance(inv);
  const reminder = nextReminder(inv, inv.studio);
  const now = dueNow(inv);
  const deposit = depositAmount(inv);
  // The studio's deposit rules only explain the default; a deposit can still be asked for on any invoice.
  const skipReason = inv.total < inv.studio.depositMinimum ? `under your ${money(inv.studio.depositMinimum)} no-deposit amount` : null;
  const hidden = <input type="hidden" name="id" value={id} />;
  const firstView = inv.views.at(-1);
  const lastView = inv.views[0];
  return (
    <>
      <PageHeader
        title={`Invoice ${inv.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {isOverdue(inv) ? <Badge tone="red">Overdue</Badge> : <Badge tone={invoiceTone[inv.status]}>{titleCase(inv.status)}</Badge>}
            {inv.isDeposit && <Badge tone="purple">Booking deposit</Badge>}
            {inv.project && <Link href={`/projects/${inv.project.id}`} className="link">{inv.project.name}</Link>}
            {inv.quote && <Link href={`/quotes/${inv.quote.id}`} className="link">from {inv.quote.number}</Link>}
            {inv.depositBooking && <Link href={`/bookings/${inv.depositBooking.id}`} className="link">booking</Link>}
          </span>
        }
        actions={
          inv.status !== "VOID" && (
            <>
              <CopyLink url={`${appUrl()}/i/${inv.publicToken}`} label={stripe() ? "Copy pay link" : "Copy client link"} />
              {emailDraft && <EmailPreview action={emailInvoice} id={id} draft={emailDraft} />}
              {inv.status === "DRAFT" && <form action={markSent}>{hidden}<button className="btn-secondary">Mark as sent</button></form>}
            </>
          )
        }
      />
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      {!stripe() && inv.status !== "PAID" && inv.status !== "VOID" && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900">Online card payments turn on once Stripe keys are added (see README). You can record payments manually below.</p>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Preview">
          {/* The client-facing paper stays light in both themes. */}
          <div className="qh-app rounded-lg p-5 sm:p-7" data-theme="light">
            <DocumentView kind="Invoice" studio={inv.studio} number={inv.number} contact={inv.contact} issueDate={inv.issueDate} secondDate={inv.dueDate}
              items={fromRows(inv.items)} taxRate={Number(inv.taxRate)} discount={inv.discount} notes={inv.notes} terms={inv.terms} amountPaid={inv.amountPaid} payments={inv.payments} />
          </div>
          <div className="mt-6 border-t border-dashed border-gray-200 pt-4 text-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Client opens · only you see this</p>
            {lastView && firstView ? (
              <>
                <p>
                  Opened <strong>{inv.views.length} {inv.views.length === 1 ? "time" : "times"}</strong>. Last opened {fmtDateTime(lastView.viewedAt)} ({ago(lastView.viewedAt)})
                  {inv.views.length > 1 && <>, first opened {fmtDateTime(firstView.viewedAt)}</>}.
                </p>
                {inv.views.length > 1 && (
                  <ul className="mt-2 space-y-1 text-xs text-gray-500">
                    {inv.views.slice(0, 10).map((v) => <li key={v.id}>{fmtDateTime(v.viewedAt)} · {deviceName(v.userAgent)}</li>)}
                    {inv.views.length > 10 && <li>…and {inv.views.length - 10} earlier</li>}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-gray-500">Not opened yet. Opens are counted when the client loads the invoice link, not when you&apos;re signed in.</p>
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <Card title={`Payments · ${money(inv.amountPaid)} of ${money(inv.total)}`}>
            {inv.payments.length > 0 && (
              <ul className="mb-4 divide-y divide-gray-100 text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span>{fmtDate(p.receivedAt)} · {titleCase(p.method)}{p.reference && ` · ${p.reference}`}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      {money(p.amount)}{p.refundedAmount > 0 && <Badge tone="amber">refunded {money(p.refundedAmount)}</Badge>}
                      {!p.stripePaymentIntentId && (
                        <form action={deletePayment}>{hidden}<input type="hidden" name="paymentId" value={p.id} /><button className="text-xs text-red-500">Remove</button></form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {inv.status !== "VOID" && due > 0 && (
              <form action={recordPayment} className="grid gap-2 sm:grid-cols-4">
                {hidden}
                <input name="amount" required defaultValue={String(now.amount / 100)} inputMode="decimal" className="input" aria-label="Amount" />
                <select aria-label="Payment method" name="method" defaultValue="CASH" className="input">
                  {["CASH", "CHECK", "BANK_TRANSFER", "VENMO", "PAYPAL", "STRIPE", "OTHER"].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
                </select>
                <input name="receivedAt" type="date" defaultValue={toDateInput(new Date())} className="input" aria-label="Date received" />
                <button className="btn-secondary">Record payment</button>
                <input aria-label="Reference / check # (optional)" name="reference" placeholder="Reference / check # (optional)" className="input sm:col-span-3" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sendReceipt" defaultChecked={!!inv.contact?.email} disabled={!inv.contact?.email} /> Email a receipt</label>
              </form>
            )}
            {due === 0 && inv.status === "PAID" && <p className="text-sm text-emerald-700">Paid in full{inv.paidAt && ` on ${fmtDate(inv.paidAt)}`}.</p>}
          </Card>
          {deposits.length > 0 && (
            <Card title="Paid deposit not credited yet">
              <form action={applyDeposits} className="space-y-2 text-sm">
                {hidden}
                <p className="text-gray-600">
                  {deposits.map((d) => <span key={d.id} className="mr-2"><Link href={`/invoices/${d.id}`} className="link">{d.number}</Link> ({money(d.amountPaid)})</span>)}
                  {deposits.length === 1 ? "was" : "were"} paid by this client but {deposits.length === 1 ? "hasn't" : "haven't"} been taken off a bill yet.
                </p>
                <button className="btn-primary btn-sm">Take {deposits.length === 1 ? "it" : "them"} off this invoice</button>
              </form>
            </Card>
          )}
          {inv.depositAppliedTo && (
            <p className="rounded-md bg-violet-50 px-4 py-2 text-sm text-violet-800">This deposit was credited on <Link href={`/invoices/${inv.depositAppliedTo.id}`} className="link">invoice {inv.depositAppliedTo.number}</Link>.</p>
          )}
          {["SENT", "PARTIAL"].includes(inv.status) && due > 0 && (
            <Card title="Payment reminders">
              <form action={setReminders} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                {hidden}
                <p className="text-gray-600">
                  {inv.remindersPaused ? "Paused for this invoice." : !inv.contact?.email ? "Off: the client has no email address." : reminder ? <>Next reminder: <strong>{reminder}</strong>.</> : "No more reminders scheduled."}
                  {inv.reminderCount > 0 && ` ${inv.reminderCount} sent so far${inv.lastReminderAt ? `, last ${fmtDate(inv.lastReminderAt)}` : ""}.`}
                </p>
                <input type="hidden" name="paused" value={inv.remindersPaused ? "0" : "1"} />
                <button className="btn-secondary btn-sm">{inv.remindersPaused ? "Turn reminders back on" : "Pause reminders"}</button>
              </form>
            </Card>
          )}
          {inv.status !== "VOID" && !inv.isDeposit && (inv.depositPercent || due > 0) && (
            <Card title="Deposit">
              {inv.depositPercent ? (
                <div className="space-y-3 text-sm">
                  <p>
                    The pay link asks for a <strong>{inv.depositPercent}% deposit ({money(deposit)})</strong> first, then the remaining {money(Math.max(0, inv.total - deposit))}.{" "}
                    {now.deposit ? <Badge tone="amber">deposit {inv.amountPaid > 0 ? `${money(now.amount)} still due` : "due"}</Badge> : <Badge tone="green">deposit paid</Badge>}
                  </p>
                  {now.deposit && (
                    <div className="flex flex-wrap gap-2">
                      <form action={setInvoiceDeposit} className="flex items-center gap-2">
                        {hidden}
                        <input name="depositPercent" type="number" min={1} max={99} required defaultValue={inv.depositPercent} className="input w-20" aria-label="Deposit percent" />
                        <span>%</span>
                        <button className="btn-secondary btn-sm">Change</button>
                      </form>
                      <form action={setInvoiceDeposit}>{hidden}<input type="hidden" name="clear" value="1" /><button className="btn-secondary btn-sm">Ask for the full amount instead</button></form>
                    </div>
                  )}
                </div>
              ) : (
                <form action={setInvoiceDeposit} className="space-y-2 text-sm">
                  {hidden}
                  <p className="text-gray-600">The pay link asks for the full {money(due)}. To take a deposit first, set a percentage. Once it&apos;s paid, the same link charges the rest.</p>
                  <div className="flex items-center gap-2">
                    <input name="depositPercent" type="number" min={1} max={99} required defaultValue={inv.studio.depositPercent || 50} className="input w-20" aria-label="Deposit percent" />
                    <span>%</span>
                    <button className="btn-primary btn-sm">Ask for a deposit</button>
                  </div>
                  {skipReason && <p className="text-xs text-gray-500">Your booking rules usually skip deposits here ({skipReason}), but you can still ask for one.</p>}
                </form>
              )}
            </Card>
          )}
          {inv.status !== "VOID" && (
            <Card title="Edit">
              <FinanceForm kind="invoice" id={id} action={updateInvoice} opts={opts} submit="Save invoice"
                values={{ contactId: inv.contactId, projectId: inv.projectId, date: toDateInput(inv.dueDate), notes: inv.notes, terms: inv.terms, taxRate: inv.taxRate.toString(), discount: inv.discount ? String(inv.discount / 100) : "", items: editorRows(inv.items) }} />
            </Card>
          )}
          <Card title="More">
            <div className="flex flex-wrap gap-2">
              {inv.status !== "VOID" && <form action={voidInvoice}>{hidden}<button className="btn-danger">Void invoice</button></form>}
              {inv.status === "DRAFT" && inv.amountPaid === 0 && <form action={deleteInvoice}>{hidden}<button className="btn-danger">Delete draft</button></form>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
