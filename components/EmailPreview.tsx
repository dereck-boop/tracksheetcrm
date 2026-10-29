"use client";
import { useRef, useState } from "react";
import type { EmailDraft } from "@/lib/invoiceEmail";

/**
 * An "Email to client" button that first shows the email as the client will get it, with the
 * subject and message editable for this one send. Edits don't change the saved template.
 */
export function EmailPreview({ action, id, back, draft, label = "Email to client", className = "btn-primary" }: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  back?: string;
  draft: EmailDraft;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const edited = subject !== draft.subject || body !== draft.body;

  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="m-auto w-[min(42rem,calc(100vw-2rem))] rounded-lg bg-white p-0 text-left shadow-xl backdrop:bg-black/40">
        <form action={action} className="space-y-4 p-5">
          <input type="hidden" name="id" value={id} />
          {back && <input type="hidden" name="back" value={back} />}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Check the email before it goes out</h2>
              <p className="text-sm text-gray-600">{draft.to ? <>To <strong>{draft.to}</strong></> : "This client has no email address. Add one to the contact first."}</p>
            </div>
            <button type="button" className="text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
          </div>
          {!draft.enabled && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">This email is turned off in Setup &gt; Client Emails, so it never goes out on its own. Sending here sends it anyway.</p>}
          <label className="block"><span className="label">Subject</span>
            <input name="subject" required className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block"><span className="label">Message</span>
            <textarea name="body" required rows={14} className="input text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>Changes here are for this email only. Edit the template in Setup &gt; Client Emails.</span>
            {edited && <button type="button" className="link" onClick={() => { setSubject(draft.subject); setBody(draft.body); }}>Undo my changes</button>}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" className="btn-secondary" onClick={() => ref.current?.close()}>Cancel</button>
            <button className="btn-primary" disabled={!draft.to}>Send email</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
