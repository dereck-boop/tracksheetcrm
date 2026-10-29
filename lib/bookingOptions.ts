import { db } from "./db";
import { fullName } from "./format";

export async function bookingOptions(studioId: string) {
  const [rooms, types, contacts, projects, engineers] = await Promise.all([
    db.room.findMany({ where: { studioId, active: true }, orderBy: { sortOrder: "asc" } }),
    db.bookingType.findMany({ where: { studioId }, orderBy: { sortOrder: "asc" } }),
    db.contact.findMany({ where: { studioId }, orderBy: { firstName: "asc" } }),
    db.project.findMany({ where: { studioId, status: { notIn: ["CLOSED"] } }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { studioId, active: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    rooms: rooms.map((r) => ({ value: r.id, label: r.name })),
    types: types.map((t) => ({ value: t.id, label: t.name })),
    contacts: contacts.map((c) => ({ value: c.id, label: fullName(c) })),
    projects: projects.map((p) => ({ value: p.id, label: p.name })),
    engineers: engineers.map((u) => ({ value: u.id, label: u.name })),
  };
}
