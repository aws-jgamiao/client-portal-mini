# Architecture

```
Browser ── HTTPS ──> Next.js on Vercel (App Router)
                      ├─ proxy.ts             refresh session cookie; redirect if signed out
                      ├─ Server Components    read data (await createClient() → user JWT)
                      ├─ Server Actions       mutate data (Zod → requireRole → supabase-js)
                      └─ Route handlers       /auth/confirm, /documents/[id]/download
                                │  publishable key + user's access token
                                ▼
                      Supabase
                      ├─ PostgREST  → Postgres: schema `portal` (RLS on every table)
                      │                         schema `portal_private` (helpers; not exposed)
                      ├─ Auth (GoTrue)  email/password, PKCE recovery links
                      └─ Storage        private bucket `portal-documents`
```

## Key decisions

| Decision | Why |
|---|---|
| RLS as the primary authorization layer | Authorization holds even if a server code path forgets a check, or someone calls the API directly with their token. |
| No service-role key in the app | Removes the most dangerous secret entirely. Privileged steps are narrow `SECURITY DEFINER` functions with their own checks (see SECURITY.md). |
| Server Actions + `useActionState` for forms | One typed path per mutation, with progressive enhancement. Input is preserved on validation errors. |
| Composite `(id, org_id)` foreign keys | Tenant integrity is enforced structurally, not only by policy. |
| Activity written by triggers | History can't be forged or skipped by app code, and has no write grants. |
| Invitations instead of admin-created users | Creating auth users would need the service role. Hashed, single-use tokens plus an RPC avoid it. |
| Cache Components off | Per-tenant data must never be shared across requests (ADR 0001). |
| No UI component library | A small set of accessible primitives (`src/components/ui`) keeps the bundle and the dependency surface small. |

## Data model

```
organizations 1─* profiles (role admin|client; client ⇒ org_id)
organizations 1─* projects 1─* milestones      (FK (project_id, org_id))
organizations 1─* onboarding_items
organizations 1─* documents *─0..1 projects    (FK (project_id, org_id); path = org/doc)
organizations 1─* messages
organizations 1─* invitations                  (token_hash only)
organizations 1─* activity_events              (trigger-written, append-only)
```

## Source layout

```
src/
  proxy.ts                   session refresh + redirect
  lib/
    supabase/server.ts       request-scoped client (RLS applies)
    auth.ts                  data-access layer: getSession / requireMember / requireAdmin
    validation/              Zod schemas, file signature checks
    action-state.ts          typed action results + safe DB error mapping
    demo-storage.ts          storage sync used by demo reset and the seeding script
  app/
    (app)/…                  authenticated pages; each feature has page.tsx + actions.ts
    auth/                    login, reset, invite actions; /auth/confirm route
supabase/
  migrations/                schema, RLS, storage, RPCs, demo seed
  tests/database/            pgTAP policy tests
tests/
  integration/               supabase-js over HTTP with real sessions
  e2e/                       Playwright (desktop + mobile, axe accessibility)
```

## Routes

| Route | Who | Purpose |
|---|---|---|
| `/` | public | Demo introduction and one-click demo sign-in |
| `/login`, `/forgot-password`, `/reset-password`, `/invite/[token]` | public | Authentication |
| `/dashboard` | all | Role-aware overview |
| `/projects`, `/projects/[id]` | all (admin edits) | Projects, milestones, history |
| `/projects/new` | admin | Create project |
| `/onboarding` | all (admin configures) | Checklist |
| `/documents` | all (admin uploads) | Library; `/documents/[id]/download` issues signed URLs |
| `/messages` | all | One thread per organization |
| `/clients`, `/clients/[id]` | admin | Organizations, members, invitations |
| `/activity` | admin | Cross-client history (keyset pagination) |
| `/profile` | all | Own details and password |
| `/isolation-check` | clients | Live cross-tenant attempts |
