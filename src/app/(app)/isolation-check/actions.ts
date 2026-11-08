"use server";

import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/demo-storage";

export type CheckResult = {
  attempt: string;
  request: string;
  response: string;
  blocked: boolean;
};

export type CheckState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; target: string; ranAt: string; results: CheckResult[] };

// The other demo tenant's fixed records (see the demo seed migration).
const TENANTS = {
  "a0000000-0000-4000-8000-00000000000a": {
    name: "Northwind Bakery (Client A)",
    project: "a0000000-0000-4000-8000-000000000101",
    document: "a0000000-0000-4000-8000-000000000301",
  },
  "b0000000-0000-4000-8000-00000000000b": {
    name: "Harbour Physio (Client B)",
    project: "b0000000-0000-4000-8000-000000000201",
    document: "b0000000-0000-4000-8000-000000000401",
  },
} as const;

type OrgId = keyof typeof TENANTS;

const fmtError = (e: { code?: string; message: string }) => `error ${e.code ?? ""}: ${e.message}`.trim();

/**
 * Runs genuine cross-tenant requests as the signed-in client, using the same
 * Supabase client and session as every other page. Nothing is mocked; if RLS
 * were misconfigured, these requests would succeed and the page would say so.
 */
export async function runIsolationCheck(_prev: CheckState): Promise<CheckState> {
  const member = await requireMember();
  if (member.role !== "client" || !member.orgId || !(member.orgId in TENANTS)) {
    return { status: "error", message: "Sign in as one of the demo clients (Client A or Client B) to run the check." };
  }
  const targetOrg = (Object.keys(TENANTS) as OrgId[]).find((id) => id !== member.orgId)!;
  const t = TENANTS[targetOrg];
  const path = `${targetOrg}/${t.document}`;
  const supabase = await createClient();
  const results: CheckResult[] = [];

  {
    const { data, error } = await supabase.from("projects").select("id, name").eq("id", t.project).maybeSingle();
    results.push({
      attempt: "Read their project by id",
      request: `GET /rest/v1/projects?id=eq.${t.project}`,
      response: error ? fmtError(error) : data ? `returned "${data.name}"` : "0 rows (same as a non-existent id)",
      blocked: !data,
    });
  }
  {
    const { data, error } = await supabase
      .from("projects")
      .update({ name: "Renamed by another client" })
      .eq("id", t.project)
      .select("id");
    results.push({
      attempt: "Rename their project",
      request: `PATCH /rest/v1/projects?id=eq.${t.project}`,
      response: error ? fmtError(error) : `${data?.length ?? 0} rows updated`,
      blocked: Boolean(error) || !data?.length,
    });
  }
  {
    const { data, error } = await supabase.from("documents").delete().eq("id", t.document).select("id");
    results.push({
      attempt: "Delete their document record",
      request: `DELETE /rest/v1/documents?id=eq.${t.document}`,
      response: error ? fmtError(error) : `${data?.length ?? 0} rows deleted`,
      blocked: Boolean(error) || !data?.length,
    });
  }
  {
    const { error } = await supabase
      .from("messages")
      .insert({ org_id: targetOrg, body: "Message injected by another client" });
    results.push({
      attempt: "Post into their message thread",
      request: `POST /rest/v1/messages {"org_id":"${targetOrg}", ...}`,
      response: error ? fmtError(error) : "message was inserted",
      blocked: Boolean(error),
    });
  }
  {
    const { data, error } = await supabase.from("profiles").select("full_name, email").eq("org_id", targetOrg);
    results.push({
      attempt: "List their people",
      request: `GET /rest/v1/profiles?org_id=eq.${targetOrg}`,
      response: error ? fmtError(error) : `${data?.length ?? 0} rows`,
      blocked: Boolean(error) || !data?.length,
    });
  }
  {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    results.push({
      attempt: "Create a download link for their file",
      request: `POST /storage/v1/object/sign/${BUCKET}/${path}`,
      response: error ? `error: ${error.message}` : "a signed URL was issued",
      blocked: !data,
    });
  }
  {
    const { data, error } = await supabase.storage.from(BUCKET).list(targetOrg);
    results.push({
      attempt: "List their storage folder",
      request: `POST /storage/v1/object/list/${BUCKET} {"prefix":"${targetOrg}"}`,
      response: error ? `error: ${error.message}` : `${data?.length ?? 0} objects`,
      blocked: Boolean(error) || !data?.length,
    });
  }

  return { status: "done", target: t.name, ranAt: new Date().toISOString(), results };
}
