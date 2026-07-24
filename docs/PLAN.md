# PartyPick POC — Plan of Attack

Working plan for building the POC. Check things off as they land; one commit per
milestone (handoff §10). The full spec is [partypick-poc-handoff.md](partypick-poc-handoff.md),
the schema rationale is [activity-app-schema.sql](activity-app-schema.sql), and the
target look is [PartyPick-Wireframes.dc.html](PartyPick-Wireframes.dc.html) (open in a browser).

## Success criteria (the demo)

A real 2–4 person group on separate phones can: sign up → calibrate taste →
check off subscriptions → build libraries from TMDB search → start/join a party
by code → mood check-in → get ~12 AI-reranked candidates → swipe → vote →
winner revealed with a deeplink → outcome recorded.

## Deviations from the handoff doc

| Handoff says | We're doing | Why |
|---|---|---|
| Docker + nginx on Google Cloud Run | **Vercel** (no Dockerfile, no nginx.conf) | Rory's hosting choice for this POC |
| Runtime `config.json` via container entrypoint | Build-time env via `scripts/generate-env.mjs` (`NG_APP_*` vars, set in Vercel dashboard) | No container entrypoint on Vercel; anon key is public anyway |
| Magic-link email auth | **Email + password** ("Confirm email" off — no auth emails at all) | Free-tier email quota is tiny; PWAs handle the email→app hop badly |

Everything else in the handoff stands, especially: AI only from edge functions,
TMDB only through edge functions, media-only UI on top of the generic activity
schema, no secrets in the repo.

## ⚠️ Open decision: which Supabase project?

This schema uses **generic table names** (`profiles`, `activities`, `parties`…).
It must live in its **own Supabase project** — it would collide with the
life-assistant super-app database (which already owns `profiles` etc. and is
production). Free tier allows two projects; create a fresh one for radar.
**Do not link this repo to the life-assistant project.**

---

## Milestone 1 — Scaffold ✅ (this commit)

- [x] Angular 20 standalone + signals, Tailwind v4 (wireframe palette as `@theme` tokens), PWA
- [x] Supabase client + `AuthService` (magic link + Google) + `authGuard` + routes
- [x] Login / callback pages working; placeholder shells for library, onboarding, party, profile
- [x] Env plumbing (`generate-env.mjs`), `vercel.json`, `.env.example`, docs, CLAUDE.md
- [ ] **Deploy check:** Vercel project connected to the GitHub repo, "hello, logged in as X" live

## Milestone 2 — Database (mostly ✅ 2026-07-24)

- [x] Create a **new** Supabase project for radar (`domneconesznimnzxdsx`)
- [x] CLI linked (`npx supabase`, auth via `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD` in local `.env`)
- [x] `supabase db push` → applied `0001_init.sql` + `0002_seed.sql`
- [x] Verified: 26 tables, RLS on all 26, 33 policies, 8 services, 10 vibe tags, 4 functions
- [x] Email + password auth enabled, "Confirm email" off (see deviations)
- [ ] Google OAuth provider + redirect-URL allowlist (localhost + Vercel domain) — when needed
- [x] `supabase gen types typescript --linked` → `database.types.ts`; client typed
- [ ] Behavioral RLS test (cross-user reads) — cheap to do once there are 2 real accounts
- [ ] Verify tmdb_provider_id values against TMDB `/watch/providers/movie?watch_region=US` — **needs TMDB key**
- [ ] Set edge secrets: `supabase secrets set GEMINI_API_KEY=… TMDB_API_KEY=…` — **needs keys from Rory**
- [x] Frontend envs on Vercel + local `.env`

## Milestone 3 — TMDB + Library ✅ (2026-07-24)

- [x] `_shared/tmdb.ts`: upsert helpers + provider-variant alias map (531→2303 etc., see 0003)
- [x] `tmdb-search` + `tmdb-detail` deployed & smoke-tested (availability replaced on every detail call)
- [x] Library tabs (Watching / Want To / Done) with real data
- [x] Debounced search with "＋ Want to" / "✓ Seen it" quick actions (background hydration)
- [x] ✓ Finished → completed + inline 1–10 star rating (triggers `recompute_affinities`)
- [x] Activity detail: hero, genre tags, availability rows with service links, status/rating
- [x] `shared/ui`: service-badges, star-rating (cards kept inline for now; "my services
      highlighted" waits for subscriptions in milestone 4)
- Test account for API smoke tests: `pp-test-1@partypick.test`

## Milestone 4 — Onboarding & taste ✅ (2026-07-24)

- [x] Calibration deck: 24 TMDB titles in `onboarding.service.ts`, hydrated lazily via `tmdb-detail` (concurrency-4 pool; already-hydrated titles come straight from the DB)
- [x] Loved(9) / Meh(5) / Haven't seen / Never would → `user_engagements` (source='calibration'); skippable after 12
- [x] Subscriptions checklist in onboarding + editable in profile (`SubscriptionsService`, optimistic toggles)
- [x] `recompute_affinities` after deck + after each rating; library badges dim non-subscribed services
- [x] Display-name step (pre-filled) on first login; `profiles.settings.onboarded` routes first-timers to /onboarding
- [x] Affinity formula verified against live DB: loved(9)→+0.778, never→−0.778 per genre tag

## Milestone 5 — Party: create / join / lobby / mood

- [ ] Create party: runtime chips, movie/show/either, streamable-by-all toggle, 6-char code (no 0/O/1/I)
- [ ] Join by code (`join_party` RPC) + `/party/join?code=XXXXXX` link
- [ ] Realtime channel `party:{id}`: Postgres Changes on party tables + presence
- [ ] Lobby: big copyable code, live avatar list, host-only advance button
- [ ] Mood check-in: energy slider + ≤3 vibe chips + free text; waiting UI; host force-continue

## Milestone 6 — Candidate pipeline

- [ ] Pool: want_to union + TMDB discover (shared providers, ≤5 pages) + local activities
- [ ] Hard filters + per-member scoring + least-misery aggregate (pure TS module, unit tested)
- [ ] Gemini rerank → 12 + blurbs; bulletproof fallback to top-12-by-score; `ai_invocations` logging
- [ ] Test via curl with a seeded party BEFORE any UI

## Milestone 7 — Swipe / vote / reveal / outcome

- [ ] Swipe deck: drag + buttons, score-ring, blurb, veto (1/member, anonymous); progress via realtime
- [ ] Survivors (≥50% right, no vetoes; floor of top-3) → 3-point vote grid (max 2 per candidate)
- [ ] Tally + tiebreak by final_score → reveal with light confetti + "Watch on {service}" deeplink
- [ ] "Start over" regeneration excluding prior candidates
- [ ] Outcome pulse card >12h later → `party_outcomes`, party → completed
- [ ] Unit tests: survivor/tally logic

## Milestone 8 — Polish

- [ ] Empty states, error toasts, loading skeletons
- [ ] `prefers-reduced-motion` respected everywhere (swipe/confetti)
- [ ] README final pass; PWA install prompt sanity check on iOS/Android
- [ ] End-to-end run of the success criteria with 2+ real phones

## Non-goals (do not build — handoff §1)

Restaurant/performance/outing UI · episode tracking · watch-history import ·
pgvector embeddings · push/email/social/friends · rainchecks · group-DNA stats ·
leaving-soon alerts · payments · native apps. The generic schema stays.
