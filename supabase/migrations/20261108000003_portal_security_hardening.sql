-- =============================================================================
-- Security hardening from the internal review (2026-11-08). See docs/SECURITY.md.
-- =============================================================================

-- 1. Only tag (and so only ever clean up) accounts this app created.
--    Previously an existing account from another app in the shared project
--    could accept an invitation, get tagged, and be deleted by a demo reset.
--    The account must also have a confirmed email.
create or replace function portal.accept_invitation(p_token text, p_full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_user  auth.users;
  v_inv   portal.invitations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_inv from portal.invitations
  where token_hash = sha256(convert_to(p_token, 'UTF8'))
    and accepted_at is null and expires_at > now()
  for update;

  select * into v_user from auth.users u where u.id = v_uid;

  if v_inv.id is null or lower(v_user.email) is distinct from lower(v_inv.email) or v_user.email_confirmed_at is null then
    raise exception 'invitation invalid or expired' using errcode = 'P0002';
  end if;
  if exists (select 1 from portal.profiles where id = v_uid) then
    raise exception 'account already belongs to an organization' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) not between 1 and 120 then
    raise exception 'full name is required' using errcode = '22023';
  end if;

  insert into portal.profiles (id, email, full_name, role, org_id)
  values (v_uid, lower(v_user.email), btrim(p_full_name), 'client', v_inv.org_id);
  update portal.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;

  -- Tag only accounts created for this invitation and not claimed by another app.
  if v_user.created_at >= v_inv.created_at
     and coalesce(v_user.raw_app_meta_data ->> 'app', 'client-portal-mini') = 'client-portal-mini' then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"app":"client-portal-mini"}'::jsonb
     where id = v_uid;
  end if;

  perform portal_private.log_activity(v_inv.org_id, null, 'member.joined',
    format('%s joined the portal', btrim(p_full_name)));
  return v_inv.org_id;
end $$;

-- 2. Demo accounts' password and email can't be changed through the Auth API
--    (the publishable key would otherwise let a visitor lock everyone out).
--    Scoped to the four fixed demo ids; the reset sets portal.seeding to restore them.
create function portal_private.protect_demo_accounts() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.id in ('00000000-0000-4000-8000-0000000000ad', 'a0000000-0000-4000-8000-0000000000a1',
                'a0000000-0000-4000-8000-0000000000a2', 'b0000000-0000-4000-8000-0000000000b1')
     and old.raw_app_meta_data ->> 'app' = 'client-portal-mini'
     and current_setting('portal.seeding', true) is distinct from 'on'
     and (new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email) then
    raise exception 'demo account credentials cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger portal_protect_demo_accounts before update on auth.users
  for each row execute function portal_private.protect_demo_accounts();

-- 3. Agency staff profiles are visible only to people who belong to the portal,
--    not to every authenticated user of the shared project.
drop policy profile_select on portal.profiles;
create policy profile_select on portal.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select portal_private.is_admin())
    or (org_id is not null and org_id = (select portal_private.my_org_id()))
    or (role = 'admin' and (select portal_private.my_org_id()) is not null)
  );

-- 4. When a shared document is made internal, remove its "shared" activity so
--    the client feed no longer shows the file name.
create function portal_private.on_document_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility = 'internal' and old.visibility = 'client' then
    delete from portal.activity_events
     where org_id = old.org_id and kind = 'document.uploaded'
       and summary = format('Document "%s" shared', old.file_name);
  end if;
  return null;
end $$;

create trigger documents_visibility after update of visibility on portal.documents
  for each row execute function portal_private.on_document_visibility();

revoke all on function portal_private.protect_demo_accounts() from public, anon, authenticated;
revoke all on function portal_private.on_document_visibility() from public, anon, authenticated;
