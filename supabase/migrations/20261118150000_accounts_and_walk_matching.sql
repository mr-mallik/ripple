-- Real accounts, Walk together matching, trusted contacts, blocks,
-- concerns about other students, and formal report requests.
--
-- Privacy rules this file enforces:
-- * Nobody can read another person's profile, contacts or exact location.
-- * Walk together only ever reveals a first name, a destination area and a
--   rounded walking time, and only to verified students the person allows.
-- * Staff can read formal requests and concerns, nothing else here.

-- ------------------------------------------------------------------ profiles
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_type text not null check (account_type in ('individual', 'organisation')),
  full_name text not null check (char_length(full_name) between 1 and 100),
  gender text check (gender in ('Woman', 'Man', 'Non-binary', 'Prefer not to say', 'Self-describe')),
  age integer check (age between 16 and 120),
  contact_number text check (char_length(contact_number) <= 30),
  address text check (char_length(address) <= 300),
  location_permission text check (location_permission in ('always', 'while_using')),
  is_student boolean not null default false,
  institution text check (char_length(institution) <= 120),
  organisation_type text check (char_length(organisation_type) <= 60),
  contact_person text check (char_length(contact_person) <= 100),
  -- Who can see me in Walk together.
  visibility text not null default 'all' check (visibility in ('all', 'women', 'institution', 'hidden')),
  walk_visible boolean not null default false,
  -- Organisation accounts are approved by the Ripple team, never by themselves.
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "people read own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "people update own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (
  full_name, gender, age, contact_number, address, location_permission, is_student,
  institution, organisation_type, contact_person, visibility, walk_visible, updated_at
) on public.profiles to authenticated;

-- Sign-up sends the profile as user metadata. Copy it into profiles, then
-- strip the personal details back out of the auth record.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(new.is_anonymous, false) or not (m ? 'account_type') then
    return new;
  end if;

  insert into public.profiles (
    user_id, account_type, full_name, gender, age, contact_number, address,
    location_permission, is_student, institution, organisation_type, contact_person
  ) values (
    new.id,
    m ->> 'account_type',
    left(coalesce(nullif(trim(m ->> 'full_name'), ''), 'Ripple user'), 100),
    nullif(m ->> 'gender', ''),
    case when (m ->> 'age') ~ '^\d{1,3}$' then (m ->> 'age')::integer end,
    left(nullif(trim(m ->> 'contact_number'), ''), 30),
    left(nullif(trim(m ->> 'address'), ''), 300),
    nullif(m ->> 'location_permission', ''),
    coalesce((m ->> 'is_student')::boolean, false),
    left(nullif(trim(m ->> 'institution'), ''), 120),
    left(nullif(trim(m ->> 'organisation_type'), ''), 60),
    left(nullif(trim(m ->> 'contact_person'), ''), 100)
  );

  update auth.users
  set raw_user_meta_data = jsonb_build_object('account_type', m ->> 'account_type')
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A verified student: a confirmed, non-anonymous account marked as a student,
-- with a university email address.
create function public.is_verified_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.user_id
    where p.user_id = p_user
      and p.account_type = 'individual'
      and p.is_student
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and (lower(u.email) like '%.ac.uk' or lower(u.email) like '%.edu')
  );
$$;

create function public.am_i_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_verified_student((select auth.uid()));
$$;

-- ------------------------------------------------------------------ trusted contacts
create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  phone text not null check (char_length(phone) between 6 and 30),
  created_at timestamptz not null default now()
);
create index trusted_contacts_owner_idx on public.trusted_contacts (owner_id);
alter table public.trusted_contacts enable row level security;

create policy "owners manage their contacts" on public.trusted_contacts
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ------------------------------------------------------------------ blocks
create table public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  blocked_name text not null check (char_length(blocked_name) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;

create policy "people manage their blocks" on public.blocks
  for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- ------------------------------------------------------------------ concerns about students
create table public.student_concerns (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reported_name text not null check (char_length(reported_name) between 1 and 60),
  reason text not null check (reason in ('Made me uncomfortable', 'Didn''t turn up', 'Fake profile', 'Something else')),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);
create index student_concerns_created_idx on public.student_concerns (created_at desc);
create index student_concerns_reporter_idx on public.student_concerns (reporter_id);
create index student_concerns_reported_idx on public.student_concerns (reported_id);
alter table public.student_concerns enable row level security;

create policy "people raise concerns" on public.student_concerns
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "reporters and staff read concerns" on public.student_concerns
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_staff()));

