import { parseLocal } from "./format";

/** Helpers for reading FormData in server actions. */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function req(fd: FormData, key: string, label = key): string {
  const v = str(fd, key);
  if (!v) throw new Error(`${label} is required`);
  return v;
}

export function date(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  return parseLocal(v);
}

export function int(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
