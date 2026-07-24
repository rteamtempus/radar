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
`supabase/migrations` + `seed.sql` + `functions/{_shared,tmdb-search,
tmdb-detail,generate-candidates}`.

Migrations are plain PostgreSQL — VS Code's default T-SQL linter flags them
falsely; ignore or set the SQL dialect to Postgres.

## Commands

`npm start` (serve; runs generate-env first) · `npm run build` · `npm test`.
Supabase (once linked): `supabase db push`, `supabase functions deploy <name>`,
`supabase secrets set K=V`, `supabase gen types typescript --linked >
src/app/core/types/database.types.ts`.
