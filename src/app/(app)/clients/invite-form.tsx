"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { createInvitation, type InviteState } from "./actions";

export function InviteForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvitation, { status: "idle" });
  const [copied, setCopied] = useState(false);
  const id = useId();
  const emailError = state.status === "error" ? state.fieldErrors?.email : undefined;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3" noValidate>
        <input type="hidden" name="orgId" value={orgId} />
        <div className="space-y-1.5">
          <label htmlFor={`${id}-email`} className="block text-sm font-medium text-ink">
            Email address
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="off"
            className="input"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${id}-error` : undefined}
          />
          {emailError && (
            <p id={`${id}-error`} className="text-sm font-medium text-danger">
              {emailError.join(" ")}
            </p>
          )}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create invitation link"}
        </Button>
      </form>

      <div role="status" aria-live="polite">
        {state.status === "error" && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.message}</p>}
        {state.status === "success" && (
          <div className="space-y-2 rounded-lg bg-ok-soft p-3 text-sm">
            <p className="text-ok">{state.message}</p>
            <div className="flex gap-2">
              <label htmlFor={`${id}-link`} className="sr-only">
                Invitation link
              </label>
              <input id={`${id}-link`} readOnly value={state.link} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="secondary"
                size="md"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-ink-muted">
              The demo doesn&apos;t send email, so open this link in a private window to try the invitee&apos;s side.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
