-- Ripple: reports, clusters, alerts, walks and staff, with row-level security.
-- Demo app: all data is fictional.

create extension if not exists postgis with schema extensions;

create type public.report_category as enum ('grabbed', 'followed', 'verbal', 'other');
create type public.cluster_status as enum ('open', 'acknowledged', 'closed');
create type public.walk_status as enum ('active', 'arrived', 'help', 'cancelled');

-- ---------------------------------------------------------------- staff
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;

create policy "staff read own row" on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ---------------------------------------------------------------- clusters
create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  status public.cluster_status not null default 'open',
  center extensions.geography(point, 4326) not null,
  lat double precision not null default 0,
  lng double precision not null default 0,
  report_count integer not null default 0,
  first_report_at timestamptz not null,
  last_report_at timestamptz not null,
  assigned_to uuid references public.staff (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clusters_last_report_at_idx on public.clusters (last_report_at desc);
create index clusters_center_idx on public.clusters using gist (center);
create index clusters_assigned_to_idx on public.clusters (assigned_to);
alter table public.clusters enable row level security;

create policy "staff read clusters" on public.clusters
  for select to authenticated using ((select public.is_staff()));
create policy "staff update clusters" on public.clusters
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------------------------------------------------------------- reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category public.report_category not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  geog extensions.geography(point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  details text check (char_length(details) <= 1000),
  is_anonymous boolean not null default true,
  contact_ok boolean not null default false,
  wants_formal_report boolean not null default false,
  cluster_id uuid references public.clusters (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index reports_created_at_idx on public.reports (created_at desc);
create index reports_cluster_id_idx on public.reports (cluster_id);
create index reports_reporter_id_idx on public.reports (reporter_id);
create index reports_geog_idx on public.reports using gist (geog);
alter table public.reports enable row level security;

create policy "reporters create own reports" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and cluster_id is null and is_demo = false);
create policy "reporters read own, staff read all" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_staff()));
create policy "reporters update own follow-up choices" on public.reports
  for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

-- Reporters may only change their follow-up choices, never the facts of the report.
revoke update on public.reports from authenticated, anon;
grant update (contact_ok, wants_formal_report) on public.reports to authenticated;

