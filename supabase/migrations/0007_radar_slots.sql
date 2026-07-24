-- ============================================================================
-- RADAR — 0007_radar_slots
-- Slots: curated, ACTIVE queues ("high movies", rewatch, date night) — the
-- core new concept from docs/IDEAS-ANALYSIS.md §2. Items auto-leave on
-- completion per the slot's on_complete ('remove'), cycle to the back
-- ('loop'), or stay put ('keep').
-- POC RLS is owner-only; group_id is in place for shared/family radars
-- (Phase C, migration 0008 will open group policies).
-- ============================================================================

create table radar_slots (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles(id) on delete cascade,
  group_id    uuid references groups(id) on delete cascade,
  name        text not null,
  emoji       text,
  position    int not null default 0,
  on_complete text not null default 'remove'
              check (on_complete in ('remove', 'loop', 'keep')),
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  check (owner_id is not null or group_id is not null)
);

create table radar_slot_items (
  slot_id     uuid not null references radar_slots(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  position    int not null default 0,
  added_by    uuid references profiles(id),
  note        text,
  added_at    timestamptz not null default now(),
  primary key (slot_id, activity_id)
);

create index radar_slot_items_activity_idx on radar_slot_items(activity_id);

alter table radar_slots      enable row level security;
alter table radar_slot_items enable row level security;

create policy radar_slots_all on radar_slots
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy radar_slot_items_all on radar_slot_items
  for all to authenticated
  using (exists (select 1 from radar_slots s where s.id = slot_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from radar_slots s where s.id = slot_id and s.owner_id = auth.uid()));
