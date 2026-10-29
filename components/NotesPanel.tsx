import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { addNote, deleteNote } from "@/app/(app)/_actions/shared";
import { Card } from "./ui";

type Parent = { leadId?: string; contactId?: string; artistId?: string; companyId?: string; projectId?: string };

export async function NotesPanel({ parent, path }: { parent: Parent; path: string }) {
  const notes = await db.note.findMany({
    where: parent,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
    take: 50,
  });
  const [key, value] = Object.entries(parent)[0]!;
  return (
    <Card title="Conversation & notes">
      <form action={addNote} className="mb-4 space-y-2">
        <input type="hidden" name={key} value={value} />
        <input type="hidden" name="path" value={path} />
        <textarea name="body" required rows={2} placeholder="Log a call, email or note…" className="input" />
        <div className="flex items-center gap-2">
          <select name="kind" aria-label="Note type" className="input w-auto">
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="text">Text</option>
          </select>
          <button className="btn-primary btn-sm">Add</button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="text-sm text-gray-500">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-md bg-gray-50 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  <span className="font-medium capitalize text-gray-700">{n.kind}</span> · {n.user?.name ?? "Someone"} ·{" "}
                  {ago(n.createdAt)}
                </span>
                <form action={deleteNote} className="opacity-0 group-hover:opacity-100">
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="path" value={path} />
                  <button className="text-red-500 hover:underline">Delete</button>
                </form>
              </div>
              <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
