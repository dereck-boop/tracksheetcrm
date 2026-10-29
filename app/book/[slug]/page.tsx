import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { format } from "@/lib/format";
import { PublicBookingForm } from "@/components/PublicBookingForm";
import { REQUEST_SERVICES } from "@/lib/requestServices";
import { unavailableDays } from "@/lib/availability";
import { turnstileSiteKey } from "@/lib/turnstile";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = await db.studio.findUnique({ where: { slug }, select: { name: true, logoUrl: true } });
  if (!studio) return {};
  const title = `Book a session · ${studio.name}`;
  const description = `Pick a day and tell ${studio.name} about your project. We'll confirm the day and set the session times with you.`;
  return { title: { absolute: title }, description, openGraph: { title, description } };
}

const STEPS = [
  ["Tell us about your project", "Pick the service you need and a day that works."],
  ["We check the calendar", "We'll confirm the day and set the session times with you."],
  ["You get the details", "Everything you need lands in your inbox."],
];

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const embedded = Boolean(sp.embed);
  const studio = await db.studio.findUnique({
    where: { slug },
    include: { rooms: { where: { active: true, onlineBooking: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!studio) notFound();
  const unavailable = studio.rooms.length ? await unavailableDays(studio.id, studio.rooms.map((r) => r.id)) : undefined;
  const form = !studio.rooms.length ? (
    <div className="py-10 text-center">
      <p className="font-display text-2xl">Online booking is paused</p>
      <p className="mt-2 text-sm text-gray-500">{studio.email ? <>Please email <a href={`mailto:${studio.email}`} className="link">{studio.email}</a> to ask about a session.</> : "Please contact the studio to ask about a session."}</p>
    </div>
  ) : (
    <PublicBookingForm
      slug={slug}
      today={format(new Date(), "yyyy-MM-dd")}
      rooms={studio.rooms.map((r) => ({ value: r.id, label: r.name }))}
      services={[...REQUEST_SERVICES]}
      embedded={embedded}
      unavailable={unavailable}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
  // Inside an iframe on the studio's own website: just the form, on a transparent background.
  if (embedded) return <main className="p-1"><style>{"body{background:transparent}"}</style>{form}</main>;
  return (
    <main className="min-h-screen bg-black px-4 py-8 sm:py-16">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[2fr_3fr] lg:gap-10">
        <aside className="relative flex flex-col gap-8 px-3 py-4 text-white sm:px-6 lg:px-0 lg:py-8">
          <div className="relative">
            {/* The logo from Studio Settings, shown as uploaded. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {studio.logoUrl && <img src={studio.logoUrl} alt={studio.name} className="mb-5 h-auto max-h-24 w-auto max-w-[200px]" />}
            <p className="text-xs uppercase tracking-[0.16em] text-accent">Book a session</p>
            <h1 className="mt-2 text-4xl leading-tight sm:text-5xl">{studio.name}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-300">Pick a day and tell us what you&apos;re working on. We&apos;ll confirm availability and send the details.</p>
          </div>
          <ol className="relative hidden space-y-5 sm:block">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent text-xs text-accent">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-sm text-gray-400">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          {(studio.address || studio.email) && (
            <div className="relative mt-auto hidden space-y-1 border-t border-white/10 pt-6 text-sm text-gray-400 lg:block">
              {studio.address && <p className="whitespace-pre-line">{studio.address}</p>}
              {studio.email && <a href={`mailto:${studio.email}`} className="hover:text-white">{studio.email}</a>}
            </div>
          )}
        </aside>
        <section className="rounded-md bg-white px-7 py-9 sm:px-10 lg:py-12">
          {form}
        </section>
      </div>
    </main>
  );
}
