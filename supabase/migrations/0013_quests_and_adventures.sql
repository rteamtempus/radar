-- ============================================================================
-- RADAR — 0013_quests_and_adventures
--
-- Quests, rebuilt. The old flow (TMDB discover + hard constraints + a Gemini
-- rerank) produced lacklustre decks, so the pool is now simply THE SLOTS
-- PEOPLE PICK. No AI, no external calls, no constraints:
--
--   choose a domain → everyone picks up to 3 slots (their own, ones they
--   saved, or another member's) → swipe every activity in the union →
--   vote → the winner is drawn at random from whatever tied at the top.
--
-- Adventures group quests into an itinerary (movie marathon, date night,
-- weekend trip): one roster, one join code, ordered + optionally scheduled
-- quests, and a recap when it's done.
--
-- ── Why RPCs instead of RLS for cross-member slot reads ────────────────────
-- Quest members can be strangers who joined by code, and Explore's slot
-- discovery (`searchSlots`) deliberately relies on radar_slots RLS alone.
-- Widening that policy so co-members can see each other's slots would leak
-- friends-only slots into public discovery — the exact failure mode the 0008
-- audit lesson warns about. So radar_slots RLS is UNTOUCHED here, and the
-- picker reads through `quest_slot_options()`, a SECURITY DEFINER function
-- that applies its own visibility rules:
--
--   * a member's own slots, EXCEPT ones they marked 'private' (the one
--     explicit "just me" promise the app has already made to users)
--   * slots a member saved from someone else (they're on that member's radar)
--
-- INTERIM RULE, pending the visibility system Rory wants to design: private
-- slots are never offered to other members. The owner can't contribute their
-- own private slot either — make it friends-only first.
--
-- party_slots denormalises the slot's name/emoji/owner so the lobby can show
-- everyone's picks without any member needing read access to the underlying
-- radar_slots row.
-- ============================================================================

-- ---- quests: what a quest is about ----------------------------------------
-- activity_type + constraints stay on the table (old rows reference them) but
-- are no longer read: `domain` replaces both.

alter table parties add column domain text
  check (domain in ('watch', 'eat', 'do', 'read'));
alter table parties add column title text;
alter table parties add column adventure_id uuid;
alter table parties add column position int not null default 0;
alter table parties add column scheduled_at timestamptz;   -- null = unscheduled
alter table parties add column scheduled_end timestamptz;

update parties set domain = 'watch' where domain is null;

-- ---- the slots contributed to a quest --------------------------------------

create table party_slots (
  party_id   uuid not null references parties(id) on delete cascade,
  slot_id    uuid not null references radar_slots(id) on delete cascade,
  member_id  uuid not null references party_members(id) on delete cascade,
  -- denormalised so every member can render the pick without reading the slot
  slot_name  text not null,
  slot_emoji text,
  owner_name text,
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  primary key (party_id, slot_id)
);

create index party_slots_member_idx on party_slots(member_id);

alter table party_slots enable row level security;

-- Readable by anyone in the quest; written only through the RPCs below
-- (which enforce the 3-per-member cap and the visibility rules).
create policy party_slots_member_read on party_slots
  for select to authenticated using (is_party_member(party_id));

alter publication supabase_realtime add table party_slots;

-- ---- what can I pick? ------------------------------------------------------
-- Returns every slot pickable for this quest: each member's own non-private
-- slots in the quest's domain, plus slots they've saved from other people.
-- SECURITY DEFINER — it is the visibility boundary, so it filters explicitly.

