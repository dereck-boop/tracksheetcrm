import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { creditLines, fmtDuration, labelCopyGaps, labelCopyText, splitTotal } from "@/lib/forms";
import { CopyLink } from "@/components/CopyLink";
import { PrintButton } from "@/components/PrintButton";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Label copy" };

/**
 * The label copy (credits sheet) for a release, filled in from the project, its songs, their split
 * sheets and credits. Print it, save it as a PDF, copy it as text, or download it as a spreadsheet.
 */
export default async function LabelCopy({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await db.project.findFirst({
    where: { id, studioId: user.studioId },
    include: { artist: true, tracks: { orderBy: { sortOrder: "asc" }, include: { credits: { orderBy: { sortOrder: "asc" } }, splits: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!p) notFound();
  const gaps = labelCopyGaps(p, p.tracks);
  const text = labelCopyText(p, p.tracks, user.studio.name);
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Label copy"
          subtitle={<Link href={`/projects/${id}`} className="link">{p.name}</Link>}
          actions={<><CopyLink url={text} label="Copy as text" /><a href={`/projects/${id}/label-copy.csv`} className="btn-secondary">Spreadsheet (CSV)</a><PrintButton /></>}
        />
        {gaps.length > 0 ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="mb-1 font-medium">Still to fill in</div>
            <ul className="list-disc space-y-0.5 pl-5">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            <p className="mt-2 text-xs">Add release details on the <Link href={`/projects/${id}`} className="underline">project</Link>, and song details, writers and credits on each song.</p>
          </div>
        ) : <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Everything&apos;s filled in and every split sheet is signed.</div>}
      </div>
      <div className="card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Label copy</div>
        <h1 className="mt-1 text-3xl text-black">{p.artist ? `${p.artist.name} – ` : ""}{p.name}</h1>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-gray-500">Type: </dt><dd className="inline">{p.type ?? "—"}</dd></div>
          <div><dt className="inline text-gray-500">Label: </dt><dd className="inline">{p.label ?? "Self-released"}</dd></div>
          <div><dt className="inline text-gray-500">Release date: </dt><dd className="inline">{fmtDate(p.releaseDate)}</dd></div>
          <div><dt className="inline text-gray-500">UPC: </dt><dd className="inline font-mono">{p.upc ?? "—"}</dd></div>
        </dl>
        <ol className="mt-8 space-y-6">
          {p.tracks.map((t, i) => {
            const total = splitTotal(t.splits);
            return (
              <li key={t.id} className="break-inside-avoid border-t border-gray-200 pt-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-gray-400 tabular-nums">{i + 1}.</span>
                  <Link href={`/projects/${id}/songs/${t.id}`} className="text-lg font-medium text-black hover:underline print:no-underline">{t.title}</Link>
                  {t.featuring && <span className="text-gray-600">feat. {t.featuring}</span>}
                  {t.explicit && <span className="rounded border border-gray-400 px-1 text-[10px] font-semibold uppercase">Explicit</span>}
                  <span className="ml-auto text-sm tabular-nums text-gray-600">{fmtDuration(t.duration) || "length ?"}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-gray-500">ISRC {t.isrc ?? "not yet"}</div>
                {t.splits.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="data-table text-sm">
                      <thead><tr><th>Writer / publisher</th><th>Role</th><th className="text-right">Share</th><th>PRO</th><th>IPI</th><th>Publisher</th></tr></thead>
                      <tbody>
                        {t.splits.map((s) => (
                          <tr key={s.id}><td>{s.name}</td><td>{s.role}</td><td className="text-right tabular-nums">{Number(s.percent)}%</td><td>{s.pro ?? "—"}</td><td className="font-mono text-xs">{s.ipi ?? "—"}</td><td>{s.publisher ?? "—"}</td></tr>
                        ))}
                        {total !== 100 && <tr><td colSpan={6} className="text-xs text-amber-700">Shares add up to {total}%</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                {t.credits.length > 0 && <ul className="mt-3 space-y-0.5 text-sm">{creditLines(t.credits).map((l) => <li key={l}>{l}</li>)}</ul>}
              </li>
            );
          })}
        </ol>
        <div className="mt-8 border-t border-gray-200 pt-4 text-sm text-gray-700">
          {p.pLine && <div>℗ {p.pLine}</div>}
          {p.cLine && <div>© {p.cLine}</div>}
          <div>Recorded at {user.studio.name}</div>
        </div>
      </div>
    </>
  );
}
