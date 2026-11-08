// Brings the private bucket in line with the documents table after a demo
// reset: removes objects that no longer have a row, and uploads any missing
// sample file. Runs with the demo admin's own session (storage RLS applies),
// so it needs no service-role key. Free of Next.js imports so
// scripts/seed-storage.ts can reuse it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEED_FILES } from "./seed-files.ts";

export const BUCKET = "portal-documents";

// The client is typed loosely on purpose: it is used with both the app's
// portal-scoped client and the plain client in the seeding script.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function syncDemoStorage(supabase: AnyClient): Promise<{ removed: number; uploaded: number }> {
  const bucket = supabase.storage.from(BUCKET);

  const { data: rows, error: rowsError } = await supabase.schema("portal").from("documents").select("storage_path");
  if (rowsError) throw new Error(`documents query failed (${rowsError.code})`);
  const expected = new Set((rows as { storage_path: string }[]).map((r) => r.storage_path));

  const { data: folders, error: listError } = await bucket.list("", { limit: 1000 });
  if (listError) throw new Error("storage list failed");

  const existing = new Set<string>();
  for (const folder of folders ?? []) {
    const { data: files } = await bucket.list(folder.name, { limit: 1000 });
    for (const file of files ?? []) existing.add(`${folder.name}/${file.name}`);
  }

  const orphans = [...existing].filter((path) => !expected.has(path));
  if (orphans.length) {
    const { error } = await bucket.remove(orphans);
    if (error) throw new Error("storage cleanup failed");
  }

  let uploaded = 0;
  for (const file of SEED_FILES) {
    if (existing.has(file.path) || !expected.has(file.path)) continue;
    const { error } = await bucket.upload(file.path, new Blob([file.content], { type: file.mime }), {
      contentType: file.mime,
      upsert: false,
    });
    if (error) throw new Error("seed upload failed");
    uploaded++;
  }

  return { removed: orphans.length, uploaded };
}
