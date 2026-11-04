import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { labelCopyRows } from "@/lib/forms";

/** The label copy as a spreadsheet: one row per writer split and credit on each song. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await db.project.findFirst({
    where: { id, studioId: user.studioId },
    include: { artist: true, tracks: { orderBy: { sortOrder: "asc" }, include: { credits: { orderBy: { sortOrder: "asc" } }, splits: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!p) return new Response("Not found", { status: 404 });
  const name = `${p.artist ? `${p.artist.name} - ` : ""}${p.name}`.replace(/[^\w -]/g, "");
  return new Response(toCsv(labelCopyRows(p, p.tracks)), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name} label copy.csv"` },
  });
}
