create extension if not exists pg_trgm;

create table if not exists official_missing_persons (
  case_id text primary key,
  reported_at timestamp,
  missing_person_name text,
  gender text,
  age_band text,
  state text,
  district text,
  language text,
  last_seen_location text,
  reporting_center text,
  reporter_mobile text,
  physical_description text,
  status text,
  resolution_hours numeric,
  is_duplicate_report boolean default false,
  remarks text,
  search_text text generated always as (
    lower(
      coalesce(case_id, '') || ' ' ||
      coalesce(missing_person_name, '') || ' ' ||
      coalesce(gender, '') || ' ' ||
      coalesce(age_band, '') || ' ' ||
      coalesce(state, '') || ' ' ||
      coalesce(district, '') || ' ' ||
      coalesce(language, '') || ' ' ||
      coalesce(last_seen_location, '') || ' ' ||
      coalesce(reporting_center, '') || ' ' ||
      coalesce(physical_description, '') || ' ' ||
      coalesce(status, '') || ' ' ||
      coalesce(remarks, '')
    )
  ) stored
);

create table if not exists cctv_locations (
  camera_id text primary key,
  longitude double precision not null,
  latitude double precision not null
);

create table if not exists zone_boundaries (
  zone_name text primary key,
  centroid_lat double precision not null,
  centroid_lng double precision not null,
  approx_boundary_points integer
);

create table if not exists police_stations (
  station_name text primary key,
  longitude double precision not null,
  latitude double precision not null
);

create table if not exists chokepoints_parking (
  location_name text primary key,
  category text not null,
  longitude double precision not null,
  latitude double precision not null,
  risk_level text,
  project_status text,
  source_url text,
  note text,
  kml_description text
);

