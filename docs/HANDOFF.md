# Radar — Session Handoff (2026-07-26)

*Read this first in a fresh session. It is the state of the world: what's
built, the decisions that bind, how to work in this repo, and everything
discussed but NOT yet implemented. Companion docs are indexed at the bottom.*

## What this is

**Radar** (working name; formerly PartyPick) — a PWA "command center for food
& entertainment": personal queues (**slots**) across four domains (🎬 Watch ·
🍜 Eat · 🎯 Do · 📚 Read), group decision **parties/quests** (swipe → vote →
reveal; deck = the union of the slots members pick), **friends + social slots** (Spotify-playlist
model), Netflix history import, and a discovery browser. All milestones from
the original handoff plus the ideas-doc phases A–B, the friends system, four
domains, social slots phases 1–4 are **live in production**.

- Repo: `c:\Workspace2\radar` → github.com/rteamtempus/radar (`main`; every
  task ends with commit + push; Vercel auto-deploys; PWA update pill notifies)
- Supabase project: `domneconesznimnzxdsx` — Radar's OWN project. **Never**
  link the life-assistant project (generic table names would collide).
- Stack: Angular 20 (standalone/signals), Tailwind 4 theme tokens, Supabase
  (Postgres+RLS, Realtime, Edge Functions Deno), TMDB, Google Places (New),
  Open Library. Capacitor 7 shells committed (paused). **No AI in the app** —
  Gemini was removed from the quest pipeline in v0.11 when quests moved to
  slots; Google Books is legacy-rows-only (CLAUDE.md § Hard rules 3).

## How to work here (conventions that matter)

1. **Credentials** live in gitignored `radar/.env`: `NG_APP_SUPABASE_URL`,
   `NG_APP_SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
   `TMDB_API_KEY` (v3-style; client supports v3+v4), `GEMINI_API_KEY`,
   `GOOGLE_PLACES_API_KEY` (one GCP key: Places API (New) + Books API enabled,
   key API-restricted to those two). Parse `.env` into `$env:` per PowerShell
   call (state doesn't persist across calls; **cd to radar first — the shell
   resets to c:\Workspace2 between turns**).
2. **DB changes** = numbered migration in `supabase/migrations` (0015 is the
   latest; next: 0016)
   → `npx -y supabase db push` → regenerate types:
   `npx -y supabase gen types typescript --linked > src/app/core/types/database.types.ts`
   (write BOM-safely via `[IO.File]::WriteAllLines`, prepend the GENERATED
   comment). Ad-hoc SQL/verification via Management API:
   `POST https://api.supabase.com/v1/projects/domneconesznimnzxdsx/database/query`
   with the access token. **Never `supabase db reset`.**
3. **Edge functions**: `npx -y supabase functions deploy <names>` (Docker not
   needed). Live: tmdb-search, tmdb-discover, tmdb-detail, import-history,
   places-search, place-detail, books-search, book-detail.
   (`generate-candidates` was deleted in v0.11 — do not redeploy it.)
