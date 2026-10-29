import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { reportError } from "./alerts";
import { friendlyMessage, withError } from "./actionErrors";

export { friendlyMessage };

/**
 * Wraps a server action so a thrown error shows up as a message on the same page instead of
 * Next.js's "This page couldn't load" screen (which hides the message in production).
 * redirect() and notFound() still work as usual.
 */
export function safe<A extends unknown[], R>(fn: (...args: A) => Promise<R>, name = fn.name) {
  return async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e);
      const message = friendlyMessage(e);
      // Our own "please fill in…" checks are expected; anything else is a real failure worth an alert.
      if (!(e instanceof Error && e.constructor === Error)) {
        console.error(`Action ${name} failed`, e);
        await reportError(`Action ${name} failed`, e).catch(() => {});
      }
      const h = await headers();
      redirect(withError(h.get("referer"), h.get("host"), message));
    }
  };
}
