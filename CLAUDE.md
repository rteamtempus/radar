# PartyPick POC (repo: radar)

Group decision app POC: personal media libraries + parties that swipe/vote on
AI-reranked suggestions. **Spec:** `docs/partypick-poc-handoff.md` (authoritative),
plan/progress: `docs/PLAN.md`, look: `docs/PartyPick-Wireframes.dc.html`.

Status: proof of concept — build for learning speed. Schema is disposable, the
architecture patterns are not.

## Stack

Angular 20 (standalone, signals, no NgModules) · Tailwind v4 (dark, mobile-first
390px, palette in `src/styles.css` `@theme`) · Supabase hosted (auth, Postgres,
Realtime, Edge Functions) · Gemini `gemini-2.5-flash` · TMDB v3 · **Vercel**
(deploy deviation: handoff §2/§9 say Cloud Run/Docker — we use Vercel, no
Dockerfile).

## Hard rules

1. **Secrets never ship to the browser.** Gemini and TMDB are called ONLY from
   edge functions. Frontend env = Supabase URL + anon key only, generated into
   `src/environments/env.generated.ts` by `scripts/generate-env.mjs` (never
   hand-edit; `NG_APP_*` vars from `.env` locally / Vercel dashboard in CI).
2. **Own Supabase project.** Table names are generic (`profiles`, `parties`…) —
   NEVER link/push this repo to the life-assistant super-app project. See
   `docs/PLAN.md` § Open decision.
3. **Gemini calls:** REST `generateContent`, structured output
   (`responseMimeType` + `responseSchema`), `thinkingBudget: 0`, one call per
   pipeline run, always log to `ai_invocations`, never let AI failure break the
   pipeline (fallback to deterministic scores). Use `_shared/gemini.ts`.
4. **TMDB:** everything fetched is upserted into `activities`
   (`external_id='<movie|tv>-<tmdbId>'`); posters as full w500 URLs; US
   flatrate only → `activity_availability`; keep the TMDB attribution footer.
5. **POC scope:** movies/TV UI only — the generic activity model stays in the
   schema but gets no UI. Non-goals list: handoff §1. Known deferrals: §12.
6. **Quality bar:** TS strict, no `any` in feature code; edge functions check
   auth first and return `{error}` with correct status; unit tests only for
   real logic (scoring, tally, affinities); no secrets in the repo, ever.

## Layout

`src/app/core` (supabase client, auth, guards, types) · `features/{auth,
onboarding,library,party,profile}` · `shared/ui` (presentational kit) ·
`supabase/migrations` (0001 schema, 0002 seed — reference data ships as
migrations) + `functions/{_shared,tmdb-search,tmdb-detail,generate-candidates}`.

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

## Commands

`npm start` (serve) · `npm run build` · `npm test` · `npm run notes:build`.
`prestart`/`prebuild` run `generate-env` then `build-release-notes`.
Supabase (once linked): `supabase db push`, `supabase functions deploy <name>`,
`supabase secrets set K=V`, `supabase gen types typescript --linked >
src/app/core/types/database.types.ts`.
