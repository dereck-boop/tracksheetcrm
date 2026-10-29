"use server";
import { safe } from "@/lib/safeAction";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { date, int, req, str } from "@/lib/form";

type Parent = "contactId" | "artistId" | "projectId";
const PARENTS: Parent[] = ["contactId", "artistId", "projectId"];

function parentFrom(fd: FormData) {
  const out: Partial<Record<Parent, string>> = {};
  for (const p of PARENTS) {
    const v = str(fd, p);
    if (v) out[p] = v;
  }
  return out;
}

async function addNote(fd: FormData) {
  const user = await requireUser();
  await db.note.create({
    data: {
      studioId: user.studioId,
      userId: user.id,
      kind: str(fd, "kind") ?? "note",
      body: req(fd, "body", "Note"),
      ...parentFrom(fd),
    },
  });
  revalidatePath(req(fd, "path"));
}

async function deleteNote(fd: FormData) {
  const user = await requireUser();
  await db.note.deleteMany({ where: { id: req(fd, "id"), studioId: user.studioId } });
  revalidatePath(req(fd, "path"));
}

async function addTask(fd: FormData) {
  const user = await requireUser();
  const p = parentFrom(fd);
  await db.task.create({
    data: {
      studioId: user.studioId,
      title: req(fd, "title", "Title"),
      dueDate: date(fd, "dueDate"),
      remindAt: date(fd, "remindAt"),
      priority: int(fd, "priority") ?? 2,
      assigneeId: str(fd, "assigneeId") ?? user.id,
      createdById: user.id,
      contactId: p.contactId,
      projectId: p.projectId,
      milestoneId: str(fd, "milestoneId"),
    },
  });
  revalidatePath(str(fd, "path") ?? "/tasks");
}

async function toggleTask(fd: FormData) {
  const user = await requireUser();
  const task = await db.task.findFirst({ where: { id: req(fd, "id"), studioId: user.studioId } });
  if (!task) return;
  const done = task.status !== "DONE";
  await db.task.update({
    where: { id: task.id },
    data: { status: done ? "DONE" : "TODO", completedAt: done ? new Date() : null },
  });
  revalidatePath(str(fd, "path") ?? "/tasks");
}

async function deleteTask(fd: FormData) {
  const user = await requireUser();
  await db.task.deleteMany({ where: { id: req(fd, "id"), studioId: user.studioId } });
  revalidatePath(str(fd, "path") ?? "/tasks");
}

// Thrown errors show as a message on the page instead of a crash screen.
const addNoteAction = safe(addNote);
const deleteNoteAction = safe(deleteNote);
const addTaskAction = safe(addTask);
const toggleTaskAction = safe(toggleTask);
const deleteTaskAction = safe(deleteTask);
export { addNoteAction as addNote, deleteNoteAction as deleteNote, addTaskAction as addTask, toggleTaskAction as toggleTask, deleteTaskAction as deleteTask };
