# Case study: demo reset passed every database test, then failed in the app

**Type:** a genuine bug, found during development by the integration test suite (not a production incident).
**Fix:** commit `28093e1`, `fix(db): make demo reset work through PostgREST (pg-safeupdate)`.

## Original problem

`portal.reset_demo()` restores the sample data for the public demo. The pgTAP suite tested it
directly in Postgres (`02_admin_invitations_reset.test.sql`) and it passed. The first time the
integration suite called the same function through the Supabase API as the demo admin, it failed:

```
reset_demo failed: DELETE requires a WHERE clause
```

## Steps to reproduce (before the fix)

1. `npx supabase start` (local stack, migrations applied, seeded).
2. Sign in as `portal-admin@example.com` with supabase-js and call `rpc('reset_demo')`, or run
   `npm run test:integration`.
3. Every test file fails in `beforeAll` with the error above.
4. `npm run test:db` still passes.

## Root cause

The same function behaved differently depending on how the session was opened:

| Path | Role that opens the connection | Libraries preloaded |
|---|---|---|
| pgTAP (`supabase test db`) | `postgres` | none |
| App / supabase-js → PostgREST | `authenticator` | `supautils, safeupdate` |

Verified with:

```sql
select rolconfig from pg_roles where rolname = 'authenticator';
-- {"session_preload_libraries=supautils, safeupdate", ...}
```

`pg-safeupdate` rejects any `UPDATE` or `DELETE` without a `WHERE` clause, as a guard against
accidental mass deletes through the REST API. It hooks the whole session, so it also applies
inside `SECURITY DEFINER` functions. `seed_demo_data()` contained
`delete from portal.organizations;`, a deliberate full-table delete (it cascades through every
tenant table) with no `WHERE`.

Reproduced outside the app by loading the library as the local superuser:

```sql
load 'safeupdate';
-- ...impersonate the demo admin...
select portal.reset_demo();   -- ERROR at seed_demo_data() line 20
```

## Fix

```sql
delete from portal.organizations where id is not null;
```

The statement has the same effect, and an inline comment explains why the `WHERE` must stay. The
other mass statements in the function already had `WHERE` clauses.

## Tests added

- `tests/integration/helpers.ts` → `resetDemo()` calls the RPC **over HTTP as the demo admin**.
  Every integration and E2E spec runs it in `beforeAll` / `beforeEach`, so the reset path is
  exercised dozens of times per run.
- `tests/integration/workflows.test.ts` and `tests/e2e/*` now depend on a working reset, so a
  regression fails the whole suite immediately.

## How regressions are prevented

- **Database tests alone are not enough.** pgTAP is still used for fast, exhaustive policy checks.
  Anything the app calls is *also* tested through PostgREST with real JWTs, which is the path
  production uses.
- CI runs both layers against the same local Supabase stack (`.github/workflows/ci.yml`).
- Lesson recorded for future SQL: any intentional full-table `UPDATE`/`DELETE` in a function that
  API callers can reach needs an explicit `WHERE`.

---

# Case study 2: "not found" pages returned HTTP 200

**Type:** a genuine bug, found by the Playwright suite during development.

**Problem.** Opening another client's project (`/projects/<client-B-id>`) as Client A correctly
rendered the 404 page, but the HTTP status was **200**. The same happened for admin-only pages.
No data leaked (the body was the not-found page), but the status was wrong for clients, crawlers
and monitoring. It also undermined the claim that a hidden record "looks exactly like" a missing
one at the HTTP level.

**Root cause.** `src/app/(app)/loading.tsx` wrapped every authenticated page in a Suspense
boundary. With a loading boundary, Next.js starts streaming the response (with status 200) before
the page component runs. By the time the page called `notFound()`, the status had already been
sent, so Next.js could only swap in the not-found UI.

**Fix.** Loading skeletons now live only on leaf routes that never call `notFound()` (dashboard,
onboarding, documents, messages, profile, isolation check). Each `loading.tsx` carries a comment
explaining the rule.

**Tests.** `tests/e2e/isolation.spec.ts` asserts `response.status() === 404` for another client's
project, a non-existent id, and four admin-only routes accessed by a client.
