"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, failure, logDbError, success, validationFailure, type ActionState } from "@/lib/action-state";
import { onboardingItemSchema, uuid } from "@/lib/validation/schemas";

/** Clients and admins tick steps off. The RPC only touches completion fields. */
export async function setOnboardingDone(itemId: string, done: boolean): Promise<void> {
  await requireMember();
  const id = uuid.safeParse(itemId);
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_onboarding_item_done", { p_item_id: id.data, p_done: Boolean(done) });
  if (error) logDbError("set_onboarding_item_done", error);
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
}

export async function addOnboardingItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = onboardingItemSchema.safeParse({
    orgId: formData.get("orgId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    required: formData.get("required") ?? "",
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("onboarding_items")
    .select("position")
    .eq("org_id", v.orgId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("onboarding_items").insert({
    org_id: v.orgId,
    title: v.title,
    description: v.description,
    due_date: v.dueDate,
    required: v.required,
    position: (last?.position ?? 0) + 1,
  });
  if (error) {
    logDbError("addOnboardingItem", error);
    return failure(dbErrorMessage(error));
  }
  revalidatePath("/onboarding");
  return success("Step added.");
}

export async function deleteOnboardingItem(itemId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_items").delete().eq("id", uuid.parse(itemId));
  if (error) logDbError("deleteOnboardingItem", error);
  revalidatePath("/onboarding");
}
