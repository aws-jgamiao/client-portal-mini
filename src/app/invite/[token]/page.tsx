import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { acceptInvite } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { inviteTokenSchema } from "@/lib/validation/schemas";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const parsed = inviteTokenSchema.safeParse(token);

  let invite: { organization_name: string; email: string; expires_at: string } | undefined;
  if (parsed.success) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_invitation", { p_token: parsed.data });
    invite = data?.[0];
  }

  if (!invite) {
    return (
      <AuthCard
        title="Invitation not available"
        description="This invitation link is invalid, has already been used, or has expired. Ask your account manager to send a new one."
      >
        <span />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${invite.organization_name}`}
      description={
        <>
          You&apos;ve been invited to the client portal as <strong className="text-ink">{invite.email}</strong>.
          This link expires on {formatDate(invite.expires_at)}.
        </>
      }
    >
      <ActionForm action={acceptInvite} className="space-y-4">
        <input type="hidden" name="token" value={parsed.data} />
        <TextField name="fullName" label="Your full name" autoComplete="name" />
        <TextField
          name="password"
          label="Choose a password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        <SubmitButton pendingText="Creating your account…">Accept and continue</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
