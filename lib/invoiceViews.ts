import "server-only";
import { headers } from "next/headers";
import { getSession } from "./auth";
import { db } from "./db";

// Link scanners and preview fetchers (mail security, chat unfurls) aren't the client reading it.
const NOT_A_PERSON = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|proofpoint|mimecast|barracuda|safelinks|python|curl|wget/i;
// Reloads within this window count as the same visit.
const SAME_VISIT_MS = 5 * 60 * 1000;

/** The visitor's user agent when it's a client reading the page: not signed in to the CRM, not a link scanner. */
export async function clientVisitor() {
  if (await getSession()) return null;
  const userAgent = (await headers()).get("user-agent")?.slice(0, 400) || null;
  return userAgent && !NOT_A_PERSON.test(userAgent) ? userAgent : null;
}

/** Since when a reload counts as the same visit. */
export const sameVisitSince = () => new Date(Date.now() - SAME_VISIT_MS);

/** Log that the client opened an invoice's pay page. Skips anyone signed in to the CRM. */
export async function recordInvoiceView(invoiceId: string) {
  const userAgent = await clientVisitor();
  if (!userAgent) return;
  const recent = await db.invoiceView.findFirst({
    where: { invoiceId, viewedAt: { gte: sameVisitSince() } },
    select: { id: true },
  });
  if (recent) return;
  await db.invoiceView.create({ data: { invoiceId, userAgent } });
}

/** "iPhone", "Android", "Mac", "Windows"… from a user agent, for the private view history. */
export function deviceName(ua: string | null) {
  if (!ua) return "Unknown device";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other device";
}
