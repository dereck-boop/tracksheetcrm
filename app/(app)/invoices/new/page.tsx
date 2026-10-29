import { requireRolePage } from "@/lib/auth";
import { financeOptions } from "@/lib/financeOptions";
import { toDateInput } from "@/lib/format";
import { FinanceForm } from "@/components/FinanceForm";
import { Card, PageHeader } from "@/components/ui";
import { createInvoice } from "../actions";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ contactId?: string; projectId?: string }> }) {
  const user = await requireRolePage("ADMIN");
  const sp = await searchParams;
  const opts = await financeOptions(user.studioId);
  return (
    <>
      <PageHeader title="New invoice" />
      <Card>
        <FinanceForm kind="invoice" action={createInvoice} opts={opts} submit="Create invoice"
          values={{ contactId: sp.contactId, projectId: sp.projectId, date: toDateInput(new Date(Date.now() + 14 * 864e5)), terms: user.studio.invoiceTerms, taxRate: opts.defaultTax, discount: "", items: [] }} />
      </Card>
    </>
  );
}
