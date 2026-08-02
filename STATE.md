# STATE — live working state

*Rolling session-continuity file. **Updated in the same commit as every push to
main** (CLAUDE.md § Session state). Read it right after CLAUDE.md when a session
starts, run the cleanup pass below, then work.*

**What goes where — do not duplicate:**

| File | Holds | Changes |
|---|---|---|
| `CLAUDE.md` | hard rules, architecture invariants | rarely |
| `docs/HANDOFF.md` | stable world-model: stack, decisions log, unbuilt queue | per milestone |
| **`STATE.md`** (this) | what's happening *now*: in-flight work, recent pushes, next steps, fresh gotchas | every push |

If something here has hardened into a rule, move it to CLAUDE.md and delete it
here. If it's a long-lived roadmap item, it belongs in HANDOFF.md's queue. This
file is the only one that shrinks.

## Cleanup pass — run every time this file is read

Delete on sight:

1. **Pushes older than the last 5** — git log has them. Keep an old one only if
   it still explains current behaviour.
2. **Next steps** that are done, abandoned, or promoted to HANDOFF.md's queue.
3. **Gotchas** that are fixed, or that have been promoted into CLAUDE.md.
4. **Anything the code contradicts.** Verify before trusting a claim here, not
   after acting on it.

Target: **under ~150 lines.** Over that, prune before adding. Say what you
removed in your reply; `/state` gives Rory the numbered breakdown so he can
direct pruning himself.

---

## Right now

- **v0.15 search-sanity fixes SHIPPED (2026-08-02)** after Rory's morning
  review of v0.14 flagged geo-weird results: (1) anchored eat/do catalog now
  defaults to 30 mi + 🌍 Everywhere chip (root cause: catalog was global,
  rating-sorted, distance-blind); (2) city-picked Google searches use hard
  `locationRestriction` (~40 km box) — GPS keeps soft bias so long-range name
  search still works; (3) books-search scoped to `title:(q) OR author:(q)`
  (OL bare `q` also matched subjects/text). All three REST- and
  browser-verified. Rory's remaining v0.14 review points still open (below).
- **Location suite v0.14 SHIPPED (2026-08-01, autonomous flight session).**
  All four phases from `docs/LOCATION-ANALYSIS.md` (see its BUILT section for
  the 7 deviations/gaps — notably: no PostGIS, lean saved-places, and the
  ⚠ home_location column-readability gap). Rory has NOT yet reviewed the UI —
  screenshots in `__screenshots__/` (profile, explore-eat-austin-guide/-map,
  slot-detail-location, adventure-trip-card) are the review artifacts he
  approved in lieu of live review; **first thing on his return: review those
  + the saved-places picker (idea 13 bloat concern) and veto anything.**
- Playwright-verified end-to-end: city picker (autocomplete→resolve→recents),
  Explore eat w/ Tokyo/Austin (distances re-anchor, city guide + OSM map),
  slot location + "Friends & quests" labels, adventure trip card +
  friends-toggle + slot-suggestion→quest. RPC-verified as pp-test-1:
  slots_near (is_local=true), people_in_city (opt-in + match floor),
  city_guide, friend_trips.
- **Test data created under radar-auto** (fixtures untouched): public "ATX
  eats" slot pinned to Austin (3 items), home=Austin, profile now
  public+geo_discoverable, adventure "Austin Weekend" (📍 Austin,
  friends-visible, one quest). pp-test-1 was only read from.
- Last shipped release is **v0.13 search overhaul** (`0280679`); commits since
  are tooling/docs only, no release note (CLAUDE.md skip list).

## Tooling verified on this machine (2026-08-01)

- **Supabase needs no MCP.** Management API (`POST /v1/projects/
  domneconesznimnzxdsx/database/query`) reads *and writes* as `postgres`;
  CLI 2.111.0 via `npx -y supabase`; REST-as-user works with the anon key.
  ⚠ Management API bypasses RLS — RLS claims must be checked over REST as a
  signed-in user (CLAUDE.md § Visual checks 4).
- **Playwright installed** (`@playwright/test` + Chromium). `node
  scripts/shot.mjs /route` → iPhone 13 screenshot in `__screenshots__/`.
  Verified working end-to-end against `npm start` on :4200. **Local only** —
  it needs a running dev server and the gitignored `.env.test`, so it will not
  work from a Claude Code *web* session (cloud sandbox). Remote Control
  sessions run on this machine and are fine.
