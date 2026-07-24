-- ============================================================================
-- RADAR — 0008_friends
-- Friends: friend codes on profiles, RLS for the dormant connections table,
-- friend visibility on engagements/slots, and two RPCs:
--   * add_friend_by_code — instant mutual friendship (code possession = consent)
--   * recommend_to_friend — drops a title into a friend's "Recommended to me"
--     slot and stamps recommended_by on their engagement card
-- Also: default slots get config.role so app features can find them by role
-- instead of by (renameable) name.
-- ============================================================================

-- ---- friend codes ----------------------------------------------------------

alter table profiles add column friend_code text unique;

update profiles set friend_code = upper(left(md5(id::text), 6))
where friend_code is null;

create or replace function set_friend_code()
returns trigger language plpgsql as $$
begin
  if new.friend_code is null then
    new.friend_code := upper(left(md5(new.id::text), 6));
  end if;
  return new;
end $$;

create trigger profiles_set_friend_code
  before insert on profiles
  for each row execute function set_friend_code();

-- ---- friendship helper -----------------------------------------------------

create or replace function is_friend(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from connections c
    where c.status = 'accepted'
      and ((c.user_id = auth.uid() and c.friend_id = p_user)
        or (c.user_id = p_user and c.friend_id = auth.uid()))
  );
$$;

grant execute on function is_friend(uuid) to authenticated;

-- ---- connections policies (table existed, was service-role-only) ----------
-- Directional rows: requester inserts (me → them, 'pending'); the target
-- accepts by updating status. add_friend_by_code short-circuits to 'accepted'.

create policy connections_select on connections
  for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
create policy connections_insert on connections
  for insert to authenticated
  with check (user_id = auth.uid() and user_id <> friend_id);
create policy connections_update on connections
  for update to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
create policy connections_delete on connections
  for delete to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

-- ---- friend visibility -----------------------------------------------------
-- Engagements: friends can READ rows the owner marked visibility='friends'
-- (the default). Slots + items: friends can read (POC: all slots are
-- friend-visible; revisit if private slots are wanted).

create policy user_engagements_friend_read on user_engagements
  for select to authenticated
  using (visibility = 'friends' and is_friend(user_id));

create policy radar_slots_friend_read on radar_slots
  for select to authenticated
  using (owner_id is not null and is_friend(owner_id));

create policy radar_slot_items_friend_read on radar_slot_items
  for select to authenticated
  using (exists (
    select 1 from radar_slots s
    where s.id = slot_id and s.owner_id is not null and is_friend(s.owner_id)
  ));

-- ---- add friend by code ----------------------------------------------------

create or replace function add_friend_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_friend uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into v_friend from profiles where friend_code = upper(trim(p_code));
  if v_friend is null then raise exception 'No one has that friend code'; end if;
  if v_friend = auth.uid() then raise exception 'That is your own code'; end if;

  -- accept any request they already sent me, else create/upgrade my row
  update connections set status = 'accepted'
  where user_id = v_friend and friend_id = auth.uid() and status = 'pending';
  if not found then
    insert into connections (user_id, friend_id, status)
    values (auth.uid(), v_friend, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
  end if;
  return v_friend;
end $$;

grant execute on function add_friend_by_code(text) to authenticated;

-- ---- recommend to a friend -------------------------------------------------

create or replace function recommend_to_friend(p_friend_id uuid, p_activity_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slot uuid;
  v_my_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_friend(p_friend_id) then raise exception 'You are not friends'; end if;

  select display_name into v_my_name from profiles where id = auth.uid();

  -- their "Recommended to me" slot (recreate if they deleted it)
  select id into v_slot from radar_slots
  where owner_id = p_friend_id and config->>'role' = 'recommended'
  limit 1;
  if v_slot is null then
    insert into radar_slots (owner_id, name, emoji, on_complete, position, config)
    values (
      p_friend_id, 'Recommended to me', '💡', 'remove',
      (select coalesce(max(position), -1) + 1 from radar_slots where owner_id = p_friend_id),
      '{"role": "recommended"}'::jsonb
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

grant execute on function recommend_to_friend(uuid, uuid) to authenticated;

-- ---- default-slot roles ----------------------------------------------------
-- Status-driven slots find their targets by config.role; tag any existing
-- default slots created before roles existed.

update radar_slots set config = jsonb_build_object('role',
  case name
    when 'Watching now' then 'watching'
    when 'Up next' then 'up_next'
    when 'Rewatch' then 'rewatch'
    when 'Recommended to me' then 'recommended'
  end)
where config = '{}'::jsonb
  and name in ('Watching now', 'Up next', 'Rewatch', 'Recommended to me');
