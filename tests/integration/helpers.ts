// Integration tests talk to a real (local) Supabase over HTTP with the
// publishable key, exactly like the app does. They sign in as the seeded
// demo users, so requests carry genuine JWTs and RLS is evaluated for real.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the variables directly.
}

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const PASSWORD = "DemoPortal!2026";

export const USERS = {
  admin: "portal-admin@example.com",
  clientA: "portal-client-a@example.com",
  clientA2: "portal-client-a2@example.com",
  clientB: "portal-client-b@example.com",
} as const;

export const IDS = {
  orgA: "a0000000-0000-4000-8000-00000000000a",
  orgB: "b0000000-0000-4000-8000-00000000000b",
  projectA1: "a0000000-0000-4000-8000-000000000101",
  projectB1: "b0000000-0000-4000-8000-000000000201",
  docA1: "a0000000-0000-4000-8000-000000000301",
  docAInternal: "a0000000-0000-4000-8000-000000000303",
  docB1: "b0000000-0000-4000-8000-000000000401",
} as const;

export type Client = SupabaseClient<Database, "portal">;

export function anonClient(): Client {
  return createClient<Database, "portal">(URL, KEY, {
    db: { schema: "portal" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signedIn(email: string, password = PASSWORD): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Restores the seed data (and removes accounts created by tests) via the demo-admin RPC. */
export async function resetDemo() {
  const admin = await signedIn(USERS.admin);
  const { error } = await admin.rpc("reset_demo");
  if (error) throw new Error(`reset_demo failed: ${error.message}`);
  await admin.auth.signOut();
}
