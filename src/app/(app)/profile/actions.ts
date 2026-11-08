"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, failure, logDbError, success, validationFailure, type ActionState } from "@/lib/action-state";
import { profileSchema } from "@/lib/validation/schemas";

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const member = await requireMember();
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    jobTitle: formData.get("jobTitle") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  // Only these three columns are updatable by clients (column-level grants);
  // role and organization can't be changed from here, or via the API.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, job_title: parsed.data.jobTitle, phone: parsed.data.phone })
    .eq("id", member.id);
  if (error) {
    logDbError("updateProfile", error);
    return failure(dbErrorMessage(error));
  }
  revalidatePath("/", "layout");
  return success("Profile saved.");
}
