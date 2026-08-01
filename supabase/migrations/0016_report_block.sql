-- ============================================================================
-- RADAR — 0016_report_block
-- Minimal safety layer, prerequisite for location-based stranger discovery
-- (docs/LOCATION-ANALYSIS.md G1/G2). Deliberately small:
--
--   * content_reports — flag a public slot or profile. Write-only for users;
--     Rory reviews via the Management API. No moderation pipeline yet.
--   * user_blocks — hide a person from MY discovery surfaces. This is UX
--     hiding, not security: their content stays public to others. Discovery
--     RPCs (0017) filter blocks server-side both ways; client Explore
--     queries filter with the loaded block list.
--
-- Also: taste_match gains a confidence floor (G7) — a cosine over <5 shared
-- tags reads as a wildly confident match ("97%") on no evidence; below the
-- floor it now returns null and the UI says "not enough data yet".
-- ============================================================================

create table content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('slot', 'profile')),
  target_id   uuid not null,
  reason      text,
  created_at  timestamptz not null default now()
);

alter table content_reports enable row level security;

create policy content_reports_insert on content_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());
-- Reporters can see their own reports (so re-reporting is visible to them);
-- nobody else reads via the API — review happens as postgres.
create policy content_reports_own_read on content_reports
  for select to authenticated
  using (reporter_id = auth.uid());

create table user_blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table user_blocks enable row level security;

create policy user_blocks_own_read on user_blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy user_blocks_insert on user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy user_blocks_delete on user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- ---- taste_match confidence floor (replaces 0011 version) ------------------
-- Identical cosine, but: fewer than 5 shared tags → null ("not enough data").

create or replace function taste_match(p_other uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v int;
  v_shared int;
begin
  if auth.uid() is null or p_other = auth.uid() then return null; end if;
  if not (
    is_friend(p_other)
    or exists (select 1 from profiles where id = p_other and visibility = 'public')
  ) then
    return null;
  end if;

  select count(*) into v_shared
  from user_tag_affinities a
  join user_tag_affinities b using (tag_id)
  where a.user_id = auth.uid() and b.user_id = p_other;
  if v_shared < 5 then return null; end if;

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
