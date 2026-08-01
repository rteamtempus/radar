# PartyPick POC (repo: radar)

Group decision app POC: personal media libraries + parties that swipe/vote on
AI-reranked suggestions. **Spec:** `docs/partypick-poc-handoff.md` (authoritative),
plan/progress: `docs/PLAN.md`, look: `docs/PartyPick-Wireframes.dc.html`.

**Starting a session? Read `STATE.md` first** — it is where the previous session
left off (§ Session state below is binding, including the cleanup pass).

Status: proof of concept — build for learning speed. Schema is disposable, the
architecture patterns are not.

## Stack

Angular 20 (standalone, signals, no NgModules) · Tailwind v4 (dark, mobile-first
390px, palette in `src/styles.css` `@theme`) · Supabase hosted (auth, Postgres,
Realtime, Edge Functions) · TMDB v3 · Google Places (New) · Open Library ·
**Vercel** (deploy deviation: handoff §2/§9 say Cloud Run/Docker — we use
Vercel, no Dockerfile). Gemini/AI was removed in v0.11 (quests run on slots).

## Hard rules

1. **Secrets never ship to the browser.** TMDB and Google keys live ONLY in
   edge functions. Frontend env = Supabase URL + anon key only, generated into
   `src/environments/env.generated.ts` by `scripts/generate-env.mjs` (never
   hand-edit; `NG_APP_*` vars from `.env` locally / Vercel dashboard in CI).
2. **Own Supabase project.** Table names are generic (`profiles`, `parties`…) —
   NEVER link/push this repo to the life-assistant super-app project. See
   `docs/PLAN.md` § Open decision.
3. **Search APIs** (capabilities & verified limits: docs/API-CAPABILITIES.md):
   TMDB `search/multi` for text (+ person hint), `discover` for filters — both
   return real totals. Books = **Open Library** (never Google Books for new
   work; `external_source` distinguishes legacy rows), popularity sort only
   when a query narrows, quoted `subject` for genre browses. Places text
   search paginates by token, has NO total count, and stays behind explicit
   billable-action buttons. **Field masks set the Places billing tier**
   (Essentials ~10K free/mo > Pro ~5K > Enterprise ~1K): search masks stay
   PRO-TIER (no rating/price/hours/editorialSummary — those come from
   place-detail, and `upsertPlace` MERGES metadata so search hits never null
   out detail-cached fields). City autocomplete = `places-autocomplete`
   (session-tokened; locations are always picked, never geocoded).
4. **Curated vocabularies:** filter chips come from `core/vocab.ts` (client)
   and `functions/_shared/vocab.ts` (edge) — slugs must stay in sync. Taggers
   write ONLY curated slugs (Places `primaryType` → 1 tag; OL subjects →
   buckets). Never mint tags from raw API strings again — migration 0015
   cleaned that up once already.
5. **TMDB:** everything fetched is upserted into `activities`
   (`external_id='<movie|tv>-<tmdbId>'`); posters as full w500 URLs; US
   flatrate only → `activity_availability`; keep the TMDB attribution footer.
6. **POC scope:** the four domains (watch/eat/do/read) share one machinery;
   non-goals list: handoff §1. Known deferrals: §12.
7. **Quality bar:** TS strict, no `any` in feature code; edge functions check
   auth first and return `{error}` with correct status; unit tests only for
   real logic (scoring, tally, affinities); no secrets in the repo, ever.

## Layout

`src/app/core` (supabase client, auth, guards, types, vocab) · `features/{auth,
onboarding,explore,library,party,profile,radar,friends}` · `shared/ui`
(presentational kit) · `supabase/migrations` (0001 schema, 0002 seed —
reference data ships as migrations) + `functions/{_shared,tmdb-search,
tmdb-discover,tmdb-detail,places-search,places-autocomplete,place-detail,
books-search,book-detail,import-history}`.

Migrations are plain PostgreSQL — VS Code's default T-SQL linter flags them
falsely; ignore or set the SQL dialect to Postgres.

## Release notes & regression testing (NOT optional)

Every task that changes the app for its users ends with **two doc updates, in
the same commit as the code**. This is not paperwork — the release notes ship
*inside the app* (the What's-new modal), and the regression files are how Rory
and his partners test a release.

**1. Release note** — `docs/release-notes/NNNN-slug.md`, format and rules in
that folder's `README.md`. Then `npm run notes:build` (also runs on
`prestart`/`prebuild`) to regenerate
`src/app/core/release-notes.generated.ts` — **commit the generated file, never
hand-edit it**.

- **Write one for:** new features, changed behaviour or wording, noticeable
  visual changes, bug fixes. Anything a user could notice.
- **Skip:** refactors, docs, tests, dependency bumps, build/CI, and shell work
  that changes nothing visible. The Capacitor port is the reference example —
  real work, no release note. When in doubt, ask "would a user notice?"
- **One note per release, not per commit.** Multiple commits in a session share
  one note; if the current note hasn't shipped yet, edit it instead of adding
  another.
