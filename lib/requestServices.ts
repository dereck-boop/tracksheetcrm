/** The services a client can pick on the public booking page. No prices; the studio quotes after. */
export const REQUEST_SERVICES = ["Mastering", "Mixing", "Recording/Tracking", "Consult"] as const;

/** A social link as typed by a client: "@handle" becomes an Instagram URL, a bare domain gets https://. */
export function socialUrl(v: string) {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("@")) return `https://instagram.com/${s.slice(1)}`;
  return `https://${s}`;
}
