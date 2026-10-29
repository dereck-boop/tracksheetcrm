import { requireUser } from "@/lib/auth";
import { ContactForm } from "@/components/ContactForm";
import { Card, PageHeader } from "@/components/ui";
import { createContact } from "../actions";

export const metadata = { title: "New contact" };

export default async function NewContactPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="New contact" />
      <Card><ContactForm studioId={user.studioId} action={createContact} submit="Create contact" /></Card>
    </>
  );
}