-- ------------------------------------------------------------------ formal report requests
create table public.formal_requests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  contact text not null check (char_length(contact) between 3 and 120),
  preferred_contact text not null check (preferred_contact in ('phone', 'email', 'either')),
  statement text check (char_length(statement) <= 4000),
  support_person boolean not null default false,
  created_at timestamptz not null default now()
);
create index formal_requests_report_idx on public.formal_requests (report_id);
create index formal_requests_user_idx on public.formal_requests (user_id);
alter table public.formal_requests enable row level security;

create policy "reporters request formal follow-up" on public.formal_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
  );
create policy "requesters and staff read formal requests" on public.formal_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create function public.mark_formal_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports set wants_formal_report = true, contact_ok = true where id = new.report_id;
  return null;
end;
$$;

create trigger formal_request_marks_report
  after insert on public.formal_requests
  for each row execute function public.mark_formal_request();

-- ------------------------------------------------------------------ walks: who with
alter table public.walks
  add column mode text not null default 'solo' check (mode in ('solo', 'together', 'shared')),
  add column companion_name text check (char_length(companion_name) <= 60),
  add column request_id uuid,
  add column feedback text check (feedback in ('good', 'not_good'));

-- ------------------------------------------------------------------ walk offers (private)
-- Where a visible student is heading, with their location rounded to ~100 m.
-- No policies: only the functions below can read it.
create table public.walk_offers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  destination text not null check (char_length(destination) between 1 and 60),
  minutes integer not null check (minutes between 1 and 120),
  geog extensions.geography(point, 4326) not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '20 minutes'
);
create index walk_offers_geog_idx on public.walk_offers using gist (geog);
alter table public.walk_offers enable row level security;

create function public.set_walk_offer(p_lat double precision, p_lng double precision, p_destination text, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_verified_student(me) then
    raise exception 'Walk together is for verified students.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where user_id = me and walk_visible and visibility <> 'hidden') then
    delete from public.walk_offers where user_id = me;
    return;
  end if;
  insert into public.walk_offers (user_id, destination, minutes, geog, updated_at, expires_at)
  values (
    me,
    left(trim(p_destination), 60),
    greatest(1, least(120, p_minutes)),
    extensions.st_setsrid(extensions.st_makepoint(round(p_lng::numeric, 3)::double precision, round(p_lat::numeric, 3)::double precision), 4326)::extensions.geography,
    now(),
    now() + interval '20 minutes'
  )
  on conflict (user_id) do update
    set destination = excluded.destination, minutes = excluded.minutes, geog = excluded.geog,
        updated_at = now(), expires_at = excluded.expires_at;
end;
$$;

create function public.clear_walk_offer()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.walk_offers where user_id = (select auth.uid());
$$;

-- Verified students heading out near me who allow me to see them.
create function public.nearby_walkers(p_lat double precision, p_lng double precision)
returns table (user_id uuid, first_name text, initials text, destination text, minutes_away integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_gender text;
  my_institution text;
  here extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
begin
  if not public.is_verified_student(me) then
    raise exception 'Walk together is for verified students.' using errcode = '42501';
  end if;
  select p.gender, lower(trim(p.institution)) into my_gender, my_institution from public.profiles p where p.user_id = me;

  return query
  select
    o.user_id,
    split_part(trim(p.full_name), ' ', 1),
    upper(left(split_part(trim(p.full_name), ' ', 1), 2)),
    o.destination,
    greatest(1, round(extensions.st_distance(o.geog, here) / 80.0))::integer
  from public.walk_offers o
  join public.profiles p on p.user_id = o.user_id
  where o.user_id <> me
    and o.expires_at > now()
    and p.walk_visible
    and extensions.st_dwithin(o.geog, here, 2000)
    and public.is_verified_student(o.user_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = me)
    )
    and case p.visibility
      when 'all' then true
      when 'women' then my_gender = 'Woman'
      when 'institution' then my_institution is not null and my_institution = lower(trim(p.institution))
      else false
    end
  order by extensions.st_distance(o.geog, here)
  limit 20;
end;
$$;

-- ------------------------------------------------------------------ walk requests
create type public.walk_request_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'started', 'ended');

