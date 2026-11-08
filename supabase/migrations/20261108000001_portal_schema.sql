-- =============================================================================
-- Client Portal Mini: schema, constraints, RLS, storage policies, RPCs.
--
-- Isolation rules (this project shares a Supabase instance with other apps):
--   * Everything lives in the `portal` (exposed) and `portal_private`
--     (never exposed) schemas. Nothing is created in `public`.
--   * Storage policies are scoped to the `portal-documents` bucket and are
--     prefixed `portal_`.
--   * The only statements that touch `auth.users` filter on this app's tag
--     (raw_app_meta_data.app = 'client-portal-mini').
--
-- Authorization model
--   admin  : agency staff, full access to every organization.
--   client : belongs to exactly one organization and only ever sees it.
-- RLS is the primary control; server code adds role checks and validation.
-- =============================================================================

create schema portal;
create schema portal_private;

comment on schema portal is 'Client Portal Mini: API-exposed tables (RLS on every table).';
comment on schema portal_private is 'Client Portal Mini: helpers and trigger functions. Never exposed through the Data API.';

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type portal.user_role      as enum ('admin', 'client');
create type portal.project_status as enum ('planning', 'in_progress', 'review', 'completed', 'on_hold');
create type portal.doc_visibility as enum ('client', 'internal');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table portal.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  slug        text not null unique
              check (char_length(slug) <= 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at  timestamptz not null default now()
);

create table portal.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null check (char_length(email) <= 254),
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  job_title   text check (job_title is null or char_length(job_title) <= 120),
  phone       text check (phone is null or phone ~ '^[0-9+() .-]{6,30}$'),
  role        portal.user_role not null,
  org_id      uuid references portal.organizations (id) on delete restrict,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  -- A client always belongs to one organization; an admin never does.
  constraint profiles_role_org check ((role = 'client') = (org_id is not null))
);
create index profiles_org_id_idx on portal.profiles (org_id);

create table portal.invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references portal.organizations (id) on delete cascade,
  email        text not null
               check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  token_hash   bytea not null unique,           -- sha256 of the token; the token itself is never stored
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null,
  created_by   uuid references portal.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index invitations_one_pending_per_email
  on portal.invitations (org_id, lower(email)) where accepted_at is null;

create table portal.projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references portal.organizations (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 120),
  description  text not null default '' check (char_length(description) <= 4000),
  status       portal.project_status not null default 'planning',
  start_date   date,
  due_date     date,
  created_by   uuid references portal.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint projects_dates check (due_date is null or start_date is null or due_date >= start_date),
  -- Target for composite foreign keys: children must share the project's org.
  constraint projects_id_org_key unique (id, org_id)
);
create index projects_org_status_idx on portal.projects (org_id, status);

create table portal.milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null,
  org_id        uuid not null,
  title         text not null check (char_length(btrim(title)) between 1 and 160),
  due_date      date,
  completed_at  timestamptz,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint milestones_project_fk foreign key (project_id, org_id)
    references portal.projects (id, org_id) on delete cascade
);
create index milestones_project_idx on portal.milestones (project_id, position);
create index milestones_org_idx on portal.milestones (org_id);

create table portal.onboarding_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references portal.organizations (id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 1 and 160),
  description   text not null default '' check (char_length(description) <= 2000),
  due_date      date,
  required      boolean not null default true,
  position      integer not null default 0,
  completed_at  timestamptz,
  completed_by  uuid references portal.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint onboarding_completed_by check (completed_by is null or completed_at is not null)
);
create index onboarding_org_idx on portal.onboarding_items (org_id, position);

