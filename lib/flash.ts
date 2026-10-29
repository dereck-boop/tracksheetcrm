import type { SendResult } from "./email";

/** Query string reporting an email result back to the page that sent it. */
export function emailFlash(result: SendResult, to: string | null | undefined) {
  return result.sent ? `?emailed=${encodeURIComponent(to ?? "")}` : `?email_error=${encodeURIComponent(result.error ?? "unknown error")}`;
}

/** The subject and message as reviewed and edited in an email preview, if the form sent them. */
export function reviewed(fd: FormData) {
  const subject = String(fd.get("subject") ?? "").trim();
  const text = String(fd.get("body") ?? "").trim();
  return subject && text ? { subject, text } : null;
}
