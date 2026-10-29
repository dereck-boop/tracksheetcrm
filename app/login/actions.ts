"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, endTwoStep, LOCK_MINUTES, loginFailed, pendingTwoStep, startTwoStep, verifyPassword } from "@/lib/auth";
import { matchStep, openSecret, redeemRecoveryCode } from "@/lib/totp";
import { allow, clientIp, HOUR } from "@/lib/rateLimit";

const LOCKED = `Too many wrong tries. For safety, sign-in is paused for ${LOCK_MINUTES} minutes.`;
const isLocked = (u: { lockedUntil: Date | null }) => Boolean(u.lockedUntil && u.lockedUntil > new Date());

async function login(_: string | null, fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  // Guessing across many accounts from one place is limited too.
  if (!(await allow(`login:ip:${await clientIp()}`, 30, HOUR))) return "Too many sign-in attempts from here. Please wait an hour and try again.";
  const user = await db.user.findUnique({ where: { email } });
  if (user && isLocked(user)) return LOCKED;
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    if (user && (await loginFailed(user.id))) return LOCKED;
    return "Email or password is incorrect.";
  }
  if (user.totpEnabledAt && user.totpSecret) {
    await startTwoStep(user.id);
    redirect("/login/verify");
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await createSession({ userId: user.id, studioId: user.studioId, role: user.role, v: user.sessionVersion });
  redirect("/dashboard");
}

/**
 * Second step: the 6-digit code from the authenticator app, or one of the backup codes. Wrong codes
 * count toward the same lock as wrong passwords (kept on the account, not in the browser), and a
 * code that already signed in once can't be used again.
 */
async function verifyTwoStep(_: string | null, fd: FormData) {
  const pending = await pendingTwoStep();
  if (!pending) redirect("/login");
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active || !user.totpSecret) redirect("/login");
  if (isLocked(user)) {
    await endTwoStep();
    return LOCKED;
  }
  const code = String(fd.get("code") ?? "").trim();
  const step = matchStep(openSecret(user.totpSecret), code);
  let ok = step !== null && step > (user.totpLastStep ?? -1);
  if (ok) await db.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
  if (!ok && code.replace(/[\s-]/g, "").length === 8) {
    const left = await redeemRecoveryCode(user.recoveryCodes, code);
    if (left) {
      await db.user.update({ where: { id: user.id }, data: { recoveryCodes: left } });
      ok = true;
    }
  }
  if (!ok) {
    if (await loginFailed(user.id)) {
      await endTwoStep();
      return LOCKED;
    }
    return "That code didn't work. Check your app and try the newest code.";
  }
  await endTwoStep();
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await createSession({ userId: user.id, studioId: user.studioId, role: user.role, v: user.sessionVersion });
  redirect("/dashboard");
}

async function logout() {
  await destroySession();
  redirect("/login");
}

// Thrown errors show as a message on the page instead of a crash screen.
const loginAction = safe(login);
const verifyTwoStepAction = safe(verifyTwoStep);
const logoutAction = safe(logout);
export { loginAction as login, verifyTwoStepAction as verifyTwoStep, logoutAction as logout };
