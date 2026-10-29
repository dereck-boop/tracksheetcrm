import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { format } from "@/lib/format";
import { EventForm } from "@/components/EventForm";
import { Card, PageHeader } from "@/components/ui";
import { deleteEvent, updateEvent } from "../actions";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [e, projects] = await Promise.all([
    db.event.findFirst({ where: { id, studioId: user.studioId } }),
    db.project.findMany({ where: { studioId: user.studioId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!e) notFound();
  // All-day events end at midnight after their last day.
  const last = e.allDay ? new Date(e.endsAt.getTime() - 1) : e.endsAt;
  return (
    <>
      <PageHeader title={e.title} subtitle={<Link href="/events" className="link">← Events</Link>} />
      <div className="max-w-2xl space-y-6">
        <Card>
          <EventForm
            values={{
              id: e.id,
              title: e.title,
              kind: e.kind,
              date: format(e.startsAt, "yyyy-MM-dd"),
              endDate: format(last, "yyyy-MM-dd"),
              startTime: e.allDay ? undefined : format(e.startsAt, "HH:mm"),
              endTime: e.allDay ? undefined : format(e.endsAt, "HH:mm"),
              allDay: e.allDay,
              closed: e.closed,
              location: e.location,
              notes: e.notes,
              projectId: e.projectId,
            }}
            projects={projects}
            action={updateEvent}
            submit="Save"
          />
          <form action={deleteEvent} className="mt-4 border-t border-gray-100 pt-4">
            <input type="hidden" name="id" value={e.id} />
            <button className="btn-danger btn-sm">Delete event</button>
          </form>
        </Card>
      </div>
    </>
  );
}
