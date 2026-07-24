-- ============================================================================
-- PARTYPICK POC — 0001_init
-- ----------------------------------------------------------------------------
-- Source: docs/activity-app-schema.sql (the "everything is an Activity" core
-- schema) with the POC adjustments from docs/partypick-poc-handoff.md §5:
--   * geography columns → jsonb           (-- TODO postgis when outings land)
--   * vector(768) columns kept, HNSW index NOT created (embeddings stay null)
--   * tables reordered so FK targets exist (tags before user_tag_affinities)
--   * RLS enabled on every table + POC policies (bottom of file)
--   * join_party + recompute_affinities RPCs
-- This SQL is PostgreSQL — editor T-SQL lint errors are false positives.
-- ============================================================================

create extension if not exists vector;      -- pgvector (Supabase built-in)
-- TODO postgis: create extension postgis; and restore geography(point) on
-- profiles.home_location / activities.location when outings/geo land.

-- ============================================================================
-- ENUMS
-- ============================================================================

create type activity_type as enum (
  'movie', 'tv_show', 'restaurant', 'live_performance', 'outing', 'custom'
);

create type engagement_status as enum (
  'want_to', 'in_progress', 'completed', 'abandoned', 'not_interested'
);

create type party_status as enum (
  'gathering', 'swiping', 'voting', 'decided', 'completed', 'cancelled'
);

create type offer_type as enum ('subscription', 'free', 'ads', 'rent', 'buy');

create type swipe_direction as enum ('left', 'right', 'super');

create type tag_kind as enum (
  'genre', 'cuisine', 'performance_type', 'vibe', 'theme',
  'content_warning', 'dietary', 'accessibility'
);

-- ============================================================================
-- USERS & PROFILES
-- ============================================================================

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  home_location jsonb,                   -- TODO postgis: geography(point)
  home_region   text default 'US',
  taste_embedding vector(768),           -- stays null in POC
  taste_embedding_updated_at timestamptz,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- One tag vocabulary across all activity types. 'vibe' tags bridge mood
-- check-ins and activities of any type.
create table tags (
  id    uuid primary key default gen_random_uuid(),
  kind  tag_kind not null,
  slug  text not null,
  label text not null,
  unique (kind, slug)
);

-- Hard constraints, applied as SQL filters BEFORE scoring.
create table user_dealbreakers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  value      jsonb not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Soft, weighted preferences (learned + user-editable). -1 avoid .. 1 love.
create table user_tag_affinities (
  user_id    uuid not null references profiles(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  weight     real not null default 0 check (weight between -1 and 1),
  source     text not null default 'learned',  -- 'learned' | 'explicit'
  updated_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

-- Social graph — table exists, POC skips it entirely (join codes only).
create table connections (
  user_id      uuid not null references profiles(id) on delete cascade,
  friend_id    uuid not null references profiles(id) on delete cascade,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- Persistent groups — tables exist, UI later.
create table groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid not null references profiles(id),
  group_embedding vector(768),
  created_at      timestamptz not null default now()
);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  primary key (group_id, user_id)
);

-- ============================================================================
-- ACTIVITIES (the universal catalog)
-- ============================================================================

create table activities (
  id            uuid primary key default gen_random_uuid(),
  type          activity_type not null,
  title         text not null,
  description   text,
  image_url     text,
  duration_min  int,
  cost_level    smallint check (cost_level between 0 and 4),
  external_source text,          -- 'tmdb' | 'watchmode' | 'user' | ...
  external_id     text,          -- tmdb: '<movie|tv>-<id>', e.g. 'movie-603'
  metadata      jsonb not null default '{}'::jsonb,
  embedding     vector(768),     -- stays null in POC (no HNSW index yet)
  location      jsonb,           -- TODO postgis: geography(point)
  created_by    uuid references profiles(id),
  is_public     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (external_source, external_id)
);

create index activities_type_idx     on activities(type);
create index activities_metadata_idx on activities using gin (metadata);
-- TODO (post-POC): hnsw index on embedding once embeddings are populated.

create table activity_tags (
  activity_id uuid not null references activities(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  primary key (activity_id, tag_id)
);

-- Media extension: POC tracks season granularity only; media_episodes stays empty.
create table media_seasons (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references activities(id) on delete cascade,
  season_number int not null,
  episode_count int,
  air_date      date,
  unique (activity_id, season_number)
);

create table media_episodes (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references media_seasons(id) on delete cascade,
  episode_number int not null,
  title          text,
  runtime_min    int,
  air_date       date,
  unique (season_id, episode_number)
);

-- ============================================================================
-- STREAMING AVAILABILITY
-- ============================================================================

create table streaming_services (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique,
  name     text not null,
  logo_url text,
  watchmode_id int,
  tmdb_provider_id int
);

create table user_subscriptions (
  user_id    uuid not null references profiles(id) on delete cascade,
  service_id uuid not null references streaming_services(id) on delete cascade,
  is_active  boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, service_id)
);

create table activity_availability (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null references activities(id) on delete cascade,
  service_id      uuid not null references streaming_services(id) on delete cascade,
  region          text not null default 'US',
  offer           offer_type not null,
  price_cents     int,
  deeplink_url    text,
  available_since date,
  leaving_at      date,
  last_checked_at timestamptz not null default now(),
  unique (activity_id, service_id, region, offer)
);

create index availability_leaving_idx on activity_availability(leaving_at)
  where leaving_at is not null;

-- ============================================================================
-- ENGAGEMENT (the personal library)
-- ============================================================================

create table user_engagements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  activity_id  uuid not null references activities(id) on delete cascade,
  status       engagement_status not null default 'want_to',
  rating       smallint check (rating between 1 and 10),
  review       text,
  is_rewatchable boolean,
  context      jsonb not null default '{}'::jsonb,
  source       text not null default 'manual',
  visibility   text not null default 'friends',
  started_at   timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (user_id, activity_id)
);

