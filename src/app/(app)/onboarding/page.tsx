import type { Metadata } from "next";
import { DueBadge } from "@/components/status-badge";
import { OrgSwitcher } from "@/components/org-switcher";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listOrganizations, parseOrgFilter } from "@/lib/data";
import { dueLabel, formatDateTime, percent } from "@/lib/format";
import { addOnboardingItem, deleteOnboardingItem, setOnboardingDone } from "./actions";

export const metadata: Metadata = { title: "Onboarding" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const member = await requireMember();
  const isAdmin = member.role === "admin";
  const supabase = await createClient();

  const organizations = isAdmin ? await listOrganizations(supabase) : [];
  const orgId = isAdmin ? (parseOrgFilter((await searchParams).org) ?? organizations[0]?.id ?? null) : member.orgId;
  const orgName = isAdmin ? organizations.find((o) => o.id === orgId)?.name : member.orgName;

  const { data: items } = orgId
    ? await supabase
        .from("onboarding_items")
        .select("id, title, description, due_date, required, completed_at, completer:profiles!onboarding_items_completed_by_fkey(full_name)")
        .eq("org_id", orgId)
        .order("position")
    : { data: [] };

  const list = items ?? [];
  const required = list.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.completed_at).length;
  const pct = percent(requiredDone, required.length);

  return (
    <>
      <PageHeader
        title="Onboarding"
        description={
          isAdmin
            ? "Configure each client's onboarding checklist and track their progress."
            : "A few things we need from you to get started. Tick each step off as you finish it."
        }
      />
      {isAdmin && <OrgSwitcher basePath="/onboarding" organizations={organizations} current={orgId} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={orgName ? `${orgName} checklist` : "Checklist"}>
            <div className="mb-5">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-ink-muted">Required steps</span>
                <span className="font-medium tabular-nums text-ink">
                  {requiredDone} of {required.length} · {pct}%
                </span>
              </div>
              <ProgressBar value={pct} label="Required onboarding steps complete" />
            </div>

            {list.length === 0 ? (
              <EmptyState title="No onboarding steps">
                {isAdmin ? "Add the first step using the form." : "Nothing to do yet."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((item) => {
                  const done = Boolean(item.completed_at);
                  return (
                    <li key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                      <form action={setOnboardingDone.bind(null, item.id, !done)} className="flex items-start gap-3">
                        <button
                          type="submit"
                          role="checkbox"
                          aria-checked={done}
                          aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${item.title}`}
                          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
                            done ? "border-ok bg-ok text-white" : "border-line-strong bg-surface hover:border-brand"
                          }`}
                        >
                          {done && <span aria-hidden="true">✓</span>}
                        </button>
                        <div>
                          <p className={`font-medium ${done ? "text-ink-muted line-through" : "text-ink"}`}>
                            {item.title}
                            {!item.required && <span className="ml-2 text-sm font-normal text-ink-muted">Optional</span>}
                          </p>
                          {item.description && <p className="mt-0.5 text-sm text-ink-muted">{item.description}</p>}
                          {done && item.completed_at && (
                            <p className="mt-1 text-xs text-ink-subtle">
                              Completed {formatDateTime(item.completed_at)}
                              {item.completer ? ` by ${item.completer.full_name}` : ""}
                            </p>
                          )}
                        </div>
                      </form>
                      <div className="flex items-center gap-2 pl-9 sm:pl-0">
                        <DueBadge label={dueLabel(item.due_date, done)} />
                        {isAdmin && (
                          <form action={deleteOnboardingItem.bind(null, item.id)}>
                            <ConfirmSubmit message={`Delete step "${item.title}"?`} variant="ghost" size="sm">
                              Delete<span className="sr-only">: {item.title}</span>
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {isAdmin && orgId && (
          <Card title="Add a step">
            <ActionForm action={addOnboardingItem} resetOnSuccess className="space-y-4">
              <input type="hidden" name="orgId" value={orgId} />
              <TextField name="title" label="Title" maxLength={160} />
              <TextAreaField name="description" label="Instructions" optional maxLength={2000} />
              <TextField name="dueDate" label="Due date" type="date" optional />
              <CheckboxField name="required" label="Required" hint="Counts towards onboarding progress." defaultChecked />
              <SubmitButton pendingText="Adding…">Add step</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
