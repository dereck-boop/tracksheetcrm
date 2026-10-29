/** Line-item math shared by quotes and invoices. All amounts in integer cents. */
export type LineItem = { description: string; quantity: number; unitPrice: number; taxable: boolean };

export function totals(items: LineItem[], taxRatePct: number, discount = 0) {
  const lines = items.map((i) => Math.round(i.quantity * i.unitPrice));
  const subtotal = lines.reduce((s, l) => s + l, 0);
  const taxableBase = items.reduce((s, i, n) => s + (i.taxable ? lines[n]! : 0), 0);
  // Discount reduces the taxable base proportionally.
  const taxableAfterDiscount = subtotal ? Math.max(0, taxableBase - Math.round((discount * taxableBase) / subtotal)) : 0;
  const tax = Math.round((taxableAfterDiscount * taxRatePct) / 100);
  const total = Math.max(0, subtotal - discount + tax);
  return { lines, subtotal, discount, tax, total };
}

/** Parse the JSON produced by <LineItemsEditor>. Prices arrive in dollars. */
export function parseItems(json: string | null): LineItem[] {
  if (!json) return [];
  const raw = JSON.parse(json) as { description?: string; quantity?: string | number; unitPrice?: string | number; taxable?: boolean }[];
  return raw
    .map((r) => ({
      description: String(r.description ?? "").trim(),
      quantity: Number(r.quantity) || 0,
      unitPrice: Math.round((Number(String(r.unitPrice ?? "").replace(/[^0-9.-]/g, "")) || 0) * 100),
      taxable: r.taxable !== false,
    }))
    .filter((r) => r.description && r.quantity);
}

/** Normalize Prisma rows (Decimal quantity) into LineItems. */
export function fromRows(rows: { description: string; quantity: unknown; unitPrice: number; taxable: boolean }[]): LineItem[] {
  return rows.map((r) => ({ description: r.description, quantity: Number(r.quantity), unitPrice: r.unitPrice, taxable: r.taxable }));
}

/** Prisma rows → editor rows (prices in dollars). */
export function editorRows(items: { description: string; quantity: unknown; unitPrice: number; taxable: boolean }[]) {
  return items.map((i) => ({ description: i.description, quantity: String(Number(i.quantity)), unitPrice: String(i.unitPrice / 100), taxable: i.taxable }));
}
