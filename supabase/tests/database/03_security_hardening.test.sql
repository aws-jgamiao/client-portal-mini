-- Regression tests for the 2026-11-08 security review findings.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select portal_private.seed_demo_data();

-- 1. An account that existed before the invitation (e.g. another app's user) is not tagged.
insert into auth.users (id, email, aud, role, raw_app_meta_data, email_confirmed_at, created_at)
values ('e0000000-0000-4000-8000-0000000000e1', 'existing@example.com', 'authenticated', 'authenticated', '{"provider":"email"}', now(), now() - interval '1 year');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.token', portal.create_invitation('a0000000-0000-4000-8000-00000000000a', 'existing@example.com'), true);
reset role;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select portal.accept_invitation(current_setting('test.token'), 'Existing Person') $$, 'an existing account can still join');
reset role;
select is((select raw_app_meta_data ->> 'app' from auth.users where id = 'e0000000-0000-4000-8000-0000000000e1'), null,
  'a pre-existing account is NOT tagged with this app');
select lives_ok($$ select portal_private.seed_demo_data() $$, 'reset runs');
select isnt_empty($$ select 1 from auth.users where id = 'e0000000-0000-4000-8000-0000000000e1' $$,
  'so a demo reset can never delete it');

-- 1b. Unconfirmed emails can't accept.
insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at)
values ('e0000000-0000-4000-8000-0000000000e2', 'unconfirmed@example.com', 'authenticated', 'authenticated', '{}', now() + interval '1 minute');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.token2', portal.create_invitation('a0000000-0000-4000-8000-00000000000a', 'unconfirmed@example.com'), true);
reset role;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select portal.accept_invitation(current_setting('test.token2'), 'U') $$, 'P0002', null,
  'an unconfirmed email cannot accept an invitation');
reset role;

-- 2. Demo credentials are protected; the reset can still restore them.
select throws_ok($$ update auth.users set encrypted_password = 'x' where id = '00000000-0000-4000-8000-0000000000ad' $$,
  '42501', null, 'demo admin password cannot be changed');
select throws_ok($$ update auth.users set email = 'mine@example.com' where id = 'a0000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'demo client email cannot be changed');
select lives_ok($$ update auth.users set last_sign_in_at = now() where id = '00000000-0000-4000-8000-0000000000ad' $$,
  'other auth updates (sign-in bookkeeping) still work');
select lives_ok($$ select portal_private.seed_demo_data() $$, 'reset still restores demo passwords');
select lives_ok($$ update auth.users set encrypted_password = 'x' where id = 'e0000000-0000-4000-8000-0000000000e1' $$,
  'non-demo accounts are unaffected');

-- 3. Admin profiles are hidden from users who don't belong to the portal.
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$ select 1 from portal.profiles $$, 'an outsider sees no profiles, not even agency staff');
reset role;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select isnt_empty($$ select 1 from portal.profiles where role = 'admin' $$, 'clients still see agency staff');
reset role;

-- 4. Making a document internal removes it from the client activity feed.
update portal.documents set visibility = 'internal' where id = 'a0000000-0000-4000-8000-000000000302';
select is_empty($$ select 1 from portal.activity_events where summary = 'Document "Sitemap v2.txt" shared' $$,
  'the "shared" activity is removed when a document becomes internal');

select * from finish();
rollback;
