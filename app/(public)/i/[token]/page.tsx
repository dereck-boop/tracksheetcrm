import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, money } from "@/lib/format";
import { balance, dueNow } from "@/lib/invoices";
import { fromRows } from "@/lib/money";
import { stripe } from "@/lib/stripe";
import { DocumentView } from "@/components/DocumentView";
import { recordCheckoutPayment } from "@/lib/payments";
import { recordInvoiceView } from "@/lib/invoiceViews";
import { clientPageUrl } from "@/lib/clientPage";
import { PrintButton } from "@/components/PrintButton";
import { payInvoice } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const inv = await db.invoice.findUnique({ where: { publicToken: (await params).token }, select: { number: true } });
  return { title: inv ? `Invoice ${inv.number}` : "Invoice", robots: { index: false } };
}

export default async function PublicInvoice({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; session_id?: string }> }) {
  const { token } = await params;
  const { paid, session_id } = await searchParams;
  const load = () => db.invoice.findUnique({ where: { publicToken: token }, include: { studio: true, contact: true, items: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { receivedAt: "asc" } } } });
  let inv = await load();
  if (!inv || inv.status === "VOID") notFound();
  // Coming back from Stripe or the auto-refresh while a payment clears isn't a fresh open.
  if (!paid && !session_id) await recordInvoiceView(inv.id).catch(() => {});

  // Back from Stripe Checkout: confirm the payment right away instead of waiting for the webhook.
  let received: number | null = null;
  let processing = Boolean(paid);
  const s = stripe();
  if (session_id && s) {
    const session = await s.checkout.sessions.retrieve(session_id).catch(() => null);
    if (session?.metadata?.invoiceId === inv.id) {
      if (session.payment_status === "paid") {
        await recordCheckoutPayment(session);
        received = session.amount_total;
        inv = (await load())!;
      } else {
        processing = true;
      }
    }
  }
  const due = balance(inv);
  const now = dueNow(inv);
  if (due === 0) processing = false;
  const clientPage = await clientPageUrl(inv.contactId);
  return (
    <>
      {processing && <meta httpEquiv="refresh" content="5" />}
      {received != null && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 print:hidden text-emerald-800">
          <p className="font-medium">Thank you for your payment!</p>
          <p className="text-sm">We received {money(received)} for invoice {inv.number}.</p>
        </div>
      )}
      {processing && <p className="mb-4 rounded-md bg-emerald-50 px-4 py-3 print:hidden text-sm text-emerald-800">Thanks! Your payment is processing. This page will update when it clears.</p>}
      <div className="mb-3 flex justify-end print:hidden"><PrintButton /></div>
      <div className="card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <DocumentView kind="Invoice" studio={inv.studio} number={inv.number} contact={inv.contact} issueDate={inv.issueDate} secondDate={inv.dueDate}
          items={fromRows(inv.items)} taxRate={Number(inv.taxRate)} discount={inv.discount} notes={inv.notes} terms={inv.terms} amountPaid={inv.amountPaid} payments={inv.payments} />
      </div>
      <div className="mt-6 text-center print:hidden">
        {due === 0 ? (
          <p className="text-emerald-700">Paid in full{inv.paidAt && ` on ${fmtDate(inv.paidAt)}`}.{received == null && " Thank you!"}</p>
        ) : processing ? null : received != null ? (
          <p className="text-gray-600">{now.deposit ? <>Deposit still due: <strong>{money(now.amount)}</strong></> : <>Remaining balance: <strong>{money(due)}</strong></>}</p>
        ) : s ? (
          <form action={payInvoice}>
            <input type="hidden" name="token" value={token} />
            {now.deposit && <p className="mb-3 text-gray-600">A {inv.depositPercent}% deposit of <strong>{money(now.amount)}</strong> is due now. The remaining {money(due - now.amount)} can be paid here later.</p>}
            <button className="btn-primary px-8 py-3 text-base">Pay {money(now.amount)}{now.deposit ? " deposit" : ""} by card</button>
            <p className="mt-2 text-xs text-gray-500">Secure payment by Stripe</p>
          </form>
        ) : (
          <p className="text-gray-600">{now.deposit ? <>Deposit due now: <strong>{money(now.amount)}</strong> of {money(due)}</> : <>Balance due: <strong>{money(due)}</strong></>}. Contact {inv.studio.email ?? inv.studio.name} for payment options.</p>
        )}
        {clientPage && <p className="mt-6 text-sm"><a href={clientPage} className="link">See all your sessions, quotes and invoices</a></p>}
      </div>
    </>
  );
}
