"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { dbErrorMessage, failure, logDbError, success, validationFailure, type ActionState } from "@/lib/action-state";
import { inviteSchema, organizationSchema, uuid } from "@/lib/validation/schemas";

export async function createOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = organizationSchema.safeParse({ name: formData.get("name"), slug: formData.get("slug") });
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").insert(parsed.data).select("id").single();
  if (error) {
    if (error.code === "23505") return failure("That slug is already in use.", { slug: ["Choose a different slug."] });
    logDbError("createOrganization", error);
    return failure(dbErrorMessage(error));
  }
  redirect(`/clients/${data.id}`);
}

export async function updateOrganization(orgId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = uuid.safeParse(orgId);
  const parsed = organizationSchema.safeParse({ name: formData.get("name"), slug: formData.get("slug") });
  if (!id.success) return failure("We couldn't find that client.");
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update(parsed.data).eq("id", id.data).select("id");
  if (error) {
    if (error.code === "23505") return failure("That slug is already in use.", { slug: ["Choose a different slug."] });
    logDbError("updateOrganization", error);
    return failure(dbErrorMessage(error));
  }
  if (!data.length) return failure("We couldn't find that client.");
  revalidatePath(`/clients/${id.data}`);
  return success("Client details saved.");
}

export type InviteState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; message: string; link: string };

export async function createInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireAdmin();
  const parsed = inviteSchema.safeParse({ orgId: formData.get("orgId"), email: formData.get("email") });
  if (!parsed.success) {
    const v = validationFailure(parsed.error);
    return v.status === "error" ? v : { status: "error", message: "Invalid input." };
  }

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation", {
    p_org_id: parsed.data.orgId,
    p_email: parsed.data.email,
  });
  if (error || !token) {
    if (error?.code === "23505") return { status: "error", message: "There's already a pending invitation for that email." };
    if (error?.hint === "invitation_limit") return { status: "error", message: "This client has too many pending invitations." };
    logDbError("create_invitation", error);
    return { status: "error", message: dbErrorMessage(error) };
  }
  revalidatePath(`/clients/${parsed.data.orgId}`);
  // The raw token is only ever shown here, once. The database keeps a hash.
  return {
    status: "success",
    message: `Invitation created for ${parsed.data.email}. Copy the link now: it won't be shown again.`,
    link: `${env.NEXT_PUBLIC_SITE_URL}/invite/${token}`,
  };
}

export async function revokeInvitation(invitationId: string, orgId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", uuid.parse(invitationId));
  if (error) logDbError("revokeInvitation", error);
  revalidatePath(`/clients/${uuid.parse(orgId)}`);
}

export async function removeMember(profileId: string, orgId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  // RLS only lets admins delete client profiles. The auth account remains
  // but no longer has access to any organization.
  const { error } = await supabase.from("profiles").delete().eq("id", uuid.parse(profileId)).eq("role", "client");
  if (error) logDbError("removeMember", error);
  revalidatePath(`/clients/${uuid.parse(orgId)}`);
}
