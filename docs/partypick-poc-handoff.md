# PartyPick POC — Claude Code Handoff Document

**Status:** Proof of concept. Tables/schema are disposable — build for learning speed, not permanence. But follow the architecture patterns below because they mirror the intended production design.

**Companion file:** `activity-app-schema.sql` (full Postgres/Supabase schema — apply as-is, see Database section).

---

## 1. What we're building

A group decision app: individuals maintain a library of movies/shows (watched, watching, want-to-watch) with ratings and preferences; groups form "parties" that use everyone's combined taste + in-the-moment mood + shared streaming subscriptions to generate candidate suggestions, which the group narrows via Tinder-style swiping and then picks via voting.

The schema generalizes to restaurants/performances/outings later ("everything is an Activity"), but **the POC UI only implements movies and TV shows**. Do not build non-media UI. Do not remove the generic activity model from the schema — it costs nothing and validates the abstraction.

### POC success criteria
A real 2–4 person group (on separate phones) can each:
1. Sign up, complete a 15-card taste calibration, check off streaming subscriptions.
2. Search TMDB, add titles to their library, mark watched/rating.
3. One person starts a party, others join via short code.
4. Everyone submits a mood check-in.
5. The app generates ~12 candidates filtered by shared availability + not-already-seen, scored by group taste, reranked with one Gemini call that also writes a per-candidate "why this fits" blurb.
6. Everyone swipes; survivors go to a vote; winner revealed with a deeplink.
7. Party outcome recorded.

### Explicit non-goals (do not build)
- Restaurants/performances/outings UI
- Episode-level tracking (season/show level only; `media_episodes` table exists but stays empty)
- Watch-history import/sync of any kind
- pgvector embeddings (columns exist; leave null — scoring uses tag affinities, see §7)
- Push notifications, email, social feed, friend requests (parties use join codes only; skip the `connections` table entirely)
- Rainchecks, group DNA stats, leaving-soon alerts (tables exist, UI later)
- Payments, native apps

---

## 2. Tech stack (non-negotiable — matches the developer's environment)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Angular 20, standalone components, signals-first | PWA-enabled (`@angular/pwa`). No NgModules. Use `input()`/`output()`/`computed()`/`resource()` patterns, zoneless if stable in the installed version, otherwise default. |
| Styling | Tailwind CSS v4 | Dark theme default. Mobile-first at 390px. |
| Backend | Supabase (hosted) | Auth (email magic link + Google), Postgres, Realtime, Edge Functions (Deno/TypeScript). |
| AI | Google Gemini API, model `gemini-2.5-flash` | Called ONLY from Edge Functions, never from the browser. Use structured output (`responseMimeType` + `responseSchema`) and disable thinking (`thinkingBudget: 0`) — this is a rank-and-write task, not reasoning. |
| Catalog data | TMDB API v3 | Free tier. Metadata + `watch/providers` endpoint for availability. |
| Deploy | Frontend: Docker (nginx) on Google Cloud Run. Edge functions + DB: Supabase hosted. | Provide the Dockerfile + `cloudbuild`-free deploy notes; CI wiring is handled separately by the developer (existing Bitbucket → Cloud Run WIF pipeline). |

### Environment variables
Create `.env.example` documenting all of these; never commit real values.

Frontend (build-time, public):
- `NG_APP_SUPABASE_URL`
- `NG_APP_SUPABASE_ANON_KEY`

Edge Functions (Supabase secrets):
- `GEMINI_API_KEY`
- `TMDB_API_KEY` (v3 auth or v4 read token — use v4 Bearer token style)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-available in edge runtime)

---

## 3. Repository structure