create or replace function quest_slot_options(p_party_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_domain text;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_party_member(p_party_id) then raise exception 'Not in this quest'; end if;

  select coalesce(domain, 'watch') into v_domain from parties where id = p_party_id;

  with members as (
    select pm.user_id, pm.id as member_id, p.display_name
    from party_members pm
    join profiles p on p.id = pm.user_id
    where pm.party_id = p_party_id and pm.user_id is not null
  ),
  -- a member's own slots (never their private ones)
  own as (
    select s.id, s.name, s.emoji, s.visibility, s.config,
           m.user_id as via_user, m.display_name as via_name,
           p.display_name as owner_name, false as saved
    from members m
    join radar_slots s on s.owner_id = m.user_id
    join profiles p on p.id = s.owner_id
    where s.visibility <> 'private'
      and coalesce(s.config->>'domain', 'watch') = v_domain
  ),
  -- slots a member saved from someone else — already on their radar
  saved as (
    select s.id, s.name, s.emoji, s.visibility, s.config,
           m.user_id as via_user, m.display_name as via_name,
           p.display_name as owner_name, true as saved
    from members m
    join slot_subscriptions ss on ss.subscriber_id = m.user_id
    join radar_slots s on s.id = ss.slot_id
    join profiles p on p.id = s.owner_id
    where s.visibility <> 'private'
      and coalesce(s.config->>'domain', 'watch') = v_domain
  ),
  pool as (select * from own union all select * from saved),
  -- one row per slot; if several members can offer it, credit the first
  deduped as (
    select distinct on (id) * from pool order by id, saved, via_user
  )
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.via_name, x.name), '[]'::jsonb)
  into v_result
  from (
    select d.id, d.name, d.emoji, d.visibility, d.owner_name, d.saved,
           d.via_user, d.via_name,
           coalesce(i.item_count, 0) as item_count,
           coalesce(i.items, '[]'::jsonb) as items
    from deduped d
    left join lateral (
      select count(*)::int as item_count,
             jsonb_agg(jsonb_build_object(
               'activity_id', a.id, 'title', a.title,
               'image_url', a.image_url, 'type', a.type
             ) order by rsi.position) as items
      from radar_slot_items rsi
      join activities a on a.id = rsi.activity_id
      where rsi.slot_id = d.id
    ) i on true
    where coalesce(i.item_count, 0) > 0
  ) x;

  return v_result;
end $$;

grant execute on function quest_slot_options(uuid) to authenticated;

-- ---- picking ---------------------------------------------------------------

