import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, Field, PageHeader } from "@/components/ui";
import { updateTrack } from "../../../actions";

/** One song: title, tempo, key and notes. */
export default async function SongPage({ params }: { params: Promise<{ id: string; trackId: string }> }) {
  const user = await requireUser();
  const { id, trackId } = await params;
  const t = await db.track.findFirst({
    where: { id: trackId, projectId: id, project: { studioId: user.studioId } },
    include: { project: { include: { artist: true } } },
  });
  if (!t) notFound();

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={<><Link href={`/projects/${id}`} className="link">{t.project.name}</Link>{t.project.artist && ` · ${t.project.artist.name}`} · {t.stage}</>}
        actions={<Link href={`/projects/${id}`} className="btn-secondary">Back to project</Link>}
      />
      <div className="max-w-xl">
        <Card title="Song details">
          <form action={updateTrack} className="space-y-3">
            <input type="hidden" name="id" value={t.id} />
            <Field label="Title"><input name="title" required defaultValue={t.title} className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
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
