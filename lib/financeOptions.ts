import { db } from "./db";
import { fullName } from "./format";

export async function financeOptions(studioId: string) {
  const [contacts, projects, services, studio] = await Promise.all([
    db.contact.findMany({ where: { studioId }, orderBy: { firstName: "asc" } }),
    db.project.findMany({ where: { studioId }, orderBy: { createdAt: "desc" } }),
    db.service.findMany({ where: { studioId, active: true }, orderBy: { name: "asc" } }),
    db.studio.findUniqueOrThrow({ where: { id: studioId } }),
  ]);
  return {
    contacts: contacts.map((c) => ({ value: c.id, label: fullName(c) })),
    projects: projects.map((p) => ({ value: p.id, label: p.name })),
    services: services.map((s) => ({ name: s.name, unit: s.unit, unitPrice: s.unitPrice, taxable: s.taxable })),
    defaultTax: studio.defaultTaxRate.toString(),
  };
}
