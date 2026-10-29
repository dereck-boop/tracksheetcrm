import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { saveRoom } from "../actions";

export const metadata = { title: "Studios" };

export default async function RoomsPage() {
  const user = await requireUser();
  const rooms = await db.room.findMany({ where: { studioId: user.studioId }, orderBy: { sortOrder: "asc" } });
  const dollars = (c: number | null) => (c != null ? String(c / 100) : "");
  return (
    <>
      <PageHeader title="Studios" subtitle="Every place you run sessions: your own room and any other studios you book. Each one gets its own column in the Day view." />
      <div className="grid gap-6 lg:grid-cols-2">
        {rooms.map((r) => (
          <Card key={r.id} title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: r.color }} />{r.name}</span>} actions={<span className="text-xs text-gray-500">{r.hourlyRate ? `${money(r.hourlyRate)}/hr` : ""}</span>}>
            <RoomForm room={r} dollars={dollars} />
          </Card>
        ))}
        <Card title="Add studio"><RoomForm dollars={dollars} /></Card>
      </div>
    </>
  );
}

function RoomForm({ room, dollars }: { room?: { id: string; name: string; address: string | null; onlineBooking: boolean; description: string | null; color: string; hourlyRate: number | null; dayRate: number | null; capacity: number | null; active: boolean }; dollars: (c: number | null) => string }) {
  return (
    <form action={saveRoom} className="grid grid-cols-2 gap-3">
      {room && <input type="hidden" name="id" value={room.id} />}
      <input aria-label="Studio name" name="name" required defaultValue={room?.name} placeholder="Studio name" className="input col-span-2" />
      <input aria-label="Address (shown on bookings and in client emails)" name="address" defaultValue={room?.address ?? ""} placeholder="Address (shown on bookings and in client emails)" className="input col-span-2" />
      <input aria-label="Notes (parking, door code, contact…)" name="description" defaultValue={room?.description ?? ""} placeholder="Notes (parking, door code, contact…)" className="input col-span-2" />
      <label><span className="label">Hourly $</span><input name="hourlyRate" defaultValue={dollars(room?.hourlyRate ?? null)} className="input" /></label>
      <label><span className="label">Day $</span><input name="dayRate" defaultValue={dollars(room?.dayRate ?? null)} className="input" /></label>
      <label><span className="label">Capacity</span><input name="capacity" type="number" defaultValue={room?.capacity ?? ""} className="input" /></label>
      <label><span className="label">Color</span><input name="color" type="color" defaultValue={room?.color ?? "#2f7d6d"} className="input h-10 p-1" /></label>
      {room && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={room.active} /> Active (shows on the calendar and in booking forms)</label>}
      <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="onlineBooking" defaultChecked={room?.onlineBooking ?? true} /> Clients can request this studio on your online booking page</label>
      <div className="col-span-2"><button className="btn-primary btn-sm">{room ? "Save" : "Add studio"}</button></div>
    </form>
  );
}
