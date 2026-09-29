-- Run after supabase-schema.sql on existing installations. Safe to reapply.
-- Roles are assigned by an administrator in auth.users.raw_app_meta_data.
begin;
create or replace function public.staff_role()
returns text language sql stable set search_path = '' as $$
  select coalesce(auth.jwt()->'app_metadata'->>'staff_role', '')
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'official_missing_persons', 'cctv_locations', 'zone_boundaries', 'police_stations',
    'chokepoints_parking', 'live_cases', 'duplicate_reviews', 'volunteer_tasks',
    'case_updates', 'cctv_review_requests', 'verified_entities', 'trust_check_reports', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "demo_read_%s" on public.%I', t, t);
    execute format('drop policy if exists "demo_insert_%s" on public.%I', t, t);
    execute format('drop policy if exists "demo_update_%s" on public.%I', t, t);
    execute format('drop policy if exists staff_read on public.%I', t);
    execute format('drop policy if exists staff_insert on public.%I', t);
    execute format('drop policy if exists staff_update on public.%I', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    if t in ('official_missing_persons', 'live_cases', 'zone_boundaries', 'police_stations', 'case_updates', 'volunteer_tasks') then
      execute format('create policy staff_read on public.%I for select to authenticated using (public.staff_role() in (''organiser'', ''volunteer''))', t);
    else
      execute format('create policy staff_read on public.%I for select to authenticated using (public.staff_role() = ''organiser'')', t);
    end if;
    -- Audit records and timeline entries are append-only for staff.
    if t <> 'audit_logs' then
      execute format('grant insert on public.%I to authenticated', t);
      execute format('create policy staff_insert on public.%I for insert to authenticated with check (public.staff_role() = ''organiser'')', t);
    end if;
    if t not in ('audit_logs', 'case_updates') then
      execute format('grant update on public.%I to authenticated', t);
      execute format('create policy staff_update on public.%I for update to authenticated using (public.staff_role() = ''organiser'') with check (public.staff_role() = ''organiser'')', t);
    end if;
  end loop;
end $$;

-- Volunteers can submit cases and update their own/unassigned field tasks.
drop policy if exists volunteer_case_insert on public.live_cases;
create policy volunteer_case_insert on public.live_cases for insert to authenticated
with check (public.staff_role() = 'volunteer' and source = 'mobile_app');
drop policy if exists volunteer_task_insert on public.volunteer_tasks;
create policy volunteer_task_insert on public.volunteer_tasks for insert to authenticated
with check (public.staff_role() = 'volunteer' and assigned_to = auth.uid()::text);
drop policy if exists volunteer_task_update on public.volunteer_tasks;
create policy volunteer_task_update on public.volunteer_tasks for update to authenticated
using (public.staff_role() = 'volunteer' and (assigned_to is null or assigned_to = auth.uid()::text))
with check (public.staff_role() = 'volunteer' and assigned_to = auth.uid()::text);
drop policy if exists volunteer_timeline_insert on public.case_updates;
create policy volunteer_timeline_insert on public.case_updates for insert to authenticated
with check (public.staff_role() = 'volunteer' and actor = auth.uid()::text);
drop policy if exists volunteer_trust_insert on public.trust_check_reports;
create policy volunteer_trust_insert on public.trust_check_reports for insert to authenticated
with check (public.staff_role() = 'volunteer');

-- Remove default PUBLIC execution as well as the original anonymous grants.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'set_updated_at', 'mask_phone', 'haversine_km', 'command_center_stats', 'search_official_cases',
      'vulnerable_official_cases', 'nearest_police', 'nearest_cctv', 'nearest_chokepoints',
      'zone_spatial_summary', 'create_audit_log', 'request_manual_cctv_review', 'staff_role'
    ])
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated, service_role', f.signature);
  end loop;
end $$;