- **Playwright MCP connects** (verified 2026-08-01): `.mcp.json` (chromium,
  iPhone 13, `--isolated`) + `enabledMcpjsonServers` in `.claude/settings.json`
  means the server starts and its tools are available with no prompt. Plain
  `"command": "npx"` works on Windows — no `npx.cmd` needed. Not yet driven
  through a full click-through.
- **Automation account created**: `radar-auto@partypick.test` (`.env.test`,
  gitignored). Driven through onboarding via the UI, so its state is what a
  real user has. `pp-test-1/2/3` verified working and left untouched.

## Environment

- Work moved to a **dedicated always-on desktop** (2026-08-01). Repo lives at
  `c:\Workspace2\radar` (no hyphen).
- Rory drives this from **remote Claude Code**, so anything a session needs must
  be committed to the repo, not left on a local disk.
- **Open `c:\Workspace2\radar` as the editor folder, not the parent
  `c:\Workspace2`.** Project root = the opened folder, and `.mcp.json`,
  `.claude/` and `/state` only resolve from the repo root. This bit us once.
- The **`claude` CLI is not installed** on this machine — work happens through
  the VS Code extension. That means no `claude remote-control` server mode
  (which would survive VS Code closing) and no `claude mcp` subcommands. Rory
  deferred installing it (`irm https://claude.ai/install.ps1 | iex`).
- Context checks: **`/context` works from mobile/web**; a custom status line
  would only render in a local terminal, so it was not set up. This session's
  context window is 1M tokens.
- **Push to main = live deploy.** Vercel auto-deploys `main`; there is no
  staging gate. `npm run build` must pass before every push.
- `.env` is present and verified on this machine (all 7 keys; Supabase project
  `domneconesznimnzxdsx` reachable, auth healthy). It is gitignored — a new
  machine needs it copied by hand.

## Recent pushes

*Newest first. Each entry: what changed and what the next session needs to know.
Keep 5.*

### Location suite v0.14 (2026-08-01) — this push
Migrations 0016–0019 (report/block + taste-match confidence floor · location
layer + geo RPCs + friend-trip trigger · trigger actor_name repair ·
city_guide enum cast — the two repairs exist because 0017 shipped bugs
verification caught). Edge: `places-autocomplete` NEW; `places-search`/
`place-detail` redeployed with Pro-tier masks + metadata-merge upsert. New
CLAUDE.md § Location suite carries the invariants. Leaflet added (npm) for
`shared/ui/map-view.ts`.

### `b9321b6`…`c5b0b47` — Location analysis & decision pass (2026-08-01)
`docs/LOCATION-ANALYSIS.md` written, all 15 ideas decided, gotchas G1–G9,
Gemini deliberately retained (HANDOFF decisions log).

### `25b9304` + `01dd31c` — Session continuity & visual testing (2026-08-01)
STATE.md introduced, Playwright + `scripts/shot.mjs` added, Playwright MCP
configured (now verified working, incl. interactive click-through).

### `0280679` — Search overhaul (v0.13, 2026-08-01)
Server-driven Explore, Open Library books, curated chips. Established the
search rules now recorded in CLAUDE.md § Hard rules 3–4.

## Next steps

1. **Rory reviews v0.14** (screenshots + live app) — especially the picker /
   saved-places UI he flagged, the "Friends & quests" copy, and whether
   geo-discoverability feels OK (his test-and-see stance).
2. **Needs-Rory checklist** (LOCATION-ANALYSIS): confirm GCP billing alert;
   create the curator account (unblocks curated city slots, idea 10).
3. **home_location readability gap** (LOCATION-ANALYSIS BUILT §6) — move to
   owner-only table + RPC before real stranger scale.
4. **Premium subscription tier** (HANDOFF queue) — map view is earmarked to
   gate behind it before extensive testers.
5. Older candidates: new-episode tracking · blend slots (#2) ·
   slot-context recs (#14) · native port resume.

## Open gotchas

- **npm audit**: 4 vulnerabilities (3 moderate, 1 high) on this install.
  Deliberately not fixed — `audit fix --force` would bump Angular. Revisit
  only as a standalone task.
- **`supabase/functions/_shared/gemini.ts` is unused but deliberately kept**
  (Rory, 2026-08-01) — nothing has imported it since migration 0013 removed the
  AI pipeline, but it stays as the starting point for future AI features.
  **Don't delete it**, and don't read its presence as evidence the app calls
  Gemini today — it doesn't.
- **Line endings**: `scripts/build-release-notes.mjs` writes LF, so
  `release-notes.generated.ts` can show as modified in `git status` on Windows
  with an empty `git diff`. Harmless; don't "fix" it by hand-editing the
  generated file.
