# Raw notes (2026-11-08): reset_demo fails over HTTP

- Symptom: integration tests call `rpc('reset_demo')` as the demo admin over PostgREST and get
  `DELETE requires a WHERE clause`.
- The pgTAP suite (02_admin_invitations_reset.test.sql) calls the same function and PASSES.
- Difference: pgTAP connects as `postgres` straight to Postgres; the integration test goes through
  PostgREST (`authenticator` role), where Supabase preloads the `pg-safeupdate` extension.
- `pg-safeupdate` rejects UPDATE/DELETE statements without a WHERE clause, including those inside
  SECURITY DEFINER functions, because it hooks the executor for the whole session.
- Offending statement: `delete from portal.organizations;` in portal_private.seed_demo_data().