- The `NNNN` prefix is the sequence compared against
  `profiles.last_seen_release_seq`. It increments by one and is **never**
  reused or renumbered.
- Write for the person using the app, not for someone reading the diff.
- Big non-code milestones (an App Store launch, say) get a note too — Rory will
  drive those with you.

**2. Regression tests** — `docs/regression-testing/`:

- Add or **edit** the feature file for what you changed. These files describe
  the feature as it is *now*; they are edited in place, never appended to.
- Add an entry to `RELEASES.md` for the release, listing every feature file it
  touched **and why** — including files you didn't change but whose behaviour
  your change could break (shared RPCs, RLS, triggers, services). That list is
  the release's test plan.
- Test IDs (`RT-NOTIF-03`) are stable forever. Delete a dead test; never
  renumber around it.

## Session state — `STATE.md` (NOT optional)

Chat history gets cleared regularly, so **`STATE.md` is the handover to the next
session.** It is worthless if it is stale and worthless if it is bloated — both
failure modes are on you to prevent.

1. **Every commit that gets pushed updates `STATE.md`, in that same commit.**
   Same discipline as release notes, but with a wider trigger: release notes
   cover user-visible change, STATE.md covers *anything the next session would
   need* — refactors, investigations, abandoned approaches, half-finished work,
   a gotcha that cost an hour. If a fresh session would waste time rediscovering
   it, it goes in.
2. **Write for a session that has no memory of this one.** Name files and
   symbols, not "the thing we discussed". State what is DONE vs IN PROGRESS vs
   DECIDED-BUT-UNBUILT, and if work is half-finished, say exactly where it
   stops and what the next move is.
3. **Reading `STATE.md` obliges you to clean it.** Every read runs the cleanup
   pass in that file's header: drop pushes older than the last 5, drop done or
   abandoned next-steps, drop fixed gotchas, drop anything the code now
   contradicts. Target under ~150 lines. Report what you removed — silent
   deletion of something Rory still wanted is worse than a long file.
4. **Don't duplicate.** `CLAUDE.md` = rules, `docs/HANDOFF.md` = stable
   world-model and roadmap queue, `STATE.md` = now. When an entry hardens into
   a rule or a roadmap item, MOVE it to the right file and delete it here.
   STATE.md is the only doc that shrinks.
5. **Verify before trusting.** Entries describe the repo as it was at that
   push. If one names a file, function, migration or flag, confirm it still
   exists before acting on it — and fix the entry when it doesn't.
6. `/state` gives Rory a numbered breakdown with prune candidates so he can
   direct the cleanup himself. It never deletes without his say-so.

## Quests & adventures

A quest's deck is **the union of the slots people pick** — no AI, no external
calls, no constraints (migration 0013 replaced the whole pipeline; the
`generate-candidates` function is deleted, not dormant). Don't reintroduce
scoring or a shortlist without asking.

1. **Cross-member slot reads go through `quest_slot_options()`, never RLS.**
   Explore's `searchSlots()` relies on `radar_slots` RLS alone, so widening
   that policy would leak friends-only slots into public discovery. If you need
   a new cross-member slot read, add it to the SECURITY DEFINER RPC.
2. **VISIBILITY RULE (resolved 2026-08-01, was interim).** Rory made the quest
   behavior intentional: the middle slot tier is **"Friends & quests"** in UI
   copy — friends can browse it AND it can be offered inside any quest its
   owner (or a subscriber) is a member of, including to code-joined strangers.
   `private` slots are never offered to anyone, including their owner.
   **Search/discovery is public-only everywhere** (Explore slots/people, geo
   RPCs, city guides) — friends-only content must never surface in any search.
3. **Server-side re-checks.** `quest_pick_slot` re-validates domain,
   visibility, membership and the 3-slot cap — never trust the picker's list.
4. **`party_slots` is denormalised** (slot name/emoji/owner/count) so the lobby
   renders everyone's picks without any member reading the underlying
   `radar_slots` row. Keep it that way.
5. **Ties are a random draw** (`tallyWinner` in `party-logic.ts`), injectable
   for tests. There is no `final_score` any more.
6. Adventures are **planning-first**: created standalone (`adventure_create`,
   from the Quests tab) with their own join code; quests are added to them and
   inherit the roster. The join box tries **adventures first**, so an adventure
   code lands people in the whole itinerary, never just one quest.
   (`adventure_create_from_party` still exists in the schema but the app no
   longer calls it.)

## Location suite (v0.14 — design log: docs/LOCATION-ANALYSIS.md)

1. **Locations are always PICKED, never geocoded.** Every stored location is
   an autocomplete `CityPick {name, place_id, lat, lng}` at city granularity
   — profiles/slots/adventures never hold a raw GPS fix. This is what keeps
   the suite inside the already-enabled Places API (no Geocoding API).
2. **Explore precedence: custom pick > GPS > home** (`location.effective()`),
   and the active source is always visible on the 📍 chip. Location never
   applies to watch/read.
