import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 font-semibold text-ink">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7">
        <rect width="32" height="32" rx="8" fill="var(--color-brand)" />
        <path d="M9 11h14M9 16h9M9 21h11" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span>
        Client Portal <span className="font-normal text-ink-muted">Mini</span>
      </span>
    </Link>
  );
}
