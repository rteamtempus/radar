---
description: Numbered breakdown of STATE.md with prune candidates, so Rory can direct the cleanup
argument-hint: "[nothing to review | 'apply 2,5,7' to delete those entries]"
allowed-tools: Read, Edit, Glob, Grep, Bash(git log:*), Bash(git status:*), Bash(git diff:*)
---

Give Rory a breakdown of `STATE.md` so **he** decides what gets deleted.

Arguments: `$ARGUMENTS`

## If the arguments name entries to apply (e.g. `apply 2,5,7`, `prune 3`, `delete 1 4`)

Use the numbering from the most recent breakdown in this conversation. If there
isn't one, produce the breakdown first and stop — never guess which entry a bare
number refers to.

Delete exactly those entries from `STATE.md` — nothing else, no rewording of
what stays, no "while I was in there" tidying. Then report the entries removed
and the new line count. If a deletion would strand information that belongs
somewhere permanent (a rule, a roadmap item), say so and ask before moving it to
`CLAUDE.md` or `docs/HANDOFF.md` rather than losing it.

## Otherwise — produce the breakdown

1. Read `STATE.md`. Note its total line count against the ~150-line target.
2. **Verify cheaply before judging.** Bounded checks only — `git log --oneline`
   to see which recorded pushes are now old, and a Glob/Grep for any file,
   symbol, or migration an entry names. Do not audit the codebase.
3. Number **every** entry across all sections, continuously (1, 2, 3…), so a
   number is unambiguous to point at. Group them under their section headings.

For each entry give one row:

| # | Section | Entry (≤8 words) | Age | Verdict | Why |

- **Verdict** is one of **KEEP** / **STALE** / **PRUNE**.
  - `PRUNE` — safe to delete: superseded, done, fixed, or older than the last 5
    pushes and no longer explaining current behaviour.
  - `STALE` — the repo contradicts it or it names something that no longer
    exists. Say what's wrong; these need correcting, not just deleting.
  - `KEEP` — a fresh session would waste time without it.
- **Why** is one line. No hedging — if you'd delete it, say `PRUNE`.

Then close with:

- **Size**: current lines vs the ~150 target, and the projected count if every
  `PRUNE` were applied.
- **Recommended**: the comma-separated numbers you'd remove.
- **Belongs elsewhere**: any entry that should be MOVED to `CLAUDE.md` (a rule)
  or `docs/HANDOFF.md` (a roadmap item) instead of deleted.
- The literal invite: *"Run `/state apply <numbers>` to delete."*

**Change nothing on this path.** The breakdown is read-only — no edits to
`STATE.md`, and do not run the CLAUDE.md § Session state cleanup pass here. This
command exists precisely so the pruning is Rory's call, not yours.