create index engagements_user_status_idx on user_engagements(user_id, status);

create table episode_progress (
  user_id    uuid not null references profiles(id) on delete cascade,
  episode_id uuid not null references media_episodes(id) on delete cascade,
  watched_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

-- ============================================================================
-- PARTIES (the decision funnel)
-- ============================================================================

create table parties (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references profiles(id),
  group_id      uuid references groups(id),
  status        party_status not null default 'gathering',
  activity_type activity_type,
  constraints   jsonb not null default '{}'::jsonb,
  decision_config jsonb not null default '{}'::jsonb,
  join_code     text unique,
  decided_activity_id uuid references activities(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- POC: everyone signs up; guest_name/guest_profile stay unused.
create table party_members (
  id            uuid primary key default gen_random_uuid(),
  party_id      uuid not null references parties(id) on delete cascade,
  user_id       uuid references profiles(id) on delete cascade,
  guest_name    text,
  guest_profile jsonb,
  role          text not null default 'member',   -- 'host' | 'member'
  joined_at     timestamptz not null default now(),
  check (user_id is not null or guest_name is not null),
  unique (party_id, user_id)
);

create table party_mood_checkins (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references party_members(id) on delete cascade,
  energy      smallint check (energy between 1 and 5),
  mood_tags   uuid[] not null default '{}',      -- tag ids, kind='vibe'
  free_text   text,
  created_at  timestamptz not null default now()
);

-- score_breakdown caches WHY (per-member scores keyed by user id, taste_min,
-- mood_match, ai rank...) so the UI can explain picks and the scorer is tunable.
create table party_candidates (
  id              uuid primary key default gen_random_uuid(),
  party_id        uuid not null references parties(id) on delete cascade,
  activity_id     uuid not null references activities(id) on delete cascade,
  final_score     real,
  score_breakdown jsonb not null default '{}'::jsonb,
  ai_blurb        text,
  presented_order int,
  created_at      timestamptz not null default now(),
  unique (party_id, activity_id)
);

create table party_swipes (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references party_candidates(id) on delete cascade,
  member_id    uuid not null references party_members(id) on delete cascade,
  direction    swipe_direction not null,
  swiped_at    timestamptz not null default now(),
  unique (candidate_id, member_id)
);

create table party_votes (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references party_candidates(id) on delete cascade,
  member_id    uuid not null references party_members(id) on delete cascade,
  points       smallint not null default 1,
  voted_at     timestamptz not null default now(),
  unique (candidate_id, member_id)
);

-- Anonymous hard vetoes. POC note: rows are member-readable via RLS, so
-- anonymity is a UI contract (never render attribution), not a DB guarantee.
create table party_vetoes (
  candidate_id uuid not null references party_candidates(id) on delete cascade,
  member_id    uuid not null references party_members(id) on delete cascade,
  primary key (candidate_id, member_id)
);

create table party_outcomes (
  party_id     uuid primary key references parties(id) on delete cascade,
  did_it       boolean,
  group_rating smallint check (group_rating between 1 and 5),
  notes        text,
  recorded_at  timestamptz not null default now()
);

-- Raincheck pairings — table exists, UI later.
create table rainchecks (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id),
  member_ids  uuid[] not null,
  source_party_id uuid references parties(id),
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- AI OBSERVABILITY — one row per Gemini call, success or failure
-- ============================================================================

create table ai_invocations (
  id            uuid primary key default gen_random_uuid(),
  purpose       text not null,        -- 'party_rerank' | ...
  party_id      uuid references parties(id),
  model         text not null,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(8,5),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- HELPERS & TRIGGERS
-- ============================================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger activities_set_updated_at
  before update on activities
  for each row execute function set_updated_at();

create trigger user_engagements_set_updated_at
  before update on user_engagements
  for each row execute function set_updated_at();

-- Membership check used by party_* policies. SECURITY DEFINER so policies on
-- party_members itself don't recurse.
create or replace function is_party_member(p_party_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from party_members pm
    where pm.party_id = p_party_id and pm.user_id = auth.uid()
  );
$$;

-- Join via short code. SECURITY DEFINER: validates the code and inserts the
-- caller's own membership row — party_members insert stays closed otherwise.
create or replace function join_party(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_party_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select id into v_party_id
  from parties
  where join_code = upper(trim(p_code)) and status = 'gathering';
  if v_party_id is null then
    raise exception 'No joinable party with that code';
  end if;
  insert into party_members (party_id, user_id, role)
  values (v_party_id, auth.uid(), 'member')
  on conflict (party_id, user_id) do nothing;
  return v_party_id;
end $$;

-- Affinity recompute (handoff §7): per tag over the user's engagements,
-- weight = clamp(avg((rating - 5.5) / 4.5), -1, 1), where not_interested
-- counts as rating 2 and unrated completed as 6.5. Simple and replaceable.
create or replace function recompute_affinities(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Can only recompute your own affinities';
  end if;

  delete from user_tag_affinities
  where user_id = p_user_id and source = 'learned';

  insert into user_tag_affinities (user_id, tag_id, weight, source, updated_at)
  select
    p_user_id,
    at.tag_id,
    least(1.0, greatest(-1.0, avg(
      ((case
          when ue.status = 'not_interested' then 2
          when ue.rating is not null then ue.rating
          else 6.5
        end) - 5.5) / 4.5
    )))::real,
    'learned',
    now()
  from user_engagements ue
  join activity_tags at on at.activity_id = ue.activity_id
  where ue.user_id = p_user_id
    and (ue.rating is not null or ue.status in ('completed', 'not_interested'))
  group by at.tag_id
  on conflict (user_id, tag_id) do update
    set weight = excluded.weight, source = 'learned', updated_at = now();
end $$;

grant execute on function join_party(text) to authenticated;
grant execute on function recompute_affinities(uuid) to authenticated;
grant execute on function is_party_member(uuid) to authenticated;

-- ============================================================================
-- RLS (POC posture — handoff §5)
-- ============================================================================

alter table profiles              enable row level security;
alter table user_dealbreakers     enable row level security;
alter table user_tag_affinities   enable row level security;
alter table connections           enable row level security;
alter table groups                enable row level security;
alter table group_members         enable row level security;
alter table tags                  enable row level security;
alter table activities            enable row level security;
alter table activity_tags         enable row level security;
alter table media_seasons         enable row level security;
alter table media_episodes        enable row level security;
alter table streaming_services    enable row level security;
alter table user_subscriptions    enable row level security;
alter table activity_availability enable row level security;
alter table user_engagements      enable row level security;
alter table episode_progress      enable row level security;
alter table parties               enable row level security;
alter table party_members         enable row level security;
alter table party_mood_checkins   enable row level security;
alter table party_candidates      enable row level security;
alter table party_swipes          enable row level security;
alter table party_votes           enable row level security;
alter table party_vetoes          enable row level security;
alter table party_outcomes        enable row level security;
alter table rainchecks            enable row level security;
alter table ai_invocations        enable row level security;

-- profiles: readable by any signed-in user (party member names/avatars);
-- writable only by the owner.
create policy profiles_select on profiles
  for select to authenticated using (true);
create policy profiles_insert on profiles
  for insert to authenticated with check (auth.uid() = id);
create policy profiles_update on profiles
  for update to authenticated using (auth.uid() = id);

-- user_* tables: owner-only, all ops.
create policy user_dealbreakers_all on user_dealbreakers
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_tag_affinities_all on user_tag_affinities
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_subscriptions_all on user_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_engagements_all on user_engagements
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy episode_progress_all on episode_progress
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Catalog/reference tables: readable by all signed-in users; writes only via
-- service role (edge functions), which bypasses RLS.
create policy tags_select on tags
  for select to authenticated using (true);
create policy activities_select on activities
  for select to authenticated using (true);
create policy activity_tags_select on activity_tags
  for select to authenticated using (true);
create policy media_seasons_select on media_seasons
  for select to authenticated using (true);
create policy media_episodes_select on media_episodes
  for select to authenticated using (true);
create policy streaming_services_select on streaming_services
  for select to authenticated using (true);
create policy activity_availability_select on activity_availability
  for select to authenticated using (true);

-- parties: visible to members (and the host pre-join); host manages state.
create policy parties_select on parties
  for select to authenticated using (host_id = auth.uid() or is_party_member(id));
create policy parties_insert on parties
  for insert to authenticated with check (host_id = auth.uid());
create policy parties_update on parties
  for update to authenticated using (host_id = auth.uid());

-- party_members: members see the roster. Inserts: the host adds themself at
-- create time; everyone else joins through the join_party() RPC.
create policy party_members_select on party_members
  for select to authenticated using (is_party_member(party_id));
create policy party_members_insert_host_self on party_members
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from parties p where p.id = party_id and p.host_id = auth.uid())
  );
create policy party_members_delete_self on party_members
  for delete to authenticated using (user_id = auth.uid());

-- party_mood_checkins: write your own (via your member row), read party-wide.
create policy party_mood_checkins_select on party_mood_checkins
  for select to authenticated using (
    exists (select 1 from party_members pm
            where pm.id = member_id and is_party_member(pm.party_id))
  );
create policy party_mood_checkins_insert on party_mood_checkins
  for insert to authenticated with check (
    exists (select 1 from party_members pm
            where pm.id = member_id and pm.user_id = auth.uid())
  );

-- party_candidates: readable by members; written by the generate-candidates
-- edge function (service role).
create policy party_candidates_select on party_candidates
  for select to authenticated using (is_party_member(party_id));

-- party_swipes / party_votes / party_vetoes: write via your own member row,
-- read party-wide (progress bars + tallies).
create policy party_swipes_select on party_swipes
  for select to authenticated using (
    exists (select 1 from party_candidates pc
            where pc.id = candidate_id and is_party_member(pc.party_id))
  );
create policy party_swipes_insert on party_swipes
  for insert to authenticated with check (
    exists (select 1 from party_members pm
            where pm.id = member_id and pm.user_id = auth.uid())
  );

create policy party_votes_select on party_votes
  for select to authenticated using (
    exists (select 1 from party_candidates pc
            where pc.id = candidate_id and is_party_member(pc.party_id))
  );
create policy party_votes_all_own on party_votes
  for all to authenticated using (
    exists (select 1 from party_members pm
            where pm.id = member_id and pm.user_id = auth.uid())
  ) with check (
    exists (select 1 from party_members pm
            where pm.id = member_id and pm.user_id = auth.uid())
  );

create policy party_vetoes_select on party_vetoes
  for select to authenticated using (
    exists (select 1 from party_candidates pc
            where pc.id = candidate_id and is_party_member(pc.party_id))
  );
create policy party_vetoes_insert on party_vetoes
  for insert to authenticated with check (
    exists (select 1 from party_members pm
            where pm.id = member_id and pm.user_id = auth.uid())
  );

-- party_outcomes: any member can record/read the outcome.
create policy party_outcomes_select on party_outcomes
  for select to authenticated using (is_party_member(party_id));
create policy party_outcomes_insert on party_outcomes
  for insert to authenticated with check (is_party_member(party_id));
create policy party_outcomes_update on party_outcomes
  for update to authenticated using (is_party_member(party_id));

-- connections / groups / group_members / rainchecks / ai_invocations:
-- RLS enabled with NO policies — locked to service role until their features
-- land (POC skips them).
