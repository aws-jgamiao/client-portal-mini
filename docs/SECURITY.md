# Security model

Client Portal Mini is a multi-tenant app. The core promise is that **a client user can only ever
read or change their own organization's data**, whatever request they craft.

## Layers of defence

| Layer | What it enforces | Where |
|---|---|---|
| Postgres RLS (primary) | Every table has policies comparing `org_id` with the caller's organization; admins pass through `is_admin()`. | `supabase/migrations/20261108000001_portal_schema.sql` |
| Column-level grants | Clients can update only `full_name`, `job_title` and `phone` on their profile. `role`, `org_id` and `sender_id` can't be written by clients at all. | same migration, "Privileges" section |
| Composite foreign keys | `(project_id, org_id)` references `projects(id, org_id)`, so a milestone or document can't pair one tenant's project with another tenant's org, even if a policy were wrong. | `milestones`, `documents` |
| CHECK constraints | Storage path must be `<org_id>/<document_id>`; MIME allow-list; 5 MB limit; text lengths. | `documents` and other tables |
| Storage policies | The `portal-documents` bucket is private. Read access requires a visible `documents` row for that exact path (the subquery runs under the caller's RLS). Only admins can upload or delete. The bucket also enforces size and MIME limits. | migration, "Storage" section |
| Server code | `requireMember()` / `requireAdmin()` re-verify the session with the Auth server (`getUser()`), Zod validates every input, bound Server Action ids are re-validated, and client-submitted org ids are overridden. | `src/lib/auth.ts`, `src/app/**/actions.ts` |
| Proxy | Refreshes sessions and redirects signed-out users. **Not** relied on for authorization. | `src/proxy.ts` |

## Privileged operations (and why there is no service-role key)

The deployed app **never** uses the Supabase service-role / secret key. Every query runs as the
signed-in user through the publishable key. These operations need elevated rights, and each is a
`SECURITY DEFINER` function with an explicit authorization check and `search_path = ''`:

| Function | Who can call it | Why it needs definer rights |
|---|---|---|
| `portal_private.is_admin()`, `my_org_id()` | used inside policies | read `profiles` without recursive RLS |
| `portal.create_invitation(org, email)` | admins (checked) | writes a token **hash**; returns the raw token once |
| `portal.get_invitation(token)` | anyone with a valid token | shows org name and email on the invite page |
| `portal.accept_invitation(token, name)` | signed-in user whose email matches | creates the client profile, tags the auth user with this app |
| `portal.set_onboarding_item_done(id, done)` | members of that org, or admins | lets clients change **only** the completion fields |
| `portal.reset_demo()` | demo admin accounts only (checked) | wipes and re-seeds sample data; restores demo passwords |
| trigger functions (`on_*_change`) | fired by writes | append to `activity_events`, which has no write grants |

The demo storage sync and the local seeding script also run **as the demo admin**, so storage RLS
applies to them too.

## Not leaking existence

- A hidden row and a missing row both return 0 rows from PostgREST.
- Pages call `notFound()` in both cases and return **HTTP 404** (see case study 2).
- RPCs raise the same `P0002` error for "not yours" and "doesn't exist".
- The download route returns an identical 404 body for every failure.
- Login and password reset return identical messages for unknown and known emails.

## Other measures

- Invitation tokens: 244 bits from the database CSPRNG, stored as SHA-256 hashes, single-use,
  bound to the invited email, and expiring after 7 days. Pending invitations are capped per org.
- File uploads: extension allow-list plus magic-byte verification, and a 5 MB cap enforced in the
  app, the bucket and a table constraint. Object keys contain no user text.
- Downloads: 60-second signed URLs issued per request after both RLS checks, sent with
  `Cache-Control: no-store`.
- Redirects: `?next=` accepts same-origin paths only (`src/lib/safe-redirect.ts`, unit tested).
- Logging: database errors are logged with their code only, never bodies, tokens or personal data.
- Headers: `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a permissions policy.
- Activity history and messages are append-only for every API role, admins included.

## Shared Supabase project

The deployed demo shares a Supabase project with the owner's other apps (an owner decision,
2026-11-08). Isolation measures:

- Everything lives in the `portal` and `portal_private` schemas and the `portal-documents`
  bucket. Nothing is created in `public`, and no existing object is altered.
- SQL that touches `auth.users` (reset/cleanup) filters on `raw_app_meta_data.app =
  'client-portal-mini'` **and** this app's fixed ids. The pgTAP suite asserts that an untagged
  user survives a reset.

**Accepted residual risks:**
- The auth user pool and auth settings are shared, so demo credentials are valid logins at the
  project level.
- Other apps' signup triggers may create rows for portal users.
- Quotas are shared.

See `../../PLAN.md` for the full risk table.

## Tests that prove it

- `supabase/tests/database/*.test.sql`: 66 pgTAP checks (reads, updates, inserts, deletes by id
  swap, grants, composite FKs, invitations, reset scope).
- `tests/integration/*.test.ts`: the same attacks over HTTP with real JWTs, plus storage.
- `tests/e2e/isolation.spec.ts`: the isolation-check page, URL tampering and admin-route 404s.

## Internal review (2026-11-08)

An independent read-only review found no cross-tenant path. It did find these issues, fixed in
 and tested in :
- Accepting an invitation could tag a pre-existing account from another app, which a demo reset
  would then delete.
- The demo credentials could be changed through the Auth API (now blocked by a trigger scoped to
  the four demo ids).
- Agency staff profiles were readable by any user of the shared project.
- Internal documents' names stayed in the client activity feed.

Accepted: the invite page's "account already exists" message reveals that an email is registered
in the shared project.

## Reporting

This is a portfolio demo. If you find a problem, please open a GitHub issue, without exploit
details for anything that affects other users of the demo.
