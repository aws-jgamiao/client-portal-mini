import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { DueBadge, StatusBadge } from "@/components/status-badge";
import { Card, EmptyState, PageHeader, ProgressBar, Stat } from "@/components/ui/primitives";
import { requireMember, type Member } from "@/lib/auth";
import { createClient, type PortalClient } from "@/lib/supabase/server";
import { daysUntil, dueLabel, formatBytes, formatDate, formatDateTime, percent } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const member = await requireMember();
  const supabase = await createClient();
  return member.role === "admin" ? (
    <AdminDashboard member={member} supabase={supabase} />
  ) : (
    <ClientDashboard member={member} supabase={supabase} />
  );
}

async function ClientDashboard({ member, supabase }: { member: Member; supabase: PortalClient }) {
  // RLS scopes every query to the member's organization; no org filter is
  // passed from the client, and none is needed.
  const [projects, onboarding, activity, documents, lastMessage] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status, due_date, milestones(id, title, due_date, completed_at, position)")
      .order("created_at"),
    supabase.from("onboarding_items").select("id, title, due_date, required, completed_at").order("position"),
    supabase
      .from("activity_events")
      .select("id, kind, summary, created_at, actor:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("documents").select("id, file_name, size_bytes, created_at").order("created_at", { ascending: false }).limit(4),
    supabase
      .from("messages")
      .select("id, body, created_at, sender:profiles(full_name, role)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const items = onboarding.data ?? [];
  const required = items.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.completed_at).length;
  const pending = items.filter((i) => !i.completed_at);
  const active = (projects.data ?? []).filter((p) => p.status !== "completed");

  return (
    <>
      <PageHeader
        eyebrow={member.orgName}
        title={`Welcome back, ${member.fullName.split(" ")[0]}`}
        description="Here's where your projects and onboarding stand today."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Active projects" value={active.length} />
        <Stat
          label="Onboarding"
          value={`${percent(requiredDone, required.length)}%`}
          hint={`${requiredDone} of ${required.length} required steps done`}
        />
        <Stat label="Steps waiting on you" value={pending.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Projects" action={<Link href="/projects" className="text-sm text-brand-ink underline underline-offset-4">View all</Link>}>
            {active.length === 0 ? (
              <EmptyState title="No active projects">Your account manager will add projects here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((p) => {
                  const ms = [...p.milestones].sort((a, b) => a.position - b.position);
                  const done = ms.filter((m) => m.completed_at).length;
                  const next = ms.find((m) => !m.completed_at);
                  return (
                    <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/projects/${p.id}`} className="font-medium text-ink hover:underline">
                          {p.name}
                        </Link>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar value={percent(done, ms.length)} label={`${p.name} milestones complete`} />
                        <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                          {done}/{ms.length}
                        </span>
                      </div>
                      {next && (
                        <p className="mt-2 text-sm text-ink-muted">
                          Next: <span className="text-ink">{next.title}</span> · {formatDate(next.due_date)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Onboarding steps waiting on you" action={<Link href="/onboarding" className="text-sm text-brand-ink underline underline-offset-4">Open checklist</Link>}>
            {pending.length === 0 ? (
              <p className="text-sm text-ink-muted">You&apos;re all done. Nice work.</p>
            ) : (
              <ul className="space-y-3">
                {pending.slice(0, 4).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-ink">
                      {i.title}
                      {!i.required && <span className="ml-1 text-ink-muted">(optional)</span>}
                    </span>
                    <DueBadge label={dueLabel(i.due_date, false)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Latest message">
            {lastMessage.data ? (
              <div className="text-sm">
                <p className="text-ink">&ldquo;{lastMessage.data.body}&rdquo;</p>
                <p className="mt-2 text-ink-muted">
                  {lastMessage.data.sender?.full_name ?? "Former member"} · {formatDateTime(lastMessage.data.created_at)}
                </p>
                <Link href="/messages" className="mt-3 inline-block text-brand-ink underline underline-offset-4">
                  Reply
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No messages yet.</p>
            )}
          </Card>
          <Card title="Recent documents">
            {(documents.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No documents shared yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {documents.data!.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3">
                    <a href={`/documents/${d.id}/download`} className="truncate text-brand-ink underline underline-offset-4">
                      {d.file_name}
                    </a>
                    <span className="shrink-0 text-ink-muted">{formatBytes(d.size_bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent activity">
            <ActivityList items={activity.data ?? []} />
          </Card>
        </div>
      </div>
    </>
  );
}

async function AdminDashboard({ member, supabase }: { member: Member; supabase: PortalClient }) {
  const [orgs, activity, milestones, messages] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, projects(id, status), onboarding_items(id, required, completed_at, due_date)")
      .order("name"),
    supabase
      .from("activity_events")
      .select("id, kind, summary, created_at, actor:profiles(full_name), organization:organizations(name)")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("milestones")
      .select("id, title, due_date, project:projects(id, name, organization:organizations(name))")
      .is("completed_at", null)
      .not("due_date", "is", null)
      .order("due_date")
      .limit(6),
    supabase
      .from("messages")
      .select("id, body, created_at, org_id, sender:profiles!inner(full_name, role), organization:organizations(name)")
      .eq("sender.role", "client")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const orgRows = orgs.data ?? [];
  const activeProjects = orgRows.flatMap((o) => o.projects).filter((p) => p.status !== "completed").length;
  const overdueSteps = orgRows
    .flatMap((o) => o.onboarding_items)
    .filter((i) => !i.completed_at && i.due_date && daysUntil(i.due_date) < 0).length;

  return (
    <>
      <PageHeader title={`Good to see you, ${member.fullName.split(" ")[0]}`} description="Every client at a glance." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Clients" value={orgRows.length} />
        <Stat label="Active projects" value={activeProjects} />
        <Stat label="Overdue onboarding steps" value={overdueSteps} hint={overdueSteps ? "Follow up with these clients" : "Nothing overdue"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Clients" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Client onboarding and project summary</caption>
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">Client</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Active projects</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Onboarding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {orgRows.map((o) => {
                    const req = o.onboarding_items.filter((i) => i.required);
                    const pct = percent(req.filter((i) => i.completed_at).length, req.length);
                    return (
                      <tr key={o.id}>
                        <th scope="row" className="px-5 py-3 font-medium">
                          <Link href={`/clients/${o.id}`} className="text-ink hover:underline">{o.name}</Link>
                        </th>
                        <td className="px-5 py-3 tabular-nums">{o.projects.filter((p) => p.status !== "completed").length}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <ProgressBar value={pct} label={`${o.name} onboarding progress`} />
                            <span className="w-10 shrink-0 tabular-nums text-ink-muted">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Upcoming milestones">
            {(milestones.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No open milestones with due dates.</p>
            ) : (
              <ul className="space-y-3">
                {milestones.data!.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="text-ink">{m.title}</span>{" "}
                      <span className="text-ink-muted">
                        · {m.project?.organization?.name} ·{" "}
                        <Link href={`/projects/${m.project?.id}`} className="underline underline-offset-4">{m.project?.name}</Link>
                      </span>
                    </span>
                    <DueBadge label={dueLabel(m.due_date, false)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Latest from clients" action={<Link href="/messages" className="text-sm text-brand-ink underline underline-offset-4">Inbox</Link>}>
            {(messages.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No client messages yet.</p>
            ) : (
              <ul className="space-y-4 text-sm">
                {messages.data!.map((m) => (
                  <li key={m.id}>
                    <Link href={`/messages?org=${m.org_id}`} className="line-clamp-2 text-ink hover:underline">{m.body}</Link>
                    <p className="text-ink-muted">{m.sender.full_name} · {m.organization?.name} · {formatDateTime(m.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent activity" action={<Link href="/activity" className="text-sm text-brand-ink underline underline-offset-4">All</Link>}>
            <ActivityList items={activity.data ?? []} showOrg />
          </Card>
        </div>
      </div>
    </>
  );
}