create or replace function public.create_audit_log(
  p_actor text, p_action text, p_entity_type text, p_entity_id text,
  p_pii_accessed boolean default false, p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_actor text;
begin
  if auth.role() = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    v_actor := p_actor;
  elsif public.staff_role() in ('organiser', 'volunteer') then
    v_actor := auth.uid()::text;
  else
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  insert into public.audit_logs(actor, action, entity_type, entity_id, pii_accessed, metadata)
  values (v_actor, p_action, p_entity_type, p_entity_id, p_pii_accessed, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- Case creation, timeline and audit commit together. A provider message ID makes
-- retries safe, including a lost response after the transaction committed.
create unique index if not exists live_cases_source_external_unique
on public.live_cases(source, external_case_id) where external_case_id is not null;

create or replace function public.create_intake_case(p_report jsonb, p_request_id text)
returns public.live_cases language plpgsql set search_path = '' as $$
declare c public.live_cases; incoming public.live_cases;
begin
  if nullif(p_request_id, '') is null then raise exception 'Request ID required'; end if;
  if auth.role() = 'authenticated' and (public.staff_role() not in ('organiser', 'volunteer') or p_report->>'source' is distinct from 'mobile_app') then
    raise exception 'Mobile staff intake required' using errcode = '42501';
  end if;
  incoming := jsonb_populate_record(null::public.live_cases, p_report);
  insert into public.live_cases(
    source, source_detail, external_case_id, case_type, status, priority,
    missing_person_name, gender, age_band, state, district, language,
    last_seen_location, zone_name, reporter_mobile, physical_description,
    raw_report, structured_data, private_verification_clues, risk_flags
  ) values (
    coalesce(incoming.source, 'manual'), incoming.source_detail, p_request_id,
    coalesce(incoming.case_type, 'missing'), 'open', coalesce(incoming.priority, 'medium'),
    incoming.missing_person_name, incoming.gender, incoming.age_band, incoming.state,
    incoming.district, incoming.language, incoming.last_seen_location, incoming.zone_name,
    incoming.reporter_mobile, incoming.physical_description, incoming.raw_report,
    coalesce(incoming.structured_data, '{}'::jsonb), coalesce(incoming.private_verification_clues, '[]'::jsonb),
    coalesce(incoming.risk_flags, '{}'::text[])
  ) on conflict (source, external_case_id) where external_case_id is not null do nothing
  returning * into c;
  if c.id is null then
    select * into strict c from public.live_cases
    where source = coalesce(incoming.source, 'manual') and external_case_id = p_request_id;
    return c;
  end if;
  insert into public.case_updates(case_id, update_type, note, actor)
  values (c.id, 'case_created', 'Intake report saved.', coalesce(auth.uid()::text, c.source));
  if auth.role() = 'authenticated' then
    insert into public.volunteer_tasks(case_id, title, description, assigned_to, priority)
    values (c.id, case when c.priority = 'critical' then 'Emergency SOS from mobile app' else 'Mobile missing-person report' end,
      c.raw_report, auth.uid()::text, c.priority);
  end if;
  perform public.create_audit_log(c.source, 'created_live_case', 'live_case', c.id::text, false,
    jsonb_build_object('source', c.source, 'priority', c.priority));
  return c;
end $$;
revoke all on function public.create_intake_case(jsonb, text) from public, anon, authenticated;
grant execute on function public.create_intake_case(jsonb, text) to service_role, authenticated;

-- One transaction prevents partial completion and false success in the field.
create or replace function public.report_person_found(
  p_case_id uuid default null, p_task_id uuid default null, p_gps jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare t public.volunteer_tasks; v_case_id uuid := p_case_id; v_official_id text;
begin
  if public.staff_role() not in ('organiser', 'volunteer') or auth.uid() is null then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_task_id is not null then
    select * into strict t from public.volunteer_tasks where id = p_task_id for update;
    if public.staff_role() = 'volunteer' and t.assigned_to is not null and t.assigned_to <> auth.uid()::text then
      raise exception 'Task belongs to another volunteer' using errcode = '42501';
    end if;
    if p_case_id is not null and p_case_id is distinct from t.case_id then
      raise exception 'Task and case do not match';
    end if;
    v_case_id := t.case_id;
    v_official_id := t.official_case_id;
    update public.volunteer_tasks set status = 'completed', assigned_to = coalesce(assigned_to, auth.uid()::text)
    where id = t.id;
  end if;
  if v_case_id is null and v_official_id is null then raise exception 'Case required'; end if;
  if v_case_id is not null then
    update public.live_cases set status = 'found' where id = v_case_id;
    if not found then raise exception 'Case not found'; end if;
  end if;
  if v_official_id is not null then
    update public.official_missing_persons set status = 'Found' where case_id = v_official_id;
  end if;
  insert into public.case_updates(case_id, official_case_id, update_type, note, actor, metadata)
  values (v_case_id, v_official_id, 'person_found_by_mobile', 'Person located; identity/reunification verification still required.',
    auth.uid()::text, jsonb_build_object('task_id', p_task_id, 'gps', p_gps));
  perform public.create_audit_log(auth.uid()::text, 'reported_person_found', 'live_case',
    coalesce(v_case_id::text, v_official_id), true, jsonb_build_object('task_id', p_task_id, 'gps', p_gps));
end $$;
revoke all on function public.report_person_found(uuid, uuid, jsonb) from public, anon;
grant execute on function public.report_person_found(uuid, uuid, jsonb) to authenticated;

revoke all on function public.staff_role() from public, anon;
grant execute on function public.staff_role() to authenticated, service_role;

create or replace function public.update_volunteer_task(p_task_id uuid, p_status text)
returns public.volunteer_tasks language plpgsql security definer set search_path = '' as $$
declare t public.volunteer_tasks;
begin
  if public.staff_role() not in ('organiser', 'volunteer') or auth.uid() is null then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('accepted', 'en_route', 'on_scene', 'completed', 'escalated') then
    raise exception 'Invalid task status';
  end if;
  select * into strict t from public.volunteer_tasks where id = p_task_id for update;
  if public.staff_role() = 'volunteer' and t.assigned_to is not null and t.assigned_to <> auth.uid()::text then
    raise exception 'Task belongs to another volunteer' using errcode = '42501';
  end if;
  update public.volunteer_tasks set status = p_status, assigned_to = coalesce(assigned_to, auth.uid()::text)
  where id = p_task_id returning * into t;
  insert into public.case_updates(case_id, official_case_id, update_type, note, actor, metadata)
  values (t.case_id, t.official_case_id, 'volunteer_' || p_status, 'Volunteer task updated.', auth.uid()::text,
    jsonb_build_object('task_id', t.id, 'status', p_status));
  perform public.create_audit_log(auth.uid()::text, 'updated_volunteer_task', 'volunteer_task', t.id::text,
    false, jsonb_build_object('status', p_status));
  return t;
end $$;
revoke all on function public.update_volunteer_task(uuid, text) from public, anon;
grant execute on function public.update_volunteer_task(uuid, text) to authenticated;
-- Volunteers change workflow only through the checked transaction above.
drop policy if exists volunteer_task_update on public.volunteer_tasks;

create or replace function public.submit_trust_report(p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if public.staff_role() not in ('organiser', 'volunteer') or auth.uid() is null then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if nullif(trim(p_message), '') is null or length(p_message) > 8000 then raise exception 'Message must contain 1 to 8000 characters'; end if;
  insert into public.trust_check_reports(source, raw_message, risk_level, reasons)
  values ('mobile_app', trim(p_message), 'unverified', array['Needs command-center review']) returning id into v_id;
  perform public.create_audit_log(auth.uid()::text, 'created_mobile_trust_check', 'trust_check_report', v_id::text, false);
  return v_id;
end $$;
revoke all on function public.submit_trust_report(text) from public, anon;
grant execute on function public.submit_trust_report(text) to authenticated;

commit;
