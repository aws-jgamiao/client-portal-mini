import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listOrganizations } from "@/lib/data";
import { createProject } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireAdmin();
  const organizations = await listOrganizations(await createClient());
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/projects" className="underline underline-offset-4">Projects</Link>}
        title="New project"
      />
      <Card className="max-w-2xl">
        <ProjectForm action={createProject} organizations={organizations} submitLabel="Create project" />
      </Card>
    </>
  );
}
