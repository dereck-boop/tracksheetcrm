"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { toCents } from "@/lib/format";
import { date, req, str } from "@/lib/form";
import { invoiceFromQuote } from "@/lib/quotes";
import { parseItems } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { resolveClient } from "@/lib/contacts";
import { sendQuoteEmail } from "@/lib/invoiceEmail";
import { reviewed } from "@/lib/flash";
import { emailFlash } from "@/lib/flash";

async function fields(fd: FormData, studioId: string) {
  return {
    contactId: await resolveClient(fd, studioId, "contactId"),
    projectId: str(fd, "projectId"),
    validUntil: date(fd, "validUntil"),
    notes: str(fd, "notes"),
    terms: str(fd, "terms"),
    taxRate: Number(str(fd, "taxRate") ?? 0) || 0,
    discount: toCents(fd.get("discount")) ?? 0,
  };
}

async function createQuote(fd: FormData) {
  const user = await requireRole("ADMIN");
  const items = parseItems(str(fd, "items"));
  if (!items.length) throw new Error("Add at least one line item");
  const data = await fields(fd, user.studioId);
  const q = await db.$transaction(async (tx) =>
    tx.quote.create({
      data: {
        studioId: user.studioId,
        number: await nextNumber(tx, user.studioId, "quote"),
        ...data,
        items: { create: items.map((it, i) => ({ ...it, sortOrder: i })) },
      },
    }),
  );
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "quote", entityId: q.id, action: "created", summary: `Created quote ${q.number}` });
  redirect(`/quotes/${q.id}`);
}

async function updateQuote(fd: FormData) {
  const user = await requireRole("ADMIN");
  const id = req(fd, "id");
  const items = parseItems(str(fd, "items"));
  if (!items.length) throw new Error("Add at least one line item");
  const q = await db.quote.findFirst({ where: { id, studioId: user.studioId } });
  if (!q) throw new Error("Quote not found");
  if (q.status === "ACCEPTED") throw new Error("Accepted quotes can't be edited");
  const data = await fields(fd, user.studioId);
  await db.$transaction([
    db.quoteItem.deleteMany({ where: { quoteId: id } }),
    db.quote.update({ where: { id }, data: { ...data, items: { create: items.map((it, i) => ({ ...it, sortOrder: i })) } } }),
  ]);
  revalidatePath(`/quotes/${id}`);
}

/** Emails the quote link to the client and marks it sent, using the subject and message as reviewed on the page. */
async function emailQuote(fd: FormData) {
  const user = await requireRole("ADMIN");
  const q = await db.quote.findFirst({ where: { id: req(fd, "id"), studioId: user.studioId } });
  if (!q) throw new Error("Quote not found");
  const result = await sendQuoteEmail(q.id, user.id, reviewed(fd));
  revalidatePath(`/quotes/${q.id}`);
  redirect(`/quotes/${q.id}${emailFlash(result, result.to)}`);
}

async function setQuoteStatus(fd: FormData) {
  const user = await requireRole("ADMIN");
  const id = req(fd, "id");
  const status = req(fd, "status") as QuoteStatus;
  if (!["DRAFT", "SENT", "DECLINED", "EXPIRED"].includes(status)) throw new Error("Unknown status");
  await db.quote.updateMany({ where: { id, studioId: user.studioId }, data: { status } });
  if (status === "SENT") await db.quote.updateMany({ where: { id, studioId: user.studioId, sentAt: null }, data: { sentAt: new Date() } });
  revalidatePath(`/quotes/${id}`);
}

async function convertQuote(fd: FormData) {
  const user = await requireRole("ADMIN");
  const q = await db.quote.findFirst({ where: { id: req(fd, "id"), studioId: user.studioId } });
  if (!q) throw new Error("Quote not found");
  const { invoice, created } = await invoiceFromQuote(q.id);
  if (created) {
    if (q.status !== "ACCEPTED") await db.quote.update({ where: { id: q.id }, data: { status: "ACCEPTED", acceptedAt: q.acceptedAt ?? new Date() } });
    await logActivity({ studioId: user.studioId, userId: user.id, entityType: "invoice", entityId: invoice.id, action: "created", summary: `Converted quote ${q.number} to invoice ${invoice.number}` });
  }
  redirect(`/invoices/${invoice.id}`);
}

async function deleteQuote(fd: FormData) {
  const user = await requireRole("ADMIN");
  await db.quote.deleteMany({ where: { id: req(fd, "id"), studioId: user.studioId, invoice: null } });
  redirect("/quotes");
}

// Thrown errors show as a message on the page instead of a crash screen.
const createQuoteAction = safe(createQuote);
const updateQuoteAction = safe(updateQuote);
const emailQuoteAction = safe(emailQuote);
const setQuoteStatusAction = safe(setQuoteStatus);
const convertQuoteAction = safe(convertQuote);
const deleteQuoteAction = safe(deleteQuote);
export { createQuoteAction as createQuote, updateQuoteAction as updateQuote, emailQuoteAction as emailQuote, setQuoteStatusAction as setQuoteStatus, convertQuoteAction as convertQuote, deleteQuoteAction as deleteQuote };
