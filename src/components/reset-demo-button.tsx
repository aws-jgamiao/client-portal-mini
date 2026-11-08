"use client";

import { useActionState } from "react";
import { resetDemoData } from "@/app/(app)/demo-actions";
import { idle } from "@/lib/action-state";

export function ResetDemoButton() {
  const [state, action, pending] = useActionState(resetDemoData, idle);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Restore all sample data? Changes made in the demo will be lost.")) e.preventDefault();
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-sm text-ink-muted hover:bg-canvas disabled:opacity-60"
      >
        {pending ? "Restoring…" : "Reset demo data"}
      </button>
      <p role="status" className={state.status === "idle" ? "sr-only" : `mt-1 text-xs ${state.status === "error" ? "text-danger" : "text-ok"}`}>
        {state.status === "idle" ? "" : state.message}
      </p>
    </form>
  );
}
