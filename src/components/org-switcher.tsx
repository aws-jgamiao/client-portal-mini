import Link from "next/link";

/** Admin-only client picker rendered as links (works without JavaScript). */
export function OrgSwitcher({
  basePath,
  organizations,
  current,
  allowAll = false,
}: {
  basePath: string;
  organizations: { id: string; name: string }[];
  current: string | null;
  allowAll?: boolean;
}) {
  const link = (href: string, active: boolean, label: string, key: string) => (
    <Link
      key={key}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 ${
        active ? "border-brand bg-brand-soft text-brand-ink" : "border-line-strong text-ink-muted hover:bg-surface"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Choose a client" className="mb-5 flex flex-wrap gap-2 text-sm">
      {allowAll && link(basePath, !current, "All clients", "all")}
      {organizations.map((o) => link(`${basePath}?org=${o.id}`, current === o.id, o.name, o.id))}
    </nav>
  );
}
