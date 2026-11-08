-- =============================================================================
-- Demo data + reset.
--
-- Fixed UUIDs make the seed deterministic, so tests (and the isolation-check
-- page) can target Client B's records by id.
-- Auth users for these ids are created by supabase/seed.sql (local) or
-- scripts/sql/create-demo-users.sql (remote, run once after review).
--
-- Only accounts tagged raw_app_meta_data.app = 'client-portal-mini' are ever
-- modified or deleted here. In a shared Supabase project, that keeps every
-- other app's users out of reach.
-- =============================================================================

create function portal_private.demo_ids() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'admin',   '00000000-0000-4000-8000-0000000000ad',
    'clientA', 'a0000000-0000-4000-8000-0000000000a1',
    'clientA2','a0000000-0000-4000-8000-0000000000a2',
    'clientB', 'b0000000-0000-4000-8000-0000000000b1',
    'orgA',    'a0000000-0000-4000-8000-00000000000a',
    'orgB',    'b0000000-0000-4000-8000-00000000000b',
    'projectA1','a0000000-0000-4000-8000-000000000101',
    'projectA2','a0000000-0000-4000-8000-000000000102',
    'projectB1','b0000000-0000-4000-8000-000000000201',
    'docA1',   'a0000000-0000-4000-8000-000000000301',
    'docA2',   'a0000000-0000-4000-8000-000000000302',
    'docAInternal','a0000000-0000-4000-8000-000000000303',
    'docB1',   'b0000000-0000-4000-8000-000000000401'
  )
$$;

