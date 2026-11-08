import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { DueBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseIdOr404 } from "@/lib/data";
import { dueLabel, formatBytes, formatDate, percent } from "@/lib/format";
import { addMilestone, deleteMilestone, deleteProject, setMilestoneDone, updateProject } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const member = await requireMember();
  const isAdmin = member.role === "admin";
  const id = parseIdOr404((await params).id);
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, description, status, start_date, due_date, organization:organizations(id, name), milestones(id, title, due_date, completed_at, position), documents(id, file_name, size_bytes, visibility, created_at)",
    )
    .eq("id", id)
    .maybeSingle();

  // Another client's project and a project that doesn't exist look identical.
  if (!project) notFound();

  const { data: activity } = await supabase
    .from("activity_events")
    .select("id, kind, summary, created_at, actor:profiles(full_name)")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(15);

  const milestones = [...project.milestones].sort((a, b) => a.position - b.position);
  const done = milestones.filter((m) => m.completed_at).length;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href="/projects" className="underline underline-offset-4">Projects</Link>
            {isAdmin && project.organization && (
              <>
                {" · "}
                <Link href={`/clients/${project.organization.id}`} className="underline underline-offset-4">
                  {project.organization.name}
                </Link>
              </>
            )}
          </>
        }
        title={project.name}
        actions={<StatusBadge status={project.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Overview">
            <p className="whitespace-pre-line text-[0.9375rem] text-ink">{project.description || "No description yet."}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ink-muted">Start</dt>
                <dd className="text-ink">{formatDate(project.start_date)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Due</dt>
                <dd className="text-ink">{formatDate(project.due_date)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Milestones</dt>
                <dd className="text-ink">{done} of {milestones.length} complete</dd>
              </div>
            </dl>
            <div className="mt-4">
              <ProgressBar value={percent(done, milestones.length)} label="Milestones complete" />
            </div>
          </Card>

          <Card title="Milestones">
            {milestones.length === 0 ? (
              <p className="text-sm text-ink-muted">No milestones yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {milestones.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`flex size-5 items-center justify-center rounded-full border text-xs ${
                          m.completed_at ? "border-ok bg-ok text-white" : "border-line-strong"
                        }`}
                      >
                        {m.completed_at ? "✓" : ""}
                      </span>
                      <span className={m.completed_at ? "text-ink-muted line-through" : "text-ink"}>{m.title}</span>
                      <span className="sr-only">{m.completed_at ? "(complete)" : "(open)"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DueBadge label={dueLabel(m.due_date, Boolean(m.completed_at))} />
                      {isAdmin && (
                        <>
                          <form action={setMilestoneDone.bind(null, m.id, project.id, !m.completed_at)}>
                            <Button type="submit" variant="ghost" size="sm">
                              {m.completed_at ? "Reopen" : "Mark done"}
                              <span className="sr-only">: {m.title}</span>
                            </Button>
                          </form>
                          <form action={deleteMilestone.bind(null, m.id, project.id)}>
                            <ConfirmSubmit message={`Delete milestone "${m.title}"?`} variant="ghost" size="sm">
                              Delete<span className="sr-only">: {m.title}</span>
                            </ConfirmSubmit>
                          </form>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {isAdmin && (
              <div className="mt-5 border-t border-line pt-5">
                <h3 className="mb-3 text-sm font-semibold text-ink">Add milestone</h3>
                <ActionForm action={addMilestone} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
                  <input type="hidden" name="projectId" value={project.id} />
                  <TextField name="title" label="Title" maxLength={160} />
                  <TextField name="dueDate" label="Due date" type="date" optional />
                  <SubmitButton pendingText="Adding…">Add</SubmitButton>
                </ActionForm>
              </div>
            )}
          </Card>

          {isAdmin && (
            <Card title="Edit project">
              <ProjectForm action={updateProject.bind(null, project.id)} defaults={project} submitLabel="Save changes" />
              <form action={deleteProject.bind(null, project.id)} className="mt-6 border-t border-line pt-5">
                <ConfirmSubmit message={`Delete "${project.name}" and its milestones? Documents stay in the library.`} variant="danger">
                  Delete project
                </ConfirmSubmit>
              </form>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Documents">
            {project.documents.length === 0 ? (
              <p className="text-sm text-ink-muted">No documents linked to this project.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {project.documents.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3">
                    <a href={`/documents/${d.id}/download`} className="truncate text-brand-ink underline underline-offset-4">
                      {d.file_name}
                    </a>
                    <span className="shrink-0 text-ink-muted">
                      {d.visibility === "internal" ? "Internal · " : ""}
                      {formatBytes(d.size_bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="History">
            <ActivityList items={activity ?? []} />
          </Card>
        </div>
      </div>
    </>
  );
}
