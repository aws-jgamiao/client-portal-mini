import { Logo } from "@/components/brand";
import { DesktopNav, MobileNav, type NavItem } from "@/components/app-nav";
import { Avatar, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ResetDemoButton } from "@/components/reset-demo-button";
import { logout } from "@/app/auth/actions";
import { requireMember, type Member } from "@/lib/auth";
import { env } from "@/lib/env";

const CLIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/projects", label: "Projects" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/documents", label: "Documents" },
  { href: "/messages", label: "Messages" },
  { href: "/profile", label: "Profile" },
  { href: "/isolation-check", label: "Isolation check" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/documents", label: "Documents" },
  { href: "/messages", label: "Messages" },
  { href: "/activity", label: "Activity" },
  { href: "/profile", label: "Profile" },
  { href: "/isolation-check", label: "Isolation check" },
];

function Account({ member }: { member: Member }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar name={member.fullName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{member.fullName}</p>
          <p className="truncate text-xs text-ink-muted">{member.role === "admin" ? "Agency admin" : member.orgName}</p>
        </div>
      </div>
      {env.NEXT_PUBLIC_DEMO_MODE && member.isDemo && member.role === "admin" && <ResetDemoButton />}
      <form action={logout}>
        <Button type="submit" variant="secondary" size="sm" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await requireMember();
  const nav = member.role === "admin" ? ADMIN_NAV : CLIENT_NAV;

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col lg:gap-6 lg:p-5">
        <Logo href="/dashboard" />
        {member.isDemo && <Badge tone="info">Demo environment</Badge>}
        <div className="flex-1">
          <DesktopNav items={nav} />
        </div>
        <Account member={member} />
      </aside>

      <header className="relative flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Logo href="/dashboard" />
        <MobileNav items={nav} footer={<Account member={member} />} />
      </header>

      <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
