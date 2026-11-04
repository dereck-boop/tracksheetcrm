/**
 * Music industry paperwork filled from data typed once: split sheets, session player releases and
 * label copy. Pure helpers only (no database), so pages, actions and tests can all use them.
 */
import { render } from "./renderTemplate";
import { fmtDate, format, inTz } from "./format";

export const CREDIT_ROLES = [
  "Producer", "Recording engineer", "Mixing engineer", "Mastering engineer", "Assistant engineer", "Editing",
  "Vocals", "Background vocals", "Guitar", "Bass", "Drums", "Keys", "Piano", "Synth", "Strings", "Horns", "Percussion", "Programming", "Arranger",
];
export const SPLIT_ROLES = ["Writer", "Composer", "Lyricist", "Producer", "Publisher"];
export const PROS = ["BMI", "ASCAP", "SESAC", "GMR", "SOCAN", "PRS", "None yet"];
/** The studio's usual credits, offered as one-click checkboxes on a song. */
export const STUDIO_CREDITS = ["Recording engineer", "Mixing engineer", "Mastering engineer", "Producer"];
export const PAY_METHODS = ["Cash", "Check", "Venmo", "Zelle", "PayPal", "Cash App", "Bank transfer", "Other"];

export const splitTotal = (splits: { percent: unknown }[]) => Math.round(splits.reduce((s, x) => s + Number(x.percent), 0) * 100) / 100;

