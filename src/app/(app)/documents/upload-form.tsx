"use client";

import { ActionForm, SelectField, SubmitButton } from "@/components/ui/form";
import { useFormState } from "@/components/ui/form";
import { ACCEPT_ATTRIBUTE } from "@/lib/validation/files";
import { uploadDocument } from "./actions";

function FileInput() {
  const state = useFormState();
  const errors = state.status === "error" ? state.fieldErrors?.file : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor="file" className="block text-sm font-medium text-ink">
        File
      </label>
      <p id="file-hint" className="text-sm text-ink-muted">
        PDF, PNG, JPEG, TXT, CSV, DOCX or XLSX, up to 5 MB.
      </p>
      <input
        id="file"
        name="file"
        type="file"
        required
        accept={ACCEPT_ATTRIBUTE}
        aria-describedby={errors ? "file-hint file-error" : "file-hint"}
        aria-invalid={errors ? true : undefined}
        className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {errors && (
        <p id="file-error" className="text-sm font-medium text-danger">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}

export function UploadForm({ orgId, projects }: { orgId: string; projects: { id: string; name: string }[] }) {
  return (
    <ActionForm action={uploadDocument} resetOnSuccess className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <FileInput />
      <SelectField
        name="projectId"
        label="Project"
        optional
        options={[{ value: "", label: "Not linked to a project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
      />
      <SelectField
        name="visibility"
        label="Who can see it"
        options={[
          { value: "client", label: "Client and agency" },
          { value: "internal", label: "Agency only (internal)" },
        ]}
      />
      <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
    </ActionForm>
  );
}
