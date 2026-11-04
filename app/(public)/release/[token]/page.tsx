import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { sessionReleaseText } from "@/lib/forms";
import { PrintButton } from "@/components/PrintButton";
import { signRelease } from "../../actions";

export const metadata = { title: "Session release", robots: { index: false } };
export const dynamic = "force-dynamic";

/** A session player reads their release (work for hire) and signs it on their phone. */
export default async function SessionRelease({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await db.sessionHire.findUnique({ where: { token }, include: { contact: true, studio: true, project: { include: { artist: true, client: true } } } });
  if (!h) notFound();
  const s = h.studio;
  // Once signed, show exactly what was signed, even if the studio has since changed its wording.
  const text = h.signedText ?? sessionReleaseText(s.sessionReleaseText, { ...h, legalName: h.contact?.legalName }, h.project, s.name, (c) => money(c, s.currency));
  return (
    <>
      <div className="mb-3 flex justify-end print:hidden"><PrintButton /></div>
      <div className="card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">{s.name}</div>
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">{text}</div>
        {h.signedAt && (
          <div className="mt-8 border-t border-gray-200 pt-4 text-sm">
            <div>Signed: <span className="font-medium">{h.signedName}</span></div>
            <div className="text-gray-500">{fmtDateTime(h.signedAt)}</div>
          </div>
        )}
      </div>
      {!h.signedAt ? (
        <form action={signRelease} className="mx-auto mt-6 max-w-md space-y-3 print:hidden">
          <input type="hidden" name="token" value={token} />
          <label className="block"><span className="label">Legal name (if different from how you&apos;re credited)</span><input name="legalName" defaultValue={h.contact?.legalName ?? ""} className="input" /></label>
          <label className="block"><span className="label">Mailing address (for your payment and tax paperwork)</span><input name="address" defaultValue={h.contact?.address ?? ""} autoComplete="street-address" className="input" /></label>
          <label className="block"><span className="label">Type your full name to sign</span><input name="name" required autoComplete="name" defaultValue={h.contact?.legalName ?? h.name} className="input" /></label>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" name="agree" required className="mt-1" /> <span>I&apos;ve read this release and agree to it.</span></label>
          <div className="flex justify-end"><button className="btn-primary px-6">Sign release</button></div>
          <p className="text-xs text-gray-500">Something wrong? Don&apos;t sign; reply to the email from {s.name} instead.</p>
        </form>
      ) : <p className="mt-6 text-center text-emerald-700 print:hidden">You signed on {fmtDate(h.signedAt)}. Print or save this page for your records.</p>}
    </>
  );
}
