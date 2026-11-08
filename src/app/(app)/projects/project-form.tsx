"use client";

import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/format";

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }));

export function ProjectForm({
  action,
  organizations,
  defaults,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  organizations?: { id: string; name: string }[];
  defaults?: {
    name: string;
    description: string;
    status: ProjectStatus;
    start_date: string | null;
    due_date: string | null;
  };
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      {organizations && (
        <SelectField
          name="orgId"
          label="Client"
          options={[{ value: "", label: "Choose a client…" }, ...organizations.map((o) => ({ value: o.id, label: o.name }))]}
        />
      )}
      <TextField name="name" label="Project name" defaultValue={defaults?.name} maxLength={120} />
      <TextAreaField
        name="description"
        label="Description"
        optional
        defaultValue={defaults?.description}
        maxLength={4000}
        hint="Visible to the client."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField name="status" label="Status" options={STATUS_OPTIONS} defaultValue={defaults?.status ?? "planning"} />
        <TextField name="startDate" label="Start date" type="date" optional defaultValue={defaults?.start_date ?? ""} />
        <TextField name="dueDate" label="Due date" type="date" optional defaultValue={defaults?.due_date ?? ""} />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
