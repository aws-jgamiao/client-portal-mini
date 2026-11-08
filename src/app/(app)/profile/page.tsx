import type { Metadata } from "next";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/primitives";
import { updatePassword } from "@/app/auth/actions";
import { requireMember } from "@/lib/auth";
import { updateProfile } from "./actions";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const member = await requireMember();
  return (
    <>
      <PageHeader title="Profile" description="How you appear to your account manager and colleagues." />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card title="Your details">
          <ActionForm action={updateProfile} className="space-y-4">
            <TextField name="fullName" label="Full name" defaultValue={member.fullName} autoComplete="name" maxLength={120} />
            <TextField name="jobTitle" label="Job title" optional defaultValue={member.jobTitle ?? ""} autoComplete="organization-title" maxLength={120} />
            <TextField name="phone" label="Phone" type="tel" optional defaultValue={member.phone ?? ""} autoComplete="tel" />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">Email</p>
              <p className="text-[0.9375rem] text-ink-muted">{member.email}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">Organization and role</p>
              <p className="text-[0.9375rem] text-ink-muted">
                {member.role === "admin" ? "Agency admin" : `${member.orgName} · Client`}. Only the agency can change this.
              </p>
            </div>
            <SubmitButton>Save profile</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Change password">
          {member.isDemo ? (
            <p className="text-sm text-ink-muted">Demo account passwords can&apos;t be changed, so the next visitor can still sign in.</p>
          ) : (
            <ActionForm action={updatePassword} className="space-y-4">
              <TextField name="password" label="New password" type="password" autoComplete="new-password" minLength={8} />
              <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
              <SubmitButton pendingText="Updating…">Update password</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