```
partypick/
├── CLAUDE.md                  # summarize this doc's conventions here
├── README.md                  # setup + run + deploy instructions
├── .env.example
├── Dockerfile                 # multi-stage: node build → nginx serve
├── nginx.conf                 # SPA fallback to index.html, gzip, cache headers
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 0001_init.sql      # = activity-app-schema.sql + POC RLS (§5)
│   ├── seed.sql               # streaming services + vibe tags + calibration set
│   └── functions/
│       ├── tmdb-search/       # proxy + upsert into activities
│       ├── tmdb-detail/       # full detail + availability upsert
│       ├── generate-candidates/  # the pipeline (§7)
│       └── _shared/           # supabase client, tmdb client, types
└── src/app/
    ├── core/                  # supabase client, auth service, guards, types
    ├── features/
    │   ├── auth/              # login, callback
    │   ├── onboarding/        # calibration deck + subscriptions checklist
    │   ├── library/           # tabs, search/add, activity detail
    │   ├── party/             # create, join, lobby, mood, swipe, vote, reveal, outcome
    │   └── profile/           # settings, subscriptions edit
    └── shared/ui/             # activity-card, service-badge, vibe-chip,
                               # score-ring, avatar-stack, swipe-card
```

Generate TypeScript types from the DB (`supabase gen types typescript`) into `core/types/database.types.ts` and use them everywhere.

---

## 4. External API usage rules

### TMDB
- Base: `https://api.themoviedb.org/3`
- Endpoints used: `/search/multi` (filter to movie+tv), `/movie/{id}`, `/tv/{id}`, `/movie/{id}/watch/providers`, `/tv/{id}/watch/providers`, `/genre/movie/list`, `/genre/tv/list`, and `/discover/movie` + `/discover/tv` (for candidate pool expansion, §7).
- **All TMDB calls go through Edge Functions** (`tmdb-search`, `tmdb-detail`) — the API key never ships to the browser, and every fetched title is upserted into `activities` (keyed on `external_source='tmdb'`, `external_id=<type>-<tmdb_id>`, e.g. `movie-603`, `tv-1396`) so the app's own tables are the source of truth after first touch.
- Map TMDB genres → `tags` (kind=`genre`) on upsert. Store `poster_path` as full image URL (`https://image.tmdb.org/t/p/w500...`) in `image_url`. Store `release_year`, `content_rating` (from release_dates/content_ratings if cheap, else omit), `tmdb_vote`, `original_language`, `tmdb_popularity` in `metadata`.
- `watch/providers` response (US region): upsert `flatrate` entries into `activity_availability` with `offer='subscription'`, matching providers to `streaming_services.tmdb_provider_id`; ignore rent/buy for POC. Set `last_checked_at=now()`. Refresh if older than 7 days when a detail page or pipeline touches the title.
- Include TMDB attribution in the app footer ("This product uses the TMDB API but is not endorsed or certified by TMDB") — required by their terms.

