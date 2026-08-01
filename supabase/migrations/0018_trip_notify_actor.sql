-- ============================================================================
-- RADAR — 0018_trip_notify_actor
-- Repair on 0017's notify_friend_trip: the payload was missing actor_name,
-- which every notification payload must denormalise (CLAUDE.md §
-- Notifications 2 — rendering must never need a join the recipient's RLS
-- might refuse).
-- ============================================================================

create or replace function notify_friend_trip()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f record;
  v_count int;
  v_owner_name text;
begin
  if new.location is null or new.visibility <> 'friends' or new.status <> 'planning' then
    return new;
  end if;
  if old.location is not distinct from new.location
     and old.visibility is not distinct from new.visibility then
    return new;
  end if;

  select display_name into v_owner_name from profiles where id = new.owner_id;

  for f in
    select case when c.user_id = new.owner_id then c.friend_id else c.user_id end as friend_id
    from connections c
    where c.status = 'accepted'
      and (c.user_id = new.owner_id or c.friend_id = new.owner_id)
  loop
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
          'actor_name', v_owner_name,
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
