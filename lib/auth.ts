import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";

const COOKIE = "studio_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

/** v is the account's sessionVersion when signed in; "Sign out everywhere" bumps it so older sessions stop working. */
export type Session = { userId: string; studioId: string; role: Role; v?: number };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(s: Session) {
  const token = await new SignJWT(s)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

/** The signed-in user, or null if there's no session or it has ended (deactivated, signed out everywhere). */
export async function currentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.userId }, include: { studio: true } });
  if (!user || !user.active || (session.v ?? 0) !== user.sessionVersion) return null;
  return user;
}

/** Current signed-in user, or redirect to /login. Use in every app page and action. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Ends every session for this account on every device (the current one too, unless it's signed in again). */
export async function endAllSessions(userId: string) {
  const u = await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  return u.sessionVersion;
}

// Sign-in protection: after this many wrong passwords or codes in a row, the account waits a while.
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Counts a wrong password or code; the fifth in a row locks sign-in for 15 minutes. */
export async function loginFailed(userId: string) {
  const u = await db.user.update({ where: { id: userId }, data: { failedLogins: { increment: 1 } } });
  if (u.failedLogins >= MAX_FAILED_LOGINS) {
    await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } });
    return true;
  }
  return false;
}

const RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, ENGINEER: 2, ASSISTANT: 1 };

/** Money pages (invoices, quotes, expenses, reports, tax) are for owners and admins, not engineers or assistants. */
export const MONEY_ROLE: Role = "ADMIN";
export const canSeeMoney = (role: Role) => RANK[role] >= RANK[MONEY_ROLE];

/** For pages: someone without the role goes to the dashboard with a note, instead of an error screen. */
export async function requireRolePage(min: Role) {
  const user = await requireUser();
  if (RANK[user.role] < RANK[min]) redirect(`/dashboard?error=${encodeURIComponent("That page is only for the studio owner and admins.")}`);
  return user;
}

export async function requireRole(min: Role) {
  const user = await requireUser();
  if (RANK[user.role] < RANK[min]) throw new Error("You don't have permission to do that.");
  return user;
}

// Two-step login: after the password, a short-lived "half signed in" cookie, signed with a
// different key so it can never pass as a real session.
const PENDING = "studio_2fa";
const pendingKey = () => new Uint8Array([...secret(), ...new TextEncoder().encode(":two-step")]);

export async function startTwoStep(userId: string) {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(pendingKey());
  (await cookies()).set(PENDING, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/login", maxAge: 600 });
}

export async function pendingTwoStep(): Promise<{ userId: string } | null> {
  const token = (await cookies()).get(PENDING)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, pendingKey());
    return { userId: String(payload.userId) };
  } catch {
    return null;
  }
}

export async function endTwoStep() {
  (await cookies()).delete({ name: PENDING, path: "/login" });
}
