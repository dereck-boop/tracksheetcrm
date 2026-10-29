import { parseCsvObjects } from "./csv";

export type ImportRow = { firstName: string; lastName: string | null; email: string | null };
export type SkipReason = "existing" | "duplicate" | "yours" | "noName";
export type ImportPlan = { create: ImportRow[]; skipped: Record<SkipReason, number> };

// Header spellings accepted for each field, compared lowercase with spaces/underscores removed.
const FIRST = ["firstname", "first", "givenname"];
const LAST = ["lastname", "last", "surname", "familyname"];
const EMAIL = ["email", "emailaddress", "e-mail"];
const NAME = ["name", "fullname", "contactname"];

function pick(row: Record<string, string>, names: string[]): string {
  for (const [k, v] of Object.entries(row)) {
    if (names.includes(k.toLowerCase().replace(/[\s_]/g, ""))) return v.trim();
  }
  return "";
}

/**
 * Maps a contacts CSV (first name, last name, email) to new contacts. Skips emails already in
 * the CRM, repeats within the file (first one wins), and the studio's own addresses.
 */
export function planContactImport(csv: string, existingEmails: Iterable<string>, ownEmails: Iterable<string>): ImportPlan {
  const seen = new Set([...existingEmails].map((e) => e.toLowerCase()));
  const own = new Set([...ownEmails].map((e) => e.toLowerCase()));
  const plan: ImportPlan = { create: [], skipped: { existing: 0, duplicate: 0, yours: 0, noName: 0 } };
  const inFile = new Set<string>();
  for (const row of parseCsvObjects(csv)) {
    let first = pick(row, FIRST);
    let last = pick(row, LAST);
    if (!first && !last) {
      // Only a single "Name" column: first word is the first name, the rest the last name.
      const [head = "", ...rest] = pick(row, NAME).split(/\s+/).filter(Boolean);
      first = head;
      last = rest.join(" ");
    }
    const email = pick(row, EMAIL).toLowerCase() || null;
    if (!first) { if (!last) { plan.skipped.noName++; continue; } first = last; last = ""; }
    if (email && own.has(email)) { plan.skipped.yours++; continue; }
    if (email && inFile.has(email)) { plan.skipped.duplicate++; continue; }
    if (email && seen.has(email)) { plan.skipped.existing++; continue; }
    if (email) inFile.add(email);
    plan.create.push({ firstName: first, lastName: last || null, email });
  }
  return plan;
}
