import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Open a notification: mark it read, then go where it points. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const n = await db.notification.findFirst({ where: { id: (await params).id, userId: user.id } });
  if (!n) redirect("/notifications");
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  redirect(n.href?.startsWith("/") ? n.href : "/notifications");
}
