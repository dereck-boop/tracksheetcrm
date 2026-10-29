"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { toCents } from "@/lib/format";
import { date, req, str } from "@/lib/form";
import { PROJECT_STATUSES, TRACK_STAGES } from "@/lib/status";
import { resolveClient } from "@/lib/contacts";

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
  await db.track.update({
    where: { id: t.id },
    data: {
      title: req(fd, "title", "Title"), bpm: bpm ? Math.round(Number(bpm)) || null : null, key: str(fd, "key"), notes: str(fd, "notes"),
    },
  });
  revalidatePath(songPath(t));
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
export { createProjectAction as createProject, updateProjectAction as updateProject, setProjectStatusAction as setProjectStatus, addMilestoneAction as addMilestone, toggleMilestoneAction as toggleMilestone, deleteMilestoneAction as deleteMilestone, addTrackAction as addTrack, setTrackStageAction as setTrackStage, deleteTrackAction as deleteTrack, deleteProjectAction as deleteProject, updateTrackAction as updateTrack };