create table if not exists live_cases (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  source_detail text,
  external_case_id text,
  reported_at timestamptz not null default now(),
  case_type text not null default 'missing' check (case_type in ('missing', 'found')),
  status text not null default 'open',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  missing_person_name text,
  gender text,
  age_band text,
  state text,
  district text,
  language text,
  last_seen_location text,
  zone_name text references zone_boundaries(zone_name),
  reporter_mobile text,
  physical_description text,
  raw_report text,
  structured_data jsonb not null default '{}'::jsonb,
  private_verification_clues jsonb not null default '[]'::jsonb,
  risk_flags text[] not null default '{}',
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  primary_case_id text not null,
  candidate_case_id text not null,
  primary_source text not null default 'official',
  candidate_source text not null default 'official',
  score integer not null check (score between 0 and 100),
  reasons text[] not null default '{}',
  review_status text not null default 'needs_review' check (review_status in ('needs_review', 'merged', 'not_duplicate')),
  reviewer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists volunteer_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references live_cases(id) on delete cascade,
  official_case_id text references official_missing_persons(case_id),
  title text not null,
  description text,
  assigned_to text,
  status text not null default 'new' check (status in ('new', 'accepted', 'en_route', 'on_scene', 'completed', 'escalated', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  zone_name text references zone_boundaries(zone_name),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists case_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references live_cases(id) on delete cascade,
  official_case_id text references official_missing_persons(case_id),
  update_type text not null,
  note text,
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists cctv_review_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references live_cases(id) on delete cascade,
  official_case_id text references official_missing_persons(case_id),
  camera_id text references cctv_locations(camera_id),
  requested_by text,
  status text not null default 'requested' check (status in ('requested', 'in_review', 'completed', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists verified_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('accommodation', 'vendor', 'helpdesk', 'transport')),
  display_name text not null,
  official_id text,
  phone text,
  upi_vpa text,
  website text,
  zone_name text references zone_boundaries(zone_name),
  verification_status text not null default 'verified' check (verification_status in ('verified', 'revoked', 'pending')),
  created_at timestamptz not null default now()
);

create table if not exists trust_check_reports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'whatsapp',
  reporter_mobile text,
  raw_message text,
  extracted_phone text,
  extracted_upi_vpa text,
  extracted_payee_name text,
  extracted_amount numeric,
  claimed_entity_name text,
  risk_level text not null default 'unverified' check (risk_level in ('verified', 'unverified', 'high_concern')),
  reasons text[] not null default '{}',
  matched_verified_entity uuid references verified_entities(id),
  status text not null default 'open' check (status in ('open', 'escalated', 'closed')),
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text not null,
  entity_id text,
  pii_accessed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_official_missing_search_trgm on official_missing_persons using gin (search_text gin_trgm_ops);
create index if not exists idx_official_missing_status on official_missing_persons(status);
create index if not exists idx_official_missing_age on official_missing_persons(age_band);
create index if not exists idx_official_missing_center on official_missing_persons(reporting_center);
create index if not exists idx_official_missing_duplicate on official_missing_persons(is_duplicate_report);
create index if not exists idx_live_cases_status on live_cases(status);
create index if not exists idx_live_cases_zone on live_cases(zone_name);
create index if not exists idx_live_cases_priority on live_cases(priority);
create index if not exists idx_tasks_status on volunteer_tasks(status);
create index if not exists idx_trust_check_risk on trust_check_reports(risk_level);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_live_cases_updated_at on live_cases;
create trigger trg_live_cases_updated_at before update on live_cases
for each row execute function set_updated_at();

drop trigger if exists trg_duplicate_reviews_updated_at on duplicate_reviews;
create trigger trg_duplicate_reviews_updated_at before update on duplicate_reviews
for each row execute function set_updated_at();

drop trigger if exists trg_volunteer_tasks_updated_at on volunteer_tasks;
create trigger trg_volunteer_tasks_updated_at before update on volunteer_tasks
for each row execute function set_updated_at();

drop trigger if exists trg_trust_check_reports_updated_at on trust_check_reports;
create trigger trg_trust_check_reports_updated_at before update on trust_check_reports
for each row execute function set_updated_at();

create or replace function mask_phone(phone text)
returns text
language sql
stable
as $$
  select case
    when phone is null or length(trim(phone)) < 5 then null
    else left(phone, 4) || repeat('*', greatest(length(phone) - 7, 0)) || right(phone, 3)
  end;
$$;

create or replace function haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(
    sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians((lng2 - lng1) / 2)), 2)
    )
  );
$$;

create or replace function command_center_stats()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'official_total', (select count(*) from official_missing_persons),
    'official_reunited', (select count(*) from official_missing_persons where status = 'Reunited'),
    'official_pending', (select count(*) from official_missing_persons where status = 'Pending'),
    'official_hospital', (select count(*) from official_missing_persons where status = 'Transferred to hospital'),
    'official_unresolved', (select count(*) from official_missing_persons where status = 'Unresolved'),
    'official_duplicates', (select count(*) from official_missing_persons where is_duplicate_report),
    'official_no_name', (select count(*) from official_missing_persons where nullif(trim(missing_person_name), '') is null),
    'official_no_mobile', (select count(*) from official_missing_persons where nullif(trim(reporter_mobile), '') is null),
    'official_children', (select count(*) from official_missing_persons where age_band in ('0-12', '13-17')),
    'official_elderly', (select count(*) from official_missing_persons where age_band in ('61-70', '71-80', '80+')),
    'live_open', (select count(*) from live_cases where status <> 'closed'),
    'volunteer_open_tasks', (select count(*) from volunteer_tasks where status not in ('completed', 'cancelled')),
    'trust_high_concern', (select count(*) from trust_check_reports where risk_level = 'high_concern'),
    'zones', (select count(*) from zone_boundaries),
    'cameras', (select count(*) from cctv_locations),
    'police_stations', (select count(*) from police_stations),
    'chokepoints_parking', (select count(*) from chokepoints_parking)
  );
$$;

