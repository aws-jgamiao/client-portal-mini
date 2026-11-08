// Demo accounts. These credentials are intentionally public (they are shown
// on the landing page) and only exist in the demo environment. They grant
// access to synthetic sample data, and a reset restores everything.
export const DEMO_PASSWORD = "DemoPortal!2026";

export const DEMO_ACCOUNTS = {
  admin: {
    email: "portal-admin@example.com",
    name: "Avery Collins",
    title: "Agency admin",
    description: "Manages every client: projects, onboarding, files, invitations and messages.",
  },
  clientA: {
    email: "portal-client-a@example.com",
    name: "Priya Shah",
    title: "Client A · Northwind Bakery",
    description: "Sees only Northwind Bakery's projects, onboarding, shared files and thread.",
  },
  clientB: {
    email: "portal-client-b@example.com",
    name: "Marcus Lee",
    title: "Client B · Harbour Physio",
    description: "Sees only Harbour Physio's data. Use it to compare with Client A.",
  },
} as const;

export type DemoAccount = keyof typeof DEMO_ACCOUNTS;

// Fixed ids from supabase/migrations/20261108000002_portal_demo.sql
export const DEMO_IDS = {
  orgA: "a0000000-0000-4000-8000-00000000000a",
  orgB: "b0000000-0000-4000-8000-00000000000b",
  projectB1: "b0000000-0000-4000-8000-000000000201",
  docB1: "b0000000-0000-4000-8000-000000000401",
} as const;
