import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { addTask, deleteTask, toggleTask } from "@/app/(app)/_actions/shared";
import { Card } from "./ui";

type Parent = { leadId?: string; contactId?: string; projectId?: string };

export async function TasksPanel({ parent, path, studioId }: { parent: Parent; path: string; studioId: string }) {
  const [tasks, team] = await Promise.all([
    db.task.findMany({
      where: { ...parent, studioId },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      include: { assignee: { select: { name: true } } },
    }),
    db.user.findMany({ where: { studioId, active: true }, select: { id: true, name: true } }),
  ]);
  const [key, value] = Object.entries(parent)[0]!;
  return (
    <Card title="To-Dos">
      <ul className="mb-4 space-y-1.5">
        {tasks.length === 0 && <li className="text-sm text-gray-500">Nothing to do yet.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-start gap-2 text-sm">
            <form action={toggleTask}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="path" value={path} />
              <button
                className={`mt-0.5 h-4 w-4 rounded border ${t.status === "DONE" ? "border-brand-600 bg-brand-600" : "border-gray-400"}`}
                aria-label="Toggle done"
              />
            </form>
            <div className="flex-1">
              <div className={t.status === "DONE" ? "text-gray-400 line-through" : "text-gray-800"}>{t.title}</div>
              <div className="text-xs text-gray-500">
                {t.assignee?.name ?? "Unassigned"}
                {t.dueDate && ` · due ${fmtDate(t.dueDate)}`}
              </div>
            </div>
            <form action={deleteTask} className="opacity-0 group-hover:opacity-100">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="path" value={path} />
              <button className="text-xs text-red-500">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={addTask} className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
        <input type="hidden" name={key} value={value} />
        <input type="hidden" name="path" value={path} />
        <input name="title" required placeholder="New to-do" className="input col-span-2" />
        <input name="dueDate" type="date" className="input" title="Due date" />
        <select name="assigneeId" aria-label="Assign to" className="input">
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary col-span-2">Add to-do</button>
      </form>
    </Card>
  );
}
