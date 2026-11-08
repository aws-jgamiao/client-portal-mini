# Deployment (Vercel + the shared Supabase project)

> Status: **deployed 2026-11-08** to the shared Supabase project and Vercel (https://client-portal-mini.vercel.app). Steps kept for reference. Each one that changes the remote
> database is shown for review first and is only run with the owner's approval.

## 1. Supabase (shared project): one-time setup

All objects are created in new schemas (`portal`, `portal_private`) plus one new bucket and four
prefixed storage policies. Nothing existing is modified.

1. **Review** both files in `supabase/migrations/`.
2. Apply them **in order**, each in a transaction, using one of these:
   - the SQL editor (paste each file), or
   - `psql "$DIRECT_URL" --single-transaction -f supabase/migrations/<file>.sql`.

   Avoid `supabase db push` from this repo. The shared project's migration history also contains
   other apps' migrations, so `db push` would report a mismatch.
3. **Dashboard → Project Settings → Data API → Exposed schemas:** add `portal` (keep the existing
   entries).
4. **Authentication → URL Configuration:** add the deployed origin plus `/auth/confirm` to the
   redirect allow-list, e.g. `https://<your-app>.vercel.app/auth/confirm`. Don't change the Site
   URL, because other apps depend on it.
5. **Create demo accounts:** review, then run `scripts/sql/create-demo-users.sql`. It only
   inserts four fixed ids on `example.com`, tagged `app = client-portal-mini`.
6. **Upload sample files:** `NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… npm run db:seed-storage`.

## 2. Vercel

1. Import the GitHub repository (framework preset: Next.js).
2. Environment variables. **Only these four, all public:**

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable (anon) key |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` |
   | `NEXT_PUBLIC_DEMO_MODE` | `true` |

   **Do not add a service-role or secret key.** The app doesn't use one.
3. Deploy, then run the smoke checks below.

## 3. Smoke checks after deploying

- [ ] `/` loads and the three demo buttons sign in.
- [ ] As Client A, `/isolation-check` reports **all 7 attempts blocked**.
- [ ] `/projects/b0000000-0000-4000-8000-000000000201` as Client A returns 404.
- [ ] A document download works for Client A.
- [ ] "Reset demo data" as the admin restores the sample data.

## 4. Optional: scheduled demo reset

A GitHub Actions workflow can sign in as the demo admin and call `portal.reset_demo()` nightly.
That needs no extensions or secrets, because the demo password is public. It isn't set up yet.

## Rollback

To remove the app from the shared project completely, review and run:

```sql
drop schema portal cascade;
drop schema portal_private cascade;
drop policy portal_documents_read on storage.objects;
drop policy portal_documents_insert on storage.objects;
drop policy portal_documents_delete on storage.objects;
-- Empty the bucket via the dashboard or Storage API first, then:
delete from storage.buckets where id = 'portal-documents';
delete from auth.users where raw_app_meta_data->>'app' = 'client-portal-mini';
```
