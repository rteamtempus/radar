# Radar — Friend-Notes Analysis & Gameplan

*2026-07-24 · Analysis of the idea notes against the built POC (milestones 1–8 +
Netflix import, see [PLAN.md](PLAN.md)). Verdicts: what exists, what's cheap,
what's expensive, what's not possible — and the DB changes each needs.*

First, a naming note: the notes call the core concept **"the radar"** — the repo
is already named `radar`. The vocabulary fits; "PartyPick" may end up being just
the group-decision feature inside Radar.

---

## TL;DR

The schema bet ("everything is an Activity") pays off hard here: **most of these
ideas need zero or additive-only DB changes.** The one genuinely new core concept
is **Slots** (curated, active queues — "high movies") which becomes the app's
organizing metaphor and needs two new tables. The one idea that's flatly not
possible is **automatic tracking of what you watch inside Netflix/Hulu** (no
such APIs exist; the CSV import + one-tap ✓ is the honest version of it).

| Verdict | Count | Examples |
|---|---|---|
| ✅ Already built | 8 | autofill from catalog, auto-tag genre/duration, history + ratings, service-agnostic, PWA on phone, preference scoring, narrow-down swiping, group sessions |
| 🟢 Quick win (days) | 6 | notes + "recommended by", time/mood filters, stale-show nudge, explicit like/dislike, rewatch behavior, async "doodle-style" parties (mostly works today) |
| 🟡 Medium (the next real build) | 5 | **Slots**, shared/family radars, new-episode tracking, quick-add endpoint (Siri-ish), AI-filled slots |
| 🔴 Big bets (later verticals) | 4 | restaurants + Google Maps, concerts/events, "what to do" generator, themes |
| ⛔ Not possible / park | 4 | auto-logging from streaming apps, native Siri/Alexa, friend-nudge AI ("picks up in ep 5"), stranger radar-sync / dating |

---

## 1. The item card — their spec vs. our schema

The notes: *"Everything lives and breathes off these item cards"* — listing
duration, type, genre, title, description, notes, recommended by, rating,
done-or-not. Almost all of it already exists:

| Card field (notes) | Where it lives today | Gap |
|---|---|---|
| Duration | `activities.duration_min` | ✅ |
| Item type | `activities.type` (movie/tv_show/restaurant/live_performance/outing/custom) | ✅ |
| Genre | `tags` kind='genre' via `activity_tags` | ✅ |
| Title / Description | `activities.title` / `.description` | ✅ |
| **Notes** (my note on it) | — | 🟢 add `user_engagements.notes text` (the existing `review` column is post-watch; a personal note is a different thing) |
| **Recommended by** | — | 🟢 add `user_engagements.recommended_by text` + nullable `recommended_by_user_id uuid` (free-text now, links to profiles when connections land) |
| Your rating | `user_engagements.rating` (1–10) | ✅ |
| Done or not | `user_engagements.status` | ✅ (richer: want_to / in_progress / completed / abandoned / not_interested) |

**Migration 0006 (small, additive):** the two columns above. That fully realizes
their card spec — including the "someone said you gotta watch this" use case
(add title → recommended_by "Dave" → when you rate it, the card can say "tell
Dave"; actual notify-Dave needs connections, later).

---

## 2. The genuinely new concept: Slots 🟡 (the next big build)

*"Slots for what you're watching and queues for each slot… like playlists but
active. Once we're done watching, it is removed… or a looping queue."*

Nothing in the current schema models this. It's the strongest idea in the notes
— it turns the flat library (Watching/Want To/Done) into the "personal TV
guide." Today's three tabs are effectively three hardcoded slots, so the UI
migration is natural.

**Migration 0007 sketch:**

```sql
create table radar_slots (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles(id) on delete cascade,   -- null when group-owned
  group_id    uuid references groups(id) on delete cascade,     -- shared/family radar
  name        text not null,            -- "High movies", "Rewatch", "Date night"
  emoji       text,
  position    int not null default 0,
  on_complete text not null default 'remove',  -- 'remove' | 'loop' | 'keep'
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  check (owner_id is not null or group_id is not null)
);

create table radar_slot_items (
  slot_id     uuid not null references radar_slots(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  position    int not null default 0,          -- Spotify-queue reorder
  added_by    uuid references profiles(id),
  note        text,
  added_at    timestamptz not null default now(),
  primary key (slot_id, activity_id)
);
```

- **Auto-remove / loop:** when an engagement flips to `completed`, a client-side
  hook (POC) removes the activity from slots with `on_complete='remove'` and
  moves it to the back of `'loop'` slots. The **Rewatch slot** from the notes is
  just a loop slot + `is_rewatchable=true` (column already exists).
- **Recommended starter slots** at onboarding: "Watching now", "Up next",
  "Rewatch", "Recommended to me".
- UI: slot rail on a new Radar home screen; drag-to-reorder within a slot
  (pointer-drag experience already proven in the swipe deck).

## 3. Shared & family radars 🟡

*"Personal radar… share radar with others… family radar for stuff you want to
watch together."*

The dormant `groups` + `group_members` tables were built for exactly this. The
slots schema above already points at `group_id`. Needed: RLS policies for
groups (currently locked to service-role), a `join_group`-style invite (reuse
the join-code pattern from parties — proven), and slot queries that union
personal + my-groups. "Recommend something in both of our radars" is then an
intersection query over slot items / want_to lists — and the **party pipeline
already does the harder version of this** (least-misery scoring), so a
lightweight "overlap view" is cheap once sharing exists.

## 4. Quick wins 🟢 (each ~a day or less, mostly UI on existing data)

1. **Time/mood filters on the library** — *"filterable based on how much time
   you have"*. Runtime + genre chips; all data present. (The party flow already
   does mood; this brings a lite version to solo browsing.)
