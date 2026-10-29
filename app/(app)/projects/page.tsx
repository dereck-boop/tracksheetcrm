import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fullName, titleCase } from "@/lib/format";
import { PROJECT_STATUSES, projectTone } from "@/lib/status";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const { status } = await searchParams;
  const filter = PROJECT_STATUSES.includes(status as ProjectStatus) ? (status as ProjectStatus) : undefined;
  const projects = await db.project.findMany({
    where: { studioId: user.studioId, ...(filter ? { status: filter } : { status: { notIn: ["CLOSED"] } }) },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      client: true,
      artist: true,
      milestones: { select: { completedAt: true } },
      _count: { select: { tracks: true } },
    },
  });
  return (
    <>
      <PageHeader title="Projects" actions={<Link href="/projects/new" className="btn-primary">New project</Link>} />
      <div className="mb-4 flex flex-wrap gap-1">
        <Link href="/projects" className={`rounded-full border px-3 py-1 text-xs ${!filter ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"}`}>Open</Link>
        {PROJECT_STATUSES.map((s) => (
          <Link key={s} href={`/projects?status=${s}`} className={`rounded-full border px-3 py-1 text-xs ${filter === s ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"}`}>{titleCase(s)}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {projects.length === 0 ? <Empty>No projects here.</Empty> : (
          <table className="data-table">
            <thead><tr><th>Project</th><th>Artist / client</th><th>Type</th><th>Status</th><th>Milestones</th><th>Songs</th><th>Due</th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const done = p.milestones.filter((m) => m.completedAt).length;
                return (
                  <tr key={p.id}>
                    <td><Link href={`/projects/${p.id}`} className="font-medium link">{p.name}</Link></td>
                    <td>{p.artist?.name ?? (p.client ? fullName(p.client) : "—")}</td>
                    <td>{p.type}</td>
                    <td><Badge tone={projectTone[p.status]}>{titleCase(p.status)}</Badge></td>
                    <td>
                      {p.milestones.length > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded bg-gray-200"><div className="h-1.5 rounded bg-brand-500" style={{ width: `${(done / p.milestones.length) * 100}%` }} /></div>
                          <span className="text-xs text-gray-500">{done}/{p.milestones.length}</span>
                        </div>
                      )}
                    </td>
                    <td>{p._count.tracks}</td>
                    <td>{fmtDate(p.dueDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
