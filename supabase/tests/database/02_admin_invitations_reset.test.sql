-- Admin capabilities, relational integrity, invitation flow, demo reset.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set admin      '''00000000-0000-4000-8000-0000000000ad'''
\set org_a      '''a0000000-0000-4000-8000-00000000000a'''
\set org_b      '''b0000000-0000-4000-8000-00000000000b'''
\set project_a1 '''a0000000-0000-4000-8000-000000000101'''

-- Two outsiders: an invitee and an account belonging to some other app in
-- the shared Supabase project (untagged). Neither has a portal profile.
insert into auth.users (id, email, aud, role, raw_app_meta_data, email_confirmed_at, created_at) values
  ('c0000000-0000-4000-8000-0000000000c1', 'new.person@example.com', 'authenticated', 'authenticated', '{}', now(), now()),
  ('d0000000-0000-4000-8000-0000000000d1', 'other-app-user@example.com', 'authenticated', 'authenticated', '{"provider":"email"}', now(), now() - interval '1 year');

-- ---------------------------------------------------------------- Outsider
select set_config('request.jwt.claims', json_build_object('sub', 'd0000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
set local role authenticated;
select is_empty($$ select 1 from portal.organizations $$, 'a signed-in user without a portal profile sees no organizations');
select is_empty($$ select 1 from portal.projects $$, '... and no projects');
select is_empty($$ select 1 from portal.documents $$, '... and no documents');
select throws_ok($$ insert into portal.messages (org_id, body) values ('a0000000-0000-4000-8000-00000000000a', 'hi') $$,
  '42501', null, '... and cannot post messages');
reset role;

-- ---------------------------------------------------------------- Admin
select set_config('request.jwt.claims', json_build_object('sub', :admin, 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq($$ select count(*)::int from portal.organizations $$, array[2], 'admin sees every organization');
select results_eq($$ select count(*)::int from portal.documents $$, array[4], 'admin sees internal documents too');
select lives_ok(format('insert into portal.projects (org_id, name) values (%L, %L)', :org_b, 'Admin-created project'),
  'admin can create a project for any organization');
select throws_ok(format('insert into portal.milestones (project_id, org_id, title) values (%L, %L, %L)', :project_a1, :org_b, 'Cross-tenant'),
  '23503', null, 'composite FK: a milestone cannot pair client A''s project with client B''s org');
select throws_ok(format($q$insert into portal.documents (org_id, storage_path, file_name, mime_type, size_bytes)
                          values (%L, %L, 'x.pdf', 'application/pdf', 10)$q$, :org_a, 'b0000000-0000-4000-8000-00000000000b/escape'),
  '23514', null, 'a document path must live inside its own organization''s folder');
select throws_ok(format($q$insert into portal.documents (org_id, storage_path, file_name, mime_type, size_bytes)
                          values (%L, %L, 'run.exe', 'application/x-msdownload', 10)$q$, :org_a, 'irrelevant'),
  '23514', null, 'disallowed MIME types are rejected');
select throws_ok($$ update portal.activity_events set summary = 'rewritten' $$, '42501', null, 'even admins cannot rewrite activity history');
select throws_ok($$ delete from portal.messages $$, '42501', null, 'messages are append-only, even for admins');
select throws_ok(format('update portal.projects set org_id = %L where id = %L', :org_b, :project_a1),
  '42501', null, 'a project cannot be moved to another organization');

-- Invitation
select ok(length(portal.create_invitation(:org_a, 'New.Person@example.com')) = 64, 'admin receives a 64-character invitation token');
select results_eq($$ select count(*)::int from portal.invitations where email = 'new.person@example.com' $$, array[1],
  'invitation email is normalised to lower case');
reset role;
select ok((select token_hash is not null and octet_length(token_hash) = 32 from portal.invitations limit 1),
  'only a SHA-256 hash of each token is stored');

-- Re-issue a known token for the invitee so the test can redeem it.
set local role authenticated;
select set_config('test.invitee_token', portal.create_invitation(:org_a, 'someone-else@example.com'), true);
reset role;

-- The invitee is the wrong account for that token -> generic error
select set_config('request.jwt.claims', json_build_object('sub', 'c0000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select portal.accept_invitation(current_setting('test.invitee_token'), 'New Person') $$,
  'P0002', 'invitation invalid or expired', 'a token cannot be redeemed by a different email address');
select throws_ok($$ select portal.accept_invitation('garbage', 'New Person') $$,
  'P0002', 'invitation invalid or expired', 'an unknown token gives the same generic error');
reset role;

-- Correct account
select set_config('request.jwt.claims', json_build_object('sub', :admin, 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.good_token', portal.create_invitation(:org_a, 'new.person2@example.com'), true);
reset role;
update auth.users set email = 'new.person2@example.com' where id = 'c0000000-0000-4000-8000-0000000000c1';

select set_config('request.jwt.claims', json_build_object('sub', 'c0000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(portal.accept_invitation(current_setting('test.good_token'), 'New Person'), :org_a::uuid,
  'the invited account joins client A');
select results_eq($$ select count(*)::int from portal.projects $$, array[2], 'the new member now sees client A''s projects');
select throws_ok($$ select portal.accept_invitation(current_setting('test.good_token'), 'Again') $$,
  'P0002', null, 'an invitation can only be used once');
reset role;
select is((select raw_app_meta_data->>'app' from auth.users where id = 'c0000000-0000-4000-8000-0000000000c1'),
  'client-portal-mini', 'accepted accounts are tagged with this app');

-- ---------------------------------------------------------------- Demo reset
select set_config('request.jwt.claims', json_build_object('sub', :admin, 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ select portal.reset_demo() $$, 'the demo admin can reset sample data');
reset role;
select is_empty($$ select 1 from auth.users where id = 'c0000000-0000-4000-8000-0000000000c1' $$,
  'reset removes accounts created by demo visitors');
select isnt_empty($$ select 1 from auth.users where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  'reset never touches accounts from other apps in the shared project');
select results_eq($$ select count(*)::int from portal.projects $$, array[3], 'reset restores the three sample projects');
select is_empty($$ select 1 from portal.invitations $$, 'reset clears invitations');

select * from finish();
rollback;