2. **Stale-show nudge** — *"haven't gone back in 60 days"*. Same pattern as the
   outcome pulse: on app open, query `in_progress` engagements with
   `updated_at < now()-60d` → "Keep on the radar?" → keep / remove-with-reason
   (reason → `abandoned` + note; feeds the taste model). In-app only for now —
   real push notifications are a separate infra decision (PWA push is possible
   later).
3. **Explicit like/dislike controls** — *"I like this, I don't like that" +
   "negative feedback… I don't like jump scares"*. `user_tag_affinities` already
   supports `source='explicit'` and negative weights, and `user_dealbreakers`
   exists with no UI. A "Taste" section in You: tag chips → love/avoid/never.
   The pipeline consumes these **today** with zero backend work.
4. **Notes + recommended-by** — migration 0006 above + two fields on the detail
   page.
5. **Async, doodle-style narrowing** — *"text your spouse… swipe for a set
   amount of time"*. This **mostly works right now**: parties survive closing
   the app, members swipe whenever, the host advances when ready. Gap: nothing
   communicates "async is fine". Add an optional end-time on the lobby
   ("swipe by 6pm") + copy changes. (A restaurant version needs the restaurant
   vertical first.)
6. **History view** — Done tab already is it; add watch dates + sort. Trivial.

## 5. Medium builds 🟡

- **New-episode / new-season tracking** — *"keep Silo on the radar until the
  show is over… 'new episode on X date' across all platforms."* TMDB provides
  `next_episode_to_air` + show `status` on the TV detail endpoint. Plan: store
  it in `activities.metadata` on hydration; a **scheduled edge function**
  (Supabase cron, daily) refreshes shows anyone is watching/wants; a "Coming
  up" section on the Radar screen. No new tables (`media_seasons` already
  exists if we want per-season rows). This kills a real pain point and is very
  feasible — the "notification" is in-app until push lands.
- **Quick-add from anywhere (the honest Siri)** — *"tell Siri… add this to the
  radar."* Native Siri/Alexa need native apps ⛔, but: (a) an authenticated
  `quick-add` edge function (`?title=...`) enables an **iOS Shortcut** ("Hey
  Siri, add to Radar" → dictation → HTTP call) and (b) Android PWAs can register
  as a **share target** (share a title from any app → Radar). ~80% of the value,
  no native app.
- **AI-filled slots** — *"we're going to Japan for 10 days, make a slot"*. All
  plumbing exists (Gemini structured output, `ai_invocations`, taste
  affinities). An edge function: prompt + my affinities/history → list of TMDB
  titles → hydrate → create slot + items. Media-only version is a strong demo;
  the "what to do when we land" half waits for non-media verticals. Also covers
  the "what should I watch if I have 30 min" ask.

## 6. Big bets 🔴 (real features, later — schema is ready, integrations aren't)

- **Restaurants / recipes / concerts** — the whole point of the generic
  `activities` model, and it's ready (add `'recipe'` to the enum when needed —
  cheap `ALTER TYPE`). But each vertical needs a data source + API budget:
  Google Places (restaurants, hours, *"save to a map"* — feasible, costs money),
  Ticketmaster/Songkick (*"artist comes to town"* alerts). Recommend: prove the
  media radar first; then restaurants as vertical #2 with a "dinner party" flow
  (the swipe/vote loop is already generic over candidates).
