-- ============================================================================
-- RADAR — 0014_adventure_create
-- Adventures are a PLANNING tool: you set the itinerary up first, then add
-- quests to it. So they can now be created standalone (from the Quests tab)
-- instead of only by promoting an existing quest. Gets its own join code,
-- same unambiguous alphabet as quest codes.
-- (adventure_create_from_party stays in the schema but the app no longer
-- offers it — the promote-a-finished-quest flow was backwards.)
-- ============================================================================

create or replace function adventure_create(p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_adventure uuid;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- retry on the (unlikely) code collision
  for attempt in 1..5 loop
    select string_agg(substr(v_alphabet, floor(random() * 32)::int + 1, 1), '')
      into v_code from generate_series(1, 6);
    begin
      insert into adventures (owner_id, name, emoji, join_code)
      values (auth.uid(), coalesce(nullif(trim(p_name), ''), 'Our adventure'), '🗺️', v_code)
      returning id into v_adventure;
      exit;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;

  insert into adventure_members (adventure_id, user_id, role)
  values (v_adventure, auth.uid(), 'host')
  on conflict do nothing;

  return v_adventure;
end $$;

grant execute on function adventure_create(text) to authenticated;
