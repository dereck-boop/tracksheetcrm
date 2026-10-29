import type { Service } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { saveService } from "../actions";

export const metadata = { title: "Price list" };

export default async function ServicesPage() {
  const user = await requireUser();
  const services = await db.service.findMany({ where: { studioId: user.studioId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader title="Price list" subtitle="Services you quote and invoice. Mark a service as bookable to offer it as a package on your online booking page." />
      <div className="grid gap-6 lg:grid-cols-2">
        {services.map((s) => (
          <Card key={s.id} title={<span className="flex items-center gap-2">{s.name}{s.bookable && <Badge tone="teal">bookable</Badge>}{!s.active && <Badge>inactive</Badge>}</span>} actions={<span className="text-sm text-gray-500">{money(s.unitPrice)}/{s.unit}</span>}>
            <ServiceForm s={s} />
          </Card>
        ))}
        <Card title="Add service"><ServiceForm /></Card>
      </div>
    </>
  );
}

function ServiceForm({ s }: { s?: Service }) {
  return (
    <form action={saveService} className="grid grid-cols-2 gap-3 text-sm">
      {s && <input type="hidden" name="id" value={s.id} />}
      <input aria-label="Name (e.g. Mix per song)" name="name" required defaultValue={s?.name} placeholder="Name (e.g. Mix per song)" className="input col-span-2" />
      <input aria-label="Description (optional)" name="description" defaultValue={s?.description ?? ""} placeholder="Description (optional)" className="input col-span-2" />
      <label><span className="label">Price $</span><input name="unitPrice" required defaultValue={s ? String(s.unitPrice / 100) : ""} className="input" /></label>
      <label><span className="label">Per</span>
        <select name="unit" defaultValue={s?.unit ?? "hour"} className="input">{["hour", "day", "song", "track", "session", "flat"].map((u) => <option key={u}>{u}</option>)}</select>
      </label>
      <label><span className="label">Booking length (hrs)</span><input name="durationHours" type="number" min={1} defaultValue={s?.durationMin ? s.durationMin / 60 : ""} className="input" /></label>
      <label><span className="label">Deposit % (override, 0 = never)</span><input name="depositPercent" type="number" min={0} max={100} defaultValue={s?.depositPercent ?? ""} className="input" /></label>
      <div className="col-span-2 flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" name="taxable" defaultChecked={s?.taxable ?? true} /> Taxable</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="bookable" defaultChecked={s?.bookable ?? false} /> Offer on booking page</label>
        {s && <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={s.active} /> Active</label>}
      </div>
      <div className="col-span-2"><button className="btn-primary btn-sm">{s ? "Save" : "Add service"}</button></div>
    </form>
  );
}