4. **Testing habits**: pure logic gets tsx tests
   (`npx -y tsx <file>.test.ts` — scoring, party-logic, netflix-csv). Feature
   verification via REST as test users: `pp-test-1/2/3@partypick.test`,
   passwords `partypick-test-N!` (1↔2 are friends; u1 owns public slot "High
   movies"; parties TESTP2/3, QUEST1 exist). Always `npm run build` before
   committing.
5. **PS 5.1 gotchas** (all hit in this project): `$pid` is read-only;
   `Invoke-RestMethod` emits a JSON array as ONE pipeline item (never wrap in
   `@()`); duplicate hashtable keys throw; no ternary/`-AsHashtable`/`-AsArray`;
   double quotes inside `git commit -m` here-strings break arg passing.
6. **RLS golden rule** (learned the hard way, memory `rls-widening-audit-lesson`):
   any policy that widens SELECT ⇒ audit every client query on that table for
   explicit owner filters (`eq user_id/owner_id`). Also: `is_party_member()`
   is `stable` — never `.select()` (RETURNING) on the party_members self-insert.
7. **Performance rule**: button taps patch local signals; no full-collection
   reloads; side effects (slot sync, recompute_affinities) fire-and-forget.
8. **Native rule** (CLAUDE.md): no `@capacitor/*` outside `core/platform/`;
   SW + update pill stay gated off native; plugin/native-config changes ⇒
   store release discipline.

## Decisions log (binding unless Rory says otherwise)

- **Auth = email+password.** Magic link removed (free-tier email quota; PWA
  email-hop is bad). "Confirm email" is OFF in Supabase. Google OAuth wired in
  code but NOT enabled — enabling it later requires native deep links
  (native-port doc Phase 3).
- **Vercel hosting** (overrides the original doc's Cloud Run). Env via
  `scripts/generate-env.mjs` → `env.generated.ts` (gitignored, dir auto-created).
- **App name undecided**; display name "Radar" everywhere. Bundle ID
  `com.rteamtempus.radar` is provisional — FREEZES at first store upload.
- **Capacitor 7** (Node 20 machine; v8 needs Node 22). Rory has a Mac for iOS.
- **Gemini stays wired for future use** (2026-08-01). No app code path calls it
  since v0.11, but `functions/_shared/gemini.ts` and `GEMINI_API_KEY` are kept
  on purpose for AI features Rory may add later (AI-filled slots, #9 in the
  queue below, is the obvious first one). Don't prune either as dead weight.
- **Not-social-media guardrails**: no feed/comments/DMs; subscriber counts
  owner-only; likes public. Statuses drive role slots; My-Radar toggles drive
  custom slots (deliberately separate).
- Provider quirks: Paramount+ TMDB id 531→2303 (+ alias map in _shared/tmdb.ts);
  Google Places ToS = store place_id only, refresh-on-view; Books search has a
  junk tail (filter offer stands, unasked).
- Taste model: affinities −1..1 per tag; explicit (You-page chips, ±1) vs
  learned (`recompute_affinities`: (rating−5.5)/4.5; not_interested=2,
  unrated completed=6.5). ⚠ The old party-score formula
  (0.5·taste+0.2·mood+0.15·quality+0.15·novelty, least-misery 0.6·min+0.4·avg)
  and the Gemini rerank were **removed in v0.11** — kept here as history only.
  Quest decks are unranked; ties are a random draw (`tallyWinner`).

## ⚠ NOT implemented yet (the queue)

**Approved social ideas** (docs/SOCIAL-SLOTS-ANALYSIS.md — #13 DENIED):
1. **#2 Blend slots** — auto-generate a shared-taste slot for me+friend from
   overlapping want-tos/affinities (reuse pipeline scoring; likely an edge
   function writing a slot with `config.blend_with`).
2. **#7 Official curator account** — mechanism DONE (`settings.featured=true`
   on a public profile surfaces in Explore→People). Waiting on Rory to create
   the account; then flag it via Management SQL and stock starter slots.
3. **#11 Seasonal slots** — optional active window (config dates), surface
   in-season, auto-archive after; searchable by season.
4. **#14 Slot-context recommendations** — recommend from a slot page attaches
   provenance ("Dave sent this from his Halloween slot"); extend
   `recommend_to_friend` with a source param + display on receiver's card/slot item.
5. **#15 second half** — city/domain curation ("new town → what locals go
   to"): featured is live; location-aware curation & richer slot search
   (by tag/geo) still to design.

**From IDEAS-ANALYSIS.md phases C/D (approved direction, unbuilt):**
6. **Group/family radars** — dormant `groups`/`group_members` tables +
   `radar_slots.group_id` column are ready; needs RLS (migration), join-code
   RPC (copy party pattern), shared-slot UI. (Partially superseded by slot
   sharing — confirm with Rory how much is still wanted.)
7. **New-episode tracking** — TMDB `next_episode_to_air` on hydrate +
   scheduled edge function (Supabase cron) + "Coming up" UI. High value.
8. **Quick-add** — authenticated `quick-add` edge endpoint + iOS Shortcut
   ("Hey Siri, add to Radar") / Android share-target manifest.
9. **AI-filled slots** — "make a slot for my Japan trip": Gemini + affinities
   → hydrate titles → create slot. All plumbing exists.
10. **Events vertical** (Ticketmaster Discovery, free API) — 5th domain;
    "artist in town" alerts. (Quests now run in all four existing domains —
    v0.11 replaced the media-only pipeline with slot-driven decks.)
11. **Themes** (90s/modern/luxury) — palette is all `@theme` tokens; also the
    icon's purple/pink vs app's coral/gold mismatch noted.
12. **Premium subscription tier** (decided 2026-08-01, "add soon") — billable
    premium features behind a subscription. First earmarked feature: map view
    (LOCATION-ANALYSIS idea 12) gates behind it before extensive-tester
    rollout. Payment rails, tier design, entitlement checks all TBD.
13. **Smaller/parked**: PWA push notifications; OG share-card images (needs
    SSR/edge render — share is link-only today); report/block for public
    content (needed before real stranger discovery); books junk filter;
    Google billing alert (advised, unknown if done); Explore "For you" sort
    blending affinities; friend-notes north stars (ep-5 nudge, dating).

**Native port (paused)** — resume via docs/NATIVE-PORT-STATUS.md: Mac
milestone-1 test → icons via `npx @capacitor/assets generate` from
`public/icons/icon-source.png` → Capgo (account needed) → Apple $99 / Play
$25 manual first releases → CI (Phase 6) → name decision before launch.

**Process debts**: real-phones end-to-end party run (Rory's court, from
PLAN.md M8); behavioral RLS spot-checks after any new visibility policy.

**⚠ Design debt — quest slot visibility (v0.11).** Quests let any member pick
any other member's slots, which Rory approved while explicitly deferring the
visibility design. The interim rule is in CLAUDE.md § Quests & adventures:
`private` slots are offered to nobody; public/friends-only slots and saved
third-party slots are offered to every member — so a stranger who joined by
code can see a friends-only slot's contents. Needs a proper model before
stranger-facing discovery grows.

## Process: every task ends with docs (added 2026-07-31)

Release notes ship *inside the app*, so they are part of the code change, not
an afterthought. **CLAUDE.md § Release notes & regression testing is binding.**
Short version: a user-visible change ⇒ a note in `docs/release-notes/` +
`npm run notes:build` (commit the generated file) + edit the matching
`docs/regression-testing/` feature file + an entry in its `RELEASES.md`.
Invisible work (refactors, the Capacitor port) gets neither.

## Docs index (radar/docs/)

- `HANDOFF.md` — this file.
- `release-notes/` — the in-app changelog, authored as markdown, compiled into
  the build. `README.md` there is the authoring guide; `0001`–`0009` are the
  backfilled history, `0010` onward are written as work ships.
- `regression-testing/` — living manual test scripts per feature, plus
  `RELEASES.md` (what to retest per release) and the test-account table.
- `partypick-poc-handoff.md` — original spec (§7 pipeline math still canonical).
- `PLAN.md` — milestones 1–8 ✅ + Netflix import ✅ (checklists, deviations).
- `IDEAS-ANALYSIS.md` — friend-notes analysis; phases A✅ B✅, C/D partial
  (nav restructure + friends shipped; see queue above).
- `SOCIAL-SLOTS-ANALYSIS.md` — social system design + 15 ideas w/ verdicts +
  shipped status (phases 1–4 ✅).
- `partypick-native-port-handoff.md` + `NATIVE-PORT-STATUS.md` — native plan
  + pause point.
- `activity-app-schema.sql`, `PartyPick-Wireframes.dc.html` — original schema
  rationale & design language (coral/gold cozy-dark, Fredoka/Nunito).

Migrations 0001–0011 tell the schema story end-to-end; CLAUDE.md carries the
hard rules. Memory (`partypick-radar-project`, `rls-widening-audit-lesson`)
mirrors the essentials.
