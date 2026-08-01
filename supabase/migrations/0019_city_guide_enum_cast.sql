-- ============================================================================
-- RADAR — 0019_city_guide_enum_cast
-- Repair on 0017's city_guide: activities.type is the activity_type ENUM, and
-- `a.type = v_type` with a text variable raises 42883 at runtime (a literal
-- would implicit-cast; a variable does not). Cast the comparison.
-- ============================================================================

create or replace function city_guide(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 50,
  p_domain text default 'eat'
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_type activity_type;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_domain not in ('eat', 'do') then raise exception 'City guides cover eat and do'; end if;
  v_type := (case p_domain when 'eat' then 'restaurant' else 'outing' end)::activity_type;

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
