// Uploads the sample files for the seeded demo documents.
// Signs in as the demo admin with the PUBLISHABLE key, so storage RLS applies
// exactly as it does in the app. No service-role key is needed.
//
//   npm run db:seed-storage            (uses .env.local)
import { createClient } from "@supabase/supabase-js";
import { syncDemoStorage } from "../src/lib/demo-storage.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase.auth.signInWithPassword({
  email: "portal-admin@example.com",
  password: "DemoPortal!2026",
});
if (error) {
  console.error(`Demo admin sign-in failed (${error.code ?? error.status}). Has the database been seeded?`);
  process.exit(1);
}

const result = await syncDemoStorage(supabase);
console.log(`Storage synced: ${result.uploaded} uploaded, ${result.removed} orphaned objects removed.`);
await supabase.auth.signOut();