create or replace function quest_pick_slot(p_party_id uuid, p_slot_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_status text;
  v_mine int;
  v_slot record;
  v_domain text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select id into v_member from party_members
  where party_id = p_party_id and user_id = auth.uid();
  if v_member is null then raise exception 'Not in this quest'; end if;

  select status::text, coalesce(domain, 'watch') into v_status, v_domain
  from parties where id = p_party_id;
  if v_status <> 'gathering' then raise exception 'This quest has already started'; end if;

  select count(*) into v_mine from party_slots
  where party_id = p_party_id and member_id = v_member;
  if v_mine >= 3 then raise exception 'You can pick at most 3 slots'; end if;

  -- Re-check pickability here rather than trusting the client: the same
  -- visibility rules as quest_slot_options, plus "must have items".
  select s.id, s.name, s.emoji, p.display_name as owner_name,
         (select count(*) from radar_slot_items i where i.slot_id = s.id) as item_count
    into v_slot
  from radar_slots s
  join profiles p on p.id = s.owner_id
  where s.id = p_slot_id
    and s.visibility <> 'private'
    and coalesce(s.config->>'domain', 'watch') = v_domain
    and (
      exists (select 1 from party_members pm
              where pm.party_id = p_party_id and pm.user_id = s.owner_id)
      or exists (select 1 from party_members pm
                 join slot_subscriptions ss on ss.subscriber_id = pm.user_id
                 where pm.party_id = p_party_id and ss.slot_id = s.id)
    );
  if not found then raise exception 'That slot is not available for this quest'; end if;
  if v_slot.item_count = 0 then raise exception 'That slot is empty'; end if;

  insert into party_slots (party_id, slot_id, member_id, slot_name, slot_emoji,
                           owner_name, item_count)
  values (p_party_id, p_slot_id, v_member, v_slot.name, v_slot.emoji,
          v_slot.owner_name, v_slot.item_count)
  on conflict (party_id, slot_id) do nothing;
end $$;

grant execute on function quest_pick_slot(uuid, uuid) to authenticated;

create or replace function quest_unpick_slot(p_party_id uuid, p_slot_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
begin
  select id into v_member from party_members
  where party_id = p_party_id and user_id = auth.uid();
  if v_member is null then raise exception 'Not in this quest'; end if;
  -- only the member who picked it can drop it
  delete from party_slots
  where party_id = p_party_id and slot_id = p_slot_id and member_id = v_member;
end $$;

grant execute on function quest_unpick_slot(uuid, uuid) to authenticated;

-- ---- starting: the deck is just the union of the picked slots --------------
-- No scoring, no filtering, no cap — "swipe every activity in every selected
-- slot" is the whole spec. presented_order is shuffled so the deck doesn't
-- open with one person's slot every time.

create or replace function quest_start(p_party_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_host uuid;
  v_count int;
begin
  select host_id into v_host from parties where id = p_party_id;
  if v_host is null then raise exception 'No such quest'; end if;
  if v_host <> auth.uid() then raise exception 'Only the host can start the quest'; end if;
  if not exists (select 1 from party_slots where party_id = p_party_id) then
    raise exception 'Pick at least one slot first';
  end if;

  insert into party_candidates (party_id, activity_id, final_score, presented_order)
  select p_party_id, x.activity_id, 0, row_number() over (order by random())
  from (
    select distinct i.activity_id
    from party_slots ps
    join radar_slot_items i on i.slot_id = ps.slot_id
    where ps.party_id = p_party_id
  ) x
  on conflict (party_id, activity_id) do nothing;

  select count(*) into v_count from party_candidates where party_id = p_party_id;
  update parties set status = 'swiping' where id = p_party_id;
  return v_count;
end $$;

grant execute on function quest_start(uuid) to authenticated;

-- Host: throw the deck away and go back to picking slots.
create or replace function quest_restart(p_party_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from parties where id = p_party_id and host_id = auth.uid()) then
    raise exception 'Only the host can restart the quest';
  end if;
  delete from party_candidates where party_id = p_party_id;  -- cascades swipes/votes/vetoes
  update parties
     set status = 'gathering', decided_activity_id = null, decided_at = null
   where id = p_party_id;
end $$;

grant execute on function quest_restart(uuid) to authenticated;

create or replace function quest_cancel(p_party_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from parties where id = p_party_id and host_id = auth.uid()) then
    raise exception 'Only the host can cancel the quest';
  end if;
  update parties set status = 'cancelled' where id = p_party_id;
end $$;

grant execute on function quest_cancel(uuid) to authenticated;

-- ============================================================================
-- ADVENTURES — an itinerary of quests with one roster and one code
-- ============================================================================

create table adventures (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  name         text not null,
  emoji        text,
  status       text not null default 'planning'
               check (status in ('planning', 'completed', 'cancelled')),
  join_code    text unique,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table adventure_members (
  adventure_id uuid not null references adventures(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         text not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (adventure_id, user_id)
);

alter table parties
  add constraint parties_adventure_id_fkey
  foreign key (adventure_id) references adventures(id) on delete set null;

create index parties_adventure_idx on parties(adventure_id, position);

create or replace function is_adventure_member(p_adventure_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from adventure_members am
    where am.adventure_id = p_adventure_id and am.user_id = auth.uid()
  );
$$;

grant execute on function is_adventure_member(uuid) to authenticated;

alter table adventures        enable row level security;
alter table adventure_members enable row level security;

create policy adventures_member_read on adventures
  for select to authenticated
  using (owner_id = auth.uid() or is_adventure_member(id));
create policy adventures_owner_update on adventures
  for update to authenticated using (owner_id = auth.uid());

create policy adventure_members_read on adventure_members
  for select to authenticated using (is_adventure_member(adventure_id));

alter publication supabase_realtime add table adventures;
alter publication supabase_realtime add table adventure_members;

-- ---- create from a quest ("Make it an adventure!") -------------------------

create or replace function adventure_create_from_party(p_party_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_adventure uuid;
  v_code text;
begin
  if not exists (select 1 from parties where id = p_party_id and host_id = auth.uid()) then
    raise exception 'Only the host can start an adventure';
  end if;
  if exists (select 1 from parties where id = p_party_id and adventure_id is not null) then
    raise exception 'This quest is already part of an adventure';
  end if;

  -- reuse the quest's code: everyone who already has it keeps working
  select join_code into v_code from parties where id = p_party_id;

  insert into adventures (owner_id, name, emoji, join_code)
  values (auth.uid(), coalesce(nullif(trim(p_name), ''), 'Our adventure'), '🗺️', v_code)
  returning id into v_adventure;

  insert into adventure_members (adventure_id, user_id, role)
  select v_adventure, pm.user_id, pm.role
  from party_members pm
  where pm.party_id = p_party_id and pm.user_id is not null
  on conflict do nothing;

  update parties set adventure_id = v_adventure, position = 0 where id = p_party_id;
  return v_adventure;
end $$;

grant execute on function adventure_create_from_party(uuid, text) to authenticated;

-- ---- join: one code puts you in the adventure AND all of its quests --------

create or replace function adventure_join_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_adventure uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into v_adventure from adventures
  where join_code = upper(trim(p_code)) and status = 'planning';
  if v_adventure is null then raise exception 'No adventure with that code'; end if;

  insert into adventure_members (adventure_id, user_id)
  values (v_adventure, auth.uid())
  on conflict do nothing;

  -- and into every quest in it, so nobody re-joins for day two
  insert into party_members (party_id, user_id)
  select p.id, auth.uid() from parties p
  where p.adventure_id = v_adventure
    and p.status not in ('completed', 'cancelled')
  on conflict (party_id, user_id) do nothing;

  return v_adventure;
end $$;

grant execute on function adventure_join_by_code(text) to authenticated;

-- ---- managing the itinerary ------------------------------------------------

create or replace function adventure_add_quest(
  p_adventure_id uuid, p_domain text, p_title text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_party uuid;
begin
  if not is_adventure_member(p_adventure_id) then raise exception 'Not in this adventure'; end if;
  if p_domain not in ('watch', 'eat', 'do', 'read') then raise exception 'Unknown domain'; end if;

  insert into parties (host_id, status, domain, title, adventure_id, position, decision_config)
  values (
    auth.uid(), 'gathering', p_domain, nullif(trim(p_title), ''), p_adventure_id,
    (select coalesce(max(position), -1) + 1 from parties where adventure_id = p_adventure_id),
    '{"votes_per_member": 3, "vetoes_per_member": 1}'::jsonb
  )
  returning id into v_party;

  -- the whole adventure roster is in every quest
  insert into party_members (party_id, user_id, role)
  select v_party, am.user_id,
         case when am.user_id = auth.uid() then 'host' else 'member' end
  from adventure_members am
  where am.adventure_id = p_adventure_id
  on conflict (party_id, user_id) do nothing;

  return v_party;
end $$;

grant execute on function adventure_add_quest(uuid, text, text) to authenticated;

create or replace function adventure_reorder(p_adventure_id uuid, p_party_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_adventure_member(p_adventure_id) then raise exception 'Not in this adventure'; end if;
  update parties p
     set position = idx.ord - 1
    from unnest(p_party_ids) with ordinality as idx(party_id, ord)
   where p.id = idx.party_id and p.adventure_id = p_adventure_id;
end $$;

grant execute on function adventure_reorder(uuid, uuid[]) to authenticated;

create or replace function adventure_schedule_quest(
  p_party_id uuid, p_start timestamptz, p_end timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_adventure uuid;
begin
  select adventure_id into v_adventure from parties where id = p_party_id;
  if v_adventure is null then raise exception 'That quest is not in an adventure'; end if;
  if not is_adventure_member(v_adventure) then raise exception 'Not in this adventure'; end if;
  update parties set scheduled_at = p_start, scheduled_end = p_end where id = p_party_id;
end $$;

grant execute on function adventure_schedule_quest(uuid, timestamptz, timestamptz) to authenticated;

/** Drop a quest from the itinerary. Undecided quests are deleted outright;
    decided ones are kept (they're history) and merely unlinked. */
create or replace function adventure_remove_quest(p_party_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_adventure uuid;
  v_status text;
begin
  select adventure_id, status::text into v_adventure, v_status
  from parties where id = p_party_id;
  if v_adventure is null then raise exception 'That quest is not in an adventure'; end if;
  if not is_adventure_member(v_adventure) then raise exception 'Not in this adventure'; end if;

  if v_status in ('decided', 'completed') then
    update parties set adventure_id = null where id = p_party_id;
  else
    delete from parties where id = p_party_id;
  end if;
end $$;

grant execute on function adventure_remove_quest(uuid) to authenticated;

create or replace function adventure_finish(p_adventure_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('completed', 'cancelled') then raise exception 'Unknown status'; end if;
  if not exists (
    select 1 from adventures where id = p_adventure_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the adventure host can do that';
  end if;

  update adventures
     set status = p_status, finished_at = now(), join_code = null
   where id = p_adventure_id;

  -- cancelling kills anything still in flight; completing leaves history alone
  if p_status = 'cancelled' then
    update parties set status = 'cancelled'
     where adventure_id = p_adventure_id
       and status not in ('decided', 'completed');
  end if;
end $$;

grant execute on function adventure_finish(uuid, text) to authenticated;
