-- Tenant isolation: Client A must never read or change Client B's data,
-- even when it targets B's records by id. Runs against the seeded demo data.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Fixed ids from portal_private.demo_ids()
\set org_a      '''a0000000-0000-4000-8000-00000000000a'''
\set org_b      '''b0000000-0000-4000-8000-00000000000b'''
\set client_a   '''a0000000-0000-4000-8000-0000000000a1'''
\set client_a2  '''a0000000-0000-4000-8000-0000000000a2'''
\set project_a1 '''a0000000-0000-4000-8000-000000000101'''
\set project_b1 '''b0000000-0000-4000-8000-000000000201'''
\set doc_b1     '''b0000000-0000-4000-8000-000000000401'''

-- Storage objects for one A document and one B document (normally uploaded by the seed script).
insert into storage.objects (bucket_id, name) values
  ('portal-documents', 'a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000301'),
  ('portal-documents', 'b0000000-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-000000000401')
on conflict do nothing;

-- ---------------------------------------------------------------- Client A
select set_config('request.jwt.claims', json_build_object('sub', :client_a, 'role', 'authenticated')::text, true);
set local role authenticated;

-- Reads
select results_eq($$ select id from portal.organizations $$, array[:org_a::uuid],
  'client A sees only its own organization');
select is_empty(format('select 1 from portal.projects where id = %L', :project_b1),
  'client A cannot read client B''s project by id');
select results_eq($$ select count(*)::int from portal.projects $$, array[2],
  'client A sees exactly its two projects');
select is_empty(format('select 1 from portal.milestones where org_id = %L', :org_b),
  'client A cannot read client B''s milestones');
select is_empty(format('select 1 from portal.documents where id = %L', :doc_b1),
  'client A cannot read client B''s document row');
select results_eq($$ select count(*)::int from portal.documents $$, array[2],
  'client A sees its 2 shared documents but not the internal one');
select is_empty(format('select 1 from portal.messages where org_id = %L', :org_b),
  'client A cannot read client B''s messages');
select is_empty(format('select 1 from portal.activity_events where org_id = %L', :org_b),
  'client A cannot read client B''s activity');
select is_empty(format('select 1 from portal.onboarding_items where org_id = %L', :org_b),
  'client A cannot read client B''s onboarding');
select is_empty(format('select 1 from portal.profiles where org_id = %L', :org_b),
  'client A cannot read client B''s people');
select is_empty($$ select 1 from portal.invitations $$, 'clients cannot read invitations');
select is_empty($$ select 1 from storage.objects where name like 'b0000000-0000-4000-8000-00000000000b/%' $$,
  'client A cannot read client B''s storage object');
select isnt_empty($$ select 1 from storage.objects where name like 'a0000000-0000-4000-8000-00000000000a/%' $$,
  'client A can read its own shared storage object');

-- Updates and deletes on B's records affect zero rows (indistinguishable from "not found")
select results_eq(format('with u as (update portal.projects set name = %L where id = %L returning 1) select count(*)::int from u', 'Hacked', :project_b1),
  array[0], 'client A cannot update client B''s project');
select results_eq(format('with u as (delete from portal.projects where id = %L returning 1) select count(*)::int from u', :project_b1),
  array[0], 'client A cannot delete client B''s project');
select results_eq(format('with u as (delete from portal.documents where id = %L returning 1) select count(*)::int from u', :doc_b1),
  array[0], 'client A cannot delete client B''s document');
select results_eq(format('with u as (update portal.projects set status = %L where id = %L returning 1) select count(*)::int from u', 'completed', :project_a1),
  array[0], 'clients cannot change project status, even in their own org');

-- Inserts into B's org are rejected outright
select throws_ok(format('insert into portal.messages (org_id, body) values (%L, %L)', :org_b, 'hello B'),
  '42501', null, 'client A cannot post a message into client B''s thread');
