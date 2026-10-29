import { requireUser } from "@/lib/auth";
import { fmtDateTime, TZ } from "@/lib/format";
import { Card, EmailFlash, Field, PageHeader } from "@/components/ui";
import { emailBackupNow, saveStudio } from "../admin/actions";
import { BookingPageLink } from "@/components/BookingPageLink";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ emailed?: string; email_error?: string }> }) {
  const { studio } = await requireUser();
  const flash = await searchParams;
  return (
    <>
      <PageHeader title="Studio settings" />
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      <Card>
        <form action={saveStudio} className="grid gap-4 sm:grid-cols-2">
          <Field label="Studio name"><input name="name" required defaultValue={studio.name} className="input" /></Field>
          <Field label="Email"><input name="email" defaultValue={studio.email ?? ""} className="input" /></Field>
          <Field label="Email sign-off (under &ldquo;Thank you,&rdquo;)"><input name="emailSignOff" placeholder={studio.name} defaultValue={studio.emailSignOff ?? ""} className="input" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={studio.phone ?? ""} className="input" /></Field>
          <Field label="Address"><input name="address" defaultValue={studio.address ?? ""} className="input" /></Field>
          <Field label="Invoice prefix"><input name="invoicePrefix" defaultValue={studio.invoicePrefix} className="input" /></Field>
          <Field label="Quote prefix"><input name="quotePrefix" defaultValue={studio.quotePrefix} className="input" /></Field>
          <Field label="Default booking deposit %"><input name="depositPercent" type="number" min={0} max={100} defaultValue={studio.depositPercent} className="input" /></Field>
          <Field label="No deposit on sessions under ($)"><input name="depositMinimum" inputMode="decimal" defaultValue={studio.depositMinimum / 100} className="input" /></Field>
          <Field label="Default tax rate %"><input name="defaultTaxRate" inputMode="decimal" defaultValue={studio.defaultTaxRate.toString()} className="input" /></Field>
          <h2 className="border-t border-gray-100 pt-4 text-lg text-black sm:col-span-2">Invoices and quotes</h2>
          <Field label="Default invoice terms"><textarea name="invoiceTerms" rows={3} defaultValue={studio.invoiceTerms ?? ""} placeholder="e.g. Payment due within 14 days. Final files released on full payment." className="input" /></Field>
          <Field label="Default quote terms"><textarea name="quoteTerms" rows={3} defaultValue={studio.quoteTerms ?? ""} placeholder="e.g. Includes two rounds of mix revisions. Quote valid 30 days." className="input" /></Field>
          <Field label="Other ways to pay (shown on invoices)"><textarea name="paymentInstructions" rows={3} defaultValue={studio.paymentInstructions ?? ""} placeholder={"e.g. Venmo @yourstudio\nZelle you@yourstudio.com\nChecks to Your Studio LLC"} className="input" /></Field>
          <Field label="Studio policies (shown on quotes and invoices)"><textarea name="policies" rows={3} defaultValue={studio.policies ?? ""} placeholder="e.g. Cancellations within 48 hours forfeit the deposit. Invoices over 30 days late add a 5% fee." className="input" /></Field>
          <div className="space-y-2 sm:col-span-2">
            <span className="label">Logo (PNG, JPG or SVG, under 300 KB)</span>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {studio.logoUrl && <img src={studio.logoUrl} alt="Current logo" className="max-h-12 max-w-[160px] object-contain" />}
              <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-sm" />
              {studio.logoUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" /> Remove logo</label>}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="autoInvoiceOnAccept" defaultChecked={studio.autoInvoiceOnAccept} className="mt-1" />
            <span>When a client accepts a quote, create the invoice and email it to them right away (with your deposit rule applied). Untick to review it yourself first.</span>
          </label>
          <h2 className="border-t border-gray-100 pt-4 text-lg text-black sm:col-span-2">Payment reminders</h2>
          <Field label="Remind clients this many days before an invoice is due (0 = off)"><input name="reminderDaysBefore" type="number" min={0} max={30} defaultValue={studio.reminderDaysBefore} className="input" /></Field>
          <Field label="Once overdue, remind every this many days (0 = off)"><input name="reminderEveryDays" type="number" min={0} max={60} defaultValue={studio.reminderEveryDays} className="input" /></Field>
          <p className="text-sm text-gray-500 sm:col-span-2">A reminder also goes out on the due date. Reminders stop when the invoice is paid, and you can pause them on any invoice. Edit the wording under Setup → Client Emails.</p>
          <h2 className="border-t border-gray-100 pt-4 text-lg text-black sm:col-span-2">Cancellations and no-shows</h2>
          <Field label="A cancellation is late with less than this many hours' notice"><input name="lateCancelHours" type="number" min={0} max={720} defaultValue={studio.lateCancelHours} className="input" /></Field>
          <Field label="Late cancellation fee (% of the session total)"><input name="lateCancelFeePercent" type="number" min={0} max={100} defaultValue={studio.lateCancelFeePercent} className="input" /></Field>
          <Field label="No-show fee (% of the session total)"><input name="noShowFeePercent" type="number" min={0} max={100} defaultValue={studio.noShowFeePercent} className="input" /></Field>
          <p className="text-sm text-gray-500 sm:col-span-2 sm:self-end">On a late cancel or no-show the deposit is kept, and any fee beyond it goes on a fee invoice. You choose each time whether to apply the rule, keep only the deposit, or let it go. Put the same rule in Studio policies above so clients see it.</p>
          <label className="flex items-start gap-2 border-t border-gray-100 pt-4 text-sm sm:col-span-2">
            <input type="checkbox" name="backupWeekly" defaultChecked={studio.backupWeekly} className="mt-1" />
            <span>Email me a backup of all my data every Monday.</span>
          </label>
          <div className="border-t border-gray-100 pt-4 sm:col-span-2"><BookingPageLink slug={studio.slug} /></div>
          <p className="text-sm text-gray-500 sm:col-span-2">Only studios with &ldquo;Clients can request this studio online&rdquo; ticked (Setup → Studios / Rooms) appear there. Timezone: {TZ} (change it with the STUDIO_TIMEZONE setting in Vercel, see the setup guide)</p>
          <div className="sm:col-span-2"><button className="btn-primary">Save settings</button></div>
        </form>
      </Card>
      <div className="mt-6">
        <Card title="Backups">
          <p className="text-sm text-gray-600">A backup is a full copy of your clients, bookings, projects, quotes, invoices, payments and everything else. If the database were ever lost, a backup file can be loaded into a new one (README, &ldquo;Restore from a backup&rdquo;).</p>
          <p className="mt-3 text-sm">{studio.lastBackupAt ? <>Last emailed backup: <strong>{fmtDateTime(studio.lastBackupAt)}</strong></> : "No backup emailed yet. The first goes out with tomorrow morning's run."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/settings/backup" className="btn-primary">Download everything</a>
            <form action={emailBackupNow}><button className="btn-secondary">Email me a backup now</button></form>
          </div>
          <p className="mt-3 text-xs text-gray-500">Passwords and two-step login codes are never in a backup.</p>
        </Card>
      </div>
    </>
  );
}
