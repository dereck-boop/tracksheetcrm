import type { Prisma } from "@prisma/client";

/** Allocate the next invoice / quote number atomically (increment-then-read inside the transaction). */
export async function nextNumber(tx: Prisma.TransactionClient, studioId: string, kind: "invoice" | "quote") {
  const s = await tx.studio.update({
    where: { id: studioId },
    data: kind === "invoice" ? { nextInvoiceNo: { increment: 1 } } : { nextQuoteNo: { increment: 1 } },
  });
  return kind === "invoice" ? `${s.invoicePrefix}${s.nextInvoiceNo - 1}` : `${s.quotePrefix}${s.nextQuoteNo - 1}`;
}
