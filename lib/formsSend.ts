import { db } from "./db";
import { sendTemplate } from "./email";
import { fullName, money } from "./format";
import { splitTotal } from "./forms";
import { appUrl } from "./stripe";

export const splitLink = (token: string) => `${appUrl()}/split/${token}`;
export const releaseLink = (token: string) => `${appUrl()}/release/${token}`;

/**
 * The contact a writer or player most likely is: same email first, else the only contact with
 * exactly that name. Used to fill in PRO, IPI and publisher typed once on the contact.
 */
export async function matchContact(studioId: string, name: string, email: string | null) {
  if (email) {
    const c = await db.contact.findFirst({ where: { studioId, email: { equals: email, mode: "insensitive" } } });
    if (c) return c;
  }
  const [first, ...rest] = name.trim().split(/\s+/);
  if (!first) return null;
  const last = rest.join(" ") || null;
  const found = await db.contact.findMany({
    where: { studioId, firstName: { equals: first, mode: "insensitive" }, lastName: last ? { equals: last, mode: "insensitive" } : null },
    take: 2,
  });
  return found.length === 1 ? found[0]! : null;
}

/**
 * Emails each writer on a song their own link to review and sign the split sheet. Skips anyone
 * already signed or without an email. Returns how many were sent.
 */
export async function sendSplitSheet(trackId: string, userId?: string | null) {
  const t = await db.track.findUniqueOrThrow({ where: { id: trackId }, include: { splits: true, project: { include: { artist: true } } } });
  if (splitTotal(t.splits) !== 100) throw new Error(`The shares add up to ${splitTotal(t.splits)}%. They need to make 100% before sending.`);
  let sent = 0;
  for (const s of t.splits) {
    if (s.signedAt || !s.email) continue;
    const r = await sendTemplate({
      studioId: t.project.studioId,
      key: "split_sheet",
      to: s.email,
      userId,
      entity: { type: "project", id: t.projectId },
      vars: { client_name: s.name.split(" ")[0], song: t.title, artist: t.project.artist?.name ?? t.project.name, link: splitLink(s.token) },
    });
    if (r.sent) {
      await db.trackSplit.update({ where: { id: s.id }, data: { sentAt: new Date() } });
      sent++;
    }
  }
  return sent;
}

/** Emails a session player the link to read and sign their release. */
export async function sendSessionRelease(hireId: string, userId?: string | null) {
  const h = await db.sessionHire.findUniqueOrThrow({ where: { id: hireId }, include: { contact: true, project: { include: { artist: true, client: true } } } });
  if (h.signedAt) throw new Error(`${h.name} has already signed.`);
  const to = h.contact?.email;
  if (!to) throw new Error(`Add an email for ${h.name} on their contact first.`);
  const r = await sendTemplate({
    studioId: h.studioId,
    key: "session_release",
    to,
    userId,
    entity: { type: "project", id: h.projectId },
    vars: {
      client_name: h.contact?.firstName ?? h.name.split(" ")[0],
      project: h.project.name,
      artist: h.project.artist?.name ?? (h.project.client ? fullName(h.project.client) : h.project.name),
      fee: money(h.fee),
      link: releaseLink(h.token),
    },
  });
  if (r.sent) await db.sessionHire.update({ where: { id: h.id }, data: { sentAt: new Date() } });
  return r;
}
