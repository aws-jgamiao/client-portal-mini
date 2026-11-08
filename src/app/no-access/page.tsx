import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/auth/actions";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <AuthCard
      title="Your account isn't linked to a client yet"
      description="You're signed in, but this account hasn't accepted an invitation to an organization. Open the invitation link from your account manager, or sign out and use a different account."
    >
      <form action={logout}>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </AuthCard>
  );
}
