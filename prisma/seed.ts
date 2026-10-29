/**
 * Demo data so every screen has something to show.
 * Run: npm run db:seed   (sign in as owner@example.com / studio-demo-pass)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_BOOKING_TYPES, DEFAULT_EMAIL_TEMPLATES } from "../lib/defaults";
import { inTz } from "../lib/format";

const db = new PrismaClient();
const day = 864e5;
const at = (offsetDays: number, hour: number) => {
  const d = inTz(Date.now() + offsetDays * day);
  d.setHours(hour, 0, 0, 0);
  return new Date(d.getTime());
};

async function main() {
  if (await db.studio.findFirst()) {
    console.log("Database already has a studio; skipping seed.");
    return;
  }
  const studio = await db.studio.create({
    data: {
      name: "Sample Studio",
      slug: "sample-studio",
      email: "hello@example.com",
      bookingTypes: { create: DEFAULT_BOOKING_TYPES },
      emailTemplates: { create: DEFAULT_EMAIL_TEMPLATES },
    },
  });
  const sid = studio.id;
  const pw = await bcrypt.hash("studio-demo-pass", 12);
  const owner = await db.user.create({ data: { studioId: sid, name: "Studio Owner", email: "owner@example.com", role: "OWNER", passwordHash: pw } });
  const eng = await db.user.create({ data: { studioId: sid, name: "Sam Engineer", email: "sam@example.com", role: "ENGINEER", passwordHash: pw, color: "#3b82f6" } });

  const [roomA, roomB, roomC] = await Promise.all([
    db.room.create({ data: { studioId: sid, name: "Studio A", color: "#2f7d6d", hourlyRate: 9000, dayRate: 70000, sortOrder: 0 } }),
    db.room.create({ data: { studioId: sid, name: "Studio B", color: "#3b82f6", hourlyRate: 6000, dayRate: 45000, sortOrder: 1 } }),
    db.room.create({ data: { studioId: sid, name: "Mix Suite", color: "#8b5cf6", hourlyRate: 5000, sortOrder: 2 } }),
  ]);
  const types = await db.bookingType.findMany({ where: { studioId: sid } });
  const type = (n: string) => types.find((t) => t.name === n)!.id;

  await db.service.createMany({
    data: [
      { studioId: sid, name: "Tracking session", unit: "hour", unitPrice: 9000, bookable: true, durationMin: 240 },
      { studioId: sid, name: "Full day lockout", unit: "day", unitPrice: 70000, bookable: true, durationMin: 600 },
      { studioId: sid, name: "Mix per song", unit: "song", unitPrice: 40000 },
      { studioId: sid, name: "Master per track", unit: "track", unitPrice: 7500 },
    ],
  });

  const maya = await db.contact.create({ data: { studioId: sid, firstName: "Maya", lastName: "Reyes", email: "maya@example.com", phone: "555-0101", role: "Artist" } });
  const theo = await db.contact.create({ data: { studioId: sid, firstName: "Theo", lastName: "Park", email: "theo@example.com", role: "Manager" } });
  const jun = await db.contact.create({ data: { studioId: sid, firstName: "Jun", lastName: "Ito", email: "jun@example.com", role: "Podcast host" } });
  const band = await db.artist.create({
    data: { studioId: sid, name: "The Wildflowers", kind: "Band", genre: "Indie folk", members: { create: [{ contactId: maya.id, role: "Vocals" }, { contactId: theo.id, role: "Manager" }] } },
  });

  const ep = await db.project.create({
    data: {
      studioId: sid, name: "Wildflowers – Low Tide EP", type: "EP", status: "IN_PROGRESS", clientId: maya.id, artistId: band.id,
      managerId: owner.id, budget: 650000, startDate: at(-20, 0), dueDate: at(30, 0),
      milestones: {
        create: [
          { title: "Pre-production", dueDate: at(-14, 0), completedAt: at(-15, 0), sortOrder: 0 },
          { title: "Tracking complete", dueDate: at(5, 0), sortOrder: 1, billAmount: 300000 },
          { title: "Mix approval", dueDate: at(20, 0), sortOrder: 2 },
          { title: "Masters delivered", dueDate: at(30, 0), sortOrder: 3, billAmount: 350000 },
        ],
      },
      tracks: {
        create: [
          { title: "Low Tide", stage: "Mixing", sortOrder: 0 },
          { title: "Paper Boats", stage: "Editing", sortOrder: 1 },
          { title: "Harbor Lights", stage: "Tracking", sortOrder: 2 },
          { title: "Undertow", stage: "Tracking", sortOrder: 3 },
          { title: "Saltwater", stage: "Pre-pro", sortOrder: 4 },
        ],
      },
    },
  });
  const pod = await db.project.create({
    data: { studioId: sid, name: "Second Takes Podcast – Season 2", type: "Podcast", status: "PLANNING", clientId: jun.id, managerId: eng.id, budget: 240000, dueDate: at(60, 0) },
  });

  await db.booking.createMany({
    data: [
      { studioId: sid, title: "Wildflowers – drums", roomId: roomA.id, typeId: type("Tracking"), startsAt: at(0, 11), endsAt: at(0, 17), contactId: maya.id, projectId: ep.id, engineerId: owner.id, status: "CONFIRMED", rate: 54000, depositAmount: 27000, depositPaidAt: at(-3, 10) },
      { studioId: sid, title: "Second Takes – ep. 1", roomId: roomB.id, typeId: type("Podcast"), startsAt: at(0, 14), endsAt: at(0, 16), contactId: jun.id, projectId: pod.id, engineerId: eng.id, status: "CONFIRMED" },
      { studioId: sid, title: "Wildflowers – guitars", roomId: roomA.id, typeId: type("Tracking"), startsAt: at(1, 12), endsAt: at(1, 18), contactId: maya.id, projectId: ep.id, engineerId: owner.id, status: "HOLD", rate: 54000, depositAmount: 27000 },
      { studioId: sid, title: "Low Tide mix", roomId: roomC.id, typeId: type("Mixing"), startsAt: at(2, 10), endsAt: at(2, 18), projectId: ep.id, engineerId: owner.id, status: "CONFIRMED" },
      { studioId: sid, title: "Rehearsal – Dana Lee", roomId: roomB.id, typeId: type("Rehearsal"), startsAt: at(3, 19), endsAt: at(3, 22), engineerId: eng.id, status: "CONFIRMED" },
      { studioId: sid, title: "Tracking session – Chris Vale", roomId: roomA.id, startsAt: at(4, 13), endsAt: at(4, 17), status: "REQUESTED", requestName: "Chris Vale", requestEmail: "chris@example.com", requestNotes: "Singer-songwriter, 2 songs, acoustic guitar + vocals.", rate: 36000, depositAmount: 18000 },
    ],
  });

  await db.task.createMany({
    data: [
      { studioId: sid, title: "Send Wildflowers guitar session deposit link", assigneeId: owner.id, projectId: ep.id, dueDate: at(0, 17), priority: 1 },
      { studioId: sid, title: "Send Jun the season 2 quote", assigneeId: owner.id, dueDate: at(1, 12) },
      { studioId: sid, title: "Order replacement SM7B cable", assigneeId: eng.id, dueDate: at(-1, 12) },
      { studioId: sid, title: "Prep podcast mic templates", assigneeId: eng.id, projectId: pod.id, dueDate: at(2, 12) },
    ],
  });

  const inv = await db.invoice.create({
    data: {
      studioId: sid, number: "INV-1001", status: "PAID", contactId: maya.id, projectId: ep.id, issueDate: at(-30, 10), dueDate: at(-16, 10), total: 300000, amountPaid: 300000, paidAt: at(-25, 10),
      items: { create: [{ description: "EP deposit – 50%", unitPrice: 300000 }] },
    },
  });
  await db.payment.create({ data: { studioId: sid, invoiceId: inv.id, amount: 300000, method: "STRIPE", receivedAt: at(-25, 10) } });
  await db.invoice.create({
    data: {
      studioId: sid, number: "INV-1002", status: "SENT", contactId: jun.id, projectId: pod.id, issueDate: at(-20, 10), dueDate: at(-6, 10), total: 120000,
      items: { create: [{ description: "Podcast season setup", unitPrice: 120000 }] },
    },
  });
  await db.studio.update({ where: { id: sid }, data: { nextInvoiceNo: 1003 } });

  await db.note.create({ data: { studioId: sid, userId: owner.id, projectId: ep.id, kind: "call", body: "Maya wants a warmer vocal chain on Low Tide. Try the U47 → 1073." } });
  console.log("Seeded. Sign in as owner@example.com / studio-demo-pass");
}

main().finally(() => db.$disconnect());
