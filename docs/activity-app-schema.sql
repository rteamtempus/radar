-- ============================================================================
-- ACTIVITY DECISION APP — CORE SCHEMA (Postgres / Supabase)
-- ----------------------------------------------------------------------------
-- Design principles:
--   1. Everything is an ACTIVITY. Movies, shows, restaurants, concerts,
--      museums all live in one table with universal columns. Type-specific
--      data goes in JSONB `metadata` + thin extension tables for anything
--      that needs hard indexing (episode tracking, geo, availability).
--   2. The PARTY is a decision funnel: gather -> candidates -> swipe ->
--      vote -> decision -> outcome. Each phase is a table, so every session
--      generates training data for the recommender.
--   3. AI is the LAST step of a pipeline (SQL hard filters -> deterministic
--      scoring -> pgvector similarity -> one small AI rerank call). The
--      schema supports that with embeddings and a candidates table that
--      caches score breakdowns.
--   4. Supabase-native: uuid PKs, auth.users FK, RLS-friendly ownership
--      columns, pgvector for taste embeddings, PostGIS optional for geo.
-- ============================================================================

create extension if not exists vector;      -- pgvector (Supabase built-in)
-- create extension if not exists postgis;  -- enable when outings/geo land

-- ============================================================================
-- ENUMS
-- ============================================================================

create type activity_type as enum (
  'movie', 'tv_show', 'restaurant', 'live_performance', 'outing', 'custom'
);
-- 'custom' lets users log one-offs ("Game night at Dave's") without a
-- catalog entry. Add new types via ALTER TYPE ... ADD VALUE (cheap in PG).

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

-- Supabase provides auth.users. This is the app-facing profile.
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  home_location geography(point),        -- or point if PostGIS deferred
  home_region   text default 'US',       -- availability lookups are per-region
  -- Taste embedding: periodically recomputed from ratings/engagements.
  -- Dimension matches your embedding model (e.g. 768 for many, 1536 OpenAI).
  taste_embedding vector(768),
  taste_embedding_updated_at timestamptz,
  settings      jsonb not null default '{}'::jsonb, -- UI prefs, notif prefs
  created_at    timestamptz not null default now()
);

