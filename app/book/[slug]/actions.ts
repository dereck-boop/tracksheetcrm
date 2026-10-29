"use server";
import { safe } from "@/lib/safeAction";
import { db } from "@/lib/db";
import { closedOn } from "@/lib/events";
import { logActivity } from "@/lib/activity";
import { req, str } from "@/lib/form";
import { emailBooking } from "@/lib/bookingEmails";
import { notifyStudio } from "@/lib/email";
import { fmtDate, format, parseLocal } from "@/lib/format";
import { appUrl } from "@/lib/stripe";
import { REQUEST_SERVICES, socialUrl } from "@/lib/requestServices";
import { roomTakenOn } from "@/lib/availability";
import { allowAll, clientIp, DAY, HOUR } from "@/lib/rateLimit";
import { isEmail, passesTurnstile } from "@/lib/turnstile";
import { friendlyMessage } from "@/lib/safeAction";

/** A required field, trimmed and cut to a sensible length. */
const field = (fd: FormData, key: string, label: string, max: number) => req(fd, key, label).slice(0, max);

const startOfToday = () => parseLocal(format(new Date(), "yyyy-MM-dd"))!;

const MAX_DAYS = 10;

/** "Nov 5, 2026", "Nov 5, 2026 and Nov 6, 2026", or "Nov 5, 2026, Nov 6, 2026 and Nov 8, 2026". */
const listDays = (days: Date[]) => {
  const d = days.map(fmtDate);
  return d.length < 2 ? d.join("") : `${d.slice(0, -1).join(", ")} and ${d.at(-1)}`;
};

export type RequestResult = { ok?: boolean; error?: string } | null;

async function requestBooking(_: RequestResult, fd: FormData): Promise<RequestResult> {
  if (str(fd, "website")) return { ok: true }; // honeypot: bots fill hidden fields
  try {
    const ip = await clientIp();
    if (!(await passesTurnstile(fd, ip))) return { error: "Please confirm you're not a robot, then send again." };
    const studio = await db.studio.findUnique({ where: { slug: req(fd, "slug") } });
    if (!studio) return { error: "Studio not found." };
    const room = await db.room.findFirst({ where: { id: req(fd, "roomId", "Room"), studioId: studio.id, active: true, onlineBooking: true } });
    if (!room) return { error: "Please choose a studio." };
    const service = req(fd, "service", "Service requested");
    if (!(REQUEST_SERVICES as readonly string[]).includes(service)) return { error: "Please choose a service." };
    // Clients pick one or more days; the studio sets the hours. Each day becomes its own
    // request with a placeholder slot until then.
    const days = [...new Set(fd.getAll("date").map((d) => String(d).trim()).filter(Boolean))].sort();
    if (days.length === 0) return { error: "Please choose a day." };
    if (days.length > MAX_DAYS) return { error: `Please choose up to ${MAX_DAYS} days.` };
    const starts: Date[] = [];
    for (const day of days) {
      const startsAt = parseLocal(`${day}T10:00`);
      if (!startsAt || startsAt < startOfToday()) return { error: "Please choose days from today on." };
      if (await closedOn(studio.id, startsAt)) return { error: `Sorry, the studio is closed on ${fmtDate(startsAt)}. Please choose another day.` };
      if (await roomTakenOn(studio.id, room.id, startsAt)) return { error: `Sorry, ${room.name} is already booked on ${fmtDate(startsAt)}. Please choose another day.` };
      starts.push(startsAt);
    }
    const firstName = field(fd, "firstName", "First name", 80);
    const lastName = field(fd, "lastName", "Last name", 80);
    const name = `${firstName} ${lastName}`;
    const email = field(fd, "email", "Email", 200).toLowerCase();
    if (!isEmail(email)) return { error: "Please check your email address." };
    const phone = str(fd, "phone")?.slice(0, 40) ?? null;
    const artist = field(fd, "artist", "Artist, band or project name", 120);
    const social = socialUrl(field(fd, "social", "Instagram / social media link", 300));
    const notes = field(fd, "notes", "Message", 4000);
    // Each request emails the address typed in, so cap how often one address or one visitor can send.
    const fine = await allowAll([[`book:email:${email}`, 3, DAY], [`book:ip:${ip}`, 5, HOUR], [`book:ip-day:${ip}`, 15, DAY]]);
    if (!fine) return { error: `We've already received a few requests from you today. Please email ${studio.email ?? "the studio"} instead and we'll get back to you.` };
    const contact = await db.contact.findFirst({ where: { studioId: studio.id, email: { equals: email, mode: "insensitive" } } });

    const bookings = await db.$transaction(
      starts.map((startsAt) =>
        db.booking.create({
          data: {
            studioId: studio.id,
            roomId: room.id,
            status: "REQUESTED",
            title: `${service} – ${artist}`,
            startsAt,
            endsAt: new Date(startsAt.getTime() + 240 * 60_000),
            contactId: contact?.id,
            requestName: name,
            requestFirstName: firstName,
            requestLastName: lastName,
            requestEmail: email,
            requestPhone: phone,
            requestArtist: artist,
            requestSocial: social,
            requestService: service,
            requestNotes: notes,
            timeTbd: true,
          },
        }),
      ),
    );
    const first = bookings[0]!;
    const dayList = listDays(starts);
    const admins = await db.user.findMany({ where: { studioId: studio.id, active: true, role: { in: ["OWNER", "ADMIN"] } } });
    await db.notification.createMany({
      data: admins.map((u) => ({ studioId: studio.id, userId: u.id, title: `Booking request from ${name}${bookings.length > 1 ? ` (${bookings.length} days)` : ""}`, href: `/bookings/${first.id}` })),
    });
    for (const b of bookings) {
      await logActivity({ studioId: studio.id, entityType: "booking", entityId: b.id, action: "requested", summary: `Online booking request from ${name}` });
    }
    // One confirmation for the whole request, naming every day.
    await emailBooking(first.id, "booking_requested", null, { date: dayList });
    await notifyStudio(
      studio.id,
      `Booking request: ${name}, ${dayList}`,
      `${name} (${email}${phone ? `, ${phone}` : ""}) requested ${service} for ${artist} in ${room.name} on ${dayList}.\n${social}\n\nSet the hours on each booking before confirming.\n\n${notes}\n\n${bookings.map((b) => `${fmtDate(b.startsAt)}: ${appUrl()}/bookings/${b.id}`).join("\n")}`,
    );
    return { ok: true };
  } catch (e) {
    if (!(e instanceof Error && e.constructor === Error)) console.error("Booking request failed", e);
    return { error: friendlyMessage(e) };
  }
}

// Thrown errors show as a message on the page instead of a crash screen.
const requestBookingAction = safe(requestBooking);
export { requestBookingAction as requestBooking };
