import { LineItemsEditor } from "./LineItemsEditor";
import { ClientSelect } from "./ClientSelect";
import { Field, Select } from "./ui";

type Opt = { value: string; label: string };
type Row = { description: string; quantity: string; unitPrice: string; taxable: boolean };

/** Shared header + line items form for quotes and invoices. */
export function FinanceForm({ action, kind, id, opts, values, submit }: {
  action: (fd: FormData) => Promise<void>;
  kind: "quote" | "invoice";
  id?: string;
  opts: { contacts: Opt[]; projects: Opt[]; services: { name: string; unit: string; unitPrice: number; taxable: boolean }[] };
  values: { contactId?: string | null; projectId?: string | null; date?: string; notes?: string | null; terms?: string | null; taxRate: string; discount: string; items: Row[] };
  submit: string;
}) {
  return (
    <form action={action} className="space-y-5">
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <ClientSelect name="contactId" defaultValue={values.contactId} options={opts.contacts} />
        <Field label="Project"><Select name="projectId" defaultValue={values.projectId} placeholder="—" options={opts.projects} /></Field>
        <Field label={kind === "quote" ? "Valid until" : "Due date"}>
          <input name={kind === "quote" ? "validUntil" : "dueDate"} type="date" defaultValue={values.date} className="input" />
        </Field>
      </div>
      <LineItemsEditor initial={values.items} services={opts.services} taxRate={values.taxRate} discount={values.discount} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Notes to client"><textarea name="notes" rows={3} defaultValue={values.notes ?? ""} className="input" /></Field>
        <Field label="Terms"><textarea name="terms" rows={3} defaultValue={values.terms ?? ""} placeholder={kind === "invoice" ? "e.g. Payment due within 14 days. Files released on full payment." : "e.g. 50% deposit to book, balance on delivery."} className="input" /></Field>
      </div>
      <button className="btn-primary">{submit}</button>
    </form>
  );
}
