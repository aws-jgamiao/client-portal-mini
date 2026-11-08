"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, failure, logDbError, success, validationFailure, type ActionState } from "@/lib/action-state";
import { messageSchema } from "@/lib/validation/schemas";

export async function sendMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const member = await requireMember();
  const parsed = messageSchema.safeParse({ orgId: formData.get("orgId"), body: formData.get("body") });
  if (!parsed.success) return validationFailure(parsed.error);

  // Clients can only ever post to their own organization: the submitted orgId
  // is overridden here, and RLS rejects a mismatch regardless.
  const orgId = member.role === "admin" ? parsed.data.orgId : member.orgId;
  if (!orgId) return failure("You don't have permission to do that.");

  const supabase = await createClient();
  // sender_id defaults to auth.uid() in the database and cannot be set by clients.
  const { error } = await supabase.from("messages").insert({ org_id: orgId, body: parsed.data.body });
  if (error) {
    logDbError("sendMessage", error);
    return failure(dbErrorMessage(error));
  }
  revalidatePath("/messages");
  return success("Message sent.");
}
