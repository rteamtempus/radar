-- ============================================================================
-- RADAR — 0017_location_layer
-- The location suite's schema (docs/LOCATION-ANALYSIS.md). Locations are
-- always PICKED from Places autocomplete and stored as a small jsonb
-- `{name, place_id, lat, lng}` — city granularity for profiles (G2: never a
-- raw GPS fix), city granularity for slots and adventures.
--
-- DELIBERATE DEVIATION from the analysis doc: no PostGIS yet. At POC scale a
-- plain haversine over jsonb lat/lng is plenty, keeps generated types clean,
-- and avoids an extension migration mid-flight. The 0001 "TODO postgis"
-- upgrade path stands for when row counts demand real spatial indexes.
--
-- Every cross-member read here is a SECURITY DEFINER RPC (CLAUDE.md § Quests
-- 1 — RLS is untouched). All discovery RPCs return PUBLIC content only (G1)
-- and filter user_blocks both directions (0016).
-- ============================================================================

-- ---- columns ---------------------------------------------------------------

-- profiles.home_location (jsonb, 0001) is reused: {name, place_id, lat, lng}.
alter table profiles add column geo_discoverable boolean not null default false;

alter table radar_slots add column location jsonb;   -- {name, place_id, lat, lng}

alter table adventures add column location   jsonb;  -- {name, place_id, lat, lng}
alter table adventures add column starts_on  date;   -- dates, not timestamps (no tz math)
alter table adventures add column ends_on    date;
alter table adventures add column visibility text not null default 'members'
  check (visibility in ('members', 'friends'));      -- NEVER 'public' (Rory 2026-08-01)

-- ---- distance --------------------------------------------------------------

create or replace function haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  ));
$$;

grant execute on function haversine_km(double precision, double precision, double precision, double precision) to authenticated;

-- ---- discovery: public slots near a point ----------------------------------
-- PUBLIC, non-role, non-empty slots with a location inside the radius.
-- is_local: badge-worthy only when the owner opted into geo discovery AND
-- their home city sits within 40 km of the slot's city (G2: opt-in gates any
-- statement about where an owner lives).

create or replace function slots_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 50,
  p_domain text default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_domain is not null and p_domain not in ('watch', 'eat', 'do', 'read') then
    raise exception 'Unknown domain';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.like_count desc, x.distance_km), '[]'::jsonb)
  into v_result
  from (
    select s.id, s.name, s.emoji, s.description,
           s.owner_id, p.display_name as owner_name,
           s.location->>'name' as loc_name,
           (s.location->>'lat')::double precision as lat,
           (s.location->>'lng')::double precision as lng,
           round(haversine_km(p_lat, p_lng,
             (s.location->>'lat')::double precision,
             (s.location->>'lng')::double precision)::numeric, 1) as distance_km,
           coalesce(s.config->>'domain', 'watch') as domain,
           (select count(*)::int from radar_slot_items i where i.slot_id = s.id) as item_count,
           (select count(*)::int from slot_likes l where l.slot_id = s.id) as like_count,
           (p.geo_discoverable
             and p.home_location is not null
             and haversine_km(
               (p.home_location->>'lat')::double precision,
               (p.home_location->>'lng')::double precision,
               (s.location->>'lat')::double precision,
               (s.location->>'lng')::double precision) < 40) as is_local,
           (select jsonb_agg(a.image_url order by i.position)
            from (select i2.activity_id, i2.position from radar_slot_items i2
                  where i2.slot_id = s.id order by i2.position limit 4) i
            join activities a on a.id = i.activity_id) as images
    from radar_slots s
    join profiles p on p.id = s.owner_id
    where s.visibility = 'public'
      and s.config->>'role' is null
      and s.owner_id <> auth.uid()
      and s.location is not null
      and (p_domain is null or coalesce(s.config->>'domain', 'watch') = p_domain)
      and haversine_km(p_lat, p_lng,
            (s.location->>'lat')::double precision,
            (s.location->>'lng')::double precision) <= p_radius_km
      and not exists (select 1 from user_blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = s.owner_id)
                         or (b.blocker_id = s.owner_id and b.blocked_id = auth.uid()))
      and exists (select 1 from radar_slot_items i where i.slot_id = s.id)
    limit 100
  ) x;

  return v_result;
end $$;

grant execute on function slots_near(double precision, double precision, double precision, text) to authenticated;

