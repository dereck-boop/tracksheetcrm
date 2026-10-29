import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Secrets kept in the database (two-step login keys) are encrypted with a
// key made from AUTH_SECRET, so a copy of the database alone can't be used to get in.
const key = (purpose: string) => createHash("sha256").update(`${purpose}:${process.env.AUTH_SECRET ?? ""}`).digest();

export function seal(purpose: string, plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function unseal(purpose: string, sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unreadable stored secret");
  const d = createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
