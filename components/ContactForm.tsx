import type { Contact } from "@prisma/client";
import { Field } from "./ui";

export const CONTACT_SOURCES = ["Instagram", "TikTok", "Referral", "Google", "Website", "Booking page", "Returning client", "Show / gig", "Other"];

export function ContactForm({ contact, action, submit }: {
  studioId?: string;
  contact?: Contact;
  action: (fd: FormData) => Promise<void>;
  submit: string;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <Field label="First name"><input name="firstName" required defaultValue={contact?.firstName} className="input" /></Field>
      <Field label="Last name"><input name="lastName" defaultValue={contact?.lastName ?? ""} className="input" /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={contact?.email ?? ""} className="input" /></Field>
      <Field label="Phone"><input name="phone" defaultValue={contact?.phone ?? ""} className="input" /></Field>
      <Field label="Role"><input name="role" placeholder="Artist, producer, manager…" defaultValue={contact?.role ?? ""} className="input" /></Field>
      <Field label="How they found you">
        <input name="source" list="contact-sources" defaultValue={contact?.source ?? ""} placeholder="Instagram, referral, Google…" className="input" />
        <datalist id="contact-sources">{CONTACT_SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Tags (comma separated)"><input name="tags" defaultValue={contact?.tags.join(", ")} className="input" /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} className="input" /></Field>
      <div className="sm:col-span-2"><button className="btn-primary">{submit}</button></div>
    </form>
  );
}
