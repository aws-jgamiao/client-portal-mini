-- Creates the Client Portal Mini demo accounts and sample data.
--
-- Safe for a shared Supabase project:
--   * inserts only the four fixed ids below, with ON CONFLICT DO NOTHING
--   * tags each account raw_app_meta_data.app = 'client-portal-mini'
--   * all demo emails are on the reserved example.com domain
-- Password for every demo account: DemoPortal!2026 (published on the landing page).
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-8000-0000000000ad'::uuid, 'portal-admin@example.com'),
      ('a0000000-0000-4000-8000-0000000000a1'::uuid, 'portal-client-a@example.com'),
      ('a0000000-0000-4000-8000-0000000000a2'::uuid, 'portal-client-a2@example.com'),
      ('b0000000-0000-4000-8000-0000000000b1'::uuid, 'portal-client-b@example.com')
    ) as t(id, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('DemoPortal!2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"],"app":"client-portal-mini"}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict do nothing;
  end loop;
end $$;

select portal_private.seed_demo_data();
