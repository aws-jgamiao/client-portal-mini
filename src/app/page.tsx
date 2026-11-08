import type { Metadata } from "next";
import { Logo } from "@/components/brand";
import { DemoSignIn } from "@/components/demo-sign-in";
import { LinkButton } from "@/components/ui/button";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Client Portal Mini: demo" };

const features = [
  {
    title: "Projects and milestones",
    body: "Status, dates, milestones and a history of what changed, written by database triggers.",
  },
  {
    title: "Onboarding checklist",
    body: "Admins configure each client's steps. Clients tick them off, and progress updates for both sides.",
  },
  {
    title: "Private documents",
    body: "Files live in a private bucket. Content is checked by type and size, and links are short-lived and signed.",
  },
  {
    title: "Client messaging",
    body: "One thread per organization, append-only, visible only to that client and the agency.",
  },
  {
    title: "Invitations",
    body: "Admins invite client users with single-use links. Only a hash of each token is stored.",
  },
  {
    title: "Tenant isolation you can test",
    body: "Sign in as Client A and open the isolation check. It attempts real cross-tenant reads and writes and shows the responses.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <LinkButton href="/login" variant="secondary" size="sm">
          Sign in
        </LinkButton>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="py-10 sm:py-14">
          <p className="text-sm font-medium text-brand-ink">Portfolio project · Next.js + Supabase</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-tight">
            One place for an agency&apos;s clients to follow their projects, finish onboarding and share files.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">
            Each client organization is isolated by PostgreSQL row-level security, so a client can&apos;t see
            another client&apos;s data even by editing a request.
          </p>
        </section>

        {env.NEXT_PUBLIC_DEMO_MODE && (
          <section aria-labelledby="demo-heading" className="mb-14">
            <h2 id="demo-heading" className="mb-3 text-lg font-semibold text-ink">
              Try it: pick a demo account
            </h2>
            <DemoSignIn />
          </section>
        )}

        <section aria-labelledby="features-heading">
          <h2 id="features-heading" className="mb-4 text-lg font-semibold text-ink">
            What you can test
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <li key={f.title} className="card p-5">
                <h3 className="font-medium text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[0.9375rem] text-ink-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="stack-heading" className="mt-14 border-t border-line pt-8">
          <h2 id="stack-heading" className="text-lg font-semibold text-ink">
            How it&apos;s built
          </h2>
          <p className="mt-2 max-w-3xl text-[0.9375rem] text-ink-muted">
            Next.js App Router (Server Components and Server Actions), TypeScript in strict mode, Tailwind CSS,
            Supabase Auth, Postgres with row-level security, Supabase Storage, Zod validation, pgTAP, Vitest and
            Playwright tests. The deployed app holds no service-role key: every query runs as the signed-in
            user.
          </p>
        </section>
      </main>
    </div>
  );
}
