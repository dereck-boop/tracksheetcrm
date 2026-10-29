import { requireRole } from "@/lib/auth";
import { backupFileName, exportStudio } from "@/lib/backup";

/** "Download everything": the whole studio as one JSON file, receipts included. Owner only. */
export async function GET() {
  const user = await requireRole("OWNER");
  const data = await exportStudio(user.studioId);
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${backupFileName(user.studio.slug, false)}"` },
  });
}
