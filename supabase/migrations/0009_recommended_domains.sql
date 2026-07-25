-- ============================================================================
-- RADAR — 0009_recommended_domains
-- Bug fix: recommend_to_friend picked the friend's 'recommended' slot by role
-- alone, so restaurant recommendations landed in the WATCH list. The RPC is
-- now domain-aware (activity type → watch/eat slot, created with the right
-- domain tag when missing), and existing mis-filed restaurant items are moved
-- into each owner's eat-domain Recommended slot.
-- ============================================================================

create or replace function recommend_to_friend(p_friend_id uuid, p_activity_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slot uuid;
  v_my_name text;
  v_domain text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_friend(p_friend_id) then raise exception 'You are not friends'; end if;

  select display_name into v_my_name from profiles where id = auth.uid();
  select case when type = 'restaurant' then 'eat' else 'watch' end
    into v_domain from activities where id = p_activity_id;
  if v_domain is null then raise exception 'Unknown activity'; end if;

  -- their domain-matching "Recommended to me" slot (recreate if deleted)
  select id into v_slot from radar_slots
  where owner_id = p_friend_id
    and config->>'role' = 'recommended'
    and coalesce(config->>'domain', 'watch') = v_domain
  limit 1;
  if v_slot is null then
    insert into radar_slots (owner_id, name, emoji, on_complete, position, config)
    values (
      p_friend_id, 'Recommended to me', '💡', 'remove',
      (select coalesce(max(position), -1) + 1 from radar_slots where owner_id = p_friend_id),
      jsonb_build_object('role', 'recommended', 'domain', v_domain)
    )
    returning id into v_slot;
  end if;

  insert into radar_slot_items (slot_id, activity_id, position, added_by)
  values (
    v_slot, p_activity_id,
    (select coalesce(max(position), -1) + 1 from radar_slot_items where slot_id = v_slot),
    auth.uid()
  )
  on conflict (slot_id, activity_id) do nothing;

  -- stamp their card (never clobber an existing recommender)
  insert into user_engagements (user_id, activity_id, recommended_by, recommended_by_user_id, source)
  values (p_friend_id, p_activity_id, v_my_name, auth.uid(), 'recommendation')
  on conflict (user_id, activity_id) do update
    set recommended_by = coalesce(user_engagements.recommended_by, excluded.recommended_by),
        recommended_by_user_id = coalesce(user_engagements.recommended_by_user_id, excluded.recommended_by_user_id);
end $$;

-- ---- data fix: move restaurant items out of watch-domain Recommended slots
do $$
declare
  r record;
  v_slot uuid;
begin
  for r in
    select rsi.slot_id, rsi.activity_id, rsi.added_by, rsi.note, rs.owner_id
    from radar_slot_items rsi
    join radar_slots rs on rs.id = rsi.slot_id
    join activities a on a.id = rsi.activity_id
    where rs.config->>'role' = 'recommended'
      and coalesce(rs.config->>'domain', 'watch') = 'watch'
      and a.type = 'restaurant'
  loop
    select id into v_slot from radar_slots
    where owner_id = r.owner_id
      and config->>'role' = 'recommended'
      and config->>'domain' = 'eat'
    limit 1;
    if v_slot is null then
      insert into radar_slots (owner_id, name, emoji, on_complete, position, config)
      values (
        r.owner_id, 'Recommended to me', '💡', 'remove',
        (select coalesce(max(position), -1) + 1 from radar_slots where owner_id = r.owner_id),
        '{"role": "recommended", "domain": "eat"}'::jsonb
      )
      returning id into v_slot;
    end if;
    insert into radar_slot_items (slot_id, activity_id, position, added_by, note)
    values (
      v_slot, r.activity_id,
      (select coalesce(max(position), -1) + 1 from radar_slot_items where slot_id = v_slot),
      r.added_by, r.note
    )
    on conflict (slot_id, activity_id) do nothing;
    delete from radar_slot_items where slot_id = r.slot_id and activity_id = r.activity_id;
  end loop;
end $$;
