import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { splitTotal } from "@/lib/forms";
import { PrintButton } from "@/components/PrintButton";
import { signSplit } from "../../actions";

export const metadata = { title: "Split sheet", robots: { index: false } };
export const dynamic = "force-dynamic";

/** One writer's view of a song's split sheet: everyone's shares, and a box to sign their own line. */
export default async function SplitSheet({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const me = await db.trackSplit.findUnique({ where: { token }, include: { track: { include: { splits: { orderBy: { createdAt: "asc" } }, project: { include: { artist: true, studio: true } } } } } });
  if (!me) notFound();
  const t = me.track;
  const s = t.project.studio;
  const done = t.splits.every((x) => x.signedAt);
  return (
    <>
      <div className="mb-3 flex justify-end print:hidden"><PrintButton /></div>
      <div className="card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Songwriter split sheet</div>
        <h1 className="mt-1 text-3xl text-black">{t.title}</h1>
        <p className="text-sm text-gray-500">{[t.project.artist?.name, t.project.name].filter(Boolean).join(" · ")}{t.isrc && ` · ISRC ${t.isrc}`} · prepared by {s.name} on {fmtDate(me.createdAt)}</p>
        <div className="mt-6 overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Writer</th><th>Role</th><th>PRO / IPI</th><th>Publisher</th><th className="text-right">Share</th><th>Signed</th></tr></thead>
            <tbody>
              {t.splits.map((x) => (
                <tr key={x.id} className={x.id === me.id ? "bg-amber-50/60" : ""}>
                  <td className="font-medium">{x.name}{x.id === me.id && <span className="ml-1 text-xs text-gray-500">(you)</span>}</td>
                  <td>{x.role}</td>
                  <td className="text-xs">{[x.pro, x.ipi].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-xs">{x.publisher ?? "—"}</td>
                  <td className="text-right tabular-nums">{Number(x.percent)}%</td>
                  <td className="text-xs">{x.signedAt ? `${x.signedName}, ${fmtDateTime(x.signedAt)}` : "not yet"}</td>
                </tr>
              ))}
              <tr><td colSpan={4} className="text-right text-xs uppercase tracking-wider text-gray-500">Total</td><td className="text-right font-medium tabular-nums">{splitTotal(t.splits)}%</td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-xs text-gray-500">By signing, each writer agrees these are the songwriting and publishing shares of this composition. The sound recording (master) is separate and isn&apos;t covered here.</p>
        {done && <p className="mt-4 text-sm font-medium text-emerald-700">Signed by everyone.</p>}
      </div>
      {!me.signedAt ? (
        <form action={signSplit} className="mx-auto mt-6 max-w-md space-y-3 print:hidden">
          <input type="hidden" name="token" value={token} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Your PRO (optional)</span><input name="pro" defaultValue={me.pro ?? ""} placeholder="BMI, ASCAP…" className="input" /></label>
            <label className="block"><span className="label">Your IPI (optional)</span><input name="ipi" defaultValue={me.ipi ?? ""} className="input" /></label>
          </div>
          <label className="block"><span className="label">Type your full name to sign</span><input name="name" required autoComplete="name" defaultValue={me.name} className="input" /></label>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" name="agree" required className="mt-1" /> <span>I agree to my {Number(me.percent)}% share and to the split above.</span></label>
          <div className="flex justify-end"><button className="btn-primary px-6">Sign split sheet</button></div>
          <p className="text-xs text-gray-500">Something wrong? Don&apos;t sign; reply to the email from {s.name} instead.</p>
        </form>
      ) : <p className="mt-6 text-center text-emerald-700 print:hidden">You signed on {fmtDate(me.signedAt)}. Print or save this page for your records.</p>}
    </>
  );
}
