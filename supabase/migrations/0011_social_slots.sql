-- ============================================================================
-- RADAR — 0011_social_slots
-- The Spotify-playlists-for-life system (docs/SOCIAL-SLOTS-ANALYSIS.md):
--   * visibility tiers on profiles + slots (public / friends / private;
--     default 'friends' = exactly the pre-migration behavior)
--   * slot metadata: description + slot_tags (reuses the shared tag table)
--   * slot_likes (thumbs-up), profile_subscriptions, slot_subscriptions
--     (one-directional, no approval; slot subs track last_seen for "+N new")
--   * taste_match RPC — one privacy-safe overlap number, computed
--     server-side so affinity rows are never exposed
-- NOTE: profiles.display_name stays readable app-wide (parties/friends need
-- names); 'private' gates profile-page CONTENT via slot/engagement RLS.
-- ============================================================================

alter table profiles add column visibility text not null default 'friends'
  check (visibility in ('public', 'friends', 'private'));

alter table radar_slots add column visibility text not null default 'friends'
  check (visibility in ('public', 'friends', 'private'));
alter table radar_slots add column description text;

-- ---- slot read RLS: friends-only blanket → per-slot tiers ------------------

drop policy radar_slots_friend_read on radar_slots;
create policy radar_slots_visibility_read on radar_slots
  for select to authenticated
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'friends' and owner_id is not null and is_friend(owner_id))
  );

-- Items (and below: tags, likes) are readable iff the slot row is readable —
-- the subquery runs under the caller's radar_slots RLS.
drop policy radar_slot_items_friend_read on radar_slot_items;
create policy radar_slot_items_visibility_read on radar_slot_items
  for select to authenticated
  using (exists (select 1 from radar_slots s where s.id = slot_id));

-- ---- slot metadata tags ----------------------------------------------------

create table slot_tags (
  slot_id uuid not null references radar_slots(id) on delete cascade,
  tag_id  uuid not null references tags(id) on delete cascade,
  primary key (slot_id, tag_id)
);

alter table slot_tags enable row level security;
create policy slot_tags_read on slot_tags
  for select to authenticated
  using (exists (select 1 from radar_slots s where s.id = slot_id));
create policy slot_tags_owner_insert on slot_tags
  for insert to authenticated
  with check (exists (select 1 from radar_slots s where s.id = slot_id and s.owner_id = auth.uid()));
create policy slot_tags_owner_delete on slot_tags
  for delete to authenticated
  using (exists (select 1 from radar_slots s where s.id = slot_id and s.owner_id = auth.uid()));

-- ---- thumbs-up -------------------------------------------------------------

create table slot_likes (
  slot_id    uuid not null references radar_slots(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, user_id)
);

alter table slot_likes enable row level security;
create policy slot_likes_read on slot_likes
  for select to authenticated
  using (exists (select 1 from radar_slots s where s.id = slot_id));
create policy slot_likes_insert on slot_likes
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from radar_slots s where s.id = slot_id));
create policy slot_likes_delete on slot_likes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- profile subscriptions (follow someone's radar; no approval) ----------

create table profile_subscriptions (
  subscriber_id uuid not null references profiles(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, profile_id),
  check (subscriber_id <> profile_id)
);

alter table profile_subscriptions enable row level security;
create policy profile_subscriptions_read on profile_subscriptions
  for select to authenticated
  using (subscriber_id = auth.uid() or profile_id = auth.uid());
create policy profile_subscriptions_insert on profile_subscriptions
  for insert to authenticated
  with check (subscriber_id = auth.uid());
create policy profile_subscriptions_delete on profile_subscriptions
  for delete to authenticated
  using (subscriber_id = auth.uid());

-- ---- slot subscriptions (save someone's slot to your radar, read-only) -----
-- Custom slots only (role slots excluded); the visibility RLS on the insert
-- subquery means you can only subscribe to slots you can currently see.
-- last_seen_at powers the "+N new since you looked" badge.

create table slot_subscriptions (
  subscriber_id uuid not null references profiles(id) on delete cascade,
  slot_id       uuid not null references radar_slots(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (subscriber_id, slot_id)
);

alter table slot_subscriptions enable row level security;
create policy slot_subscriptions_read on slot_subscriptions
  for select to authenticated
  using (
    subscriber_id = auth.uid()
    or exists (select 1 from radar_slots s where s.id = slot_id and s.owner_id = auth.uid())
  );
create policy slot_subscriptions_insert on slot_subscriptions
  for insert to authenticated
  with check (
    subscriber_id = auth.uid()
    and exists (
      select 1 from radar_slots s
      where s.id = slot_id
        and s.owner_id <> auth.uid()
        and s.config->>'role' is null
    )
  );
create policy slot_subscriptions_update on slot_subscriptions
  for update to authenticated
  using (subscriber_id = auth.uid());
create policy slot_subscriptions_delete on slot_subscriptions
  for delete to authenticated
  using (subscriber_id = auth.uid());

-- ---- taste match (idea #6) -------------------------------------------------
-- Cosine similarity over tag affinities, returned as 0–100. SECURITY DEFINER
-- so no affinity rows leak; only answers for friends or public profiles.

create or replace function taste_match(p_other uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v int;
begin
  if auth.uid() is null or p_other = auth.uid() then return null; end if;
  if not (
    is_friend(p_other)
    or exists (select 1 from profiles where id = p_other and visibility = 'public')
  ) then
    return null;
  end if;

  with mine as (select tag_id, weight from user_tag_affinities where user_id = auth.uid()),
  theirs as (select tag_id, weight from user_tag_affinities where user_id = p_other),
  dot as (select coalesce(sum(m.weight * t.weight), 0) as d from mine m join theirs t using (tag_id)),
  n1 as (select sqrt(coalesce(sum(weight * weight), 0)) as v from mine),
  n2 as (select sqrt(coalesce(sum(weight * weight), 0)) as v from theirs)
  select case
           when n1.v = 0 or n2.v = 0 then null
           else round(100 * greatest(0, dot.d / (n1.v * n2.v)))::int
         end
  into v
  from dot, n1, n2;
  return v;
end $$;

grant execute on function taste_match(uuid) to authenticated;
