"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { toCents } from "@/lib/format";
import { recalcTotal } from "@/lib/invoices";
import { date, req, str } from "@/lib/form";
import { PROJECT_STATUSES, TRACK_STAGES } from "@/lib/status";
import { resolveClient } from "@/lib/contacts";
import { requireRole } from "@/lib/auth";
import { cleanIsrc, isrcLooksRight, parseDuration } from "@/lib/forms";
import { matchContact, sendSessionRelease, sendSplitSheet } from "@/lib/formsSend";
import { createInvoice } from "@/lib/invoices";
import { emailFlash } from "@/lib/flash";
import { fullName, money } from "@/lib/format";

const fields = async (fd: FormData, studioId: string) => ({
  name: req(fd, "name", "Name"),
  type: str(fd, "type"),
  clientId: await resolveClient(fd, studioId, "clientId"),
  artistId: str(fd, "artistId"),
  managerId: str(fd, "managerId"),
  startDate: date(fd, "startDate"),
  dueDate: date(fd, "dueDate"),
  budget: toCents(fd.get("budget")),
  description: str(fd, "description"),
});

async function ownProject(studioId: string, id: string) {
  const p = await db.project.findFirst({ where: { id, studioId } });
  if (!p) throw new Error("Project not found");
  return p;
}

async function createProject(fd: FormData) {
  const user = await requireUser();
  const p = await db.project.create({ data: { studioId: user.studioId, ...(await fields(fd, user.studioId)) } });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "project", entityId: p.id, action: "created", summary: `Started project ${p.name}` });
  redirect(`/projects/${p.id}`);
}

async function updateProject(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  await db.project.updateMany({ where: { id, studioId: user.studioId }, data: await fields(fd, user.studioId) });
  revalidatePath(`/projects/${id}`);
}

async function setProjectStatus(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  const status = req(fd, "status") as ProjectStatus;
  if (!PROJECT_STATUSES.includes(status)) throw new Error("Unknown status");
  // Delivered starts the clock on the wrap-up email (sent the next morning) and the session-file archive.
  await db.project.updateMany({ where: { id, studioId: user.studioId }, data: { status } });
  if (status === "DELIVERED") await db.project.updateMany({ where: { id, studioId: user.studioId, deliveredAt: null }, data: { deliveredAt: new Date() } });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "project", entityId: id, action: "status_changed", summary: `Project moved to ${status}` });
  revalidatePath(`/projects/${id}`);
}

async function addMilestone(fd: FormData) {
  const user = await requireUser();
  const p = await ownProject(user.studioId, req(fd, "projectId"));
  const count = await db.milestone.count({ where: { projectId: p.id } });
  await db.milestone.create({
    data: { projectId: p.id, title: req(fd, "title", "Title"), dueDate: date(fd, "dueDate"), billAmount: toCents(fd.get("billAmount")), sortOrder: count },
  });
  revalidatePath(`/projects/${p.id}`);
}

async function toggleMilestone(fd: FormData) {
  const user = await requireUser();
  const p = await ownProject(user.studioId, req(fd, "projectId"));
  const m = await db.milestone.findFirst({ where: { id: req(fd, "id"), projectId: p.id } });
  if (!m) return;
  await db.milestone.update({ where: { id: m.id }, data: { completedAt: m.completedAt ? null : new Date() } });
  revalidatePath(`/projects/${p.id}`);
}

async function deleteMilestone(fd: FormData) {
  const user = await requireUser();
  const p = await ownProject(user.studioId, req(fd, "projectId"));
  await db.milestone.deleteMany({ where: { id: req(fd, "id"), projectId: p.id } });
  revalidatePath(`/projects/${p.id}`);
}

async function addTrack(fd: FormData) {
  const user = await requireUser();
  const p = await ownProject(user.studioId, req(fd, "projectId"));
  const count = await db.track.count({ where: { projectId: p.id } });
  await db.track.create({ data: { projectId: p.id, title: req(fd, "title", "Title"), stage: TRACK_STAGES[0]!, sortOrder: count } });
  revalidatePath(`/projects/${p.id}`);
}

async function setTrackStage(fd: FormData) {
  const user = await requireUser();
  const p = await ownProject(user.studioId, req(fd, "projectId"));
  const stage = req(fd, "stage");
  if (!TRACK_STAGES.includes(stage)) return;
  await db.track.updateMany({ where: { id: req(fd, "id"), projectId: p.id }, data: { stage } });
  revalidatePath(`/projects/${p.id}`);
}