create or replace function search_official_cases(q text default '', max_rows integer default 50)
returns table (
  case_id text,
  reported_at timestamp,
  missing_person_name text,
  masked_mobile text,
  gender text,
  age_band text,
  state text,
  district text,
  language text,
  last_seen_location text,
  reporting_center text,
  physical_description text,
  status text,
  is_duplicate_report boolean,
  risk_flags text[],
  rank_score real
)
language sql
stable
as $$
  select
    m.case_id,
    m.reported_at,
    nullif(m.missing_person_name, ''),
    mask_phone(m.reporter_mobile),
    m.gender,
    m.age_band,
    m.state,
    m.district,
    m.language,
    m.last_seen_location,
    m.reporting_center,
    m.physical_description,
    m.status,
    m.is_duplicate_report,
    array_remove(array[
      case when m.age_band in ('0-12', '13-17') then 'child' end,
      case when m.age_band in ('61-70', '71-80', '80+') then 'elderly' end,
      case when nullif(trim(m.missing_person_name), '') is null then 'no_name' end,
      case when nullif(trim(m.reporter_mobile), '') is null then 'no_mobile' end,
      case when m.status = 'Transferred to hospital' then 'hospital' end,
      case when m.status = 'Unresolved' then 'unresolved' end,
      case when m.is_duplicate_report then 'possible_duplicate' end
    ], null) as risk_flags,
    case
      when coalesce(q, '') = '' then 0
      else similarity(m.search_text, lower(q))
    end as rank_score
  from official_missing_persons m
  where coalesce(q, '') = ''
     or m.search_text ilike '%' || lower(q) || '%'
     or similarity(m.search_text, lower(q)) > 0.08
  order by
    case when coalesce(q, '') = '' then m.reported_at end desc,
    similarity(m.search_text, lower(coalesce(q, ''))) desc
  limit greatest(1, least(coalesce(max_rows, 50), 200));
$$;

create or replace function vulnerable_official_cases(max_rows integer default 100)
returns table (
  case_id text,
  missing_person_name text,
  masked_mobile text,
  age_band text,
  gender text,
  language text,
  last_seen_location text,
  reporting_center text,
  status text,
  risk_flags text[]
)
language sql
stable
as $$
  select
    m.case_id,
    nullif(m.missing_person_name, ''),
    mask_phone(m.reporter_mobile),
    m.age_band,
    m.gender,
    m.language,
    m.last_seen_location,
    m.reporting_center,
    m.status,
    array_remove(array[
      case when m.age_band in ('0-12', '13-17') then 'child' end,
      case when m.age_band in ('61-70', '71-80', '80+') then 'elderly' end,
      case when nullif(trim(m.missing_person_name), '') is null then 'no_name' end,
      case when nullif(trim(m.reporter_mobile), '') is null then 'no_mobile' end,
      case when m.status = 'Transferred to hospital' then 'hospital' end,
      case when m.status = 'Unresolved' then 'unresolved' end
    ], null) as risk_flags
  from official_missing_persons m
  where m.age_band in ('0-12', '13-17', '61-70', '71-80', '80+')
     or nullif(trim(m.missing_person_name), '') is null
     or nullif(trim(m.reporter_mobile), '') is null
     or m.status in ('Transferred to hospital', 'Unresolved', 'Pending')
  order by
    case when m.status = 'Unresolved' then 0 when m.status = 'Transferred to hospital' then 1 else 2 end,
    m.reported_at desc
  limit greatest(1, least(coalesce(max_rows, 100), 300));
$$;

