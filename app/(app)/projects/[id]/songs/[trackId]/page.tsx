import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fullName } from "@/lib/format";
import { CREDIT_ROLES, creditLines, fmtDuration, PROS, SPLIT_ROLES, splitTotal, STUDIO_CREDITS } from "@/lib/forms";
import { splitLink } from "@/lib/formsSend";
import { CopyLink } from "@/components/CopyLink";
import { Badge, Card, EmailFlash, Field, PageHeader } from "@/components/ui";
import { addCredit, copyCreditsToAll, deleteCredit, deleteSplit, saveSplit, sendSplits, updateTrack } from "../../../actions";

/** The song sheet: details and ISRC, who played and engineered, and the songwriting split sheet. */
export default async function SongPage({ params, searchParams }: { params: Promise<{ id: string; trackId: string }>; searchParams: Promise<{ emailed?: string; email_error?: string }> }) {
  const user = await requireUser();
  const { id, trackId } = await params;
  const flash = await searchParams;
  const t = await db.track.findFirst({
    where: { id: trackId, projectId: id, project: { studioId: user.studioId } },
    include: { credits: { orderBy: { sortOrder: "asc" } }, splits: { orderBy: { createdAt: "asc" } }, project: { include: { artist: { include: { members: { include: { contact: true } } } } } } },
  });
  if (!t) notFound();
  const [team, contacts, songs] = await Promise.all([
    db.user.findMany({ where: { studioId: user.studioId, active: true }, select: { name: true } }),
    db.contact.findMany({ where: { studioId: user.studioId }, select: { firstName: true, lastName: true, email: true }, orderBy: { firstName: "asc" } }),
    db.track.count({ where: { projectId: id } }),
  ]);
  const total = splitTotal(t.splits);
  const signed = t.splits.filter((s) => s.signedAt).length;
  const members = t.project.artist?.members.map((m) => m.contact) ?? [];
  const names = [...new Set([...members.map(fullName), ...team.map((u) => u.name), ...contacts.map(fullName)])];
  const emails = [...new Map([...members, ...contacts].filter((c) => c.email).map((c) => [c.email!, fullName(c)])).entries()];
  const creditsText = [`${t.title}${t.project.artist ? ` (${t.project.artist.name})` : ""}`, ...creditLines(t.credits)].join("\n");

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={<><Link href={`/projects/${id}`} className="link">{t.project.name}</Link>{t.project.artist && ` · ${t.project.artist.name}`} · {t.stage}</>}
        actions={<><Link href={`/projects/${id}/label-copy`} className="btn-secondary">Label copy</Link><Link href={`/projects/${id}`} className="btn-secondary">Back to project</Link></>}
      />
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title={`Split sheet · ${total}%`}
            actions={t.splits.length > 0 && <span className="text-xs text-gray-500">{signed} of {t.splits.length} signed</span>}
          >
            <p className="mb-3 text-sm text-gray-600">Who wrote the song and what share each person gets. Settle it before release so royalties don&apos;t get stuck. Each writer signs their own link on their phone. Changing a share clears the signatures so everyone signs the new numbers. A writer&apos;s PRO, IPI and publisher fill in from their contact when you leave them blank.</p>
            {t.splits.length > 0 && (
              <div className="mb-4 overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Role</th><th className="text-right">Share</th><th>PRO / IPI</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {t.splits.map((s) => (
                      <tr key={s.id}>
                        <td><div className="font-medium">{s.name}</div><div className="text-xs text-gray-500">{s.email ?? "no email"}{s.publisher && ` · pub. ${s.publisher}`}</div></td>
                        <td>{s.role}</td>
                        <td className="text-right tabular-nums">{Number(s.percent)}%</td>
                        <td className="text-xs">{[s.pro, s.ipi].filter(Boolean).join(" · ") || "—"}</td>
                        <td>{s.signedAt ? <Badge tone="green">signed {fmtDate(s.signedAt)}</Badge> : s.sentAt ? <Badge tone="blue">sent</Badge> : <Badge>not sent</Badge>}</td>
                        <td className="whitespace-nowrap text-right">
                          <CopyLink url={splitLink(s.token)} label="Link" />
                          <form action={deleteSplit} className="inline"><input type="hidden" name="trackId" value={t.id} /><input type="hidden" name="id" value={s.id} /><button className="ml-2 text-xs text-red-600">Remove</button></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {t.splits.length > 0 && total !== 100 && <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900">The shares add up to {total}%. They need to make 100% before you send it.</p>}
            <details open={t.splits.length === 0} className="rounded-md border border-gray-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">Add a writer</summary>
              <form action={saveSplit} className="mt-3 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="trackId" value={t.id} />
                <Field label="Name"><input name="name" required list="split-names" className="input" /></Field>
                <Field label="Email"><input name="email" type="email" list="split-emails" className="input" /></Field>
                <Field label="Share %"><input name="percent" required inputMode="decimal" defaultValue={t.splits.length ? String(Math.max(0, 100 - total)) : "100"} className="input" /></Field>
                <Field label="Role"><select name="role" className="input">{SPLIT_ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
                <Field label="PRO"><input name="pro" list="pros" placeholder="From their contact" className="input" /></Field>
                <Field label="IPI number"><input name="ipi" placeholder="From their contact" className="input" /></Field>
                <Field label="Publisher (optional)" className="sm:col-span-2"><input name="publisher" className="input" /></Field>
                <div className="flex items-end"><button className="btn-primary w-full">Add</button></div>
                <datalist id="split-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
                <datalist id="split-emails">{emails.map(([e, n]) => <option key={e} value={e}>{n}</option>)}</datalist>
                <datalist id="pros">{PROS.map((p) => <option key={p} value={p} />)}</datalist>
              </form>
            </details>
            {t.splits.length > 0 && (
              <form action={sendSplits} className="mt-4 flex flex-wrap items-center gap-3">
                <input type="hidden" name="trackId" value={t.id} />
                <button className="btn-primary" disabled={total !== 100 || signed === t.splits.length}>Email it to everyone to sign</button>
                <span className="text-xs text-gray-500">Only people who haven&apos;t signed and have an email get it.</span>
              </form>
            )}
          </Card>

          <Card title="Credits" actions={t.credits.length > 0 && <CopyLink url={creditsText} label="Copy credits" />}>
            {t.credits.length === 0 ? <p className="mb-3 text-sm text-gray-500">Who played, produced and engineered. They go on the label copy, and you can paste them into your distributor (DistroKid, CD Baby…), liner notes or Bandcamp so everyone gets credit, including you. Session players you hire on the project are added here for you.</p> : (
              <ul className="mb-4 divide-y divide-gray-100 text-sm">
                {t.credits.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-1.5">
                    <span><span className="text-gray-500">{c.role}:</span> {c.name}</span>
                    <form action={deleteCredit}><input type="hidden" name="trackId" value={t.id} /><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-600">Remove</button></form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addCredit} className="mb-4 rounded-md bg-gray-50 p-3">
              <input type="hidden" name="trackId" value={t.id} />
              <input type="hidden" name="name" value={user.name} />
              <div className="mb-2 text-sm font-medium">Add your own credits</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {STUDIO_CREDITS.map((r) => <label key={r} className="flex items-center gap-1.5"><input type="checkbox" name="role" value={r} defaultChecked={r !== "Producer" && !t.credits.some((c) => c.role === r && c.name === user.name)} /> {r}</label>)}
              </div>
              <button className="btn-secondary btn-sm mt-2">Add as {user.name}</button>
            </form>
            <form action={addCredit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="trackId" value={t.id} />
              <input aria-label="Name" name="name" required list="credit-names" placeholder="Name" className="input" />
              <input aria-label="What they did (Bass, Producer…)" name="role" required list="credit-roles" placeholder="What they did (Bass, Producer…)" className="input" />
              <button className="btn-secondary">Add</button>
              <datalist id="credit-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
              <datalist id="credit-roles">{CREDIT_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
            </form>
            {t.credits.length > 0 && songs > 1 && (
              <form action={copyCreditsToAll} className="mt-3"><input type="hidden" name="trackId" value={t.id} /><button className="text-xs link">Copy these credits to the other songs that don&apos;t have any yet</button></form>
            )}
          </Card>
        </div>
        <Card title="Song details">
          <form action={updateTrack} className="space-y-3">
            <input type="hidden" name="id" value={t.id} />
            <Field label="Title"><input name="title" required defaultValue={t.title} className="input" /></Field>
            <Field label="Featuring (optional)"><input name="featuring" defaultValue={t.featuring ?? ""} placeholder="Other artists credited on the song" className="input" /></Field>
            <Field label="ISRC code"><input name="isrc" defaultValue={t.isrc ?? ""} placeholder="e.g. USABC2600001" className="input font-mono" /></Field>
            <p className="-mt-1 text-xs text-gray-500">The recording&apos;s ID. Your distributor gives one to each song, or you can get your own codes. Keep it here so every form has it.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Length"><input name="duration" defaultValue={fmtDuration(t.duration)} placeholder="3:45" className="input" /></Field>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="explicit" defaultChecked={t.explicit} /> Explicit lyrics</label>
              <Field label="Tempo (BPM)"><input name="bpm" inputMode="numeric" defaultValue={t.bpm ?? ""} className="input" /></Field>
              <Field label="Key"><input name="key" defaultValue={t.key ?? ""} placeholder="F# minor" className="input" /></Field>
            </div>
            <Field label="Notes"><textarea name="notes" rows={4} defaultValue={t.notes ?? ""} className="input" /></Field>
            <button className="btn-primary btn-sm">Save</button>
          </form>
        </Card>
      </div>
    </>
  );
}
