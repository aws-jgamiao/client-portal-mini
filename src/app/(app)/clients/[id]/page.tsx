import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Avatar, Card, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseIdOr404 } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { removeMember, revokeInvitation, updateOrganization } from "../actions";
import { InviteForm } from "../invite-form";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  await requireAdmin();
  const id = parseIdOr404((await params).id);
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, created_at, profiles(id, full_name, email, job_title, created_at), invitations(id, email, expires_at, accepted_at, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const pending = org.invitations.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());
  const links = [
    { href: `/projects?org=${org.id}`, label: "Projects" },
    { href: `/onboarding?org=${org.id}`, label: "Onboarding" },
    { href: `/documents?org=${org.id}`, label: "Documents" },
    { href: `/messages?org=${org.id}`, label: "Messages" },
    { href: `/activity?org=${org.id}`, label: "Activity" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/clients" className="underline underline-offset-4">Clients</Link>}
        title={org.name}
        description={`Client since ${formatDate(org.created_at)}`}
      />
      <nav aria-label={`${org.name} sections`} className="mb-6 flex flex-wrap gap-2 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full border border-line-strong px-3 py-1 text-ink-muted hover:bg-surface">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`People (${org.profiles.length})`}>
            {org.profiles.length === 0 ? (
              <p className="text-sm text-ink-muted">No one has joined yet. Send an invitation.</p>
            ) : (
              <ul className="divide-y divide-line">
                {org.profiles.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name} />
                      <div>
                        <p className="font-medium text-ink">{p.full_name}</p>
                        <p className="text-sm text-ink-muted">{[p.job_title, p.email].filter(Boolean).join(" · ")}</p>
                      </div>
                    </div>
                    <form action={removeMember.bind(null, p.id, org.id)}>
                      <ConfirmSubmit message={`Remove ${p.full_name} from ${org.name}? They'll lose access immediately.`} variant="ghost" size="sm">
                        Remove<span className="sr-only">: {p.full_name}</span>
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Pending invitations">
            {pending.length === 0 ? (
              <p className="text-sm text-ink-muted">No pending invitations.</p>
            ) : (
              <ul className="divide-y divide-line">
                {pending.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 text-sm">
                    <span>
                      <span className="text-ink">{i.email}</span>
                      <span className="text-ink-muted"> · expires {formatDate(i.expires_at)}</span>
                    </span>
                    <form action={revokeInvitation.bind(null, i.id, org.id)}>
                      <ConfirmSubmit message={`Revoke the invitation for ${i.email}?`} variant="ghost" size="sm">
                        Revoke<span className="sr-only">: {i.email}</span>
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Invite someone">
            <InviteForm orgId={org.id} />
          </Card>
          <Card title="Details">
            <ActionForm action={updateOrganization.bind(null, org.id)} className="space-y-4">
              <TextField name="name" label="Organization name" defaultValue={org.name} maxLength={120} />
              <TextField name="slug" label="Slug" defaultValue={org.slug} maxLength={60} />
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
