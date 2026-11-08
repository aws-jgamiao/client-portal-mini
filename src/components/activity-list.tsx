import { formatDateTime } from "@/lib/format";

export type ActivityItem = {
  id: number;
  kind: string;
  summary: string;
  created_at: string;
  actor: { full_name: string } | null;
  organization?: { name: string } | null;
};

const DOT: Record<string, string> = {
  "project.created": "bg-info",
  "project.status_changed": "bg-brand",
  "milestone.completed": "bg-ok",
  "onboarding.completed": "bg-ok",
  "onboarding.reopened": "bg-warn",
  "document.uploaded": "bg-info",
  "member.joined": "bg-brand",
};

export function ActivityList({ items, showOrg = false }: { items: ActivityItem[]; showOrg?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-ink-muted">No activity yet.</p>;
  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[item.kind] ?? "bg-ink-subtle"}`} />
          <div className="min-w-0 text-sm">
            <p className="text-ink">{item.summary}</p>
            <p className="text-ink-muted">
              {showOrg && item.organization && <span className="font-medium">{item.organization.name} · </span>}
              {item.actor?.full_name ?? "System"} · <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