async function deleteTrack(fd: FormData) {
  const user = await requireUser();
  const p = await ownProject(user.studioId, req(fd, "projectId"));
  await db.track.deleteMany({ where: { id: req(fd, "id"), projectId: p.id } });
  revalidatePath(`/projects/${p.id}`);
}

async function deleteProject(fd: FormData) {
  const user = await requireUser();
  await db.project.deleteMany({ where: { id: req(fd, "id"), studioId: user.studioId } });
  redirect("/projects");
}

// ─── Songs ───────────────────────

async function ownTrack(studioId: string, id: string) {
  const t = await db.track.findFirst({ where: { id, project: { studioId } } });
  if (!t) throw new Error("Song not found");
  return t;
}
const songPath = (t: { id: string; projectId: string }) => `/projects/${t.projectId}/songs/${t.id}`;

async function updateTrack(fd: FormData) {
  const user = await requireUser();
  const t = await ownTrack(user.studioId, req(fd, "id"));
  const bpm = str(fd, "bpm");
  const isrc = cleanIsrc(str(fd, "isrc"));
  if (isrc && !isrcLooksRight(isrc)) throw new Error("That ISRC doesn't look right. It's 12 letters and numbers, like USABC2600001.");
  const length = str(fd, "duration");
  const duration = parseDuration(length);
  if (length && duration == null) throw new Error("Write the length as minutes:seconds, like 3:45.");
  await db.track.update({
    where: { id: t.id },
    data: {
      title: req(fd, "title", "Title"), bpm: bpm ? Math.round(Number(bpm)) || null : null, key: str(fd, "key"), notes: str(fd, "notes"),
      isrc, duration, explicit: fd.get("explicit") !== null, featuring: str(fd, "featuring"),
    },
  });
  revalidatePath(songPath(t));
}

async function addCredit(fd: FormData) {
  const user = await requireUser();
  const t = await ownTrack(user.studioId, req(fd, "trackId"));
  const roles = fd.getAll("role").map(String).map((r) => r.trim()).filter(Boolean);
  if (!roles.length) throw new Error("Pick what they did");
  const name = req(fd, "name", "Name");
  const count = await db.trackCredit.count({ where: { trackId: t.id } });
  await db.trackCredit.createMany({ data: roles.map((role, i) => ({ trackId: t.id, name, role, sortOrder: count + i })) });
  revalidatePath(songPath(t));
}

async function deleteCredit(fd: FormData) {
  const user = await requireUser();
  const t = await ownTrack(user.studioId, req(fd, "trackId"));
  await db.trackCredit.deleteMany({ where: { id: req(fd, "id"), trackId: t.id } });
  revalidatePath(songPath(t));
}

/** Copies one song's credits onto every other song on the project that has none yet. */
async function copyCreditsToAll(fd: FormData) {
  const user = await requireUser();
  const t = await ownTrack(user.studioId, req(fd, "trackId"));
  const credits = await db.trackCredit.findMany({ where: { trackId: t.id }, orderBy: { sortOrder: "asc" } });
  const others = await db.track.findMany({ where: { projectId: t.projectId, id: { not: t.id }, credits: { none: {} } }, select: { id: true } });
  await db.trackCredit.createMany({ data: others.flatMap((o) => credits.map((c) => ({ trackId: o.id, name: c.name, role: c.role, sortOrder: c.sortOrder }))) });
  revalidatePath(songPath(t));
}

/** Any change to the splits clears signatures: people signed the old numbers, not the new ones. */
async function resetSignatures(trackId: string) {
  await db.trackSplit.updateMany({ where: { trackId }, data: { signedAt: null, signedName: null, signedIp: null } });
}

/**
 * Adds a writer. PRO, IPI, publisher and email left blank are filled from the matching contact,
 * so details typed once on a person carry onto every song they write.
 */
async function saveSplit(fd: FormData) {
  const user = await requireUser();
  const t = await ownTrack(user.studioId, req(fd, "trackId"));
  const percent = Number(str(fd, "percent")?.replace("%", ""));
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error("Share must be between 0 and 100%");
  const name = req(fd, "name", "Name");
  const email = str(fd, "email")?.toLowerCase() ?? null;
  const c = await matchContact(user.studioId, name, email);
  const data = {
    name,
    email: email ?? c?.email ?? null,
    role: str(fd, "role") ?? "Writer",
    percent,
    pro: str(fd, "pro") ?? c?.pro ?? null,
    ipi: str(fd, "ipi") ?? c?.ipi ?? null,
    publisher: str(fd, "publisher") ?? c?.publisher ?? null,
  };
  const id = str(fd, "id");
  if (id) await db.trackSplit.updateMany({ where: { id, trackId: t.id }, data });
  else await db.trackSplit.create({ data: { ...data, trackId: t.id } });
  await resetSignatures(t.id);
  revalidatePath(songPath(t));
}

