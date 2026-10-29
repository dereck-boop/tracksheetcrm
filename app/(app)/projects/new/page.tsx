import { requireUser } from "@/lib/auth";
import { ProjectForm } from "@/components/ProjectForm";
import { Card, PageHeader } from "@/components/ui";
import { createProject } from "../actions";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ clientId?: string; artistId?: string }> }) {
  const user = await requireUser();
  const defaults = await searchParams;
  return (
    <>
      <PageHeader title="New project" />
      <Card><ProjectForm studioId={user.studioId} defaults={defaults} action={createProject} submit="Create project" /></Card>
    </>
  );
}
