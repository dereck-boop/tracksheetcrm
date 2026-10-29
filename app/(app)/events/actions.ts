"use server";
import { safe } from "@/lib/safeAction";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { req, str } from "@/lib/form";
import { parseLocal } from "@/lib/format";
import { nextDay } from "@/lib/events";
import { EVENT_KINDS } from "@/lib/eventKinds";
import { logActivity } from "@/lib/activity";

/** All-day events run from midnight on the first day to midnight after the last; timed ones default to an hour. */
async function fields(fd: FormData, studioId: string) {
  const kind = str(fd, "kind") ?? "Other";
  if (!EVENT_KINDS.some((k) => k.kind === kind)) throw new Error("Unknown kind of event");
  const day = req(fd, "date", "Date");
  const lastDay = str(fd, "endDate") ?? day;
  if (lastDay < day) throw new Error("The end date is before the start date");
  const allDay = fd.get("allDay") === "on";
  let startsAt: Date | null;
  let endsAt: Date | null;
  if (allDay) {
    startsAt = parseLocal(day);
    endsAt = parseLocal(nextDay(lastDay));
  } else {
    startsAt = parseLocal(`${day}T${req(fd, "startTime", "Start time")}`);
    const endTime = str(fd, "endTime");
    endsAt = endTime ? parseLocal(`${lastDay}T${endTime}`) : startsAt && new Date(startsAt.getTime() + 3600_000);
  }
  if (!startsAt || !endsAt) throw new Error("Check the date and times");
  if (endsAt <= startsAt) throw new Error("The event must end after it starts");
  const projectId = str(fd, "projectId");
  if (projectId && !(await db.project.findFirst({ where: { id: projectId, studioId } }))) throw new Error("Project not found");
  return {
    title: req(fd, "title", "Title"),
    kind,
    startsAt,
    endsAt,
    allDay,
    closed: kind === "Closed" || fd.get("closed") === "on",
    location: str(fd, "location"),
    notes: str(fd, "notes"),
    projectId,
  };
}

async function createEvent(fd: FormData) {
  const user = await requireUser();
  const e = await db.event.create({ data: { studioId: user.studioId, ...(await fields(fd, user.studioId)) } });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "event", entityId: e.id, action: "created", summary: `Added event “${e.title}”` });
  revalidatePath("/events");
  redirect(str(fd, "back") ?? "/events");
}

async function updateEvent(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  await db.event.updateMany({ where: { id, studioId: user.studioId }, data: await fields(fd, user.studioId) });
  redirect("/events");
}

async function deleteEvent(fd: FormData) {
  const user = await requireUser();
  await db.event.deleteMany({ where: { id: req(fd, "id"), studioId: user.studioId } });
  redirect("/events");
}

/** Turn the calendar feed on, or give it a new secret address (the old one stops working). */
async function resetCalendarFeed() {
  const user = await requireRole("ADMIN");
  await db.studio.update({ where: { id: user.studioId }, data: { calendarToken: randomBytes(18).toString("base64url") } });
  revalidatePath("/events");
}

async function disableCalendarFeed() {
  const user = await requireRole("ADMIN");
  await db.studio.update({ where: { id: user.studioId }, data: { calendarToken: null } });
  revalidatePath("/events");
}

// Thrown errors show as a message on the page instead of a crash screen.
const createEventAction = safe(createEvent);
const updateEventAction = safe(updateEvent);
const deleteEventAction = safe(deleteEvent);
const resetCalendarFeedAction = safe(resetCalendarFeed);
const disableCalendarFeedAction = safe(disableCalendarFeed);
export { createEventAction as createEvent, updateEventAction as updateEvent, deleteEventAction as deleteEvent, resetCalendarFeedAction as resetCalendarFeed, disableCalendarFeedAction as disableCalendarFeed };
