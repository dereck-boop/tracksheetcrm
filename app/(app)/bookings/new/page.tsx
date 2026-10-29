import { requireUser } from "@/lib/auth";
import { bookingOptions } from "@/lib/bookingOptions";
import { inTz, parseLocal, toLocalInput } from "@/lib/format";
import { BOOKING_STATUSES } from "@/lib/status";
import { BookingForm } from "@/components/BookingForm";
import { Card, PageHeader } from "@/components/ui";
import { createBooking } from "../actions";

export const metadata = { title: "New booking" };

export default async function NewBookingPage({ searchParams }: {
  searchParams: Promise<{ contactId?: string; projectId?: string; roomId?: string; start?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const opts = await bookingOptions(user.studioId);
  let start = sp.start ? parseLocal(sp.start) : null;
  if (!start) {
    const d = inTz(Date.now());
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    start = new Date(d.getTime());
  }
  const end = new Date(start.getTime() + 4 * 36e5);
  return (
    <>
      <PageHeader title="New booking" />
      <Card>
        {opts.rooms.length === 0 ? (
          <p className="text-sm text-gray-600">Add a studio under Setup → Studios / Rooms first.</p>
        ) : (
          <BookingForm
            action={createBooking}
            {...opts}
            statuses={BOOKING_STATUSES}
            allowRepeat
            submit="Create booking"
            defaults={{ contactId: sp.contactId, projectId: sp.projectId, roomId: sp.roomId, startsAt: toLocalInput(start), endsAt: toLocalInput(end), engineerId: user.id }}
          />
        )}
      </Card>
    </>
  );
}