create table portal.documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references portal.organizations (id) on delete cascade,
  project_id    uuid,
  storage_path  text not null unique,
  file_name     text not null check (char_length(file_name) between 1 and 200 and file_name !~ '[/\\]'),
  mime_type     text not null check (mime_type in (
                  'application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  visibility    portal.doc_visibility not null default 'client',
  uploaded_by   uuid references portal.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  -- The object key contains no user-controlled text, so a path can never
  -- escape the organization's folder.
  constraint documents_path_in_org check (storage_path = org_id::text || '/' || id::text),
  constraint documents_project_fk foreign key (project_id, org_id)
    references portal.projects (id, org_id) on delete set null (project_id)
);
create index documents_org_idx on portal.documents (org_id, created_at desc);
create index documents_project_idx on portal.documents (project_id);

create table portal.messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references portal.organizations (id) on delete cascade,
  sender_id   uuid default auth.uid() references portal.profiles (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index messages_org_created_idx on portal.messages (org_id, created_at desc);

create table portal.activity_events (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references portal.organizations (id) on delete cascade,
  project_id  uuid references portal.projects (id) on delete set null,
  actor_id    uuid references portal.profiles (id) on delete set null,
  kind        text not null,
  summary     text not null,
  created_at  timestamptz not null default now()
);
create index activity_org_created_idx on portal.activity_events (org_id, created_at desc);
create index activity_project_created_idx on portal.activity_events (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- SECURITY DEFINER so policies on `profiles` can call them without recursion.
-- STABLE + wrapped in (select ...) in policies => evaluated once per statement.
-- ---------------------------------------------------------------------------
create function portal_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.role = 'admin' from portal.profiles p where p.id = (select auth.uid())),
    false)
$$;

create function portal_private.my_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from portal.profiles p where p.id = (select auth.uid())
$$;

-- Actor for activity rows: the signed-in user, or the seed actor during seeding.
create function portal_private.actor() returns uuid
language sql stable set search_path = '' as $$
  select coalesce((select auth.uid()), nullif(current_setting('portal.seed_actor', true), '')::uuid)
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table portal.organizations    enable row level security;
alter table portal.profiles         enable row level security;
alter table portal.invitations      enable row level security;
alter table portal.projects         enable row level security;
alter table portal.milestones       enable row level security;
alter table portal.onboarding_items enable row level security;
alter table portal.documents        enable row level security;
alter table portal.messages         enable row level security;
alter table portal.activity_events  enable row level security;

-- organizations
create policy org_select on portal.organizations for select to authenticated
  using ((select portal_private.is_admin()) or id = (select portal_private.my_org_id()));
create policy org_insert on portal.organizations for insert to authenticated
  with check ((select portal_private.is_admin()));
create policy org_update on portal.organizations for update to authenticated
  using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));

-- profiles: see yourself, your organization's members, agency staff (so
-- clients know who they are talking to), or everything (admin).
create policy profile_select on portal.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or role = 'admin'
    or (select portal_private.is_admin())
    or (org_id is not null and org_id = (select portal_private.my_org_id()))
  );
-- Column grants (below) limit updates to full_name / job_title / phone.
create policy profile_update on portal.profiles for update to authenticated
  using (id = (select auth.uid()) or (select portal_private.is_admin()))
  with check (id = (select auth.uid()) or (select portal_private.is_admin()));
-- Admins remove client members (the auth user stays but loses all access).
create policy profile_delete on portal.profiles for delete to authenticated
  using ((select portal_private.is_admin()) and role = 'client');

-- invitations: admin only (acceptance goes through accept_invitation()).
create policy invitation_admin_select on portal.invitations for select to authenticated
  using ((select portal_private.is_admin()));
create policy invitation_admin_delete on portal.invitations for delete to authenticated
  using ((select portal_private.is_admin()));

-- tenant tables: members read their org; admins read and write everything.
create policy project_select on portal.projects for select to authenticated
  using ((select portal_private.is_admin()) or org_id = (select portal_private.my_org_id()));
create policy project_insert on portal.projects for insert to authenticated
  with check ((select portal_private.is_admin()));
create policy project_update on portal.projects for update to authenticated
  using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy project_delete on portal.projects for delete to authenticated
  using ((select portal_private.is_admin()));

create policy milestone_select on portal.milestones for select to authenticated
  using ((select portal_private.is_admin()) or org_id = (select portal_private.my_org_id()));
create policy milestone_insert on portal.milestones for insert to authenticated
  with check ((select portal_private.is_admin()));
create policy milestone_update on portal.milestones for update to authenticated
  using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy milestone_delete on portal.milestones for delete to authenticated
  using ((select portal_private.is_admin()));

create policy onboarding_select on portal.onboarding_items for select to authenticated
  using ((select portal_private.is_admin()) or org_id = (select portal_private.my_org_id()));
create policy onboarding_insert on portal.onboarding_items for insert to authenticated
  with check ((select portal_private.is_admin()));
create policy onboarding_update on portal.onboarding_items for update to authenticated
  using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy onboarding_delete on portal.onboarding_items for delete to authenticated
  using ((select portal_private.is_admin()));

-- documents: clients only see documents shared with them (visibility = client).
create policy document_select on portal.documents for select to authenticated
  using (
    (select portal_private.is_admin())
    or (org_id = (select portal_private.my_org_id()) and visibility = 'client')
  );
