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

- **Location suite — decision pass COMPLETE, no code yet.**
  `docs/LOCATION-ANALYSIS.md` is authoritative: approved 2–10/12/13, denied
  11/14, deferred 1/15; gotchas G1–G9; 4-phase build plan. **Next move:
  start phase 0** (quest-slot visibility redesign, minimal report/block,
  G8 field-mask split + metadata merge). Notable: premium subscription tier
  decided ("soon") → HANDOFF queue; maps = OSM/Leaflet, never Google SDK;
  Places Autocomplete + locality search verified working on the existing key
  (no new Google setup needed).
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

### `25b9304` + `01dd31c` — Session continuity & visual testing (2026-08-01)
STATE.md introduced, Playwright + `scripts/shot.mjs` added, Playwright MCP
configured. Tooling only, no app code — no release note by design.

### `0280679` — Search overhaul (v0.13, 2026-08-01)
Server-driven Explore, Open Library books, curated chips. Established the
search rules now recorded in CLAUDE.md § Hard rules 3–4 (TMDB `search/multi`
vs `discover`, Open Library over Google Books, curated slugs only).

### `98d5142` — API capabilities investigation (2026-07-31)
Wrote `docs/API-CAPABILITIES.md` — verified limits for Places/Books/TMDB.
Consult it before assuming any provider can filter, sort, or count.

### `e2057d1` — Adventures planning-first (2026-07-31)
Adventures are created standalone from the Quests tab and own the join code;
the join box tries adventures before quests. `adventure_create_from_party`
still exists in the schema but is no longer called.

## Next steps

Nothing committed to. Candidates, in rough priority order:

1. **Quest slot visibility redesign** — the interim rule (CLAUDE.md § Quests 2)
   leaks friends-only slot contents to anyone who joins by code. Needs a real
   model before stranger-facing discovery grows. Design debt, Rory's call.
2. **New-episode tracking** — TMDB `next_episode_to_air` + scheduled edge
   function + "Coming up" UI. Flagged high value in HANDOFF.md.
3. **Blend slots (#2)** and **slot-context recommendations (#14)** — approved
   social ideas, unbuilt. See `docs/SOCIAL-SLOTS-ANALYSIS.md`.
4. **Native port** resume — blocked on the Mac milestone-1 test
   (`docs/NATIVE-PORT-STATUS.md`).

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
