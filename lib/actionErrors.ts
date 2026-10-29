/**
 * The message a person should see for an error thrown in a server action. Our own checks throw
 * plain Errors written for people ("Add at least one line item"); anything else (database, Stripe,
 * a bug) gets a general message instead of technical details.
 */
export function friendlyMessage(e: unknown) {
  if (e instanceof Error && e.constructor === Error && e.message) return e.message.slice(0, 300);
  return "Something went wrong. Please try again, and if it keeps happening let the studio know.";
}

/** The page the form was sent from, with ?error=<message>, so it can show what went wrong. */
export function withError(referer: string | null, host: string | null, message: string) {
  let target = "/dashboard";
  try {
    if (referer) {
      const u = new URL(referer);
      if (!host || u.host === host) {
        u.searchParams.delete("error");
        u.searchParams.set("error", message);
        target = `${u.pathname}${u.search}`;
      }
    }
  } catch {
    // A malformed referer just falls back to the dashboard.
  }
  if (target === "/dashboard") target = `/dashboard?error=${encodeURIComponent(message)}`;
  return target;
}
