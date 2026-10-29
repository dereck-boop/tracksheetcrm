import type { Project } from "@prisma/client";
import { db } from "@/lib/db";
import { fullName, toDateInput } from "@/lib/format";
import { PROJECT_TYPES } from "@/lib/status";
import { ClientSelect } from "./ClientSelect";
import { Field, Select } from "./ui";

export async function ProjectForm({ studioId, project, defaults, action, submit }: {
  studioId: string;
  project?: Project;
  defaults?: { clientId?: string; artistId?: string };
  action: (fd: FormData) => Promise<void>;
  submit: string;
}) {
  const [contacts, artists, team] = await Promise.all([
    db.contact.findMany({ where: { studioId }, orderBy: { firstName: "asc" } }),
    db.artist.findMany({ where: { studioId }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { studioId, active: true } }),
  ]);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {project && <input type="hidden" name="id" value={project.id} />}
      <Field label="Project name" className="sm:col-span-2"><input name="name" required defaultValue={project?.name} className="input" /></Field>
      <Field label="Type"><Select name="type" defaultValue={project?.type} placeholder="—" options={PROJECT_TYPES.map((t) => ({ value: t, label: t }))} /></Field>
      <ClientSelect name="clientId" defaultValue={project?.clientId ?? defaults?.clientId} placeholder="None" options={contacts.map((c) => ({ value: c.id, label: fullName(c) }))} />
      <Field label="Artist / group"><Select name="artistId" defaultValue={project?.artistId ?? defaults?.artistId} placeholder="None" options={artists.map((a) => ({ value: a.id, label: a.name }))} /></Field>
      <Field label="Project manager"><Select name="managerId" defaultValue={project?.managerId} placeholder="—" options={team.map((u) => ({ value: u.id, label: u.name }))} /></Field>
      <Field label="Budget ($)"><input name="budget" inputMode="decimal" defaultValue={project?.budget ? String(project.budget / 100) : ""} className="input" /></Field>
      <Field label="Start"><input name="startDate" type="date" defaultValue={toDateInput(project?.startDate)} className="input" /></Field>
      <Field label="Due"><input name="dueDate" type="date" defaultValue={toDateInput(project?.dueDate)} className="input" /></Field>
      <Field label="Description" className="sm:col-span-2"><textarea name="description" rows={3} defaultValue={project?.description ?? ""} className="input" /></Field>
      <div className="sm:col-span-2"><button className="btn-primary">{submit}</button></div>
    </form>
  );
}
