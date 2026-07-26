-- ============================================================================
-- RADAR — 0010_do_read_domains
-- Two new domains: "Do" (places to go — museums, mini golf…) reuses the
-- existing 'outing' activity type via Google Places; "Read" (books, Google
-- Books) needs a new enum value. recommend_to_friend learns the new domain
-- mapping (text comparison — the new enum value can't be referenced as a
-- literal in this transaction).
-- ============================================================================

alter type activity_type add value if not exists 'book';

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
  select case type::text
           when 'restaurant' then 'eat'
           when 'outing' then 'do'
           when 'book' then 'read'
           else 'watch'
         end
    into v_domain from activities where id = p_activity_id;
  if v_domain is null then raise exception 'Unknown activity'; end if;

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

  insert into user_engagements (user_id, activity_id, recommended_by, recommended_by_user_id, source)
  values (p_friend_id, p_activity_id, v_my_name, auth.uid(), 'recommendation')
  on conflict (user_id, activity_id) do update
    set recommended_by = coalesce(user_engagements.recommended_by, excluded.recommended_by),
        recommended_by_user_id = coalesce(user_engagements.recommended_by_user_id, excluded.recommended_by_user_id);
end $$;