create or replace function nearest_police(lat double precision, lng double precision, max_rows integer default 3)
returns table (
  station_name text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
language sql
stable
as $$
  select
    p.station_name,
    p.latitude,
    p.longitude,
    haversine_km(lat, lng, p.latitude, p.longitude) as distance_km
  from police_stations p
  order by distance_km
  limit greatest(1, least(coalesce(max_rows, 3), 20));
$$;

create or replace function nearest_cctv(lat double precision, lng double precision, max_rows integer default 8)
returns table (
  camera_id text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
language sql
stable
as $$
  select
    c.camera_id,
    c.latitude,
    c.longitude,
    haversine_km(lat, lng, c.latitude, c.longitude) as distance_km
  from cctv_locations c
  order by distance_km
  limit greatest(1, least(coalesce(max_rows, 8), 50));
$$;

drop function if exists nearest_chokepoints(double precision, double precision, integer);

create or replace function nearest_chokepoints(lat double precision, lng double precision, max_rows integer default 5)
returns table (
  location_name text,
  category text,
  risk_level text,
  project_status text,
  source_url text,
  note text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
language sql
stable
as $$
  select
    cp.location_name,
    cp.category,
    cp.risk_level,
    cp.project_status,
    cp.source_url,
    cp.note,
    cp.latitude,
    cp.longitude,
    haversine_km(lat, lng, cp.latitude, cp.longitude) as distance_km
  from chokepoints_parking cp
  order by distance_km
  limit greatest(1, least(coalesce(max_rows, 5), 50));
$$;

create or replace function zone_spatial_summary()
returns table (
  zone_name text,
  centroid_lat double precision,
  centroid_lng double precision,
  camera_count bigint,
  live_case_count bigint,
  critical_live_case_count bigint,
  open_task_count bigint
)
language sql
stable
as $$
  select
    z.zone_name,
    z.centroid_lat,
    z.centroid_lng,
    (select count(*) from cctv_locations c where split_part(c.camera_id, '-C', 1) = replace(z.zone_name, 'Zone Area ', 'Z')) as camera_count,
    (select count(*) from live_cases lc where lc.zone_name = z.zone_name) as live_case_count,
    (select count(*) from live_cases lc where lc.zone_name = z.zone_name and lc.priority in ('high', 'critical')) as critical_live_case_count,
    (select count(*) from volunteer_tasks vt where vt.zone_name = z.zone_name and vt.status not in ('completed', 'cancelled')) as open_task_count
  from zone_boundaries z
  order by z.zone_name;
$$;

create or replace function create_audit_log(
  p_actor text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_pii_accessed boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into audit_logs(actor, action, entity_type, entity_id, pii_accessed, metadata)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_pii_accessed, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function request_manual_cctv_review(
  p_camera_id text,
  p_requested_by text default 'command_center',
  p_case_id uuid default null,
  p_official_case_id text default null,
  p_note text default 'Manual CCTV location review requested. No automated footage analysis claimed.'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into cctv_review_requests(case_id, official_case_id, camera_id, requested_by, note)
  values (p_case_id, p_official_case_id, p_camera_id, p_requested_by, p_note)
  returning id into v_id;

  perform create_audit_log(
    p_requested_by,
    'requested_manual_cctv_review',
    'cctv_review_request',
    v_id::text,
    false,
    jsonb_build_object(
      'camera_id', p_camera_id,
      'case_id', p_case_id,
      'official_case_id', p_official_case_id
    )
  );

  return v_id;
end;
$$;

alter table official_missing_persons enable row level security;
alter table cctv_locations enable row level security;
alter table zone_boundaries enable row level security;
alter table police_stations enable row level security;
alter table chokepoints_parking enable row level security;
alter table live_cases enable row level security;
alter table duplicate_reviews enable row level security;
alter table volunteer_tasks enable row level security;
alter table case_updates enable row level security;
alter table cctv_review_requests enable row level security;
alter table verified_entities enable row level security;
alter table trust_check_reports enable row level security;
alter table audit_logs enable row level security;


do $$
begin
  alter publication supabase_realtime add table live_cases;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table volunteer_tasks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table case_updates;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table trust_check_reports;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table audit_logs;
exception when duplicate_object then null;
end $$;

-- Security hardening (kept in sync with security-hardening.sql)
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
