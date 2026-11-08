import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth";
import { DEMO_IDS } from "@/lib/demo";
import { IsolationChecker } from "./checker";

export const metadata: Metadata = { title: "Isolation check" };

export default async function IsolationCheckPage() {
  const member = await requireMember();
  const otherProject = member.orgId === DEMO_IDS.orgB ? "a0000000-0000-4000-8000-000000000101" : DEMO_IDS.projectB1;

  return (
    <>
      <PageHeader
        title="Isolation check"
        description="Prove that one client can't reach another client's data, even when it knows the exact record ids."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Live cross-tenant attempts">
            {member.role === "admin" ? (
              <p className="text-[0.9375rem] text-ink-muted">
                Admins can see every client by design, so there&apos;s nothing to block here. Sign out and sign in as{" "}
                <strong className="text-ink">Client A</strong> or <strong className="text-ink">Client B</strong> to run the
                check.
              </p>
            ) : (
              <>
                <p className="mb-4 text-[0.9375rem] text-ink-muted">
                  Clicking the button sends seven real requests to Supabase as <strong className="text-ink">you</strong>,
                  targeting the other demo client&apos;s project, document, file, people and message thread by id. The
                  responses below come straight from PostgREST and Storage.
                </p>
                <IsolationChecker />
              </>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Try it by hand">
            <p className="text-sm text-ink-muted">
              Open the other client&apos;s project URL directly. You&apos;ll get the same 404 as for an id that doesn&apos;t exist,
              so the response doesn&apos;t even confirm the project is there.
            </p>
            <Link href={`/projects/${otherProject}`} className="mt-3 inline-block break-all text-sm text-brand-ink underline underline-offset-4">
              /projects/{otherProject}
            </Link>
          </Card>
          <Card title="Why it's blocked">
            <ul className="list-disc space-y-2 pl-5 text-sm text-ink-muted">
              <li>Every table has row-level security policies that compare the row&apos;s organization with yours.</li>
              <li>Writes from clients are limited by column-level grants, so organization and role can&apos;t be changed.</li>
              <li>Child records use composite foreign keys, so they can&apos;t point across tenants.</li>
              <li>Storage access is checked against the same document policies.</li>
              <li>The app uses your session for every query. It has no service-role key that could bypass RLS.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