-- ---- discovery: people in a city -------------------------------------------
-- OPT-IN ONLY (geo_discoverable, default false) and public profiles only.
-- match = taste_match() (0016 confidence floor applies: null = "not enough
-- data"). Ordered best-match first.

create or replace function people_in_city(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 50
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(
    jsonb_agg(row_to_json(x)::jsonb order by x.match desc nulls last, x.distance_km),
    '[]'::jsonb)
  into v_result
  from (
    select p.id, p.display_name,
           p.home_location->>'name' as home_name,
           round(haversine_km(p_lat, p_lng,
             (p.home_location->>'lat')::double precision,
             (p.home_location->>'lng')::double precision)::numeric, 1) as distance_km,
           taste_match(p.id) as match,
           (select count(*)::int from radar_slots s
            where s.owner_id = p.id and s.visibility = 'public'
              and s.config->>'role' is null) as public_slot_count
    from profiles p
    where p.geo_discoverable
      and p.visibility = 'public'
      and p.id <> auth.uid()
      and p.home_location is not null
      and haversine_km(p_lat, p_lng,
            (p.home_location->>'lat')::double precision,
            (p.home_location->>'lng')::double precision) <= p_radius_km
      and not exists (select 1 from user_blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
                         or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
    limit 50
  ) x;

  return v_result;
end $$;

grant execute on function people_in_city(double precision, double precision, double precision) to authenticated;

-- ---- discovery: city guide -------------------------------------------------
-- "What to eat/do in <city>, according to Radar": places inside the radius
-- ranked by how many PUBLIC slots hold them (saves), with slot provenance.

create or replace function city_guide(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 50,
  p_domain text default 'eat'
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_type text;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_domain not in ('eat', 'do') then raise exception 'City guides cover eat and do'; end if;
  v_type := case p_domain when 'eat' then 'restaurant' else 'outing' end;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.saves desc, x.rating desc nulls last), '[]'::jsonb)
  into v_result
  from (
    select a.id, a.title, a.image_url, a.type,
           (a.metadata->>'rating')::numeric as rating,
           (a.metadata->>'rating_count')::int as rating_count,
           (a.metadata->>'price_level')::int as price_level,
           a.metadata->>'address' as address,
           (a.location->>'lat')::double precision as lat,
           (a.location->>'lng')::double precision as lng,
           round(haversine_km(p_lat, p_lng,
             (a.location->>'lat')::double precision,
             (a.location->>'lng')::double precision)::numeric, 1) as distance_km,
           count(distinct s.id)::int as saves,
           (array_agg(distinct s.name))[1:3] as slot_names
    from activities a
    join radar_slot_items i on i.activity_id = a.id
    join radar_slots s on s.id = i.slot_id
    join profiles op on op.id = s.owner_id
    where a.type = v_type
      and a.location is not null
      and s.visibility = 'public'
      and s.config->>'role' is null
      and haversine_km(p_lat, p_lng,
            (a.location->>'lat')::double precision,
            (a.location->>'lng')::double precision) <= p_radius_km
      and not exists (select 1 from user_blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = s.owner_id)
                         or (b.blocker_id = s.owner_id and b.blocked_id = auth.uid()))
    group by a.id
    limit 60
  ) x;

  return v_result;
end $$;

grant execute on function city_guide(double precision, double precision, double precision, text) to authenticated;

-- ---- friends' upcoming trips -----------------------------------------------
-- Adventures a FRIEND owns, marked visibility='friends', still planning and
-- not past. Summary only — friends see the trip exists; joining still takes
-- the code. Excludes adventures I'm already in (those are in my own list).

create or replace function friend_trips()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.starts_on nulls last), '[]'::jsonb)
  into v_result
  from (
    select a.id, a.name, a.emoji,
           a.location->>'name' as loc_name,
           a.starts_on, a.ends_on,
           a.owner_id, p.display_name as owner_name,
           (select count(*)::int from adventure_members m where m.adventure_id = a.id) as member_count
    from adventures a
    join profiles p on p.id = a.owner_id
    where a.visibility = 'friends'
      and a.status = 'planning'
      and is_friend(a.owner_id)
      and not is_adventure_member(a.id)
      and (a.ends_on is null or a.ends_on >= current_date)
    limit 20
  ) x;

  return v_result;
end $$;

grant execute on function friend_trips() to authenticated;

-- ---- trip-triggered friend nudge (LOCATION-ANALYSIS idea 9) ----------------
-- When a friends-visible adventure gains a location, tell each friend who has
-- saved content near that city: "Dave is planning Tokyo — you have 12 places
-- there." Re-firing updates in place via group_key (CLAUDE.md § Notifications
-- 3). UPDATE-only: adventure_create never sets a location, so there is no
-- INSERT path to cover.

create or replace function notify_friend_trip()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f record;
  v_count int;
begin
  if new.location is null or new.visibility <> 'friends' or new.status <> 'planning' then
    return new;
  end if;
  if old.location is not distinct from new.location
     and old.visibility is not distinct from new.visibility then
    return new;
  end if;

  for f in
    select case when c.user_id = new.owner_id then c.friend_id else c.user_id end as friend_id
    from connections c
    where c.status = 'accepted'
      and (c.user_id = new.owner_id or c.friend_id = new.owner_id)
  loop
    -- their own saved things near the trip city (their data, their nudge)
    select count(distinct i.activity_id) into v_count
    from radar_slots s
    join radar_slot_items i on i.slot_id = s.id
    join activities a on a.id = i.activity_id
    where s.owner_id = f.friend_id
      and a.location is not null
      and haversine_km(
        (new.location->>'lat')::double precision,
        (new.location->>'lng')::double precision,
        (a.location->>'lat')::double precision,
        (a.location->>'lng')::double precision) <= 80;

    if v_count > 0 then
      perform notify_user(
        f.friend_id,
        new.owner_id,
        'friend_trip',
        'adventure',
        new.id::text,
        '/friends/' || new.owner_id,
        jsonb_build_object(
          'adventure_name', new.name,
          'emoji', new.emoji,
          'city', new.location->>'name',
          'starts_on', new.starts_on,
          'nearby_count', v_count
        ),
        'trip:' || new.id
      );
    end if;
  end loop;

  return new;
end $$;

create trigger adventures_notify_friend_trip
  after update on adventures
  for each row execute function notify_friend_trip();
