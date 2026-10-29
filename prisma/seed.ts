/**
 * Demo data so every screen has something to show.
 * Run: npm run db:seed   (sign in as owner@example.com / studio-demo-pass)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_BOOKING_TYPES, DEFAULT_EMAIL_TEMPLATES } from "../lib/defaults";
import { addDemoData } from "../lib/demoData";

const db = new PrismaClient();

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
  const pw = await bcrypt.hash("studio-demo-pass", 12);
  const owner = await db.user.create({ data: { studioId: studio.id, name: "Studio Owner", email: "owner@example.com", role: "OWNER", passwordHash: pw } });
  await addDemoData(db, studio.id, owner.id);
  console.log("Seeded. Sign in as owner@example.com / studio-demo-pass");
}

main().finally(() => db.$disconnect());