create table public.walk_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  from_name text not null,
  to_name text not null,
  destination text not null,
  minutes_away integer,
  meeting_point text check (char_length(meeting_point) <= 120),
  status public.walk_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index walk_requests_from_idx on public.walk_requests (from_user, created_at desc);
create index walk_requests_to_idx on public.walk_requests (to_user, created_at desc);
alter table public.walk_requests enable row level security;

create policy "participants read their walk requests" on public.walk_requests
  for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

alter table public.walks
  add constraint walks_request_id_fkey foreign key (request_id) references public.walk_requests (id) on delete set null;
create index walks_request_id_idx on public.walks (request_id);

create function public.send_walk_request(p_to uuid, p_lat double precision, p_lng double precision, p_destination text)
returns public.walk_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target record;
  my_name text;
  r public.walk_requests;
begin
  select * into target from public.nearby_walkers(p_lat, p_lng) w where w.user_id = p_to;
  if not found then
    raise exception 'That student is no longer nearby.' using errcode = 'P0002';
  end if;
  select split_part(trim(full_name), ' ', 1) into my_name from public.profiles where user_id = me;

  update public.walk_requests set status = 'cancelled', updated_at = now()
  where from_user = me and status in ('pending', 'accepted');

  insert into public.walk_requests (from_user, to_user, from_name, to_name, destination, minutes_away)
  values (me, p_to, my_name, target.first_name, left(trim(p_destination), 60), target.minutes_away)
  returning * into r;
  return r;
end;
$$;

create function public.update_walk_request(p_id uuid, p_action text, p_meeting_point text default null)
returns public.walk_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r public.walk_requests;
begin
  select * into r from public.walk_requests where id = p_id and (from_user = me or to_user = me) for update;
  if not found then
    raise exception 'Walk request not found.' using errcode = 'P0002';
  end if;

  if p_action = 'accept' and r.to_user = me and r.status = 'pending' then
    update public.walk_requests set status = 'accepted', updated_at = now() where id = p_id returning * into r;
  elsif p_action = 'decline' and r.to_user = me and r.status = 'pending' then
    update public.walk_requests set status = 'declined', updated_at = now() where id = p_id returning * into r;
  elsif p_action = 'cancel' and r.status in ('pending', 'accepted') then
    update public.walk_requests set status = 'cancelled', updated_at = now() where id = p_id returning * into r;
  elsif p_action = 'meet' and r.status = 'accepted' and coalesce(trim(p_meeting_point), '') <> '' then
    update public.walk_requests set meeting_point = left(trim(p_meeting_point), 120), updated_at = now()
    where id = p_id returning * into r;
  elsif p_action = 'start' and r.status = 'accepted' and r.meeting_point is not null then
    update public.walk_requests set status = 'started', updated_at = now() where id = p_id returning * into r;
  elsif p_action = 'end' and r.status = 'started' then
    update public.walk_requests set status = 'ended', updated_at = now() where id = p_id returning * into r;
  else
    raise exception 'That walk request can''t be changed now.' using errcode = '22023';
  end if;
  return r;
end;
$$;

-- ------------------------------------------------------------------ access to functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.mark_formal_request() from public, anon, authenticated;
revoke execute on function public.is_verified_student(uuid) from public, anon, authenticated;
revoke execute on function public.am_i_verified() from public, anon;
revoke execute on function public.set_walk_offer(double precision, double precision, text, integer) from public, anon;
revoke execute on function public.clear_walk_offer() from public, anon;
revoke execute on function public.nearby_walkers(double precision, double precision) from public, anon;
revoke execute on function public.send_walk_request(uuid, double precision, double precision, text) from public, anon;
revoke execute on function public.update_walk_request(uuid, text, text) from public, anon;
grant execute on function public.am_i_verified() to authenticated;
grant execute on function public.set_walk_offer(double precision, double precision, text, integer) to authenticated;
grant execute on function public.clear_walk_offer() to authenticated;
grant execute on function public.nearby_walkers(double precision, double precision) to authenticated;
grant execute on function public.send_walk_request(uuid, double precision, double precision, text) to authenticated;
grant execute on function public.update_walk_request(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ realtime
alter publication supabase_realtime add table public.walk_requests, public.formal_requests, public.student_concerns;
