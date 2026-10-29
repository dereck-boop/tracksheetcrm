import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { importContacts } from "../actions";

const SKIPS = [
  ["existing", "already in your contacts (same email)"],
  ["duplicate", "repeated an email from earlier in the file"],
  ["yours", "used your own or your team's email"],
  ["noName", "had no name"],
] as const;

type Result = Partial<Record<"added" | (typeof SKIPS)[number][0], string>>;

export const metadata = { title: "Import contacts" };

export default async function ImportContactsPage({ searchParams }: { searchParams: Promise<Result> }) {
  await requireUser();
  const result = await searchParams;
  const skipped = SKIPS.map(([k, label]) => [Number(result[k] ?? 0), label] as const).filter(([n]) => n > 0);
  return (
    <>
      <PageHeader title="Import contacts" subtitle="Add people from a CSV exported from another app" />
      {result.added != null && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-medium">Added {result.added} contact{result.added === "1" ? "" : "s"}. <Link href="/contacts" className="link">View contacts</Link></p>
          {skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {skipped.map(([n, label]) => <li key={label}>Skipped {n} that {label}</li>)}
            </ul>
          )}
        </div>
      )}
      <Card>
        <form action={importContacts} className="space-y-4">
          <p className="text-sm text-gray-600">
            The file needs a header row. First name, last name and email are imported (columns named like
            &ldquo;firstName&rdquo;, &ldquo;First Name&rdquo; or a single &ldquo;Name&rdquo;); other columns are ignored.
            Anyone whose email is already in your contacts is skipped, so importing the same file twice is safe.
          </p>
          <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
          <button className="btn-primary">Import</button>
        </form>
      </Card>
    </>
  );
}