/** "3:45" or "225" (seconds) to seconds; null if blank or unreadable. */
export function parseDuration(v: string | null | undefined): number | null {
  const s = v?.trim();
  if (!s) return null;
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return /^\d+$/.test(s) ? Number(s) : null;
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** ISRCs are 12 characters: country (2 letters), registrant (3), year (2 digits), number (5 digits). */
export const cleanIsrc = (v: string | null | undefined) => v?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
export const isrcLooksRight = (v: string) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(v);

/** Liner-notes style credits for one song, roles grouped: "Mixing engineer: A, B". */
export function creditLines(credits: { name: string; role: string }[]) {
  const byRole = new Map<string, string[]>();
  for (const c of credits) byRole.set(c.role, [...(byRole.get(c.role) ?? []), c.name]);
  return [...byRole.entries()].map(([role, names]) => `${role}: ${names.join(", ")}`);
}

type LabelTrack = {
  title: string; isrc: string | null; duration: number | null; explicit: boolean; featuring: string | null;
  credits: { name: string; role: string }[];
  splits: { name: string; role: string; percent: unknown; pro: string | null; ipi: string | null; publisher: string | null; signedAt: Date | null }[];
};
type LabelProject = { name: string; type: string | null; label: string | null; upc: string | null; releaseDate: Date | null; pLine: string | null; cLine: string | null; artist: { name: string } | null };

/** What's still missing before the label copy is complete, in plain words. Empty = ready. */
export function labelCopyGaps(p: LabelProject, tracks: LabelTrack[]): string[] {
  const gaps: string[] = [];
  if (!tracks.length) return ["Add the songs to the project."];
  if (!p.artist) gaps.push("Pick the artist on the project.");
  if (!p.releaseDate) gaps.push("Add the release date.");
  if (!p.pLine) gaps.push("Add the ℗ line (who owns the recordings).");
  const titles = (f: (t: LabelTrack) => boolean) => tracks.filter(f).map((t) => `“${t.title}”`).join(", ");
  const noIsrc = titles((t) => !t.isrc);
  if (noIsrc) gaps.push(`ISRC missing on ${noIsrc}.`);
  const noTime = titles((t) => t.duration == null);
  if (noTime) gaps.push(`Length missing on ${noTime}.`);
  const noSplit = titles((t) => !t.splits.length);
  if (noSplit) gaps.push(`No writers on ${noSplit}.`);
  const off = titles((t) => t.splits.length > 0 && splitTotal(t.splits) !== 100);
  if (off) gaps.push(`Writer shares don't add up to 100% on ${off}.`);
  const unsigned = titles((t) => t.splits.length > 0 && t.splits.some((s) => !s.signedAt));
  if (unsigned) gaps.push(`Split sheet not signed by everyone on ${unsigned}.`);
  return gaps;
}

const dateText = (d: Date | null) => (d ? format(d, "yyyy-MM-dd") : "");

/** The label copy as plain text, ready to paste into an email, a distributor form or liner notes. */
export function labelCopyText(p: LabelProject, tracks: LabelTrack[], studioName: string) {
  const head = [
    `${p.artist ? `${p.artist.name} – ` : ""}${p.name}${p.type ? ` (${p.type})` : ""}`,
    p.label ? `Label: ${p.label}` : "Self-released",
    p.upc && `UPC: ${p.upc}`,
    p.releaseDate && `Release date: ${dateText(p.releaseDate)}`,
  ].filter(Boolean).join("\n");
  const songs = tracks.map((t, i) => {
    const writers = t.splits.filter((s) => s.role !== "Publisher");
    const pubs = [...new Set(t.splits.map((s) => s.publisher).filter(Boolean))];
    return [
      `${i + 1}. ${t.title}${t.featuring ? ` (feat. ${t.featuring})` : ""}${t.duration != null ? `  ${fmtDuration(t.duration)}` : ""}${t.explicit ? "  [Explicit]" : ""}`,
      t.isrc && `ISRC: ${t.isrc}`,
      writers.length > 0 && `Written by: ${writers.map((s) => `${s.name} (${Number(s.percent)}%${s.pro ? `, ${s.pro}` : ""}${s.ipi ? `, IPI ${s.ipi}` : ""})`).join("; ")}`,
      pubs.length > 0 && `Published by: ${pubs.join(", ")}`,
      ...creditLines(t.credits),
    ].filter(Boolean).join("\n");
  });
  const foot = [p.pLine && `℗ ${p.pLine}`, p.cLine && `© ${p.cLine}`, `Recorded at ${studioName}`].filter(Boolean).join("\n");
  return [head, ...songs, foot].join("\n\n");
}

/** Every credit and writer split, one row each, for a label's or distributor's spreadsheet. */
export function labelCopyRows(p: LabelProject, tracks: LabelTrack[]) {
  return [
    ["Artist", "Release", "UPC", "Track #", "Song", "Featuring", "ISRC", "Length", "Explicit", "Type", "Name", "Role", "Share %", "PRO", "IPI", "Publisher", "Signed"],
    ...tracks.flatMap((t, i) => {
      const base = [p.artist?.name ?? "", p.name, p.upc ?? "", i + 1, t.title, t.featuring ?? "", t.isrc ?? "", fmtDuration(t.duration), t.explicit ? "Yes" : "No"];
      const rows = [
        ...t.splits.map((s) => [...base, "Writer split", s.name, s.role, Number(s.percent), s.pro ?? "", s.ipi ?? "", s.publisher ?? "", dateText(s.signedAt)]),
        ...t.credits.map((c) => [...base, "Credit", c.name, c.role, "", "", "", "", ""]),
      ];
      return rows.length ? rows : [[...base, "", "", "", "", "", "", "", ""]];
    }),
  ];
}

// ─── Session player release ──────────────────────────────────────────

export const RELEASE_VARS = ["player", "role", "project", "artist", "owner", "studio_name", "date", "fee"];

export const DEFAULT_SESSION_RELEASE = `SESSION PLAYER RELEASE (WORK FOR HIRE)

I, {{player}}, performed {{role}} on recordings for "{{project}}" by {{artist}}, made at {{studio_name}} on {{date}}.

1. Payment. I'm being paid {{fee}} as a one-time flat fee for my performance. I won't get royalties, points or other payments from these recordings unless that's agreed separately in writing.

2. Ownership. My performance was made as a work made for hire for {{owner}}. If it doesn't count as a work for hire, I assign all my rights in the recordings of my performance to {{owner}}.

3. My name. {{owner}} and {{studio_name}} may use my name, approved photos and short bio to credit me and promote these recordings.

4. Songwriting. This covers my performance only. It doesn't change any songwriting share I may have, which is set out separately on a split sheet.

5. I'm free to sign this, and I haven't agreed anything with anyone else that conflicts with it.`;

/** The release with this hire's details filled in. */
export function sessionReleaseText(
  template: string | null | undefined,
  h: { name: string; legalName?: string | null; role: string; fee: number; workDate: Date | null },
  p: { name: string; artist?: { name: string } | null; client?: { firstName: string; lastName?: string | null } | null },
  studioName: string,
  money: (cents: number) => string,
) {
  const artist = p.artist?.name ?? (p.client ? [p.client.firstName, p.client.lastName].filter(Boolean).join(" ") : p.name);
  return render(template?.trim() || DEFAULT_SESSION_RELEASE, {
    player: h.legalName || h.name,
    role: h.role.toLowerCase(),
    project: p.name,
    artist,
    owner: artist,
    studio_name: studioName,
    date: h.workDate ? fmtDate(h.workDate) : "the session dates",
    fee: money(h.fee),
  });
}

/** Money paid out to people in one calendar year, by person, for 1099 checks. */
export function paidInYear(hires: { paidAt: Date | null; fee: number }[], year: number) {
  return hires.filter((h) => h.paidAt && inTz(h.paidAt).getFullYear() === year).reduce((s, h) => s + h.fee, 0);
}
/** Paying one person this much or more in a year needs a 1099-NEC (it was $600 before 2026). */
export const CONTRACTOR_1099_LIMIT = 200000;
