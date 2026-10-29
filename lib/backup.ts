import { gzipSync } from "zlib";
import { db } from "./db";

/**
 * Full copies of a studio's data. Every table is listed in restore order (a row only points at rows
 * listed before it), with how to find this studio's rows. Passwords and two-step login secrets are
 * left out, so a backup file can't be used to sign in.
 */
type Scope = "id" | "studio" | Record<string, unknown>;
const viaProject = (studioId: string) => ({ project: { studioId } });
export const BACKUP_TABLES: [model: string, where: (studioId: string) => Scope][] = [
  ["studio", () => "id"],
  ["user", () => "studio"],
  ["contact", () => "studio"],
  ["artist", () => "studio"],
  ["artistMember", (s) => ({ artist: { studioId: s } })],
  ["room", () => "studio"],
  ["bookingType", () => "studio"],
  ["bookingSeries", () => "studio"],
  ["service", () => "studio"],
  ["project", () => "studio"],
  ["event", () => "studio"],
  ["quote", () => "studio"],
  ["quoteItem", (s) => ({ quote: { studioId: s } })],
  ["invoice", () => "studio"],
  ["invoiceItem", (s) => ({ invoice: { studioId: s } })],
  ["invoiceView", (s) => ({ invoice: { studioId: s } })],
  ["payment", () => "studio"],
  ["milestone", viaProject],
  ["track", viaProject],
  ["booking", () => "studio"],
  ["task", () => "studio"],
  ["activity", () => "studio"],
  ["note", () => "studio"],
  ["emailTemplate", () => "studio"],
  ["notification", () => "studio"],
];

/** Fields never written to a backup. */
export const SECRET_FIELDS: Record<string, string[]> = {
  user: ["passwordHash", "totpSecret", "recoveryCodes"],
};

type Delegate = { findMany: (args: object) => Promise<Record<string, unknown>[]> };
const delegate = (model: string) => (db as unknown as Record<string, Delegate>)[model]!;

/** Values JSON can't hold as-is: big numbers and file contents. Dates and decimals become strings. */
function encode(v: unknown): unknown {
  if (typeof v === "bigint") return { $bigint: v.toString() };
  if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString("base64") };
  return v;
}

export async function exportStudio(studioId: string) {
  const tables: Record<string, unknown[]> = {};
  for (const [model, where] of BACKUP_TABLES) {
    const scope = where(studioId);
    const rows = await delegate(model).findMany({ where: scope === "id" ? { id: studioId } : scope === "studio" ? { studioId } : scope });
    const hidden = SECRET_FIELDS[model] ?? [];
    tables[model] = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !hidden.includes(k)).map(([k, v]) => [k, encode(v)])));
  }
  return { app: "tracksheet-crm", version: 1, exportedAt: new Date().toISOString(), tables };
}

export const backupFileName = (studioSlug: string, gz: boolean) => `${studioSlug}-backup-${new Date().toISOString().slice(0, 10)}.json${gz ? ".gz" : ""}`;

/** The backup and the same as gzipped JSON (small enough to email). */
export async function buildBackup(studioId: string) {
  const data = await exportStudio(studioId);
  return { data, gz: gzipSync(Buffer.from(JSON.stringify(data))) };
}

/** How many rows of the main kinds a backup holds, for the email and the settings page. */
export function backupSummary(b: Awaited<ReturnType<typeof exportStudio>>) {
  const n = (k: string) => b.tables[k]?.length ?? 0;
  return `${n("contact")} contacts, ${n("booking")} bookings, ${n("project")} projects, ${n("invoice")} invoices and ${n("payment")} payments`;
}

/**
 * Emails a backup to the studio's owners and stamps lastBackupAt.
 * Never throws.
 */
export async function emailBackup(studioId: string) {
  try {
    const { sendEmail } = await import("./email");
    const [studio, owners] = await Promise.all([
      db.studio.findUniqueOrThrow({ where: { id: studioId } }),
      db.user.findMany({ where: { studioId, role: "OWNER", active: true }, select: { email: true } }),
    ]);
    const to = [...new Set(owners.map((o) => o.email))];
    if (!to.length) return { sent: false, error: "No owner to send it to" };
    const { data, gz } = await buildBackup(studioId);
    let sent = 0;
    let error: string | undefined;
    for (const address of to) {
      const r = await sendEmail({
        to: address,
        subject: `${studio.name} TrackSheet backup, ${new Date().toISOString().slice(0, 10)}`,
        text: `Your weekly TrackSheet CRM backup is attached (${backupSummary(data)}).\n\nKeep these emails: each one is a full copy of your clients, bookings, projects, invoices and payments. If the database were ever lost or wiped, this file can be loaded into a fresh one (see "Restore from a backup" in the setup guide).`,
        attachments: [{ filename: backupFileName(studio.slug, true), content: gz }],
      });
      if (r.sent) sent++;
      else error = r.error;
    }
    if (sent) await db.studio.update({ where: { id: studioId }, data: { lastBackupAt: new Date() } });
    return { sent: sent > 0, error };
  } catch (e) {
    console.error("emailBackup failed", e);
    return { sent: false, error: (e as Error).message };
  }
}
