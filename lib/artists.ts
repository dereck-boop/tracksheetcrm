import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient | typeof db;

/** The band/artist with this name (any capitalization), if it's already in Artists. */
export function findArtist(tx: Tx, studioId: string, name: string) {
  return tx.artist.findFirst({ where: { studioId, name: { equals: name.trim(), mode: "insensitive" } } });
}

/** Returns the band/artist with this name, creating it if needed. */
export async function findOrCreateArtist(tx: Tx, studioId: string, name: string, kind = "Artist") {
  return (await findArtist(tx, studioId, name)) ?? tx.artist.create({ data: { studioId, name: name.trim(), kind } });
}

/** Links a person to a band/artist (no-op if already linked, unless a new role is given). */
export async function linkMember(tx: Tx, artistId: string, contactId: string, role?: string | null) {
  await tx.artistMember.upsert({
    where: { artistId_contactId: { artistId, contactId } },
    create: { artistId, contactId, role: role ?? null },
    update: role ? { role } : {},
  });
}
