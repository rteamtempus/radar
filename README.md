# PartyPick (POC)

A group decision app: everyone keeps a library of movies/shows they've watched
or want to watch; a "party" combines the group's taste, tonight's mood, and
shared streaming subscriptions into ~12 AI-reranked candidates the group
narrows by swiping, then picks by voting.

**Proof of concept** — expect churn. The authoritative spec is
[docs/partypick-poc-handoff.md](docs/partypick-poc-handoff.md); the working plan
with progress checkboxes is [docs/PLAN.md](docs/PLAN.md); the wireframes are
[docs/PartyPick-Wireframes.dc.html](docs/PartyPick-Wireframes.dc.html) (open in a browser).

## Stack

| | |
|---|---|
| Frontend | Angular 20 (standalone + signals), Tailwind v4, PWA |
| Backend | Supabase — auth (magic link + Google), Postgres + RLS, Realtime, Edge Functions |
| AI | Gemini `gemini-2.5-flash`, called only from edge functions |
| Catalog | TMDB v3, called only from edge functions |
| Hosting | Vercel (frontend) + Supabase hosted (everything else) |

## Local dev

```bash
npm install
cp .env.example .env    # fill in Supabase URL + anon key
npm start               # http://localhost:4200
```

`npm start`/`npm run build` first run `scripts/generate-env.mjs`, which writes
`src/environments/env.generated.ts` from `NG_APP_*` env vars (or `.env`).

## Supabase setup (once per project)

> ⚠️ Use a **dedicated** Supabase project — this schema's generic table names
> must not share a database with other apps. See docs/PLAN.md.

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push                                  # applies supabase/migrations (schema + seed)
supabase secrets set GEMINI_API_KEY=... TMDB_API_KEY=...
supabase functions deploy tmdb-search tmdb-detail generate-candidates
supabase gen types typescript --linked > src/app/core/types/database.types.ts
```

Then in the Supabase dashboard: enable Email (magic link) + Google auth
providers and add `http://localhost:4200` and the Vercel domain to the
redirect-URL allowlist.

## Deploy (Vercel)

Import the GitHub repo into Vercel — `vercel.json` sets the build command,
output dir (`dist/partypick/browser`), and the SPA fallback rewrite. Set
`NG_APP_SUPABASE_URL` and `NG_APP_SUPABASE_ANON_KEY` in the project's
environment variables.

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
