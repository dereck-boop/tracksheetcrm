"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { totals } from "@/lib/money";

type Row = { description: string; quantity: string; unitPrice: string; taxable: boolean };
export type ServiceOption = { name: string; unit: string; unitPrice: number; taxable: boolean };

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function LineItemsEditor({ initial, services, taxRate: tax0, discount: disc0 }: {
  initial: Row[];
  services: ServiceOption[];
  taxRate: string;
  discount: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ description: "", quantity: "1", unitPrice: "", taxable: true }]);
  const [taxRate, setTaxRate] = useState(tax0);
  const [discount, setDiscount] = useState(disc0);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  const cents = (v: string) => Math.round((Number(v.replace(/[^0-9.-]/g, "")) || 0) * 100);
  const t = totals(
    rows.map((r) => ({ description: r.description, quantity: Number(r.quantity) || 0, unitPrice: cents(r.unitPrice), taxable: r.taxable })),
    Number(taxRate) || 0,
    cents(discount),
  );

  return (
    <div>
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2">Description</th><th className="w-20 pb-2">Qty</th><th className="w-24 pb-2">Price $</th><th className="w-14 pb-2 text-center">Tax</th><th className="w-24 pb-2 text-right">Amount</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><input value={r.description} onChange={(e) => set(i, { description: e.target.value })} className="input" placeholder="Description" /></td>
                <td className="py-1 pr-2"><input value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="decimal" className="input" /></td>
                <td className="py-1 pr-2"><input value={r.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} inputMode="decimal" className="input" /></td>
                <td className="py-1 text-center"><input type="checkbox" checked={r.taxable} onChange={(e) => set(i, { taxable: e.target.checked })} /></td>
                <td className="py-1 text-right tabular-nums">{usd(t.lines[i] ?? 0)}</td>
                <td className="py-1 text-right">
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))} className="text-gray-400 hover:text-red-500" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRows((r) => [...r, { description: "", quantity: "1", unitPrice: "", taxable: true }])} className="btn-secondary btn-sm"><Plus className="h-3.5 w-3.5" />Line</button>
        {services.length > 0 && (
          <select
            className="input w-auto py-1.5 text-xs"
            value=""
            onChange={(e) => {
              const s = services[Number(e.target.value)];
              if (s) setRows((r) => [...r.filter((x) => x.description || x.unitPrice), { description: s.name, quantity: "1", unitPrice: String(s.unitPrice / 100), taxable: s.taxable }]);
            }}
          >
            <option value="">+ From price list…</option>
            {services.map((s, i) => <option key={i} value={i}>{s.name} · {usd(s.unitPrice)}/{s.unit}</option>)}
          </select>
        )}
      </div>
      <div className="mt-4 ml-auto grid max-w-xs grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 text-sm">
        <span className="text-gray-500">Subtotal</span><span className="text-right tabular-nums">{usd(t.subtotal)}</span>
        <label className="text-gray-500" htmlFor="discount">Discount $</label>
        <input id="discount" name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className="input w-28 py-1 text-right" />
        <label className="text-gray-500" htmlFor="taxRate">Tax %</label>
        <input id="taxRate" name="taxRate" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" className="input w-28 py-1 text-right" />
        <span className="text-gray-500">Tax</span><span className="text-right tabular-nums">{usd(t.tax)}</span>
        <span className="font-semibold">Total</span><span className="text-right font-semibold tabular-nums">{usd(t.total)}</span>
      </div>
    </div>
  );
}
