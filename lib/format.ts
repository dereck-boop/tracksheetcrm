import { format as fmt, formatDistanceToNowStrict } from "date-fns";
import { TZDate } from "@date-fns/tz";

/** The studio's wall-clock timezone. All dates are stored in UTC and shown in this zone. */
export const TZ = process.env.STUDIO_TIMEZONE || "America/New_York";

/** A Date viewed in the studio timezone (getHours(), getDay() etc. return studio-local values). */
export const inTz = (d: Date | number) => new TZDate(typeof d === "number" ? d : d.getTime(), TZ);
const format = (d: Date, f: string) => fmt(inTz(d), f);
export { format };

/** Parse "2026-10-12T14:30" or "2026-10-12" as studio wall-clock time. */
export function parseLocal(v: string): Date | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  return new Date(new TZDate(+y!, +mo! - 1, +d!, +h, +mi, TZ).getTime());
}

export function money(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    (cents ?? 0) / 100,
  );
}

/** "$1,250.50" or "1250.5" → 125050 */
export function toCents(value: FormDataEntryValue | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const fmtDate = (d: Date | null | undefined) => (d ? format(d, "MMM d, yyyy") : "—");
export const fmtDateTime = (d: Date | null | undefined) => (d ? format(d, "MMM d, yyyy h:mm a") : "—");
export const fmtTime = (d: Date) => format(d, "h:mm a");
export const ago = (d: Date) => formatDistanceToNowStrict(d, { addSuffix: true });

export function fullName(c: { firstName: string; lastName?: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Value for <input type="datetime-local"> */
export function toLocalInput(d: Date | null | undefined) {
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}
export function toDateInput(d: Date | null | undefined) {
  return d ? format(d, "yyyy-MM-dd") : "";
}
