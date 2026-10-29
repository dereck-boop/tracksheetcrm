import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { titleCase } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { inviteUser, resetTwoStep, setUserActive } from "../actions";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const user = await requireUser();
  const team = await db.user.findMany({ where: { studioId: user.studioId }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title="Team" subtitle="Engineers, assistants and admins who can sign in. Each person turns on two-step login under their name (bottom left)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Two-step</th><th></th></tr></thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td><td>{u.email}</td>
                  <td><Badge tone={u.role === "OWNER" ? "teal" : "gray"}>{titleCase(u.role)}</Badge></td>
                  <td>
                    {u.totpEnabledAt ? <Badge tone="green">on</Badge> : <Badge tone="amber">off</Badge>}
                    {u.totpEnabledAt && user.role === "OWNER" && u.id !== user.id && (
                      <form action={resetTwoStep} className="inline"><input type="hidden" name="id" value={u.id} /><button className="ml-2 text-xs link">Reset</button></form>
                    )}
                  </td>
                  <td>
                    {u.role !== "OWNER" && u.id !== user.id && (
                      <form action={setUserActive}>
                        <input type="hidden" name="id" value={u.id} /><input type="hidden" name="active" value={String(!u.active)} />
                        <button className="text-xs link">{u.active ? "Deactivate" : "Reactivate"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card title="Add team member">
          <form action={inviteUser} className="space-y-3">
            <input aria-label="Name" name="name" required placeholder="Name" className="input" />
            <input aria-label="Email" name="email" type="email" required placeholder="Email" className="input" />
            <select aria-label="Role" name="role" className="input"><option value="ENGINEER">Engineer</option><option value="ASSISTANT">Assistant</option><option value="ADMIN">Admin</option></select>
            <input aria-label="Temporary password" name="password" required minLength={10} placeholder="Temporary password" className="input" />
            <button className="btn-primary">Add</button>
          </form>
        </Card>
      </div>
    </>
  );
}
