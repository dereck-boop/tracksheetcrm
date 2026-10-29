import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { addTask, toggleTask } from "../_actions/shared";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "To-dos" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string; show?: string }> }) {
  const user = await requireUser();
  const { who, show } = await searchParams;
  const everyone = who === "all";
  const tasks = await db.task.findMany({
    where: {
      studioId: user.studioId,
      ...(everyone ? {} : { assigneeId: user.id }),
      ...(show === "done" ? { status: "DONE" } : { status: { not: "DONE" } }),
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "asc" }],
    include: { project: true, contact: true, assignee: true },
    take: 300,
  });
  const team = await db.user.findMany({ where: { studioId: user.studioId, active: true } });
  const now = new Date();
  const q = (o: Record<string, string | undefined>) => "/tasks?" + new URLSearchParams(Object.entries({ who, show, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="To-Dos" subtitle={everyone ? "Everyone's to-dos" : "Assigned to you"} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={q({ who: undefined })} className={!everyone ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Mine</Link>
        <Link href={q({ who: "all" })} className={everyone ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Everyone</Link>
        <span className="mx-2 border-l border-gray-300" />
        <Link href={q({ show: undefined })} className={show !== "done" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Open</Link>
        <Link href={q({ show: "done" })} className={show === "done" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Completed</Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card divide-y divide-gray-100 lg:col-span-2">
          {tasks.length === 0 && <p className="p-6 text-sm text-gray-500">All clear.</p>}
          {tasks.map((t) => {
            const overdue = t.status !== "DONE" && t.dueDate && t.dueDate < now;
            const link = t.project ? { href: `/projects/${t.project.id}`, label: t.project.name } : t.contact ? { href: `/contacts/${t.contact.id}`, label: t.contact.firstName } : null;
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <form action={toggleTask}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="path" value="/tasks" />
                  <button className={`mt-0.5 h-4 w-4 rounded border ${t.status === "DONE" ? "border-brand-600 bg-brand-600" : "border-gray-400"}`} aria-label="Toggle done" />
                </form>
                <div className="flex-1">
                  <div className={t.status === "DONE" ? "text-gray-400 line-through" : ""}>{t.title}</div>
                  <div className="text-xs text-gray-500">
                    {link && <Link href={link.href} className="link">{link.label}</Link>}
                    {everyone && ` · ${t.assignee?.name ?? "Unassigned"}`}
                  </div>
                </div>
                {t.priority === 1 && <Badge tone="red">High</Badge>}
                <span className={`text-xs ${overdue ? "font-medium text-red-600" : "text-gray-500"}`}>{t.dueDate ? fmtDate(t.dueDate) : ""}</span>
              </div>
            );
          })}
        </div>
        <Card title="New to-do">
          <form action={addTask} className="space-y-3">
            <input type="hidden" name="path" value="/tasks" />
            <input aria-label="What needs doing?" name="title" required placeholder="What needs doing?" className="input" />
            <label className="block"><span className="label">Due</span><input name="dueDate" type="date" className="input" /></label>
            <label className="block"><span className="label">Remind me</span><input name="remindAt" type="datetime-local" className="input" /></label>
            <label className="block"><span className="label">Assign to</span>
              <select name="assigneeId" defaultValue={user.id} className="input">{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </label>
            <label className="block"><span className="label">Priority</span>
              <select name="priority" defaultValue="2" className="input"><option value="1">High</option><option value="2">Normal</option><option value="3">Low</option></select>
            </label>
            <button className="btn-primary">Add to-do</button>
          </form>
        </Card>
      </div>
    </>
  );
}
