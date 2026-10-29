import { requireRolePage } from "@/lib/auth";
import { financeOptions } from "@/lib/financeOptions";
import { toDateInput } from "@/lib/format";
import { FinanceForm } from "@/components/FinanceForm";
import { Card, PageHeader } from "@/components/ui";
import { createQuote } from "../actions";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ contactId?: string; projectId?: string }> }) {
  const user = await requireRolePage("ADMIN");
  const sp = await searchParams;
  const opts = await financeOptions(user.studioId);
  return (
    <>
      <PageHeader title="New quote" />
      <Card>
        <FinanceForm kind="quote" action={createQuote} opts={opts} submit="Create quote"
          values={{ contactId: sp.contactId, projectId: sp.projectId, date: toDateInput(new Date(Date.now() + 30 * 864e5)), terms: user.studio.quoteTerms, taxRate: opts.defaultTax, discount: "", items: [] }} />
      </Card>
    </>
  );
}
