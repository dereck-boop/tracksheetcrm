/**
 * Loads a backup file (from the weekly email or "Download everything") into an EMPTY database.
 *
 *   DATABASE_URL="postgresql://…" npx prisma migrate deploy
 *   DATABASE_URL="postgresql://…" npx tsx scripts/restore-backup.ts my-studio-backup-2026-10-26.json.gz
 *
 * Backups don't hold passwords, so every team member gets the temporary password printed at the end.
 */
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { BACKUP_TABLES } from "../lib/backup";

// Fields pointing at a row of the same table: written after every row exists.
const SELF_REFS: Record<string, string[]> = { invoice: ["depositAppliedToId"] };

function decode(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.$bigint === "string") return BigInt(o.$bigint);
    if (typeof o.$bytes === "string") return Buffer.from(o.$bytes, "base64");
  }
  return v;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npx tsx scripts/restore-backup.ts <backup.json or backup.json.gz>");
  const raw = readFileSync(file);
  const backup = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8")) as { app: string; tables: Record<string, Record<string, unknown>[]> };
  if (backup.app !== "tracksheet-crm") throw new Error("That file isn't a TrackSheet CRM backup");

  const db = new PrismaClient();
  if ((await db.studio.count()) > 0) throw new Error("This database already has a studio in it. Restore into an empty database.");
  const temp = randomBytes(9).toString("base64url");
  const hash = await bcrypt.hash(temp, 12);
  const model = (m: string) => (db as unknown as Record<string, { createMany: (a: object) => Promise<unknown>; update: (a: object) => Promise<unknown> }>)[m]!;

  for (const [name] of BACKUP_TABLES) {
    const rows = (backup.tables[name] ?? []).map((r) => {
      const row = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, decode(v)]));
      for (const f of SELF_REFS[name] ?? []) row[f] = null;
      if (name === "user") Object.assign(row, { passwordHash: hash, totpEnabledAt: null });
      return row;
    });
    for (let i = 0; i < rows.length; i += 500) await model(name).createMany({ data: rows.slice(i, i + 500) });
    for (const r of backup.tables[name] ?? []) {
      const refs = Object.fromEntries((SELF_REFS[name] ?? []).filter((f) => r[f]).map((f) => [f, r[f]]));
      if (Object.keys(refs).length) await model(name).update({ where: { id: r.id }, data: refs });
    }
    if (rows.length) console.log(`${name}: ${rows.length}`);
  }
  await db.$disconnect();
  console.log(`\nRestored. Everyone signs in with the temporary password ${temp} and changes it under their name (bottom left).`);
  console.log("Two-step login and the Google Calendar, Instagram and YouTube connections need setting up again.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