create policy document_insert on portal.documents for insert to authenticated
  with check ((select portal_private.is_admin()));
create policy document_update on portal.documents for update to authenticated
  using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy document_delete on portal.documents for delete to authenticated
  using ((select portal_private.is_admin()));

-- messages: one thread per organization. Append-only (no update/delete).
create policy message_select on portal.messages for select to authenticated
  using ((select portal_private.is_admin()) or org_id = (select portal_private.my_org_id()));
create policy message_insert on portal.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and ((select portal_private.is_admin()) or org_id = (select portal_private.my_org_id()))
  );

-- activity: readable per org, written only by triggers (no write grants at all).
create policy activity_select on portal.activity_events for select to authenticated
  using ((select portal_private.is_admin()) or org_id = (select portal_private.my_org_id()));

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, activity history, invitation cap
-- ---------------------------------------------------------------------------
create function portal_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger projects_touch before update on portal.projects
  for each row execute function portal_private.touch_updated_at();

create function portal_private.log_activity(
  p_org uuid, p_project uuid, p_kind text, p_summary text
) returns void
language sql security definer set search_path = '' as $$
  insert into portal.activity_events (org_id, project_id, actor_id, kind, summary)
  values (p_org, p_project, portal_private.actor(), p_kind, p_summary)
$$;

