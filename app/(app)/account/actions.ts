"use server";
import { safe } from "@/lib/safeAction";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, endAllSessions, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { checkCode, newRecoveryCodes, newSecret, openSecret, sealSecret } from "@/lib/totp";

async function changePassword(_: string | null, fd: FormData) {
  const user = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return "Current password is incorrect.";
  if (next.length < 10) return "Use a new password of at least 10 characters.";
  if (next !== String(fd.get("confirm") ?? "")) return "New passwords don't match.";
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  // A new password signs out every other device; this one stays signed in.
  const v = await endAllSessions(user.id);
  await createSession({ userId: user.id, studioId: user.studioId, role: user.role, v });
  return "Password updated. Any other devices have been signed out.";
}

/** "Sign out everywhere": ends every session for this account, including this one. */
async function signOutEverywhere() {
  const user = await requireUser();
  await endAllSessions(user.id);
  redirect("/login");
}

export type TwoStepState = { error?: string; codes?: string[] } | null;

/** Step 1 of turning on two-step login: a new secret, not active until a code from it is entered. */
async function startTwoStepSetup() {
  const user = await requireUser();
  if (user.totpEnabledAt) return;
  await db.user.update({ where: { id: user.id }, data: { totpSecret: sealSecret(newSecret()) } });
  revalidatePath("/account");
}

async function confirmTwoStep(_: TwoStepState, fd: FormData): Promise<TwoStepState> {
  const user = await requireUser();
  if (!user.totpSecret) return { error: "Start again: click Turn on two-step login." };
  if (!checkCode(openSecret(user.totpSecret), String(fd.get("code") ?? ""))) return { error: "That code didn't match. Type the newest 6 digits from the app." };
  const { plain, hashed } = await newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: user.totpEnabledAt ?? new Date(), recoveryCodes: hashed } });
  return { codes: plain };
}

async function newBackupCodes(_: TwoStepState, fd: FormData): Promise<TwoStepState> {
  const user = await requireUser();
  if (!user.totpSecret || !user.totpEnabledAt) return { error: "Two-step login is off." };
  if (!checkCode(openSecret(user.totpSecret), String(fd.get("code") ?? ""))) return { error: "That code didn't match." };
  const { plain, hashed } = await newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { recoveryCodes: hashed } });
  return { codes: plain };
}

async function turnOffTwoStep(_: TwoStepState, fd: FormData): Promise<TwoStepState> {
  const user = await requireUser();
  if (!(await verifyPassword(String(fd.get("password") ?? ""), user.passwordHash))) return { error: "Password is incorrect." };
  await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] } });
  revalidatePath("/account");
  return null;
}

// Thrown errors show as a message on the page instead of a crash screen.
const changePasswordAction = safe(changePassword);
const startTwoStepSetupAction = safe(startTwoStepSetup);
const confirmTwoStepAction = safe(confirmTwoStep);
const newBackupCodesAction = safe(newBackupCodes);
const turnOffTwoStepAction = safe(turnOffTwoStep);
const signOutEverywhereAction = safe(signOutEverywhere);
export { signOutEverywhereAction as signOutEverywhere, changePasswordAction as changePassword, startTwoStepSetupAction as startTwoStepSetup, confirmTwoStepAction as confirmTwoStep, newBackupCodesAction as newBackupCodes, turnOffTwoStepAction as turnOffTwoStep };
