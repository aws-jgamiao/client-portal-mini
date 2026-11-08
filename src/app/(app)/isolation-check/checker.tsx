"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { runIsolationCheck, type CheckState } from "./actions";

export function IsolationChecker() {
  const [state, action, pending] = useActionState<CheckState>(runIsolationCheck, { status: "idle" });
  const blocked = state.status === "done" ? state.results.filter((r) => r.blocked).length : 0;

  return (
    <div>
      <form action={action}>
        <Button type="submit" disabled={pending}>
          {pending ? "Running…" : state.status === "done" ? "Run again" : "Run the isolation check"}
        </Button>
      </form>

      <div aria-live="polite" className="mt-6">
        {state.status === "error" && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{state.message}</p>}
        {state.status === "done" && (
          <>
            <p className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${blocked === state.results.length ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
              {blocked === state.results.length
                ? `All ${state.results.length} attempts against ${state.target} were blocked.`
                : `${state.results.length - blocked} of ${state.results.length} attempts were NOT blocked. This is a security bug.`}
            </p>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Cross-tenant access attempts and responses</caption>
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Attempt</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Response</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {state.results.map((r) => (
                    <tr key={r.attempt} className="align-top">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <span className="font-medium text-ink">{r.attempt}</span>
                        <code className="mt-1 block break-all text-xs text-ink-muted">{r.request}</code>
                      </th>
                      <td className="px-4 py-3 font-mono text-xs text-ink">{r.response}</td>
                      <td className="px-4 py-3">
                        {r.blocked ? <Badge tone="ok">Blocked</Badge> : <Badge tone="danger">Exposed</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-subtle">Ran at {new Date(state.ranAt).toLocaleTimeString()} with your own session.</p>
          </>
        )}
      </div>
    </div>
  );
}