async function deleteSplit(fd: FormData) {
  const user = await requireUser();
  const t = await ownTrack(user.studioId, req(fd, "trackId"));
  await db.trackSplit.deleteMany({ where: { id: req(fd, "id"), trackId: t.id } });
  await resetSignatures(t.id);
  revalidatePath(songPath(t));
}

async function sendSplits(fd: FormData) {
  const user = await requireUser();
  const t = await ownTrack(user.studioId, req(fd, "trackId"));
  const n = await sendSplitSheet(t.id, user.id);
  redirect(`${songPath(t)}?${n ? `emailed=${encodeURIComponent(`${n} writer${n === 1 ? "" : "s"}`)}` : `email_error=${encodeURIComponent("nobody to send to (everyone has signed, or no emails)")}`}`);
}

// ─── Release info (label copy) ──────────────────────────────────────

async function saveRelease(fd: FormData) {
  const user = await requireUser();
  const p = await ownProject(user.studioId, req(fd, "id"));
  const upc = str(fd, "upc")?.replace(/\D/g, "") || null;
  if (upc && (upc.length < 12 || upc.length > 13)) throw new Error("A UPC/EAN barcode is 12 or 13 digits.");
  await db.project.update({
    where: { id: p.id },
    data: { label: str(fd, "label"), upc, releaseDate: date(fd, "releaseDate"), pLine: str(fd, "pLine"), cLine: str(fd, "cLine") },
  });
  revalidatePath(`/projects/${p.id}`);
}

// ─── Session players: release (work for hire) and money paid out ───

async function ownHire(studioId: string, id: string) {
  const h = await db.sessionHire.findFirst({ where: { id, studioId } });
  if (!h) throw new Error("Session player not found");
  return h;
}

/** Hires a player on a project. Optionally credits them on every song and emails the release to sign. */
async function addHire(fd: FormData) {
  const user = await requireRole("ADMIN");
  const p = await ownProject(user.studioId, req(fd, "projectId"));
  const contactId = await resolveClient(fd, user.studioId, "contactId");
  if (!contactId) throw new Error("Pick who you hired, or add them as a new contact");
  const c = await db.contact.findFirstOrThrow({ where: { id: contactId, studioId: user.studioId } });
  const role = req(fd, "role", "What they played");
  const h = await db.sessionHire.create({
    data: { studioId: user.studioId, projectId: p.id, contactId: c.id, name: fullName(c), role, fee: toCents(fd.get("fee")) ?? 0, workDate: date(fd, "workDate") },
  });
  if (!c.role) await db.contact.update({ where: { id: c.id }, data: { role: "Session musician" } });
  if (fd.get("credit") !== null) {
    const tracks = await db.track.findMany({ where: { projectId: p.id }, include: { _count: { select: { credits: true } } } });
    await db.trackCredit.createMany({ data: tracks.map((t) => ({ trackId: t.id, name: fullName(c), role, sortOrder: t._count.credits })) });
  }
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "project", entityId: p.id, action: "updated", summary: `Hired ${fullName(c)} (${role}) for ${money(h.fee)}` });
  if (fd.get("send") !== null) {
    const r = await sendSessionRelease(h.id, user.id).catch((e: Error) => ({ sent: false, error: e.message }));
    redirect(`/projects/${p.id}${emailFlash(r, c.email)}`);
  }
  revalidatePath(`/projects/${p.id}`);
}

async function sendRelease(fd: FormData) {
  const user = await requireRole("ADMIN");
  const h = await ownHire(user.studioId, req(fd, "id"));
  const r = await sendSessionRelease(h.id, user.id);
  const c = h.contactId ? await db.contact.findUnique({ where: { id: h.contactId } }) : null;
  redirect(`/projects/${h.projectId}${emailFlash(r, c?.email)}`);
}

