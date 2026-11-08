import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Role = Database["portal"]["Enums"]["user_role"];

export type Member = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  phone: string | null;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  isDemo: boolean;
};

type Session =
  | { state: "signed-out" }
  | { state: "no-profile"; userId: string; email: string }
  | { state: "member"; member: Member };

/**
 * Data Access Layer entry point. Verifies the session with the Auth server
 * (getUser, not just the cookie) and loads the portal profile under RLS.
 * Wrapped in React cache() so a page and its layout share one lookup.
 */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "signed-out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, job_title, phone, role, org_id, is_demo, organization:organizations(name)")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { state: "no-profile", userId: user.id, email: user.email ?? "" };

  return {
    state: "member",
    member: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      jobTitle: profile.job_title,
      phone: profile.phone,
      role: profile.role,
      orgId: profile.org_id,
      orgName: profile.organization?.name ?? null,
      isDemo: profile.is_demo,
    },
  };
});

/** For pages and actions that need a portal member. */
export async function requireMember(): Promise<Member> {
  const session = await getSession();
  if (session.state === "signed-out") redirect("/login");
  if (session.state === "no-profile") redirect("/no-access");
  return session.member;
}

/**
 * Admin-only pages respond with 404 to everyone else, so their existence
 * is not advertised. RLS would return no data anyway.
 */
export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();
  if (member.role !== "admin") notFound();
  return member;
}
