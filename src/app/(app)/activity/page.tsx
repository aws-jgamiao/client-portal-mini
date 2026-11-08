import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { OrgSwitcher } from "@/components/org-switcher";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listOrganizations, parseOrgFilter } from "@/lib/data";

export const metadata: Metadata = { title: "Activity" };

const PAGE_SIZE = 30;

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  await requireAdmin();
  const params = await searchParams;
  const orgId = parseOrgFilter(params.org);
  const before = typeof params.before === "string" && /^\d{1,18}$/.test(params.before) ? Number(params.before) : null;
  const supabase = await createClient();

  // Keyset pagination on the identity column: stable under concurrent inserts.
  let query = supabase
    .from("activity_events")
    .select("id, kind, summary, created_at, actor:profiles(full_name), organization:organizations(name)")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (orgId) query = query.eq("org_id", orgId);
  if (before) query = query.lt("id", before);

  const [{ data }, organizations] = await Promise.all([query, listOrganizations(supabase)]);
  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);

  return (
    <>
      <PageHeader title="Activity" description="A history of changes across every client, recorded by the database." />
      <OrgSwitcher basePath="/activity" organizations={organizations} current={orgId} allowAll />
      <Card>
        <ActivityList items={page} showOrg={!orgId} />
        {hasMore && last && (
          <div className="mt-6 border-t border-line pt-4">
            <Link
              href={`/activity?${new URLSearchParams({ ...(orgId ? { org: orgId } : {}), before: String(last.id) })}`}
              className="text-sm text-brand-ink underline underline-offset-4"
            >
              Show older activity
            </Link>
          </div>
        )}
      </Card>
    </>
  );
}
