"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { toCents } from "@/lib/format";
import { int, req, str } from "@/lib/form";
import { sendEmail } from "@/lib/email";
import { EMAIL_TEMPLATES, type TemplateKey } from "@/lib/emailTemplates";
import { emailFlash } from "@/lib/flash";
import { appUrl } from "@/lib/stripe";
import { emailBackup } from "@/lib/backup";

async function saveRoom(fd: FormData) {
  const user = await requireRole("ADMIN");
  const id = str(fd, "id");
  const data = {
    name: req(fd, "name", "Name"),
    address: str(fd, "address"),
    description: str(fd, "description"),
    color: str(fd, "color") ?? "#2f7d6d",
    hourlyRate: toCents(fd.get("hourlyRate")),
    dayRate: toCents(fd.get("dayRate")),
    capacity: int(fd, "capacity"),
    active: fd.get("active") !== null || !id,
    onlineBooking: fd.get("onlineBooking") !== null,
  };
  if (id) await db.room.updateMany({ where: { id, studioId: user.studioId }, data });
  else await db.room.create({ data: { ...data, studioId: user.studioId, sortOrder: await db.room.count({ where: { studioId: user.studioId } }) } });
  revalidatePath("/admin/rooms");
}

async function inviteUser(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const role = (str(fd, "role") ?? "ENGINEER") as Role;
  if (role === "OWNER" && admin.role !== "OWNER") throw new Error("Only the owner can add owners");
  const password = req(fd, "password", "Temporary password");
  if (password.length < 10) throw new Error("Temporary password must be at least 10 characters");
  await db.user.create({
    data: {
      studioId: admin.studioId,
      name: req(fd, "name", "Name"),
      email: req(fd, "email", "Email").toLowerCase(),
      role,
      passwordHash: await hashPassword(password),
    },
  });
  revalidatePath("/admin/team");
}

async function setUserActive(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const id = req(fd, "id");
  if (id === admin.id) throw new Error("You can't deactivate yourself");
  await db.user.updateMany({ where: { id, studioId: admin.studioId, role: { not: "OWNER" } }, data: { active: fd.get("active") === "true" } });
  revalidatePath("/admin/team");
}

