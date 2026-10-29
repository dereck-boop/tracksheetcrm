/** A booking's price: its quoted rate, else the package or studio rate × hours (what its invoice would charge). */
export function sessionLine(b: {
  startsAt: Date;
  endsAt: Date;
  rate: number | null;
  service?: { unit: string; unitPrice: number; taxable: boolean } | null;
  room: { hourlyRate: number | null; dayRate: number | null };
}) {
  const hrs = Math.round(((b.endsAt.getTime() - b.startsAt.getTime()) / 3_600_000) * 100) / 100;
  const item = b.rate != null ? { quantity: 1, unitPrice: b.rate }
    : b.service ? { quantity: b.service.unit === "hour" ? hrs : 1, unitPrice: b.service.unitPrice }
    : b.room.hourlyRate ? { quantity: hrs, unitPrice: b.room.hourlyRate }
    : { quantity: 1, unitPrice: b.room.dayRate ?? 0 };
  return { ...item, total: Math.round(item.quantity * item.unitPrice), taxable: b.service?.taxable ?? true };
}