create function portal_private.on_project_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform portal_private.log_activity(new.org_id, new.id, 'project.created',
      format('Project "%s" created', new.name));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform portal_private.log_activity(new.org_id, new.id, 'project.status_changed',
      format('"%s" moved from %s to %s', new.name,
             replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')));
  end if;
  return null;
end $$;

create trigger projects_activity after insert or update of status on portal.projects
  for each row execute function portal_private.on_project_change();

create function portal_private.on_milestone_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    perform portal_private.log_activity(new.org_id, new.project_id, 'milestone.completed',
      format('Milestone "%s" completed', new.title));
  end if;
  return null;
end $$;

create trigger milestones_activity after update of completed_at on portal.milestones
  for each row execute function portal_private.on_milestone_change();

create function portal_private.on_onboarding_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    perform portal_private.log_activity(new.org_id, null, 'onboarding.completed',
      format('Onboarding step "%s" completed', new.title));
  elsif new.completed_at is null and old.completed_at is not null then
    perform portal_private.log_activity(new.org_id, null, 'onboarding.reopened',
      format('Onboarding step "%s" reopened', new.title));
  end if;
  return null;
end $$;

create trigger onboarding_activity after update of completed_at on portal.onboarding_items
  for each row execute function portal_private.on_onboarding_change();

-- Internal documents must not leak through the client-visible activity feed,
-- so only client-visible uploads are logged.
create function portal_private.on_document_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility = 'client' then
    perform portal_private.log_activity(new.org_id, new.project_id, 'document.uploaded',
      format('Document "%s" shared', new.file_name));
  end if;
  return null;
end $$;

create trigger documents_activity after insert on portal.documents
  for each row execute function portal_private.on_document_insert();

create function portal_private.cap_pending_invitations() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from portal.invitations
      where org_id = new.org_id and accepted_at is null and expires_at > now()) >= 20 then
    raise exception 'too many pending invitations for this organization'
      using errcode = 'P0001', hint = 'invitation_limit';
  end if;
  return new;
end $$;

create trigger invitations_cap before insert on portal.invitations
  for each row execute function portal_private.cap_pending_invitations();

-- ---------------------------------------------------------------------------
-- RPCs (exposed). Each one checks authorization explicitly.
-- Errors for "not yours" and "does not exist" are identical (P0002) so the
-- API never reveals that another organization's record exists.
-- ---------------------------------------------------------------------------

-- Admin creates an invitation; returns the raw token ONCE (only its hash is stored).
create function portal.create_invitation(p_org_id uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  if not portal_private.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from portal.organizations where id = p_org_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  -- 2 x uuid v4 => 244 random bits from the server's CSPRNG.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into portal.invitations (org_id, email, token_hash, created_by)
  values (p_org_id, lower(btrim(p_email)), sha256(convert_to(v_token, 'UTF8')), auth.uid());
  return v_token;
end $$;

-- Anyone holding a valid token can see which org and email it is for.
create function portal.get_invitation(p_token text)
returns table (organization_name text, email text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.name, i.email, i.expires_at
  from portal.invitations i
  join portal.organizations o on o.id = i.org_id
  where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and i.accepted_at is null
    and i.expires_at > now()
$$;

-- The signed-in user redeems an invitation addressed to their email.
create function portal.accept_invitation(p_token text, p_full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   portal.invitations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_inv from portal.invitations
  where token_hash = sha256(convert_to(p_token, 'UTF8'))
    and accepted_at is null and expires_at > now()
  for update;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  -- One generic error for: unknown token, expired, used, or wrong account.
  if v_inv.id is null or v_email is distinct from lower(v_inv.email) then
    raise exception 'invitation invalid or expired' using errcode = 'P0002';
  end if;
  if exists (select 1 from portal.profiles where id = v_uid) then
    raise exception 'account already belongs to an organization' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) not between 1 and 120 then
    raise exception 'full name is required' using errcode = '22023';
  end if;

  insert into portal.profiles (id, email, full_name, role, org_id)
  values (v_uid, v_email, btrim(p_full_name), 'client', v_inv.org_id);

  update portal.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;

  -- Tag the account so demo cleanup can find it (and never touches other apps' users).
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"app":"client-portal-mini"}'::jsonb
   where id = v_uid;

  perform portal_private.log_activity(v_inv.org_id, null, 'member.joined',
    format('%s joined the portal', btrim(p_full_name)));
  return v_inv.org_id;
end $$;

-- Clients (and admins) tick off onboarding steps. Only completion fields change.
create function portal.set_onboarding_item_done(p_item_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from portal.onboarding_items where id = p_item_id for update;
  if v_org is null or not (portal_private.is_admin() or v_org = portal_private.my_org_id()) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  update portal.onboarding_items
     set completed_at = case when p_done then coalesce(completed_at, now()) end,
         completed_by = case when p_done then coalesce(completed_by, auth.uid()) end
   where id = p_item_id;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant exactly what the policies expect.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema portal         from public, anon, authenticated;
revoke all on all functions in schema portal         from public, anon, authenticated;
revoke all on all functions in schema portal_private from public, anon, authenticated;
revoke all on schema portal_private from public;

grant usage on schema portal to anon, authenticated;
-- Policies run as the caller, so the caller needs to reach the helpers.
-- portal_private is not in the API's exposed schemas, so it is not reachable over HTTP.
grant usage on schema portal_private to authenticated;
grant execute on function portal_private.is_admin()  to authenticated;
grant execute on function portal_private.my_org_id() to authenticated;

grant select, insert                                on portal.organizations    to authenticated;
grant update (name, slug)                           on portal.organizations    to authenticated;
grant select, delete                                on portal.profiles         to authenticated;
grant update (full_name, job_title, phone)          on portal.profiles         to authenticated;
grant select, delete                                on portal.invitations      to authenticated;
grant select, insert, delete                        on portal.projects         to authenticated;
grant update (name, description, status, start_date, due_date) on portal.projects to authenticated;
grant select, insert, delete                        on portal.milestones       to authenticated;
grant update (title, due_date, completed_at, position) on portal.milestones    to authenticated;
grant select, insert, delete                        on portal.onboarding_items to authenticated;
grant update (title, description, due_date, required, position) on portal.onboarding_items to authenticated;
grant select, insert, delete                        on portal.documents        to authenticated;
grant update (file_name, visibility, project_id)    on portal.documents        to authenticated;
grant select                                        on portal.messages         to authenticated;
grant insert (org_id, body)                         on portal.messages         to authenticated;
grant select                                        on portal.activity_events  to authenticated;

grant execute on function portal.create_invitation(uuid, text)        to authenticated;
grant execute on function portal.get_invitation(text)                 to anon, authenticated;
grant execute on function portal.accept_invitation(text, text)        to authenticated;
grant execute on function portal.set_onboarding_item_done(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, object key = "<org_id>/<document_id>".
-- Read access mirrors the documents table: the subquery runs under the
-- caller's RLS, so a client can read an object only if they can see its row.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-documents', 'portal-documents', false, 5242880, array[
  'application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create policy portal_documents_read on storage.objects for select to authenticated
  using (
    bucket_id = 'portal-documents'
    and exists (select 1 from portal.documents d where d.storage_path = storage.objects.name)
  );
create policy portal_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-documents' and (select portal_private.is_admin()));
create policy portal_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-documents' and (select portal_private.is_admin()));
