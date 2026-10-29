import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { seal, unseal } from "./secrets";

/** Two-step login codes (TOTP, RFC 6238): the 6 digits an authenticator app shows, new every 30 seconds. */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string) {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/[\s=]/g, "").toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(randomBytes(20));

export function codeAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** The 30-second step a code belongs to if it matches now or 30 seconds either side (phone clocks drift), else null. */
export function matchStep(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return null;
  const step = Math.floor(now / 30_000);
  const d = [-1, 0, 1].find((d) => timingSafeEqual(Buffer.from(codeAt(secret, step + d)), Buffer.from(c)));
  return d === undefined ? null : step + d;
}

/** True if the code matches now or 30 seconds either side. */
export const checkCode = (secret: string, code: string, now = Date.now()) => matchStep(secret, code, now) !== null;

export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

export const sealSecret = (secret: string) => seal("totp", secret);
export const openSecret = (sealed: string) => unseal("totp", sealed);

/** Ten one-time backup codes like 7KQ4-M2XD, for when the phone is lost. Stored hashed. */
export async function newRecoveryCodes() {
  const plain = Array.from({ length: 10 }, () => base32(randomBytes(5)).replace(/(.{4})/, "$1-"));
  return { plain, hashed: await Promise.all(plain.map((c) => bcrypt.hash(c.replace("-", ""), 10))) };
}

/** The hashed codes left after using one, or null if the code doesn't match any. */
export async function redeemRecoveryCode(hashed: string[], code: string) {
  const c = code.replace(/[\s-]/g, "").toUpperCase();
  if (c.length !== 8) return null;
  for (let i = 0; i < hashed.length; i++) if (await bcrypt.compare(c, hashed[i]!)) return hashed.filter((_, j) => j !== i);
  return null;
}
