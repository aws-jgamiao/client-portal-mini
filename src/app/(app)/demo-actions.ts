"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncDemoStorage } from "@/lib/demo-storage";
import { env } from "@/lib/env";
import { dbErrorMessage, failure, logDbError, success, type ActionState } from "@/lib/action-state";

export async function resetDemoData(_prev: ActionState): Promise<ActionState> {
  const member = await requireAdmin();
  if (!env.NEXT_PUBLIC_DEMO_MODE || !member.isDemo) return failure("Reset is only available in the demo.");

  const supabase = await createClient();
  // The database re-checks that the caller is a demo admin.
  const { error } = await supabase.rpc("reset_demo");
  if (error) {
    logDbError("reset_demo", error);
    return failure(dbErrorMessage(error));
  }
  try {
    await syncDemoStorage(supabase);
  } catch (e) {
    console.error(`[demo] storage sync failed: ${(e as Error).message}`);
    return failure("Data was reset, but sample files couldn't be restored. Try again.");
  }
  revalidatePath("/", "layout");
  return success("Sample data restored.");
}
