"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  dbErrorMessage,
  failure,
  logDbError,
  success,
  validationFailure,
  type ActionState,
} from "@/lib/action-state";
import { createProjectSchema, milestoneSchema, projectSchema, uuid } from "@/lib/validation/schemas";

// Every action re-checks the role on the server (requireAdmin) and the
// database re-checks it again through RLS. Bound ids are validated because
// Server Action arguments can be forged by the caller.

function projectFields(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    status: formData.get("status"),
    startDate: formData.get("startDate") ?? "",
    dueDate: formData.get("dueDate") ?? "",
  };
}

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = createProjectSchema.safeParse({ ...projectFields(formData), orgId: formData.get("orgId") });
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      org_id: v.orgId,
      name: v.name,
      description: v.description,
      status: v.status,
      start_date: v.startDate,
      due_date: v.dueDate,
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    logDbError("createProject", error);
    return failure(dbErrorMessage(error));
  }
  redirect(`/projects/${data.id}`);
}

export async function updateProject(projectId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = uuid.safeParse(projectId);
  const parsed = projectSchema.safeParse(projectFields(formData));
  if (!id.success) return failure("We couldn't find that project.");
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ name: v.name, description: v.description, status: v.status, start_date: v.startDate, due_date: v.dueDate })
    .eq("id", id.data)
    .select("id");
  if (error) {
    logDbError("updateProject", error);
    return failure(dbErrorMessage(error));
  }
  if (!data.length) return failure("We couldn't find that project.");
  revalidatePath(`/projects/${id.data}`);
  return success("Project updated.");
}

export async function deleteProject(projectId: string): Promise<void> {
  await requireAdmin();
  const id = uuid.parse(projectId);
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) logDbError("deleteProject", error);
  redirect("/projects");
}

export async function addMilestone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = milestoneSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("org_id, milestones(position)")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (!project) return failure("We couldn't find that project.");

  const nextPosition = Math.max(0, ...project.milestones.map((m) => m.position)) + 1;
  // org_id comes from the project row, never from the form. The composite
  // foreign key would reject a mismatched pair anyway.
  const { error } = await supabase.from("milestones").insert({
    project_id: parsed.data.projectId,
    org_id: project.org_id,
    title: parsed.data.title,
    due_date: parsed.data.dueDate,
    position: nextPosition,
  });
  if (error) {
    logDbError("addMilestone", error);
    return failure(dbErrorMessage(error));
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return success("Milestone added.");
}

export async function setMilestoneDone(milestoneId: string, projectId: string, done: boolean): Promise<void> {
  await requireAdmin();
  const id = uuid.parse(milestoneId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("milestones")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) logDbError("setMilestoneDone", error);
  revalidatePath(`/projects/${uuid.parse(projectId)}`);
}

export async function deleteMilestone(milestoneId: string, projectId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("milestones").delete().eq("id", uuid.parse(milestoneId));
  if (error) logDbError("deleteMilestone", error);
  revalidatePath(`/projects/${uuid.parse(projectId)}`);
}
