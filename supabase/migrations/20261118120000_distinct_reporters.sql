-- A new cluster (and its public heads-up) needs reports from at least two
-- different people, so one person reporting twice can't trigger an alert.
-- Scripted demo reports all come from the staff account, so they are exempt.
create or replace function public.assign_cluster()
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
      and extensions.st_dwithin(r.geog, new.geog, 400)
      and (r.reporter_id <> new.reporter_id or (new.is_demo and r.is_demo));

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
    values (v_cluster, 'created', 'Ripple linked reports from different people made close together in time and place.');

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

revoke execute on function public.assign_cluster() from public, anon, authenticated;
