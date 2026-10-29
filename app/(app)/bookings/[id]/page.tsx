import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { bookingOptions } from "@/lib/bookingOptions";
import { fmtDate, fmtDateTime, fmtTime, fullName, money, titleCase, toLocalInput } from "@/lib/format";
import { BOOKING_STATUSES, bookingTone, INACTIVE_BOOKING } from "@/lib/status";
import { cancelTerms, clientHistory, historyLine, policyNote, type CancelKind, type CancelOutcome } from "@/lib/cancellations";
import { CancelBooking } from "@/components/CancelBooking";
import { BookingForm } from "@/components/BookingForm";
import { CopyLink } from "@/components/CopyLink";
import { RequestResponse } from "@/components/RequestResponse";
import { EmailPreview } from "@/components/EmailPreview";
import { invoiceEmailDraft } from "@/lib/invoiceEmail";
import { getTemplate, studioVars } from "@/lib/email";
import { bookingClient } from "@/lib/bookingEmails";
import { appUrl } from "@/lib/stripe";
import { createDepositInvoice, emailInvoice, invoiceBooking } from "../../invoices/actions";
import { Badge, Card, EmailFlash, PageHeader } from "@/components/ui";
import { deleteBooking, markDepositPaid, setBookingStatus, updateBooking } from "../actions";

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ emailed?: string; email_error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const flash = await searchParams;
  const b = await db.booking.findFirst({
    where: { id, studioId: user.studioId },
    include: { room: true, type: true, contact: true, project: true, engineer: true, service: true, depositInvoice: true, invoice: true, feeInvoice: true },
  });
  if (!b) notFound();
  const active = !INACTIVE_BOOKING.includes(b.status) && b.status !== "COMPLETED";
  const cancel = active && b.status !== "REQUESTED" ? await cancelProps(b, user.studio) : null;
  const history = await clientHistory(b.contactId, user.studio.lateCancelHours);
  const opts = await bookingOptions(user.studioId);
  const depositDraft = b.depositAmount && !b.depositPaidAt && b.depositInvoice ? await invoiceEmailDraft(b.depositInvoice.id) : null;
  const seriesCount = b.seriesId ? await db.booking.count({ where: { seriesId: b.seriesId } }) : 0;
  const reply = b.status === "REQUESTED" ? await requestReply(b) : null;
  const centsStr = (c: number | null) => (c != null ? String(c / 100) : "");
  const quick = (status: string, label: string, cls = "btn-secondary") => (
    <form action={setBookingStatus}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} />
      <button className={cls}>{label}</button>
    </form>
  );
  return (
    <>
      <PageHeader
        title={b.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={bookingTone[b.status]}>{titleCase(b.status)}</Badge>{b.timeTbd ? <>{fmtDate(b.startsAt)} · <Badge tone="amber">hours not set</Badge></> : <>{fmtDateTime(b.startsAt)} – {fmtTime(b.endsAt)}</>} · {b.room.name}{b.type && ` · ${b.type.name}`}{b.room.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(b.room.address)}`} target="_blank" rel="noreferrer" className="link">{b.room.address}</a>}</span>}
        actions={
          <>
            {b.status === "REQUESTED" && <a href="#respond" className="btn-primary">Accept or decline</a>}
            {b.status === "HOLD" && !b.timeTbd && quick("CONFIRMED", "Confirm", "btn-primary")}
            {b.status === "CONFIRMED" && quick("COMPLETED", "Mark completed", "btn-primary")}
            {cancel && <a href="#cancel" className="btn-danger">{cancel.started ? "No-show or cancel" : "Cancel"}</a>}
            {b.status === "REQUESTED" && quick("CANCELLED", "Cancel", "btn-danger")}
          </>
        }
      />
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      {(b.status === "CANCELLED" || b.status === "NO_SHOW") && b.cancelledAt && (
        <p className="mb-4 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-700">
          {b.status === "NO_SHOW" ? "Marked as a no-show" : `Cancelled with ${b.cancelNoticeHours ?? 0} hours' notice`} on {fmtDateTime(b.cancelledAt)}{b.cancelReason && `: ${b.cancelReason}`}.
          {b.depositInvoice?.depositForfeited && ` Deposit (${money(b.depositInvoice.amountPaid)}) kept.`}
          {b.feeInvoice && <> Fee on <Link href={`/invoices/${b.feeInvoice.id}`} className="link">invoice {b.feeInvoice.number}</Link> ({titleCase(b.feeInvoice.status).toLowerCase()}).</>}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {reply && (
            <div id="respond" className="scroll-mt-6">
              <Card title="Accept or decline this request">
                <RequestResponse bookingId={b.id} canConfirm={!b.timeTbd} roomId={b.roomId} {...reply} />
              </Card>
            </div>
          )}
          {b.requestName && (
            <Card title="Online booking request">
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="label">Name</dt><dd>{b.requestName}</dd></div>
                <div><dt className="label">Email</dt><dd>{b.requestEmail}</dd></div>
                <div><dt className="label">Phone</dt><dd>{b.requestPhone ?? "—"}</dd></div>
                {b.requestService && <div><dt className="label">Service requested</dt><dd>{b.requestService}</dd></div>}
                {b.requestArtist && <div><dt className="label">Artist / project</dt><dd>{b.requestArtist}</dd></div>}
                {b.requestSocial && <div className="min-w-0"><dt className="label">Social</dt><dd className="truncate"><a className="link" href={b.requestSocial} target="_blank" rel="noreferrer">{b.requestSocial.replace(/^https?:\/\/(www\.)?/, "")}</a></dd></div>}
              </dl>
              {b.service && <p className="mt-3 text-sm">Package: <strong>{b.service.name}</strong></p>}
              {b.timeTbd && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">The client picked {fmtDate(b.startsAt)}. Set the start and end times under Edit booking and save, then confirm.</p>}
              {b.requestNotes && <p className="mt-3 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm">{b.requestNotes}</p>}
            </Card>
          )}
          <Card title="Edit booking">
            <BookingForm
              action={updateBooking}
              {...opts}
              statuses={BOOKING_STATUSES}
              submit="Save changes"
              newClient={b.requestEmail ? {
                firstName: b.requestFirstName ?? b.requestName?.split(" ")[0],
                lastName: b.requestFirstName ? b.requestLastName : b.requestName?.split(" ").slice(1).join(" "),
                email: b.requestEmail,
                phone: b.requestPhone,
                notes: [b.requestArtist && `Artist / project: ${b.requestArtist}`, b.requestSocial && `Social: ${b.requestSocial}`].filter(Boolean).join("\n"),
              } : undefined}
              defaults={{
                id: b.id, title: b.title, roomId: b.roomId, typeId: b.typeId, contactId: b.contactId, projectId: b.projectId, engineerId: b.engineerId,
                status: b.status, startsAt: toLocalInput(b.startsAt), endsAt: toLocalInput(b.endsAt), rate: centsStr(b.rate), depositAmount: centsStr(b.depositAmount), notes: b.notes,
              }}
            />
          </Card>
          {cancel && (
            <div id="cancel" className="scroll-mt-6">
              <Card title={cancel.started ? "No-show or cancellation" : "Cancel this session"}>
                <CancelBooking bookingId={b.id} {...cancel} />
              </Card>
            </div>
          )}
        </div>
        <div className="space-y-6">
          <Card title="At a glance">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Client</dt><dd>{b.contact ? <Link className="link" href={`/contacts/${b.contact.id}`}>{fullName(b.contact)}</Link> : b.requestName ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Project</dt><dd>{b.project ? <Link className="link" href={`/projects/${b.project.id}`}>{b.project.name}</Link> : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Engineer</dt><dd>{b.engineer?.name ?? "Unassigned"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Session total</dt><dd>{b.rate != null ? money(b.rate) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Deposit</dt><dd>{b.depositAmount ? <>{money(b.depositAmount)} {b.depositPaidAt ? <Badge tone="green">paid</Badge> : <Badge tone="amber">due</Badge>}</> : "—"}</dd></div>
              {seriesCount > 1 && <div className="flex justify-between"><dt className="text-gray-500">Recurring</dt><dd>{seriesCount} sessions in series</dd></div>}
            </dl>
            {history?.any && <p className={`mt-3 rounded-md p-2 text-xs ${history.noShows || history.lateCancels ? "bg-amber-50 text-amber-900" : "bg-gray-50 text-gray-600"}`}>Client history: {historyLine(history)}.</p>}
            {b.depositAmount && !b.depositPaidAt && (
              <div className="mt-4 space-y-2">
                {b.depositInvoice ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {depositDraft && <EmailPreview action={emailInvoice} id={b.depositInvoice.id} back={`/bookings/${id}`} draft={depositDraft} label="Email deposit link" className="btn-primary btn-sm" />}
                      <CopyLink url={`${appUrl()}/i/${b.depositInvoice.publicToken}`} label="Copy deposit pay link" />
                      <Link href={`/invoices/${b.depositInvoice.id}`} className="btn-secondary">Invoice {b.depositInvoice.number}</Link>
                    </div>
                    <p className="text-xs text-gray-500">The booking confirms automatically when the deposit is paid online.</p>
                  </>
                ) : (
                  <form action={createDepositInvoice}>
                    <input type="hidden" name="bookingId" value={id} />
                    <button className="btn-primary btn-sm">Create deposit invoice</button>
                  </form>
                )}
                <form action={markDepositPaid}>
                  <input type="hidden" name="id" value={id} />
                  <button className="text-xs link">Mark deposit paid without an invoice</button>
                </form>
              </div>
            )}
          </Card>
          {!INACTIVE_BOOKING.includes(b.status) && (
            <Card title="Billing">
              {b.invoice ? (
                <p className="text-sm">Billed on <Link href={`/invoices/${b.invoice.id}`} className="link">invoice {b.invoice.number}</Link> ({money(b.invoice.total)}, {titleCase(b.invoice.status).toLowerCase()}).</p>
              ) : (
                <>
                <form action={invoiceBooking} className="space-y-2 text-sm">
                  <input type="hidden" name="bookingId" value={id} />
                  <p className="text-gray-600">Makes a draft invoice for this session{b.rate != null ? ` at ${money(b.rate)}` : " priced from the studio rate"}{b.depositPaidAt && b.depositInvoice ? ", with the paid deposit taken off" : ""}. You can edit it before sending.</p>
                  <button className="btn-primary btn-sm">Create invoice for this session</button>
                </form>
                </>
              )}
            </Card>
          )}
          <Card title="Delete">
            <form action={deleteBooking} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              {b.seriesId && (
                <select aria-label="Which sessions" name="scope" className="input"><option value="one">Only this session</option><option value="future">This and following sessions</option></select>
              )}
              <button className="btn-danger btn-sm">Delete booking</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Templates, fill-ins and studios for the accept / decline email on a request. */
async function requestReply(b: { id: string; studioId: string; roomId: string; startsAt: Date; endsAt: Date; timeTbd: boolean; room: { name: string; address: string | null }; contact: { firstName: string; lastName: string | null; email: string | null } | null; requestName: string | null; requestFirstName: string | null; requestEmail: string | null }) {
  const [accept, confirm, decline, base, rooms, studio] = await Promise.all([
    getTemplate(b.studioId, "booking_accepted"),
    getTemplate(b.studioId, "booking_confirmed"),
    getTemplate(b.studioId, "booking_declined"),
    studioVars(b.studioId),
    db.room.findMany({ where: { studioId: b.studioId, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, address: true } }),
    db.studio.findUnique({ where: { id: b.studioId }, select: { slug: true } }),
  ]);
  const client = bookingClient(b);
  return {
    to: client.email,
    templates: { accept, confirm, decline },
    rooms,
    vars: {
      ...base,
      client_name: client.name, room: b.room.name, address: b.room.address ?? "", date: fmtDate(b.startsAt),
      time: b.timeTbd ? "a time to be confirmed" : fmtTime(b.startsAt), end_time: b.timeTbd ? "" : fmtTime(b.endsAt),
      booking_link: studio ? `${appUrl()}/book/${studio.slug}` : "",
    },
  };
}

/** Policy figures, email paragraphs and templates for the cancel / no-show card. */
async function cancelProps(
  b: Parameters<typeof cancelTerms>[0] & { studioId: string; room: { name: string; address: string | null }; timeTbd: boolean; contact: { firstName: string; lastName: string | null; email: string | null } | null; requestName: string | null; requestFirstName: string | null; requestEmail: string | null },
  studio: { lateCancelHours: number; lateCancelFeePercent: number; noShowFeePercent: number },
) {
  const kinds: CancelKind[] = ["cancel", "noshow"];
  const outcomes: CancelOutcome[] = ["policy", "keep", "waive"];
  const terms = Object.fromEntries(kinds.map((k) => [k, cancelTerms(b, studio, k)])) as Record<CancelKind, ReturnType<typeof cancelTerms>>;
  const notes = Object.fromEntries(kinds.map((k) => [k, Object.fromEntries(outcomes.map((o) => [o, policyNote(terms[k], k, o, studio)]))])) as Record<CancelKind, Record<CancelOutcome, string>>;
  const [cancel, noshow, base] = await Promise.all([getTemplate(b.studioId, "booking_cancelled"), getTemplate(b.studioId, "booking_no_show"), studioVars(b.studioId)]);
  const client = bookingClient(b);
  const vars = Object.fromEntries(Object.entries({ ...base, client_name: client.name, room: b.room.name, address: b.room.address ?? "", date: fmtDate(b.startsAt), time: b.timeTbd ? "" : fmtTime(b.startsAt), end_time: b.timeTbd ? "" : fmtTime(b.endsAt) }).map(([k, v]) => [k, v ?? ""]));
  return { to: client.email, started: b.startsAt <= new Date(), lateHours: studio.lateCancelHours, terms, notes, templates: { cancel, noshow }, vars };
}
