import type { BookingStatus, InvoiceStatus, ProjectStatus, QuoteStatus, TaskStatus } from "@prisma/client";
import type { Tone } from "@/components/ui";

export const PROJECT_STATUSES: ProjectStatus[] = ["PLANNING", "IN_PROGRESS", "ON_HOLD", "REVIEW", "DELIVERED", "CLOSED"];
export const projectTone: Record<ProjectStatus, Tone> = {
  PLANNING: "blue", IN_PROGRESS: "teal", ON_HOLD: "amber", REVIEW: "purple", DELIVERED: "green", CLOSED: "gray",
};

export const BOOKING_STATUSES: BookingStatus[] = ["REQUESTED", "HOLD", "CONFIRMED", "COMPLETED", "CANCELLED", "DECLINED", "NO_SHOW"];
export const bookingTone: Record<BookingStatus, Tone> = {
  REQUESTED: "purple", HOLD: "amber", CONFIRMED: "green", COMPLETED: "teal", CANCELLED: "gray", DECLINED: "red", NO_SHOW: "red",
};
/** Statuses that don't hold a slot on the calendar. */
export const INACTIVE_BOOKING: BookingStatus[] = ["CANCELLED", "DECLINED", "NO_SHOW"];

export const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
export const TRACK_STAGES = ["Pre-pro", "Tracking", "Editing", "Mixing", "Mastering", "Done"];
export const PROJECT_TYPES = ["Single", "EP", "Album", "Podcast", "Mix only", "Master only", "Soundtrack", "Other"];

export const quoteTone: Record<QuoteStatus, Tone> = { DRAFT: "gray", SENT: "blue", ACCEPTED: "green", DECLINED: "red", EXPIRED: "amber" };
export const invoiceTone: Record<InvoiceStatus, Tone> = { DRAFT: "gray", SENT: "blue", PARTIAL: "amber", PAID: "green", VOID: "gray" };