async function markHirePaid(fd: FormData) {
  const user = await requireRole("ADMIN");
  const h = await ownHire(user.studioId, req(fd, "id"));
  const undo = fd.get("undo") !== null;
  await db.sessionHire.update({ where: { id: h.id }, data: undo ? { paidAt: null, paidMethod: null } : { paidAt: date(fd, "paidAt") ?? new Date(), paidMethod: str(fd, "paidMethod") } });
  if (!undo) await logActivity({ studioId: user.studioId, userId: user.id, entityType: "project", entityId: h.projectId, action: "paid", summary: `Paid ${h.name} ${money(h.fee)}${str(fd, "paidMethod") ? ` by ${str(fd, "paidMethod")}` : ""}` });
  revalidatePath(`/projects/${h.projectId}`);
}

/** Passes the player's fee on to the client: a line on the project's open draft invoice, or a new draft. */
async function billHire(fd: FormData) {
  const user = await requireRole("ADMIN");
  const h = await ownHire(user.studioId, req(fd, "id"));
  if (h.invoiceId) throw new Error("This fee is already on an invoice");
  const p = await db.project.findUniqueOrThrow({ where: { id: h.projectId } });
  const line = { description: `Session player: ${h.name} (${h.role})`, quantity: 1, unitPrice: h.fee, taxable: false };
  const draft = await db.invoice.findFirst({ where: { studioId: user.studioId, projectId: p.id, status: "DRAFT", isDeposit: false }, orderBy: { createdAt: "desc" }, include: { _count: { select: { items: true } } } });
  let invoiceId: string;
  if (draft) {
    await db.$transaction(async (tx) => {
      await tx.invoiceItem.create({ data: { ...line, invoiceId: draft.id, sortOrder: draft._count.items } });
      await recalcTotal(tx, draft.id);
    });
    invoiceId = draft.id;
  } else {
    const inv = await createInvoice(user.studioId, { contactId: p.clientId, projectId: p.id, terms: user.studio.invoiceTerms }, [line]);
    invoiceId = inv.id;
  }
  await db.sessionHire.update({ where: { id: h.id }, data: { invoiceId } });
  redirect(`/invoices/${invoiceId}`);
}

async function deleteHire(fd: FormData) {
  const user = await requireRole("ADMIN");
  const h = await ownHire(user.studioId, req(fd, "id"));
  if (h.signedAt || h.paidAt) throw new Error("A signed or paid session player can't be removed. Undo the payment first if it was a mistake.");
  await db.sessionHire.delete({ where: { id: h.id } });
  revalidatePath(`/projects/${h.projectId}`);
}

// Thrown errors show as a message on the page instead of a crash screen.
const createProjectAction = safe(createProject);
const updateProjectAction = safe(updateProject);
const setProjectStatusAction = safe(setProjectStatus);
const addMilestoneAction = safe(addMilestone);
const toggleMilestoneAction = safe(toggleMilestone);
const deleteMilestoneAction = safe(deleteMilestone);
const addTrackAction = safe(addTrack);
const setTrackStageAction = safe(setTrackStage);
const deleteTrackAction = safe(deleteTrack);
const deleteProjectAction = safe(deleteProject);
const updateTrackAction = safe(updateTrack);
const addCreditAction = safe(addCredit);
const deleteCreditAction = safe(deleteCredit);
const copyCreditsToAllAction = safe(copyCreditsToAll);
const saveSplitAction = safe(saveSplit);
const deleteSplitAction = safe(deleteSplit);
const sendSplitsAction = safe(sendSplits);
const saveReleaseAction = safe(saveRelease);
const addHireAction = safe(addHire);
const sendReleaseAction = safe(sendRelease);
const markHirePaidAction = safe(markHirePaid);
const billHireAction = safe(billHire);
const deleteHireAction = safe(deleteHire);
export {
  addCreditAction as addCredit, deleteCreditAction as deleteCredit, copyCreditsToAllAction as copyCreditsToAll, saveSplitAction as saveSplit, deleteSplitAction as deleteSplit, sendSplitsAction as sendSplits,
  saveReleaseAction as saveRelease, addHireAction as addHire, sendReleaseAction as sendRelease, markHirePaidAction as markHirePaid, billHireAction as billHire, deleteHireAction as deleteHire,
};
export { createProjectAction as createProject, updateProjectAction as updateProject, setProjectStatusAction as setProjectStatus, addMilestoneAction as addMilestone, toggleMilestoneAction as toggleMilestone, deleteMilestoneAction as deleteMilestone, addTrackAction as addTrack, setTrackStageAction as setTrackStage, deleteTrackAction as deleteTrack, deleteProjectAction as deleteProject, updateTrackAction as updateTrack };
