"use server";
import { safe } from "@/lib/safeAction";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

// Thrown errors show as a message on the page instead of a crash screen.
const markAllReadAction = safe(markAllRead);
export { markAllReadAction as markAllRead };
