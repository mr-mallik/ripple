-- Ripple is now general women's safety support, not just for one campus.
--
-- * A "verified user" is any confirmed individual account (no longer only
--   university emails). Walk together is open to verified users.
-- * Walk together visibility: all verified users, students only, my trusted
--   contacts only, women only, or hidden.
-- * Formal reports collect details about the person affected and the incident.

-- ------------------------------------------------------------------ verified users
create or replace function public.is_verified_user(p_user uuid)
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
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
  );
$$;

create or replace function public.am_i_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_verified_user((select auth.uid()));
$$;

-- Phone numbers compared by their last 10 digits, so 07… and +447… match.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '');
$$;

-- ------------------------------------------------------------------ visibility options
alter table public.profiles drop constraint if exists profiles_visibility_check;
update public.profiles set visibility = 'students' where visibility = 'institution';
alter table public.profiles
  add constraint profiles_visibility_check check (visibility in ('all', 'students', 'contacts', 'women', 'hidden'));

create or replace function public.set_walk_offer(p_lat double precision, p_lng double precision, p_destination text, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_verified_user(me) then
    raise exception 'Walk together is for verified users.' using errcode = '42501';
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

-- Verified users heading out near me who allow me to see them.
create or replace function public.nearby_walkers(p_lat double precision, p_lng double precision)
returns table (user_id uuid, first_name text, initials text, destination text, minutes_away integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_gender text;
  my_phone text;
  me_student boolean;
  here extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
begin
  if not public.is_verified_user(me) then
    raise exception 'Walk together is for verified users.' using errcode = '42501';
  end if;
  select p.gender, public.phone_key(p.contact_number) into my_gender, my_phone from public.profiles p where p.user_id = me;
  me_student := public.is_verified_student(me);

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
    and public.is_verified_user(o.user_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = me)
    )
    and case p.visibility
      when 'all' then true
      when 'students' then me_student
      when 'women' then my_gender = 'Woman'
      when 'contacts' then my_phone is not null and exists (
        select 1 from public.trusted_contacts tc
        where tc.owner_id = o.user_id and public.phone_key(tc.phone) = my_phone
      )
      else false
    end
  order by extensions.st_distance(o.geog, here)
  limit 20;
end;
$$;

-- ------------------------------------------------------------------ formal reports
alter table public.formal_requests
  add column age integer check (age between 1 and 120),
  add column gender text check (gender in ('Female', 'Male', 'Prefer not to say')),
  add column address text check (char_length(address) <= 300),
  add column incident_date date,
  add column incident_place text check (char_length(incident_place) <= 200);
alter table public.formal_requests alter column preferred_contact set default 'either';

-- ------------------------------------------------------------------ access
revoke execute on function public.is_verified_user(uuid) from public, anon, authenticated;
revoke execute on function public.phone_key(text) from public, anon;
revoke execute on function public.am_i_verified() from public, anon;
grant execute on function public.am_i_verified() to authenticated;
