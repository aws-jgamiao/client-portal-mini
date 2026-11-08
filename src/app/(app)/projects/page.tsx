import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listOrganizations, parseOrgFilter } from "@/lib/data";
import { formatDate, percent } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const member = await requireMember();
  const isAdmin = member.role === "admin";
  const supabase = await createClient();
  const orgFilter = isAdmin ? parseOrgFilter((await searchParams).org) : null;

  let query = supabase
    .from("projects")
    .select("id, name, status, start_date, due_date, organization:organizations(id, name), milestones(completed_at)")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (orgFilter) query = query.eq("org_id", orgFilter);

  const [{ data: projects }, organizations] = await Promise.all([query, isAdmin ? listOrganizations(supabase) : []]);

  return (
    <>
      <PageHeader
        title="Projects"
        description={isAdmin ? "All client projects." : `Everything we're working on for ${member.orgName}.`}
        actions={isAdmin && <LinkButton href="/projects/new">New project</LinkButton>}
      />

      {isAdmin && organizations.length > 0 && (
        <nav aria-label="Filter by client" className="mb-4 flex flex-wrap gap-2 text-sm">
          <FilterLink href="/projects" active={!orgFilter}>All clients</FilterLink>
          {organizations.map((o) => (
            <FilterLink key={o.id} href={`/projects?org=${o.id}`} active={orgFilter === o.id}>
              {o.name}
            </FilterLink>
          ))}
        </nav>
      )}

      {!projects?.length ? (
        <EmptyState
          title="No projects yet"
          action={isAdmin && <LinkButton href="/projects/new" variant="secondary">Create a project</LinkButton>}
        >
          {isAdmin ? "Create a project for a client to get started." : "Your account manager will add projects here."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => {
            const done = p.milestones.filter((m) => m.completed_at).length;
            return (
              <li key={p.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {isAdmin && <p className="text-sm text-ink-muted">{p.organization?.name}</p>}
                    <h2 className="font-semibold text-ink">
                      <Link href={`/projects/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </h2>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <ProgressBar value={percent(done, p.milestones.length)} label={`${p.name} milestones complete`} />
                  <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                    {done}/{p.milestones.length} milestones
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink-muted">
                  {formatDate(p.start_date)} – {formatDate(p.due_date)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 ${active ? "border-brand bg-brand-soft text-brand-ink" : "border-line-strong text-ink-muted hover:bg-surface"}`}
    >
      {children}
    </Link>
  );
}
