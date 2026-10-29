import { db } from "./db";

export async function logActivity(a: {
  studioId: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
}) {
  await db.activity.create({ data: a });
}
