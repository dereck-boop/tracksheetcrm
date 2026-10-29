import { randomBytes } from "crypto";
import { db } from "./db";
import { appUrl } from "./stripe";

/** The client's private page (/c/<token>), creating its token the first time. */
export async function clientPageUrl(contactId: string | null | undefined) {
  if (!contactId) return "";
  const c = await db.contact.findUnique({ where: { id: contactId }, select: { portalToken: true } });
  if (!c) return "";
  let token = c.portalToken;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await db.contact.update({ where: { id: contactId }, data: { portalToken: token } });
  }
  return `${appUrl()}/c/${token}`;
}
