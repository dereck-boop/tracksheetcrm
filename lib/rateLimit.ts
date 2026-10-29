import { headers } from "next/headers";
import { db } from "./db";

/** The visitor's IP address as Vercel reports it, or "unknown". */
export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Counts one use of `key` and says whether it is still within `limit` uses per `windowMs`.
 * Backed by the database so it holds across Vercel's many server instances.
 */
export async function allow(key: string, limit: number, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const used = await db.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
  if (used >= limit) return false;
  await db.rateLimitHit.create({ data: { key } });
  return true;
}

/** Checks several limits at once; every one must allow it. */
export async function allowAll(limits: [key: string, limit: number, windowMs: number][]) {
  for (const [key, limit, windowMs] of limits) if (!(await allow(key, limit, windowMs))) return false;
  return true;
}

/** Clears hits older than a day (the longest window used). Run by the daily job. */
export function pruneRateLimits() {
  return db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 864e5) } } });
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
