import type { Contact, Studio } from "@prisma/client";
import { fmtDate, fullName, money, titleCase } from "@/lib/format";
import { totals, type LineItem } from "@/lib/money";
import { Linkify } from "./Linkify";

/** Printable quote / invoice body, used in the app and on the public client pages. */
export function DocumentView({ kind, studio, number, contact, issueDate, secondDate, items, taxRate, discount, notes, terms, amountPaid, payments }: {
  kind: "Quote" | "Invoice";
  studio: Studio;
  number: string;
  contact: Contact | null;
  issueDate: Date;
  secondDate: Date | null;
  items: LineItem[];
  taxRate: number;
  discount: number;
  notes: string | null;
  terms: string | null;
  amountPaid?: number;
  /** Shown as a payment history under the totals (client page and in-app preview). */
  payments?: { receivedAt: Date; method: string; amount: number; refundedAmount: number }[];
}) {
  const t = totals(items, taxRate, discount);
  return (
    <div className="text-sm text-gray-800">
      <div className="flex flex-wrap justify-between gap-6">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {studio.logoUrl && <img src={studio.logoUrl} alt="" className="mb-2 max-h-16 max-w-[200px] object-contain" />}
          <div className="font-display text-2xl tracking-tight text-black">{studio.name}</div>
          <div className="mt-1 whitespace-pre-line text-gray-500">{[studio.address, studio.email, studio.phone].filter(Boolean).join("\n")}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl uppercase tracking-wide text-gray-400">{kind}</div>
          <div className="font-medium">{number}</div>
          <div className="text-gray-500">Issued {fmtDate(issueDate)}</div>
          {secondDate && <div className="text-gray-500">{kind === "Quote" ? "Valid until" : "Due"} {fmtDate(secondDate)}</div>}
        </div>
      </div>
      {contact && (
        <div className="mt-6">
          <div className="label">{kind === "Quote" ? "Prepared for" : "Bill to"}</div>
          <div className="font-medium">{fullName(contact)}</div>
          <div className="text-gray-500">{contact.email}</div>
        </div>
      )}
      {/* Phones: one line per item, so the price and amount are never off the edge of the screen. */}
      <ul className="mt-6 divide-y divide-gray-100 border-y border-gray-200 sm:hidden print:hidden">
        {items.map((it, i) => (
          <li key={i} className="flex items-start justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <div className="break-words">{it.description}</div>
              <div className="text-sm tabular-nums text-gray-500">{it.quantity} × {money(it.unitPrice)}</div>
            </div>
            <div className="shrink-0 text-right tabular-nums">{money(t.lines[i])}</div>
          </li>
        ))}
      </ul>
      <div className="mt-6 hidden overflow-x-auto sm:block print:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="py-2 text-right tabular-nums">{money(it.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{money(t.lines[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1 tabular-nums">
        <span className="text-gray-500">Subtotal</span><span className="text-right">{money(t.subtotal)}</span>
        {t.discount > 0 && <><span className="text-gray-500">Discount</span><span className="text-right">−{money(t.discount)}</span></>}
        {t.tax > 0 && <><span className="text-gray-500">Tax ({taxRate}%)</span><span className="text-right">{money(t.tax)}</span></>}
        <span className="font-semibold">Total</span><span className="text-right font-semibold">{money(t.total)}</span>
        {amountPaid != null && amountPaid > 0 && (
          <>
            <span className="text-gray-500">Paid</span><span className="text-right">−{money(amountPaid)}</span>
            <span className="font-semibold">Balance due</span><span className="text-right font-semibold">{money(Math.max(0, t.total - amountPaid))}</span>
          </>
        )}
      </div>
      {payments && payments.length > 0 && (
        <div className="mt-6">
          <div className="label">Payment history</div>
          <ul className="divide-y divide-gray-100">
            {payments.map((p, i) => (
              <li key={i} className="flex justify-between py-1.5 tabular-nums">
                <span>{fmtDate(p.receivedAt)} · {p.method === "STRIPE" ? "Card" : titleCase(p.method)}</span>
                <span>{money(p.amount)}{p.refundedAmount > 0 && <span className="ml-2 text-amber-700">({money(p.refundedAmount)} refunded)</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(notes || terms || (kind === "Invoice" && studio.paymentInstructions) || studio.policies) && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {notes && <div><div className="label">Notes</div><p className="whitespace-pre-wrap"><Linkify text={notes} /></p></div>}
          {terms && <div><div className="label">Terms</div><p className="whitespace-pre-wrap"><Linkify text={terms} /></p></div>}
          {kind === "Invoice" && studio.paymentInstructions && <div><div className="label">Other ways to pay</div><p className="whitespace-pre-wrap"><Linkify text={studio.paymentInstructions} /></p></div>}
          {studio.policies && <div><div className="label">Studio policies</div><p className="whitespace-pre-wrap"><Linkify text={studio.policies} /></p></div>}
        </div>
      )}
    </div>
  );
}