### Gemini
- One call per party candidate-generation run, from the `generate-candidates` edge function only. Contract in §7. Log every call to `ai_invocations`.
- Use the REST API directly (no SDK needed in Deno): `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` with header `x-goog-api-key: ${GEMINI_API_KEY}`.
- Always send `generationConfig` with `responseMimeType: "application/json"`, an explicit `responseSchema`, and `thinkingConfig: { thinkingBudget: 0 }` (2.5 Flash thinks by default; it's unnecessary cost/latency for this task).
- Token counts for `ai_invocations` come from `usageMetadata.promptTokenCount` and `usageMetadata.candidatesTokenCount` in the response.

---

## 5. Database

1. Migration `0001_init.sql` = the companion `activity-app-schema.sql` verbatim, with these POC adjustments:
   - Comment out the `postgis`/`geography` pieces (use `text` placeholder columns or drop `location`/`home_location` for POC — simplest: change both to `jsonb null`). Keep a `-- TODO postgis` note.
   - Keep `vector(768)` columns but do NOT create the HNSW index (empty columns, no index needed yet). If the `vector` extension is unavailable, change embedding columns to `jsonb null` with a TODO.
   - Skip creating the `connections` table's UI; table itself can stay.
2. **RLS (POC posture):** enable RLS on every table. Policies:
   - `profiles`, `user_*` tables: `auth.uid() = user_id` (or `id`) for all ops; profiles readable by any authenticated user (needed to show party member names/avatars).
   - `activities`, `tags`, `activity_tags`, `streaming_services`, `activity_availability`, `media_seasons`: readable by all authenticated; writes only via service role (edge functions).
   - `parties` and all `party_*` tables: readable/writable by party members. Membership check: `exists (select 1 from party_members pm where pm.party_id = <row's party> and pm.user_id = auth.uid())`. Party join (inserting your own `party_members` row via join code) is done through a `join_party` RPC (security definer) that validates the code — do not open `party_members` insert broadly.
   - Guests: **POC simplification — skip anonymous guests.** Everyone signs up (magic link is 30 seconds). `guest_name`/`guest_profile` columns stay unused.
3. **seed.sql** must include:
   - `streaming_services`: Netflix (tmdb 8), Amazon Prime Video (9/119), Disney+ (337), Hulu (15), Max (1899), Apple TV+ (350), Paramount+ (531), Peacock (386). Verify tmdb_provider_id values against `/watch/providers/movie?watch_region=US` at build time — do not trust the ids in this doc blindly.
   - `tags` kind=`vibe`: cozy, hype, mindless-fun, deep, dark, funny, scary-ok, romantic, nostalgic, mind-bending.
   - Calibration set: 24 hardcoded well-known TMDB ids spanning genres/eras (mix of e.g. action blockbuster, prestige drama, horror, rom-com, animation, sci-fi, comedy series, crime series). Fetch-and-upsert these via a one-time script or lazily on first onboarding load.

---

## 6. Feature specifications

### 6.1 Auth & onboarding
- Magic-link email + Google OAuth via Supabase Auth. On first login create `profiles` row (display name prompt).
- **Calibration deck:** full-screen swipeable cards of the 24 seed titles. Four actions: Loved / Meh / Haven't seen / Never would. Skippable after 12. Writes:
  - Loved → `user_engagements` status=`completed`, rating=9
  - Meh → status=`completed`, rating=5
  - Never would → status=`not_interested`
  - Haven't seen → no row
  - After the deck, compute initial `user_tag_affinities` (§7 formula) client-side or via RPC.
- **Subscriptions checklist:** grid of service logos, tap to toggle → `user_subscriptions`. Editable later in profile.

### 6.2 Library
- Tabs: Watching / Want To / Done (statuses `in_progress`, `want_to`, `completed`). Cards: poster, title, year, service badges (from `activity_availability` ∩ my `user_subscriptions` — show my services highlighted, others dimmed).
- One-tap "✓ finished" on Watching cards → status=`completed` + inline 1–10 rating prompt (10-star row). Rating updates recompute my tag affinities (RPC `recompute_affinities(user_id)`).
- Search: debounced input → `tmdb-search` edge function → results with "＋ Want to watch" / "✓ Seen it" quick actions.
- Activity detail: poster hero, overview, tags, availability row with deeplink buttons (`deeplink_url` if present else service homepage), my status/rating controls.

### 6.3 Party flow (the core demo)
State machine = `parties.status`: `gathering → swiping → voting → decided → completed`. Host advances states; all clients follow via Realtime.

**Realtime design:** one Supabase Realtime channel per party: `party:{id}`. Use Postgres Changes subscriptions on `party_members`, `party_mood_checkins`, `party_swipes`, `party_votes`, `parties` (filtered by party_id) rather than broadcast — simpler and survives refresh. Use channel presence for "who's currently on the screen" indicators.

1. **Create:** host picks constraints — max runtime (chips: <90 / <2h / <3h / any), activity type fixed to `movie` or `tv_show` or "either", toggle `must_be_streamable_by_all` (default on). Generates 6-char join code (unambiguous alphabet, no 0/O/1/I).
2. **Lobby:** shows join code big + copyable link (`/party/join?code=XXXXXX`), live member avatar list. "Everyone's in → Mood check" button (host only).
3. **Mood check-in:** each member: energy slider 1–5 + pick up to 3 vibe chips + optional free-text ("something like Severance but funnier"). Lobby-style waiting UI shows who's done. When all members have checked in (or host force-continues), host taps **Generate suggestions** → calls `generate-candidates` → status `swiping`.
4. **Swipe deck:** each member independently swipes the same ~12 candidates (order by `presented_order`). Card: poster, title, year, runtime, tags, score-ring (final_score as %), `ai_blurb`, service badges. Actions: left (no), right (yes), veto (🚫, max 1 per member per party, writes `party_vetoes`, anonymous — never show who). Progress bar: members-finished count via realtime. When all finished (or host advances): status `voting`.
5. **Vote:** survivors = candidates with ≥50% right-swipes and zero vetoes; if <3 survive, take top 3 by (right-swipe count, final_score). Grid of survivor cards; each member distributes 3 points (tap to add, tap held vote to remove; max 2 on one candidate). When all voted or host advances → tally (`sum(points)`, tiebreak by final_score) → status `decided`.
6. **Reveal:** winner card, confetti (CSS/canvas, keep it light), "Watch on {service}" deeplink, "Start over with new suggestions" (host; regenerates excluding all prior candidates this party).
7. **Outcome:** on next app open after a decided party >12h old, show a dismissible pulse card: "How was {title}?" → 1–5 stars or "we bailed" → `party_outcomes`, status `completed`.

---

## 7. Candidate generation pipeline (edge function `generate-candidates`)

Input: `{ party_id }` (auth: must be host). Output: writes `party_candidates`, flips party status, returns candidate list.

### Step 0 — Gather context
Load party, members, their `user_subscriptions`, `user_engagements`, `user_tag_affinities`, `user_dealbreakers`, mood check-ins.

### Step 1 — Candidate pool (~150–300 titles)
The local `activities` table starts sparse, so build the pool from three sources, upserting everything touched:
1. Union of all members' `want_to` lists (highest-signal candidates).
2. TMDB `/discover/{movie|tv}` calls: `with_watch_providers=` (comma list of the group's shared provider ids) `&watch_region=US&sort_by=popularity.desc`, plus 2–3 genre-targeted discover calls using the group's top positive shared genres. ~5 pages total max.
3. Existing local `activities` of the right type with availability on shared services.

### Step 2 — Hard filters (SQL/TS)
- Type matches party constraint.
- Runtime ≤ constraint (for tv_show use typical episode runtime; treat missing as pass).
- If `must_be_streamable_by_all`: availability ∩ (services every member subscribes to) ≠ ∅. Compute shared services once: `intersect` of members' active subscriptions.
- Exclude titles ANY member has `completed` (unless that member's engagement has `is_rewatchable=true`) or `not_interested`.
- Exclude any member's dealbreaker tags (content_warning kind).
- Exclude candidates already in `party_candidates` for this party (regeneration case).

### Step 3 — Deterministic scoring (per member, then aggregate)
Per member m and candidate c:
```
member_score(m,c) = 0.5 * tag_affinity(m,c)      // mean of m's weights over c's tags (missing weight = 0)
                  + 0.2 * mood_match(c, m.mood)  // overlap of c's vibe/genre tags with m's chosen vibe chips, mapped via a
                                                 // hardcoded vibe→genre map (cozy→[comedy,family,romance], hype→[action,adventure],
                                                 // dark→[thriller,crime,horror], mind-bending→[sci-fi,mystery], etc.)
                  + 0.15 * quality(c)            // normalized tmdb_vote (vote/10), 0 if missing
                  + 0.15 * novelty(m,c)          // 1 if m has no engagement row, 0.5 if want_to (already interested ≠ novel), 
                                                 // 1 if rewatchable-completed
```
Aggregate (least-misery weighted):
```
final_score = 0.6 * min(member_scores) + 0.4 * avg(member_scores)
```
Store per-part numbers in `score_breakdown` (include per-member scores keyed by user id — used later for group-DNA features; fine for POC since RLS scopes it to the party).

Take top 30 by final_score.

### Step 4 — AI rerank + blurbs (one Gemini call)
Model: `gemini-2.5-flash` via `generateContent` (see §4). `generationConfig`:
```json
{
  "responseMimeType": "application/json",
  "responseSchema": {
    "type": "ARRAY",
    "items": {
      "type": "OBJECT",
      "properties": {
        "id":    { "type": "STRING" },
        "rank":  { "type": "INTEGER" },
        "blurb": { "type": "STRING" }
      },
      "required": ["id", "rank", "blurb"]
    }
  },
  "thinkingConfig": { "thinkingBudget": 0 },
  "maxOutputTokens": 2048,
  "temperature": 0.7
}
```
`systemInstruction`: "You pick what a group should watch tonight. Be decisive and specific."
User content:
- Party context: member count, energy avg, all vibe chips, free-texts verbatim, runtime cap.
- 30 candidates, each as one compact line: `id | title (year) | type | runtime | tags | tmdb_vote | score`.
- Task: "Pick the best 12 for this group. Return exactly 12 items ranked 1–12. blurb is one sentence (<20 words) telling the group why it fits them tonight. Prioritize the mood free-texts over general popularity. Use only ids from the list."

Parse defensively even with the schema enforced (validate ids against the sent set, dedupe, clamp to 12; fall back to top-12-by-score with templated blurbs on any parse/API failure or empty candidate array — **the pipeline must never hard-fail because of the AI step**). Write the 12 to `party_candidates` with `presented_order=rank`, `ai_blurb`, cached `score_breakdown`. Log to `ai_invocations` with token counts from `usageMetadata`.

### Affinity recompute RPC
`recompute_affinities(p_user_id)`: for each tag, over the user's engagements on activities carrying that tag: `weight = clamp(avg((rating-5.5)/4.5), -1, 1)` counting `not_interested` as rating 2 and unrated `completed` as 6.5; require ≥1 engagement. `source='learned'`. Simple, transparent, replaceable.

---

## 8. UI/design direction
- Dark, warm, playful. Rounded-2xl cards, generous poster imagery, one primary action per screen. Party screens should feel like a game, not a form.
- Components to build in `shared/ui`: `activity-card`, `swipe-card` (pointer-event drag with rotate/translate, buttons as fallback), `service-badge-row`, `vibe-chip`, `score-ring` (SVG arc), `avatar-stack`, `join-code-display`.
- Respect `prefers-reduced-motion` on swipe/confetti animations.
- Empty states matter: empty library → "search to add your first title"; lobby with 1 member → "waiting for friends… share the code".

## 9. Deployment
- `Dockerfile`: stage 1 `node:22-alpine` → `npm ci && npm run build`; stage 2 `nginx:alpine`, copy `dist/*/browser` → `/usr/share/nginx/html`, custom `nginx.conf` with SPA fallback (`try_files $uri /index.html`), listen on `$PORT` (Cloud Run injects PORT=8080 — template it via envsubst in an entrypoint or hardcode 8080).
- README must include: local dev (`supabase start` optional vs hosted project, `supabase db push`, `supabase functions deploy`, `supabase secrets set`), and `gcloud run deploy partypick --source .` as the manual deploy path.
- Runtime config: since env is build-time in Angular, generate `public/config.json` at container start from env vars via entrypoint script, fetched by an `APP_INITIALIZER`-equivalent provider — this keeps one image promotable across environments (developer preference; matches their existing Cloud Run patterns).

## 10. Build order (commit at each milestone)
1. Scaffold: Angular app + Tailwind + PWA + Supabase client + auth + Dockerfile. Deployable "hello, logged in as X".
2. Migration + seed + generated types + RLS. Verify with SQL smoke tests.
3. Edge functions `tmdb-search`/`tmdb-detail` + Library feature (search, add, statuses, ratings, detail, availability badges).
4. Onboarding (calibration + subscriptions) + `recompute_affinities`.
5. Party: create/join/lobby/mood with realtime.
6. `generate-candidates` pipeline (test via curl with a seeded party before UI).
7. Swipe deck + voting + reveal + outcome pulse.
8. Polish pass: empty states, error toasts, loading skeletons, README, `.env.example`, TMDB attribution.

## 11. Quality bar
- TypeScript strict; no `any` in feature code. Zod (or hand-rolled guards) on all edge function inputs and the Gemini JSON response.
- Every edge function: auth check first, structured error responses `{error: string}` with correct status codes.
- Unit tests only where logic is real: scoring functions (pure TS — extract them), survivor/tally logic, affinity formula. Skip component tests for POC.
- No secrets in the repo, ever. `ai_invocations` row on every Gemini call, success or failure (record failures with cost 0).

## 12. Known deferrals (leave TODO comments where relevant)
Guests/QR join, Watchmode integration (freshness + leaving-soon), pgvector taste embeddings, episode tracking, rainchecks, group persistence (`groups` tables), non-media activity types, PostGIS, dealbreakers UI (table works, no settings screen — hardcode none).
