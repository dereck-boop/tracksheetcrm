import { db } from "./db";
import { fullName } from "./format";

/**
 * Folds the duplicate contact into the one being kept: every booking, project, quote,
 * invoice, note, to-do and band membership moves over, blank details are filled
 * in from the duplicate, and the duplicate is deleted.
 */
export async function mergeContacts(studioId: string, keepId: string, dupId: string) {
  if (keepId === dupId) throw new Error("Pick a different contact to merge");
  const [keep, dup] = await Promise.all([
    db.contact.findFirst({ where: { id: keepId, studioId } }),
    db.contact.findFirst({ where: { id: dupId, studioId } }),
  ]);
  if (!keep || !dup) throw new Error("Contact not found");

  await db.$transaction(async (tx) => {
    for (const m of await tx.artistMember.findMany({ where: { contactId: dupId } })) {
      const existing = await tx.artistMember.findUnique({ where: { artistId_contactId: { artistId: m.artistId, contactId: keepId } } });
      if (!existing) await tx.artistMember.create({ data: { artistId: m.artistId, contactId: keepId, role: m.role } });
      else if (!existing.role && m.role) await tx.artistMember.update({ where: { artistId_contactId: { artistId: m.artistId, contactId: keepId } }, data: { role: m.role } });
    }
    await tx.artistMember.deleteMany({ where: { contactId: dupId } });

    const move = { where: { contactId: dupId }, data: { contactId: keepId } };
    await tx.booking.updateMany(move);
    await tx.quote.updateMany(move);
    await tx.invoice.updateMany(move);
    await tx.note.updateMany(move);
    await tx.task.updateMany(move);
    await tx.project.updateMany({ where: { clientId: dupId }, data: { clientId: keepId } });
    await tx.activity.updateMany({ where: { studioId, entityType: "contact", entityId: dupId }, data: { entityId: keepId } });

    // Free the duplicate's unique portal link before it can move over.
    await tx.contact.update({ where: { id: dupId }, data: { portalToken: null } });
    await tx.contact.update({
      where: { id: keepId },
      data: {
        lastName: keep.lastName ?? dup.lastName,
        email: keep.email ?? dup.email,
        phone: keep.phone ?? dup.phone,
        role: keep.role ?? dup.role,
        stripeCustomerId: keep.stripeCustomerId ?? dup.stripeCustomerId,
        portalToken: keep.portalToken ?? dup.portalToken,
        source: keep.source ?? dup.source,
        notes: [keep.notes, dup.notes].filter(Boolean).join("\n\n") || null,
        tags: [...new Set([...keep.tags, ...dup.tags])],
      },
    });
    await tx.contact.delete({ where: { id: dupId } });
  });
  return { keep, dupName: fullName(dup) };
}

/** Rough "is this probably the same person" score for ordering merge candidates (lower = closer). */
export function nameDistance(a: string, b: string) {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array<number>(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0]![j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
  return d[x.length]![y.length]!;
}
