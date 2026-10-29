import { db } from "./db";
import { sendEmail } from "./email";
import { appUrl } from "./stripe";

// The same failure repeating (a broken page reloaded, a retried webhook) sends one email, not dozens.
const QUIET_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();

/**
 * Emails the studio when something fails on the live site, so problems don't sit unnoticed in
 * the Vercel logs. Goes to ALERT_EMAIL if set, else the studio email. Never throws.
 */
export async function reportError(where: string, error: unknown) {
  try {
    if (process.env.NODE_ENV !== "production") return;
    const message = error instanceof Error ? error.message : String(error);
    const key = `${where}:${message.slice(0, 120)}`;
    const now = Date.now();
    if (now - (lastSent.get(key) ?? 0) < QUIET_MS) return;
    lastSent.set(key, now);
    const to = process.env.ALERT_EMAIL || (await db.studio.findFirst({ select: { email: true } }))?.email;
    if (!to) return;
    const stack = error instanceof Error && error.stack ? `\n\n${error.stack.split("\n").slice(0, 8).join("\n")}` : "";
    await sendEmail({
      to,
      subject: `TrackSheet CRM error: ${where}`.slice(0, 150),
      text: `Something failed on ${appUrl()}.\n\nWhere: ${where}\nWhat: ${message}${stack}\n\nThe full details are in Vercel > studio-crm > Logs. This alert won't repeat for the same error for 30 minutes.`,
    });
  } catch {
    // An alert must never cause a second failure.
  }
}
