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

- **No feature work in flight.** Last shipped release is **v0.13 search
  overhaul** (`0280679`). The commit after it is machine/tooling setup only —
  no app code changed, so no release note (CLAUDE.md skip list).
- Next task is undecided — pick from *Next steps* below or HANDOFF.md's queue.
- **First thing worth doing:** confirm the Playwright MCP actually connects
  (`/mcp`), since it shipped untested.

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
- **Playwright MCP configured** in `.mcp.json` (chromium, iPhone 13,
  `--isolated`) and pre-approved via `.claude/settings.json`
  (`enabledMcpjsonServers`), so it activates with no prompt. **Still untested**
  — first use will `npx`-download `@playwright/mcp`. If it misbehaves on
  Windows, the likely culprit is `"command": "npx"` needing to be `npx.cmd`.
- **Automation account created**: `radar-auto@partypick.test` (`.env.test`,
  gitignored). Driven through onboarding via the UI, so its state is what a
  real user has. `pp-test-1/2/3` verified working and left untouched.

## Environment

- Work moved to a **dedicated always-on desktop** (2026-08-01). Repo lives at
  `c:\Workspace2\radar` — note HANDOFF.md still says `c:\Workspace-2\radar`
  (hyphen); that path is stale, fix it next time that file is touched.
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

### `b21605d` — Quests rebuilt on slots (2026-07-31)
Migration 0013 replaced the AI candidate pipeline; `generate-candidates` is
deleted, not dormant. Deck = union of picked slots. Don't reintroduce scoring.

### `9a63707` — Notifications inbox + release-notes system (2026-07-31)
Migration 0012. Clients never insert notifications; producers are SECURITY
DEFINER triggers/RPCs calling `notify_user()`.

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
- **Line endings**: `scripts/build-release-notes.mjs` writes LF, so
  `release-notes.generated.ts` can show as modified in `git status` on Windows
  with an empty `git diff`. Harmless; don't "fix" it by hand-editing the
  generated file.