-- Hard constraints, not soft preferences. Applied as SQL filters BEFORE
-- any scoring. kind examples: 'content_warning' (no gore), 'dietary'
-- (vegetarian required), 'max_runtime', 'max_price_level', 'max_distance_km'.
create table user_dealbreakers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  value      jsonb not null,        -- { "tag_id": ... } or { "minutes": 150 }
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Soft, weighted preferences (learned + user-editable).
-- Weight range -1.0 (avoid) .. 1.0 (love). One row per user per tag.
create table user_tag_affinities (
  user_id    uuid not null references profiles(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  weight     real not null default 0 check (weight between -1 and 1),
  source     text not null default 'learned',  -- 'learned' | 'explicit'
  updated_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

-- Social graph: who can invite whom to parties.
create table connections (
  user_id      uuid not null references profiles(id) on delete cascade,
  friend_id    uuid not null references profiles(id) on delete cascade,
  status       text not null default 'pending',  -- pending | accepted | blocked
  created_at   timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- Persistent groups ("Household", "D&D crew") — reusable party templates
-- with their own learned joint taste over time.
create table groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid not null references profiles(id),
  group_embedding vector(768),   -- learned joint taste (idea #14)
  created_at      timestamptz not null default now()
);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  primary key (group_id, user_id)
);

-- ============================================================================
-- TAXONOMY
-- ============================================================================

-- One tag vocabulary across all activity types. 'vibe' tags ('cozy',
-- 'high-energy', 'mindless fun') are the bridge between mood check-ins
-- and activities of ANY type — this is what makes cross-type mood
-- matching work later.
create table tags (
  id    uuid primary key default gen_random_uuid(),
  kind  tag_kind not null,
  slug  text not null,
  label text not null,
  unique (kind, slug)
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
  -- Universal comparable fields (used in cross-type filtering/scoring):
  duration_min  int,             -- runtime / typical meal / avg visit length
  cost_level    smallint check (cost_level between 0 and 4), -- $..$$$$ (0=free/subscription)
  -- External identity (entity resolution):
  external_source text,          -- 'tmdb' | 'watchmode' | 'google_places' |
                                 -- 'ticketmaster' | 'user'
  external_id     text,
  -- Type-specific bag. Examples:
  --   movie:      { "release_year": 2024, "content_rating": "PG-13",
  --                 "tmdb_vote": 7.8, "original_language": "en" }
  --   restaurant: { "cuisines": ["thai"], "reservations": true,
  --                 "hours": {...} }
  --   performance:{ "venue": "...", "event_date": "...", "ticket_url": "..." }
  metadata      jsonb not null default '{}'::jsonb,
  -- Content embedding from title+description+tags; enables taste-vector
  -- similarity across ALL activity types with one cosine query.
  embedding     vector(768),
  -- Geo only meaningful for place-bound types:
  location      geography(point),
  -- Provenance: user-created customs are private-by-default.
  created_by    uuid references profiles(id),
  is_public     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (external_source, external_id)
);

create index activities_type_idx      on activities(type);
create index activities_metadata_idx  on activities using gin (metadata);
create index activities_embedding_idx on activities
  using hnsw (embedding vector_cosine_ops);
-- create index activities_location_idx on activities using gist (location);

create table activity_tags (
  activity_id uuid not null references activities(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  primary key (activity_id, tag_id)
);

-- ----------------------------------------------------------------------------
-- Media extension: seasons/episodes (only for tv_show).
-- MVP tip: track at SEASON granularity first; add episodes when needed.
-- ----------------------------------------------------------------------------

create table media_seasons (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references activities(id) on delete cascade,
  season_number int not null,
  episode_count int,
  air_date      date,
  unique (activity_id, season_number)
);

create table media_episodes (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references media_seasons(id) on delete cascade,
  episode_number int not null,
  title         text,
  runtime_min   int,
  air_date      date,
  unique (season_id, episode_number)
);

-- ============================================================================
-- STREAMING AVAILABILITY
-- ============================================================================

create table streaming_services (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique,   -- 'netflix', 'hulu', 'max'
  name     text not null,
  logo_url text,
  -- external ids for sync jobs:
  watchmode_id int,
  tmdb_provider_id int
);

-- The user just checks boxes. This is the whole "what do I subscribe to"
-- feature — no account linking required.
create table user_subscriptions (
  user_id    uuid not null references profiles(id) on delete cascade,
  service_id uuid not null references streaming_services(id) on delete cascade,
  is_active  boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, service_id)
);

-- Synced from Watchmode/JustWatch. leaving_at powers "leaving soon" (idea #7).
-- last_checked_at powers freshness discipline — never surface stale rows.
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
-- ENGAGEMENT (the personal library: watched / want-to / ratings)
-- ============================================================================

create table user_engagements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  activity_id  uuid not null references activities(id) on delete cascade,
  status       engagement_status not null default 'want_to',
  rating       smallint check (rating between 1 and 10),
  review       text,
  is_rewatchable boolean,           -- "would happily do again" — gold for groups
  -- Context of consumption (feeds mood learning):
  context      jsonb not null default '{}'::jsonb, -- {"mood":["cozy"],"with":"partner"}
  source       text not null default 'manual',     -- 'manual'|'party'|'import_netflix_csv'|...
  visibility   text not null default 'friends',    -- 'private'|'friends'|'public'
  started_at   timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (user_id, activity_id)
);

create index engagements_user_status_idx on user_engagements(user_id, status);

-- Episode/season progress for shows (row per watched unit).
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
  group_id      uuid references groups(id),   -- optional persistent group
  status        party_status not null default 'gathering',
  activity_type activity_type,                -- null = "surprise us, any type"
  -- Session constraints (hard filters for the pipeline):
  --   { "max_duration_min": 150, "max_cost_level": 2,
  --     "location": {"lat":..,"lng":..,"radius_km":15},
  --     "when": "2026-07-25T19:00", "must_be_streamable_by_all": true }
  constraints   jsonb not null default '{}'::jsonb,
  -- Decision mechanics config:
  --   { "mode": "vote" | "auto_pick" | "host_decides",
  --     "votes_per_member": 3, "vetoes_per_member": 1,
  --     "candidate_count": 12 }
  decision_config jsonb not null default '{}'::jsonb,
  join_code     text unique,                  -- QR/short-code guest join (idea #9)
  decided_activity_id uuid references activities(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- Members can be registered users OR anonymous guests (guest_name set,
-- user_id null). Guests answer 3 quick taste questions stored in
-- guest_profile and participate fully in swiping/voting.
create table party_members (
  id            uuid primary key default gen_random_uuid(),
  party_id      uuid not null references parties(id) on delete cascade,
  user_id       uuid references profiles(id) on delete cascade,
  guest_name    text,
  guest_profile jsonb,          -- lightweight taste answers for guests
  role          text not null default 'member',   -- 'host' | 'member'
  joined_at     timestamptz not null default now(),
  check (user_id is not null or guest_name is not null),
  unique (party_id, user_id)
);

-- In-the-moment vibe per member. Tags reference the shared 'vibe' vocabulary
-- so mood maps onto activities of any type.
create table party_mood_checkins (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references party_members(id) on delete cascade,
  energy      smallint check (energy between 1 and 5),
  mood_tags   uuid[] not null default '{}',      -- tag ids, kind='vibe'
  free_text   text,                              -- optional; feed to AI rerank
  created_at  timestamptz not null default now()
);

-- Output of the suggestion pipeline. score_breakdown caches WHY, so the UI
-- can explain suggestions and you can debug/tune the scorer without rerunning.
--   { "availability": 1.0, "taste_avg": 0.72, "taste_min": 0.45,
--     "novelty": 0.9, "mood_match": 0.8, "ai_rank": 3 }
-- taste_min matters: group satisfaction = maximize the MINIMUM, not the mean
-- (least-misery strategy) or you always pick the bland average.
create table party_candidates (
  id              uuid primary key default gen_random_uuid(),
  party_id        uuid not null references parties(id) on delete cascade,
  activity_id     uuid not null references activities(id) on delete cascade,
  final_score     real,
  score_breakdown jsonb not null default '{}'::jsonb,
  ai_blurb        text,          -- "Why this fits your group" (one Haiku call)
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
  points       smallint not null default 1,   -- supports ranked/multi-vote
  voted_at     timestamptz not null default now(),
  unique (candidate_id, member_id)
);

-- Anonymous hard vetoes (idea #2). Kept in a separate table so the UI can
-- honor them without ever attributing them to a member.
create table party_vetoes (
  candidate_id uuid not null references party_candidates(id) on delete cascade,
  member_id    uuid not null references party_members(id) on delete cascade,
  primary key (candidate_id, member_id)
);

-- Post-activity pulse (idea #5): did the pick land? This is your recommender's
-- true training signal — swipes are noisy, outcomes are truth.
create table party_outcomes (
  party_id     uuid primary key references parties(id) on delete cascade,
  did_it       boolean,
  group_rating smallint check (group_rating between 1 and 5),
  notes        text,
  recorded_at  timestamptz not null default now()
);

-- Raincheck pairings (idea #4): subset of the party liked something the
-- group didn't pick.
create table rainchecks (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id),
  member_ids  uuid[] not null,   -- profile ids who mutually liked it
  source_party_id uuid references parties(id),
  status      text not null default 'open',   -- open | scheduled | dismissed
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- AI COST CONTROL / OBSERVABILITY (optional but you'll want it fast)
-- ============================================================================

create table ai_invocations (
  id            uuid primary key default gen_random_uuid(),
  purpose       text not null,        -- 'party_rerank' | 'taste_summary' | ...
  party_id      uuid references parties(id),
  model         text not null,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(8,5),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- RLS SKETCH (Supabase) — enable and write policies per table. Ownership
-- columns exist everywhere they're needed:
--   profiles/user_*      -> auth.uid() = user_id
--   parties/party_*      -> member of party (exists in party_members)
--   activities           -> is_public OR created_by = auth.uid()
--   user_engagements     -> owner always; friends per `visibility`
-- ============================================================================