-- Activity logging is skipped while seeding; curated history is inserted instead.
create or replace function portal_private.log_activity(
  p_org uuid, p_project uuid, p_kind text, p_summary text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('portal.seeding', true) = 'on' then
    return;
  end if;
  insert into portal.activity_events (org_id, project_id, actor_id, kind, summary)
  values (p_org, p_project, portal_private.actor(), p_kind, p_summary);
end $$;

create function portal_private.seed_demo_data() returns void
language plpgsql security definer set search_path = '' as $$
declare
  ids jsonb := portal_private.demo_ids();
  v_admin uuid := (ids->>'admin')::uuid;
  v_a1 uuid := (ids->>'clientA')::uuid;
  v_a2 uuid := (ids->>'clientA2')::uuid;
  v_b1 uuid := (ids->>'clientB')::uuid;
  v_org_a uuid := (ids->>'orgA')::uuid;
  v_org_b uuid := (ids->>'orgB')::uuid;
  v_pa1 uuid := (ids->>'projectA1')::uuid;
  v_pa2 uuid := (ids->>'projectA2')::uuid;
  v_pb1 uuid := (ids->>'projectB1')::uuid;
  v_seed_users uuid[] := array[v_admin, v_a1, v_a2, v_b1];
  d date := current_date;
begin
  perform set_config('portal.seeding', 'on', true);

  -- 1. Wipe app data (cascades through every tenant table).
  delete from portal.profiles where role = 'client' or id <> all (v_seed_users);
  delete from portal.organizations;

  -- 2. Remove accounts that visitors created through invitations, and restore
  --    demo passwords (a visitor could change one with the public API key).
  delete from auth.users
   where raw_app_meta_data->>'app' = 'client-portal-mini'
     and id <> all (v_seed_users);
  update auth.users
     set encrypted_password = extensions.crypt('DemoPortal!2026', extensions.gen_salt('bf'))
   where raw_app_meta_data->>'app' = 'client-portal-mini'
     and id = any (v_seed_users);

  -- 3. Organizations and people.
  insert into portal.organizations (id, name, slug, created_at) values
    (v_org_a, 'Northwind Bakery', 'northwind-bakery', now() - interval '40 days'),
    (v_org_b, 'Harbour Physio',   'harbour-physio',   now() - interval '25 days');

  insert into portal.profiles (id, email, full_name, job_title, role, org_id, is_demo)
  select u.id, u.email, x.full_name, x.job_title, x.role::portal.user_role, x.org_id, true
  from (values
    (v_admin, 'Avery Collins', 'Account Manager',   'admin',  null::uuid),
    (v_a1,    'Priya Shah',    'Owner',             'client', v_org_a),
    (v_a2,    'Tom Becker',    'Operations Lead',   'client', v_org_a),
    (v_b1,    'Marcus Lee',    'Practice Manager',  'client', v_org_b)
  ) as x(id, full_name, job_title, role, org_id)
  join auth.users u on u.id = x.id
  on conflict (id) do update
    set full_name = excluded.full_name, job_title = excluded.job_title, phone = null,
        role = excluded.role, org_id = excluded.org_id, is_demo = true;

  -- 4. Projects and milestones.
  insert into portal.projects (id, org_id, name, description, status, start_date, due_date, created_by, created_at) values
    (v_pa1, v_org_a, 'Website redesign',
     'New brochure site with menu pages, catering enquiry form and Google Business profile clean-up.',
     'in_progress', d - 30, d + 21, v_admin, now() - interval '30 days'),
    (v_pa2, v_org_a, 'Online ordering launch',
     'Click-and-collect ordering for weekend pastry boxes, integrated with the existing POS.',
     'planning', d + 7, d + 60, v_admin, now() - interval '6 days'),
    (v_pb1, v_org_b, 'Booking system migration',
     'Move patient bookings from spreadsheets to an online booking tool, with SMS reminders.',
     'review', d - 20, d + 5, v_admin, now() - interval '20 days');

  insert into portal.milestones (project_id, org_id, title, due_date, completed_at, position) values
    (v_pa1, v_org_a, 'Discovery workshop',       d - 28, now() - interval '27 days', 1),
    (v_pa1, v_org_a, 'Sitemap and wireframes',   d - 14, now() - interval '12 days', 2),
    (v_pa1, v_org_a, 'Visual design sign-off',   d + 3,  null, 3),
    (v_pa1, v_org_a, 'Content entry and launch', d + 21, null, 4),
    (v_pa2, v_org_a, 'Menu and pricing import',  d + 14, null, 1),
    (v_pa2, v_org_a, 'Payment provider set-up',  d + 30, null, 2),
    (v_pb1, v_org_b, 'Data export from spreadsheets', d - 15, now() - interval '14 days', 1),
    (v_pb1, v_org_b, 'Staff training session',   d - 2,  now() - interval '2 days', 2),
    (v_pb1, v_org_b, 'Go-live',                  d + 5,  null, 3);

  -- 5. Onboarding.
  insert into portal.onboarding_items (org_id, title, description, due_date, required, position, completed_at, completed_by) values
    (v_org_a, 'Sign the services agreement', 'Review and sign the agreement sent by email.', d - 35, true, 1, now() - interval '36 days', v_a1),
    (v_org_a, 'Share brand assets',          'Upload your logo, fonts and any photography you want to reuse.', d - 20, true, 2, now() - interval '22 days', v_a2),
    (v_org_a, 'Grant domain registrar access','Add our team as a technical contact so we can update DNS at launch.', d + 2, true, 3, null, null),
    (v_org_a, 'Confirm opening hours',       'Check the hours we have listed for each store.', d + 10, false, 4, null, null),
    (v_org_b, 'Sign the services agreement', 'Review and sign the agreement sent by email.', d - 22, true, 1, now() - interval '23 days', v_b1),
    (v_org_b, 'Export current bookings',     'Send us the last 3 months of bookings as CSV.', d - 16, true, 2, now() - interval '16 days', v_b1),
    (v_org_b, 'Nominate SMS sender name',    'Choose the name patients will see on reminder texts.', d - 1, true, 3, null, null);

  -- 6. Documents (rows only; scripts/seed-storage.mjs uploads the matching objects).
  insert into portal.documents (id, org_id, project_id, storage_path, file_name, mime_type, size_bytes, visibility, uploaded_by, created_at) values
    ((ids->>'docA1')::uuid, v_org_a, v_pa1, (ids->>'orgA') || '/' || (ids->>'docA1'),
     'Northwind - project brief.pdf', 'application/pdf', 1180, 'client', v_admin, now() - interval '29 days'),
    ((ids->>'docA2')::uuid, v_org_a, v_pa1, (ids->>'orgA') || '/' || (ids->>'docA2'),
     'Sitemap v2.txt', 'text/plain', 412, 'client', v_admin, now() - interval '12 days'),
    ((ids->>'docAInternal')::uuid, v_org_a, v_pa1, (ids->>'orgA') || '/' || (ids->>'docAInternal'),
     'Internal estimate.csv', 'text/csv', 220, 'internal', v_admin, now() - interval '28 days'),
    ((ids->>'docB1')::uuid, v_org_b, v_pb1, (ids->>'orgB') || '/' || (ids->>'docB1'),
     'Harbour Physio - booking rules.pdf', 'application/pdf', 1176, 'client', v_admin, now() - interval '18 days');

  -- 7. Messages.
  insert into portal.messages (org_id, sender_id, body, created_at) values
    (v_org_a, v_a1,    'Hi Avery, we have new photos of the sourdough range. Should I upload them here?', now() - interval '3 days'),
    (v_org_a, v_admin, 'Yes please! Anything over 2000px wide is perfect. I will add them to the gallery mock-up.', now() - interval '3 days' + interval '2 hours'),
    (v_org_a, v_a2,    'Quick one: can the catering form send enquiries to orders@ as well as Priya?', now() - interval '1 day'),
    (v_org_b, v_b1,    'Staff training went well. Two physios asked for a cheat sheet on rescheduling.', now() - interval '2 days'),
    (v_org_b, v_admin, 'Great to hear. I will put a one-page guide in your documents this week.', now() - interval '1 day');

  -- 8. Curated activity history.
  insert into portal.activity_events (org_id, project_id, actor_id, kind, summary, created_at) values
    (v_org_a, v_pa1, v_admin, 'project.created',        'Project "Website redesign" created', now() - interval '30 days'),
    (v_org_a, v_pa1, v_admin, 'milestone.completed',    'Milestone "Discovery workshop" completed', now() - interval '27 days'),
    (v_org_a, null,  v_a2,    'onboarding.completed',   'Onboarding step "Share brand assets" completed', now() - interval '22 days'),
    (v_org_a, v_pa1, v_admin, 'milestone.completed',    'Milestone "Sitemap and wireframes" completed', now() - interval '12 days'),
    (v_org_a, v_pa1, v_admin, 'document.uploaded',      'Document "Sitemap v2.txt" shared', now() - interval '12 days'),
    (v_org_a, v_pa1, v_admin, 'project.status_changed', '"Website redesign" moved from planning to in progress', now() - interval '11 days'),
    (v_org_a, v_pa2, v_admin, 'project.created',        'Project "Online ordering launch" created', now() - interval '6 days'),
    (v_org_b, v_pb1, v_admin, 'project.created',        'Project "Booking system migration" created', now() - interval '20 days'),
    (v_org_b, v_pb1, v_admin, 'milestone.completed',    'Milestone "Staff training session" completed', now() - interval '2 days'),
    (v_org_b, v_pb1, v_admin, 'project.status_changed', '"Booking system migration" moved from in progress to review', now() - interval '1 day');

  perform set_config('portal.seeding', 'off', true);
end $$;

-- Demo admins can restore the sample data from the UI.
create function portal.reset_demo() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from portal.profiles
    where id = auth.uid() and role = 'admin' and is_demo
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform portal_private.seed_demo_data();
end $$;

revoke all on function portal_private.demo_ids()       from public, anon, authenticated;
revoke all on function portal_private.seed_demo_data() from public, anon, authenticated;
revoke all on function portal_private.log_activity(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function portal.reset_demo()             from public, anon;
grant execute on function portal.reset_demo() to authenticated;
