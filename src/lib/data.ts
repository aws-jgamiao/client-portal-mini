import "server-only";
import { notFound } from "next/navigation";
import type { PortalClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/schemas";

/** Organizations visible to the caller (all for admins, one for clients). */
export async function listOrganizations(supabase: PortalClient) {
  const { data } = await supabase.from("organizations").select("id, name, slug").order("name");
  return data ?? [];
}

/**
 * Validates a route/search-param id. Malformed ids get the same 404 as ids
 * that RLS hides, so probing reveals nothing.
 */
export function parseIdOr404(value: unknown): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) notFound();
  return parsed.data;
}

/** Optional ?org= filter for admin pages; ignores invalid values. */
export function parseOrgFilter(value: unknown): string | null {
  const parsed = uuid.safeParse(value);
  return parsed.success ? parsed.data : null;
}
