import { requireRole } from "@/lib/auth";
import { emailConfigured, getTemplate } from "@/lib/email";
import { EMAIL_TEMPLATES, TEMPLATE_KEYS } from "@/lib/emailTemplates";
import { Card, EmailFlash, PageHeader } from "@/components/ui";
import { saveEmailTemplate, sendTestEmail } from "../actions";

export const metadata = { title: "Emails" };

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ emailed?: string; email_error?: string; saved?: string }> }) {
  const user = await requireRole("ADMIN");
  const flash = await searchParams;
  const templates = await Promise.all(TEMPLATE_KEYS.map((k) => getTemplate(user.studioId, k)));
  return (
    <>
      <PageHeader
        title="Automated emails"
        subtitle="What clients get from the studio automatically. Replies go to your studio email."
        actions={emailConfigured() && <form action={sendTestEmail}><button className="btn-secondary">Send me a test email</button></form>}
      />
      {!emailConfigured() && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Emails are off until <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> are set in Vercel (see the README, &ldquo;Turn on email&rdquo;).
          You can edit the templates now.
        </p>
      )}
      {!user.studio.email && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">Add your studio email in Studio Settings so client replies and new-lead alerts reach you.</p>
      )}
      <EmailFlash emailed={flash.emailed} error={flash.email_error} />
      {flash.saved && <p className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Saved &ldquo;{EMAIL_TEMPLATES[flash.saved as keyof typeof EMAIL_TEMPLATES]?.label}&rdquo;.</p>}
      <div className="space-y-6">
        {templates.map((t) => {
          const def = EMAIL_TEMPLATES[t.key];
          return (
            <Card key={t.key} title={def.label}>
              <form action={saveEmailTemplate} className="space-y-3">
                <input type="hidden" name="key" value={t.key} />
                <p className="text-sm text-gray-500">Sent when: {def.when}</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={t.enabled} /> Send this email</label>
                <label className="block"><span className="label">Subject</span><input name="subject" required defaultValue={t.subject} className="input" /></label>
                <label className="block"><span className="label">Message</span><textarea name="body" required rows={6} defaultValue={t.body} className="input font-mono text-sm" /></label>
                <p className="text-xs text-gray-500">
                  Placeholders: {[...def.vars, "sign_off", "studio_name", "studio_email", "studio_phone"].map((v) => <code key={v} className="mr-2">{`{{${v}}}`}</code>)}
                </p>
                <div className="flex gap-2">
                  <button className="btn-primary btn-sm">Save</button>
                  <button name="reset" value="1" className="btn-secondary btn-sm">Reset to default</button>
                </div>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
