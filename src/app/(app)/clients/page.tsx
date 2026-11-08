import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { percent } from "@/lib/format";
import { createOrganization } from "./actions";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, profiles(id), projects(id, status), onboarding_items(required, completed_at)")
    .order("name");

  return (
    <>
      <PageHeader title="Clients" description="Each client is a separate organization. Its people only ever see its own data." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!orgs?.length ? (
            <EmptyState title="No clients yet">Add your first client with the form.</EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {orgs.map((o) => {
                const req = o.onboarding_items.filter((i) => i.required);
                const pct = percent(req.filter((i) => i.completed_at).length, req.length);
                return (
                  <li key={o.id} className="card p-5">
                    <h2 className="font-semibold text-ink">
                      <Link href={`/clients/${o.id}`} className="hover:underline">{o.name}</Link>
                    </h2>
                    <p className="text-sm text-ink-muted">
                      {o.profiles.length} {o.profiles.length === 1 ? "person" : "people"} ·{" "}
                      {o.projects.filter((p) => p.status !== "completed").length} active projects
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <ProgressBar value={pct} label={`${o.name} onboarding`} />
                      <span className="shrink-0 text-sm tabular-nums text-ink-muted">{pct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Card title="Add a client">
          <ActionForm action={createOrganization} className="space-y-4">
            <TextField name="name" label="Organization name" maxLength={120} />
            <TextField name="slug" label="Slug" hint="Lowercase letters, numbers and hyphens, e.g. harbour-physio." maxLength={60} />
            <SubmitButton>Add client</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