select throws_ok(format('insert into portal.projects (org_id, name) values (%L, %L)', :org_b, 'Injected'),
  '42501', null, 'client A cannot create a project in client B''s org');
select throws_ok(format('insert into portal.projects (org_id, name) values (%L, %L)', :org_a, 'Own project'),
  '42501', null, 'clients cannot create projects at all');
select throws_ok(format('insert into portal.messages (org_id, body, sender_id) values (%L, %L, %L)', :org_a, 'spoof', :client_a2),
  '42501', null, 'clients cannot choose the sender of a message');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('portal-documents', 'b0000000-0000-4000-8000-00000000000b/x') $$,
  '42501', null, 'client A cannot upload into client B''s folder');
select throws_ok($$ insert into portal.activity_events (org_id, kind, summary) values ('a0000000-0000-4000-8000-00000000000a', 'x', 'x') $$,
  '42501', null, 'activity history cannot be written directly');

-- Allowed actions still work
select lives_ok(format('insert into portal.messages (org_id, body) values (%L, %L)', :org_a, 'Thanks!'),
  'client A can post in its own thread');
select results_eq($$ select sender_id from portal.messages where body = 'Thanks!' $$,
  array[:client_a::uuid], 'message sender is the signed-in user');

-- Profiles: own fields only
select results_eq(format('with u as (update portal.profiles set full_name = %L where id = %L returning 1) select count(*)::int from u', 'Priya S.', :client_a),
  array[1], 'client can update their own name');
select results_eq(format('with u as (update portal.profiles set full_name = %L where id = %L returning 1) select count(*)::int from u', 'Renamed', :client_a2),
  array[0], 'client cannot update a colleague''s profile');
select throws_ok(format('update portal.profiles set role = %L where id = %L', 'admin', :client_a),
  '42501', null, 'client cannot promote themselves to admin');
select throws_ok(format('update portal.profiles set org_id = %L where id = %L', :org_b, :client_a),
  '42501', null, 'client cannot move themselves into another organization');

-- RPCs
select throws_ok($$ select portal.set_onboarding_item_done((select id from portal.onboarding_items limit 0), true) $$,
  'P0002', null, 'unknown onboarding item is "not found"');
reset role;
select set_config('test.b_item', (select id::text from portal.onboarding_items where org_id = :org_b and completed_at is null limit 1), true);
select set_config('test.a_item', (select id::text from portal.onboarding_items where org_id = :org_a and completed_at is null order by position limit 1), true);
set local role authenticated;
select throws_ok($$ select portal.set_onboarding_item_done(current_setting('test.b_item')::uuid, true) $$,
  'P0002', 'not found', 'client B''s onboarding item looks exactly like a missing one');
select lives_ok($$ select portal.set_onboarding_item_done(current_setting('test.a_item')::uuid, true) $$,
  'client A can complete its own onboarding step');
select throws_ok($$ select portal.create_invitation('a0000000-0000-4000-8000-00000000000a', 'x@example.com') $$,
  '42501', null, 'clients cannot create invitations');
select throws_ok($$ select portal.reset_demo() $$, '42501', null, 'clients cannot reset demo data');

reset role;
select isnt(
  (select completed_by from portal.onboarding_items where id = current_setting('test.a_item')::uuid), null,
  'completion is attributed to the client');
select is(
  (select name from portal.projects where id = :project_b1), 'Booking system migration',
  'client B''s project is unchanged after the attempts');

-- ---------------------------------------------------------------- Anonymous
set local role anon;
select throws_ok($$ select 1 from portal.projects $$, '42501', null, 'anonymous users have no table access');
select is_empty($$ select * from portal.get_invitation('not-a-real-token') $$, 'unknown invitation token reveals nothing');
reset role;

select is_empty($$ select 1 from information_schema.role_table_grants
                   where grantee in ('anon', 'PUBLIC') and table_schema in ('portal', 'portal_private') $$,
  'anon and PUBLIC hold no table privileges in portal schemas');

select * from finish();
rollback;
