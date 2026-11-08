"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/demo-storage";
import { checkUpload } from "@/lib/validation/files";
import { documentMetaSchema, uuid } from "@/lib/validation/schemas";
import { dbErrorMessage, failure, logDbError, success, validationFailure, type ActionState } from "@/lib/action-state";

export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const meta = documentMetaSchema.safeParse({
    orgId: formData.get("orgId"),
    projectId: formData.get("projectId") ?? "",
    visibility: formData.get("visibility"),
  });
  if (!meta.success) return validationFailure(meta.error);

  const raw = formData.get("file");
  const file = await checkUpload(raw instanceof File ? raw : null);
  if (!file.ok) return failure(file.message, { file: [file.message] });

  const supabase = await createClient();

  // Confirm the org (and project, if any) is visible to this admin, and that
  // the project belongs to the chosen org. The composite FK enforces it too.
  if (meta.data.projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", meta.data.projectId)
      .eq("org_id", meta.data.orgId)
      .maybeSingle();
    if (!project) return failure("Choose a project that belongs to this client.", { projectId: ["Not a project for this client."] });
  }

  // The object key is "<org_id>/<random uuid>". No part of it comes from the
  // file name, so path traversal is impossible. A DB CHECK enforces the shape.
  const id = crypto.randomUUID();
  const path = `${meta.data.orgId}/${id}`;
  const blob = raw as File;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: file.mime, upsert: false });
  if (uploadError) {
    console.error("[storage] upload failed");
    return failure("The file couldn't be uploaded. Please try again.");
  }

  const { error } = await supabase.from("documents").insert({
    id,
    org_id: meta.data.orgId,
    project_id: meta.data.projectId,
    storage_path: path,
    file_name: file.name,
    mime_type: file.mime,
    size_bytes: file.size,
    visibility: meta.data.visibility,
    uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  if (error) {
    // Don't leave an orphaned object behind.
    await supabase.storage.from(BUCKET).remove([path]);
    logDbError("uploadDocument", error);
    return failure(dbErrorMessage(error));
  }

  revalidatePath("/documents");
  return success(`"${file.name}" uploaded.`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await requireAdmin();
  const id = uuid.parse(documentId);
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).maybeSingle();
  if (!doc) return;
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) {
    logDbError("deleteDocument", error);
    return;
  }
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (storageError) console.error("[storage] remove failed");
  revalidatePath("/documents");
}

export async function setDocumentVisibility(documentId: string, visibility: "client" | "internal"): Promise<void> {
  await requireAdmin();
  const id = uuid.parse(documentId);
  if (visibility !== "client" && visibility !== "internal") return;
  const supabase = await createClient();
  const { error } = await supabase.from("documents").update({ visibility }).eq("id", id);
  if (error) logDbError("setDocumentVisibility", error);
  revalidatePath("/documents");
}