3. **Geo search = SECURITY DEFINER RPCs** (`slots_near`, `people_in_city`,
   `city_guide`, `friend_trips`) — public content only, `user_blocks`
   filtered both directions. Never widen RLS for a geo feature.
4. **People discovery is opt-in** (`profiles.geo_discoverable`, default
   false, + profile must be public). Rory's stance: test-and-see — keep it
   deletable. Home city renders only when the owner is discoverable.
5. **Adventures are NEVER public** — visibility is `members` (default) or
   `friends`. Friends see trip summaries via `friend_trips()`, not the
   adventure itself.
6. **Maps are Leaflet + OSM** (`shared/ui/map-view.ts`, lazy-loaded, circle
   markers). Never the Google Maps SDK — that's a new billable product.
   Map view is earmarked premium-gated before extensive-tester rollout.
7. No PostGIS yet — jsonb lat/lng + `haversine_km()` SQL. Fine at POC scale;
   0001's TODO stands if row counts demand spatial indexes.

## Notifications

Generic activity-stream inbox (`notifications`, migration 0012). `verb` is
free text, so **a new notification kind is a new producer, not a migration**.

1. **Clients never insert.** Every notification comes from a `SECURITY
   DEFINER` trigger or RPC calling `notify_user()`. There is deliberately no
   insert policy — don't add one.
2. **Denormalise into `payload`.** Rendering must never need a join the
   recipient's RLS might refuse. Add the display fields (title, image, names)
   to the payload at write time.
3. **Set a `group_key`** for anything that could fire repeatedly; re-firing
   updates the row in place and re-unreads it instead of stacking duplicates.
4. **Triggers fire on UPDATE, not INSERT**, for engagement-shaped events — the
   Netflix importer inserts hundreds of completed rows and must stay silent.
5. New verb ⇒ add a case to `describe()` in `core/notifications.service.ts`
   (unknown verbs fall back safely) + a release note + a regression test.
6. **Release notes are not notification rows** — they ship with the build and
   collapse into one synthetic "What's new" entry. See `core/release-notes.ts`.

## Native shells (Capacitor)

The app ships as web (Vercel) AND native shells (Capacitor 7, `ios/` +
`android/` are committed source; build artifacts gitignored). Rules:

1. **Never import `@capacitor/*` in feature code** — everything goes through
   `core/platform/platform.service.ts` (isNative, openExternal, share,
   haptic, onResume, back button). External links use `openExternal`.
2. **Service worker + update pill stay disabled on native** (`app.config.ts`
   gates on `!Capacitor.isNativePlatform()`; native updates will be Capgo's
   job). Never remove that gate.
3. Adding/removing a Capacitor plugin or touching `ios/`/`android/` config
   requires a native version bump + store release (+ `--min-update-version`
   once Capgo OTA exists). Flag loudly in the commit message.
4. `appId` `com.rteamtempus.radar` is permanent after first store upload;
   `appName` (display) is freely changeable.
5. Auth is email+password (no redirects needed). If Google OAuth gets
   enabled, native needs the deep-link flow from
   docs/partypick-native-port-handoff.md Phase 3.
6. UI definition of done: verified in browser AND at least one native
   platform (simulator OK; physical device for auth/share/keyboard).

Commands: `npm run native:sync` (build + copy into shells),
`native:run:android`, `native:ios` (opens Xcode — Mac only). iOS building
requires the Mac; the ios/ project itself is generated and committed here.

## Visual checks & test accounts

1. **See the app** — `node scripts/shot.mjs /explore` screenshots an iPhone 13
   viewport (390px, the mobile-first target) into `__screenshots__/`, logging
   in automatically. `--anon` for signed-out, `--full` for full-page,
   `--device "Pixel 7"`. Session cached in `.auth/state.json`; delete it if
   auth behaves oddly. Both dirs are gitignored. The Playwright MCP in
   `.mcp.json` covers interactive click-through work.
2. **Automation writes go to `radar-auto@partypick.test`** — credentials in
   gitignored `.env.test`. Onboarded, neutral taste (0 engagements), friend
   code `7B95DA`, subscribed to Prime/Apple TV+/Disney+.
3. **`pp-test-1/2/3` are Rory's manual regression fixtures** (u1 owns "High
   movies"; parties TESTP2/3, QUEST1). Read them, never mutate them — an
   automated run that edits those breaks `docs/regression-testing/`.
4. **The Management API bypasses RLS.** `POST /v1/projects/<ref>/database/query`
   runs as `postgres`, so it can never tell you whether a policy works. Verify
   any RLS claim over REST as a signed-in user (anon key + password grant).

## Commands

`npm start` (serve) · `npm run build` · `npm test` · `npm run notes:build`.
`prestart`/`prebuild` run `generate-env` then `build-release-notes`.
Supabase (once linked): `supabase db push`, `supabase functions deploy <name>`,
`supabase secrets set K=V`, `supabase gen types typescript --linked >
src/app/core/types/database.types.ts`.