- **"What to do" slot** (*"coffee shop + board game"*) — AI-filled slot over
  custom/outing activities. After at least one non-media vertical exists.
- **Trip/bachelorette planning sessions** — parties + groups + AI slots
  composed. A composition play, not a new system — but only after the pieces
  above.
- **Themes (90s / modern / luxury)** — pure CSS: the palette is already all
  `@theme` tokens, so `data-theme` variants are mechanical. Cosmetic; do it
  when the product settles.

## 7. Not possible / park ⛔

- **Auto-logging from Netflix/Hulu accounts** — *"integrated into everything
  you're logged into."* **No streaming service exposes viewing-activity APIs**,
  and credential-sharing/scraping breaks their ToS and 2FA. Honest substitutes,
  two of which are already built: one-tap ✓ (built), **Netflix CSV re-import**
  (built — importing again is safe/idempotent, so "re-import monthly" is the
  workflow), and possibly a browser extension someday (desktop-only, fragile).
  This constraint is worth embracing in the product story: Radar is the
  *service-agnostic* layer precisely because it doesn't live inside any one app.
- **Native Siri/Alexa integration** — needs native apps; see the Shortcut/share-
  target substitute above.
- **"Your best friend says it picks up in episode 5"** — needs a friend graph +
  friends' episode-level opinions + AI blending. Charming north-star; park it.
- **Stranger radar-sync / icebreaker / dating** — taste-overlap math is easy
  (it's the Group DNA wireframe), but strangers + taste data = privacy and
  product questions that don't belong in a POC. Park; note that `visibility`
  on engagements already anticipates the privacy tiers.
- **Social feed** — the notes explicitly *don't* want it, and nothing built
  points that way. The ambient "Jules loved this" line (in the wireframes)
  becomes possible when `connections` gets a UI — that's the ceiling, by design.

## 8. Proposed DB changes (all additive, in order)

| # | Migration | For |
|---|---|---|
| 0006 | `user_engagements` + `notes text`, `recommended_by text`, `recommended_by_user_id uuid null` | Item card spec, "recommended by" |
| 0007 | `radar_slots`, `radar_slot_items` + RLS (owner OR group-member) | Slots |
| 0008 | RLS policies for `groups`/`group_members` + `join_group(code)` RPC (add `groups.join_code`) | Shared/family radars |
| — | No migration: TV air-date data → `activities.metadata`; explicit affinities/dealbreakers already exist | Episode tracking, taste controls |

Nothing built so far gets thrown away; the party pipeline, import, and library
all slot underneath the Radar-home/slots layer.

## 9. Recommended build order

1. ✅ **Phase A — cards + quick wins** (2026-07-24): migration 0006 (notes + recommended-by, on the detail page's "My card"), runtime/genre filter chips, 60-day stale-show nudge, explicit love/avoid taste chips in You (source='explicit' affinities), async-party lobby copy.
2. ✅ **Phase B — Slots + Radar home** (2026-07-24): migration 0007; `SlotsService` + `/radar` home (new default route + nav item). Starter slots seeded on first visit (Watching now / Up next / Rewatch 🔁 / Recommended to me); per-slot inline search-to-add, ▲▼ reorder, two-tap delete, custom slots with loop mode. Completing a title auto-removes it from 'remove' slots and cycles it to the back of 'loop' slots. Library tabs kept as the status/history view underneath (rather than replaced — revisit with real usage). RLS verified owner-only.
3. **Phase C — Sharing** (0008 groups) + new-episode tracking + quick-add endpoint/Shortcut.
4. **Phase D — AI slots**, then the first non-media vertical (restaurants) when ready to spend on Places.

## 10. Open questions for Rory + friend

1. Slots and the existing Watching/Want To/Done tabs: replace the tabs entirely
   with default slots (my recommendation), or keep tabs + slots as a separate
   screen?
2. Family radar: is a "household" group with one shared join code enough for
   v1 (no roles/permissions)?
3. Stale nudge: 60 days as the default — per-slot configurable, or keep it
   simple?
4. For the Siri workaround: are your phones iOS (Shortcut route) or Android
   (share-target route) — or both?
5. Restaurants vertical: worth a Google Places API key + billing when we get
   there, or should concerts/events come first?