-- ---------------------------------------------------------------- cluster events (response log)
create table public.cluster_events (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters (id) on delete cascade,
  actor_id uuid references public.staff (user_id) on delete set null,
  kind text not null check (kind in ('created', 'report_added', 'acknowledged', 'assigned', 'note', 'closed', 'reopened', 'alert_sent')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index cluster_events_cluster_id_idx on public.cluster_events (cluster_id, created_at);
create index cluster_events_actor_id_idx on public.cluster_events (actor_id);
alter table public.cluster_events enable row level security;

create policy "staff read events" on public.cluster_events
  for select to authenticated using ((select public.is_staff()));
create policy "staff add events" on public.cluster_events
  for insert to authenticated
  with check ((select public.is_staff()) and actor_id = (select auth.uid()));

-- ---------------------------------------------------------------- alerts (public heads-up)
-- Holds only a rounded area and a general message: never report details or descriptions.
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references public.clusters (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 400,
  message text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);
create index alerts_expires_at_idx on public.alerts (expires_at desc);
create index alerts_cluster_id_idx on public.alerts (cluster_id);
alter table public.alerts enable row level security;

create policy "signed-in users read live alerts" on public.alerts
  for select to authenticated using (expires_at > now() or (select public.is_staff()));

-- ---------------------------------------------------------------- walks (walk-with-me)
create table public.walks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  destination text not null check (char_length(destination) between 1 and 120),
  start_lat double precision,
  start_lng double precision,
  last_lat double precision,
  last_lng double precision,
  expected_by timestamptz not null,
  status public.walk_status not null default 'active',
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index walks_user_id_idx on public.walks (user_id);
create index walks_status_idx on public.walks (status, expected_by);
alter table public.walks enable row level security;

create policy "walkers create own walks" on public.walks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "walkers read own, staff read all" on public.walks
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "walkers update own walks" on public.walks
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- clustering
-- Two or more reports within 400 m and 30 minutes form a cluster. A new cluster
-- raises one general heads-up for the surrounding area.
create function public.assign_cluster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cluster uuid;
  v_is_new boolean := false;
  v_neighbours integer;
  v_lat double precision;
  v_lng double precision;
begin
  select c.id into v_cluster
  from public.clusters c
  where c.status <> 'closed'
    and c.last_report_at >= new.created_at - interval '30 minutes'
    and extensions.st_dwithin(c.center, new.geog, 400)
  order by extensions.st_distance(c.center, new.geog)
  limit 1;

  if v_cluster is null then
    select count(*) into v_neighbours
    from public.reports r
    where r.id <> new.id
      and r.cluster_id is null
      and r.created_at between new.created_at - interval '30 minutes' and new.created_at
      and extensions.st_dwithin(r.geog, new.geog, 400);

    if v_neighbours = 0 then
      return null;
    end if;

    insert into public.clusters (center, lat, lng, first_report_at, last_report_at)
    values (new.geog, new.lat, new.lng, new.created_at, new.created_at)
    returning id into v_cluster;
    v_is_new := true;

    update public.reports r
    set cluster_id = v_cluster
    where r.cluster_id is null
      and r.created_at between new.created_at - interval '30 minutes' and new.created_at
      and extensions.st_dwithin(r.geog, new.geog, 400);
  else
    update public.reports set cluster_id = v_cluster where id = new.id;
  end if;

  update public.clusters c
  set report_count = s.n,
      first_report_at = s.first_at,
      last_report_at = s.last_at,
      center = s.center,
      lat = extensions.st_y(s.center::extensions.geometry),
      lng = extensions.st_x(s.center::extensions.geometry),
      updated_at = now()
  from (
    select count(*)::integer as n,
           min(created_at) as first_at,
           max(created_at) as last_at,
           extensions.st_centroid(extensions.st_collect(geog::extensions.geometry))::extensions.geography as center
    from public.reports
    where cluster_id = v_cluster
  ) s
  where c.id = v_cluster
  returning c.lat, c.lng into v_lat, v_lng;

  if v_is_new then
    insert into public.cluster_events (cluster_id, kind, note)
    values (v_cluster, 'created', 'Ripple linked reports made close together in time and place.');

    insert into public.alerts (cluster_id, lat, lng, message)
    values (
      v_cluster,
      round(v_lat::numeric, 3)::double precision,
      round(v_lng::numeric, 3)::double precision,
      'Several people have reported feeling unsafe near here in the last 30 minutes. Stay in well-lit, busy areas and keep in touch with friends. Campus security are aware.'
    );
    insert into public.cluster_events (cluster_id, kind, note)
    values (v_cluster, 'alert_sent', 'General heads-up sent to people within 400 m.');
  else
    insert into public.cluster_events (cluster_id, kind, note)
    values (v_cluster, 'report_added', 'Another nearby report was linked.');
  end if;

  return null;
end;
$$;

create trigger reports_assign_cluster
  after insert on public.reports
  for each row execute function public.assign_cluster();

-- Closing a cluster ends its public heads-up.
create function public.end_alerts_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    update public.alerts set expires_at = now() where cluster_id = new.id and expires_at > now();
  end if;
  return new;
end;
$$;

create trigger clusters_end_alerts
  after update of status on public.clusters
  for each row execute function public.end_alerts_on_close();

-- ---------------------------------------------------------------- demo helpers (staff only)
create function public.demo_add_report(
  p_lat double precision,
  p_lng double precision,
  p_category public.report_category,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Only security staff can run the demo';
  end if;
  insert into public.reports (reporter_id, category, lat, lng, details, is_demo)
  values ((select auth.uid()), p_category, p_lat, p_lng, p_details, true)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.demo_reset()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only security staff can reset the demo';
  end if;
  delete from public.alerts where true;
  delete from public.cluster_events where true;
  delete from public.reports where true;
  delete from public.clusters where true;
  delete from public.walks where true;
end;
$$;

revoke execute on function public.assign_cluster() from public, anon, authenticated;
revoke execute on function public.end_alerts_on_close() from public, anon, authenticated;
revoke execute on function public.demo_add_report(double precision, double precision, public.report_category, text) from public, anon;
revoke execute on function public.demo_reset() from public, anon;
grant execute on function public.demo_add_report(double precision, double precision, public.report_category, text) to authenticated;
grant execute on function public.demo_reset() to authenticated;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.reports, public.clusters, public.cluster_events, public.alerts, public.walks;
