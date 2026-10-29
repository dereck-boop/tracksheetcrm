"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { DEFAULT_BOOKING_TYPES, DEFAULT_EMAIL_TEMPLATES } from "@/lib/defaults";
import { addDemoData } from "@/lib/demoData";

/** First-run: create the studio and its owner account. Disabled once any user exists. */
async function setup(_: string | null, fd: FormData) {
  if ((await db.user.count()) > 0) return "This studio is already set up. Please sign in.";
  const studioName = String(fd.get("studio") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!studioName || !name || !email) return "All fields are required.";
  // The setup code (chosen when the site was deployed) stops a stranger who finds the new site
  // from claiming it before the owner does.
  const code = process.env.SETUP_CODE?.trim();
  if (code && String(fd.get("code") ?? "").trim() !== code) return "That setup code doesn't match the SETUP_CODE you chose when deploying.";
  if (password.length < 10) return "Use a password of at least 10 characters.";

  // "Add sample data" is for test copies: the sample data brings its own rooms.
  const demo = fd.get("demo") === "on";
  const slug = studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "studio";
  const studio = await db.studio.create({
    data: {
      name: studioName,
      slug,
      email,
      rooms: demo ? undefined : { create: [{ name: "Studio A", sortOrder: 0 }] },
      bookingTypes: { create: DEFAULT_BOOKING_TYPES },
      emailTemplates: { create: DEFAULT_EMAIL_TEMPLATES },
    },
  });
  const user = await db.user.create({
    data: { studioId: studio.id, name, email, role: "OWNER", passwordHash: await hashPassword(password) },
  });
  if (demo) await addDemoData(db, studio.id, user.id);
  await createSession({ userId: user.id, studioId: studio.id, role: user.role });
  redirect("/dashboard");
}

// Thrown errors show as a message on the page instead of a crash screen.
const setupAction = safe(setup);
export { setupAction as setup };