/** Owner only: clears a team member's two-step login when they've lost their phone and backup codes. */
async function resetTwoStep(fd: FormData) {
  const owner = await requireRole("OWNER");
  await db.user.updateMany({ where: { id: req(fd, "id"), studioId: owner.studioId }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] } });
  revalidatePath("/admin/team");
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** The uploaded logo as a data URL (kept in the database, so no file storage is needed). */
async function logoField(fd: FormData): Promise<{ logoUrl?: string | null }> {
  if (fd.get("removeLogo") !== null) return { logoUrl: null };
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return {};
  if (!LOGO_TYPES.includes(file.type)) throw new Error("Logo must be a PNG, JPG, WebP or SVG image");
  if (file.size > 300_000) throw new Error("Logo must be under 300 KB");
  return { logoUrl: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}` };
}

async function saveStudio(fd: FormData) {
  const user = await requireRole("OWNER");
  const days = (k: string, max: number, d: number) => Math.min(Math.max(int(fd, k) ?? d, 0), max);
  await db.studio.update({
    where: { id: user.studioId },
    data: {
      name: req(fd, "name", "Studio name"),
      email: str(fd, "email"),
      emailSignOff: str(fd, "emailSignOff"),
      phone: str(fd, "phone"),
      address: str(fd, "address"),
      invoicePrefix: str(fd, "invoicePrefix") ?? "INV-",
      quotePrefix: str(fd, "quotePrefix") ?? "Q-",
      depositPercent: int(fd, "depositPercent") ?? 50,
      depositMinimum: toCents(fd.get("depositMinimum")) ?? 0,
      defaultTaxRate: Number(str(fd, "defaultTaxRate") ?? 0),
      invoiceTerms: str(fd, "invoiceTerms"),
      quoteTerms: str(fd, "quoteTerms"),
      paymentInstructions: str(fd, "paymentInstructions"),
      policies: str(fd, "policies"),
      autoInvoiceOnAccept: fd.get("autoInvoiceOnAccept") !== null,
      reminderDaysBefore: days("reminderDaysBefore", 30, 3),
      reminderEveryDays: days("reminderEveryDays", 60, 7),
      lateCancelHours: days("lateCancelHours", 720, 48),
      lateCancelFeePercent: days("lateCancelFeePercent", 100, 0),
      noShowFeePercent: days("noShowFeePercent", 100, 100),
      backupWeekly: fd.get("backupWeekly") !== null,
      ...(await logoField(fd)),
    },
  });
  revalidatePath("/", "layout");
}

async function saveService(fd: FormData) {
  const user = await requireRole("ADMIN");
  const id = str(fd, "id");
  const data = {
    name: req(fd, "name", "Name"),
    description: str(fd, "description"),
    unit: str(fd, "unit") ?? "hour",
    unitPrice: toCents(fd.get("unitPrice")) ?? 0,
    taxable: fd.get("taxable") !== null,
    bookable: fd.get("bookable") !== null,
    active: fd.get("active") !== null || !id,
    onlineBooking: fd.get("onlineBooking") !== null,
    durationMin: int(fd, "durationHours") ? int(fd, "durationHours")! * 60 : null,
    depositPercent: int(fd, "depositPercent"),
  };
  if (id) await db.service.updateMany({ where: { id, studioId: user.studioId }, data });
  else await db.service.create({ data: { ...data, studioId: user.studioId } });
  revalidatePath("/admin/services");
}

async function saveEmailTemplate(fd: FormData) {
  const user = await requireRole("ADMIN");
  const key = req(fd, "key") as TemplateKey;
  const def = EMAIL_TEMPLATES[key];
  if (!def) throw new Error("Unknown email");
  const reset = fd.get("reset") === "1";
  const data = {
    subject: reset ? def.subject : req(fd, "subject", "Subject"),
    body: reset ? def.body : req(fd, "body", "Message"),
    enabled: reset ? true : fd.get("enabled") !== null,
  };
  await db.emailTemplate.upsert({ where: { studioId_key: { studioId: user.studioId, key } }, create: { studioId: user.studioId, key, ...data }, update: data });
  redirect(`/admin/emails?saved=${key}#${key}`);
}

async function sendTestEmail() {
  const user = await requireRole("ADMIN");
  const result = await sendEmail({
    to: user.email,
    subject: `Test email from ${user.studio.name}`,
    text: `This is a test from TrackSheet CRM. If you're reading it, automated emails are working.\n\n${appUrl()}`,
    replyTo: user.studio.email,
  });
  redirect(`/admin/emails${emailFlash(result, user.email)}`);
}

/** Emails the owner a backup right now (same as the Monday one). */
async function emailBackupNow() {
  const user = await requireRole("OWNER");
  const r = await emailBackup(user.studioId);
  redirect(`/settings${emailFlash(r, user.email)}`);
}

// Thrown errors show as a message on the page instead of a crash screen.
const saveRoomAction = safe(saveRoom);
const inviteUserAction = safe(inviteUser);
const setUserActiveAction = safe(setUserActive);
const resetTwoStepAction = safe(resetTwoStep);
const saveStudioAction = safe(saveStudio);
const saveServiceAction = safe(saveService);
const saveEmailTemplateAction = safe(saveEmailTemplate);
const sendTestEmailAction = safe(sendTestEmail);
const emailBackupNowAction = safe(emailBackupNow);
export { saveRoomAction as saveRoom, inviteUserAction as inviteUser, setUserActiveAction as setUserActive, resetTwoStepAction as resetTwoStep, saveStudioAction as saveStudio, saveServiceAction as saveService, saveEmailTemplateAction as saveEmailTemplate, sendTestEmailAction as sendTestEmail, emailBackupNowAction as emailBackupNow };
