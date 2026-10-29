import { db } from "./db";
import { logActivity } from "./activity";
import { EMAIL_TEMPLATES, type TemplateKey } from "./emailTemplates";
import { render } from "./renderTemplate";

/**
 * Outgoing email via Resend's HTTP API (no SDK needed). Set RESEND_API_KEY and EMAIL_FROM
 * (e.g. "Your Studio <studio@yourstudio.com>"); without them emails are skipped.
 */
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export type SendResult = { sent: boolean; error?: string };

// Resend allows about 2 sends a second, and the daily job sends back to back: space them out.
const GAP_MS = 550;
let nextSendAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitTurn() {
  const now = Date.now();
  const at = Math.max(now, nextSendAt);
  nextSendAt = at + GAP_MS;
  if (at > now) await sleep(at - now);
}

export async function sendEmail(msg: { to: string; subject: string; text: string; replyTo?: string | null; attachments?: { filename: string; content: Buffer }[] }): Promise<SendResult> {
  if (!emailConfigured()) {
    console.log(`[email skipped: not configured] to=${msg.to} subject=${msg.subject}`);
    return { sent: false, error: "Email is not set up" };
  }
  // Sample data uses @example.com addresses; sending to them would only bounce.
  if (/@example\.(com|org|net)$/i.test(msg.to.trim())) {
    console.log(`[email skipped: sample address] to=${msg.to} subject=${msg.subject}`);
    return { sent: false, error: "That's a sample (@example.com) address" };
  }
  try {
    // A busy moment (429) or a hiccup at Resend (5xx) gets two more tries before giving up.
    for (let attempt = 0; ; attempt++) {
      await waitTurn();
      const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: toHtml(msg.text),
          ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
          ...(msg.attachments?.length ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) } : {}),
        }),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const error = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
        console.error(error);
        return { sent: false, error };
      }
      return { sent: true };
    }
  } catch (e) {
    console.error("Email send failed", e);
    return { sent: false, error: (e as Error).message };
  }
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text to simple HTML: paragraphs, line breaks and clickable links. */
function toHtml(text: string) {
  const body = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:560px">${body}</div>`;
}

export { render };

/** The studio's version of a template, falling back to the built-in default. */
export async function getTemplate(studioId: string, key: TemplateKey) {
  const row = await db.emailTemplate.findUnique({ where: { studioId_key: { studioId, key } } });
  const def = EMAIL_TEMPLATES[key];
  return { key, subject: row?.subject ?? def.subject, body: row?.body ?? def.body, enabled: row?.enabled ?? true };
}

/** The fill-ins every template can use: studio name, sign-off, email and phone. */
export async function studioVars(studioId: string) {
  const studio = await db.studio.findUnique({ where: { id: studioId } });
  return { studio_name: studio?.name, sign_off: studio?.emailSignOff || studio?.name, studio_email: studio?.email, studio_phone: studio?.phone };
}

/**
 * Sends a client-facing template email and logs it on the record's activity feed.
 * Never throws: a failed email must not break the action that triggered it.
 */
export async function sendTemplate(opts: {
  studioId: string;
  key: TemplateKey;
  to: string | null | undefined;
  vars: Record<string, string | null | undefined>;
  entity?: { type: string; id: string };
  userId?: string | null;
  /** Subject and message as reviewed and edited on the page; sent as written, even if the template is turned off. */
  override?: { subject: string; text: string } | null;
}): Promise<SendResult> {
  try {
    if (!opts.to) return { sent: false, error: "No email address" };
    const [tpl, studio] = await Promise.all([getTemplate(opts.studioId, opts.key), db.studio.findUnique({ where: { id: opts.studioId } })]);
    if (!tpl.enabled && !opts.override) return { sent: false, error: "Template is turned off" };
    const vars = { studio_name: studio?.name, sign_off: studio?.emailSignOff || studio?.name, studio_email: studio?.email, studio_phone: studio?.phone, ...opts.vars };
    const { subject, text } = opts.override ?? { subject: render(tpl.subject, vars), text: render(tpl.body, vars) };
    const result = await sendEmail({ to: opts.to, subject, text, replyTo: studio?.email });
    if (result.sent && opts.entity) {
      await logActivity({
        studioId: opts.studioId,
        userId: opts.userId,
        entityType: opts.entity.type,
        entityId: opts.entity.id,
        action: "emailed",
        summary: `Emailed ${opts.to}: ${EMAIL_TEMPLATES[opts.key].label}`,
      });
    }
    return result;
  } catch (e) {
    console.error("sendTemplate failed", e);
    return { sent: false, error: (e as Error).message };
  }
}

/** Internal heads-up to the studio inbox (not templated). */
export async function notifyStudio(studioId: string, subject: string, text: string, to?: string | null) {
  try {
    const studio = await db.studio.findUnique({ where: { id: studioId } });
    const address = to || studio?.email;
    if (!address) return { sent: false, error: "No studio email" };
    return await sendEmail({ to: address, subject, text });
  } catch (e) {
    console.error("notifyStudio failed", e);
    return { sent: false, error: (e as Error).message };
  }
}
