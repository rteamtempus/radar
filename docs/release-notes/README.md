# Release notes

**These markdown files are the only place release notes are authored.**
`npm run notes:build` compiles them into `src/app/core/release-notes.generated.ts`
(which the app renders in the What's-new modal and the archive page). The
build script also runs automatically on `npm start` and `npm run build`, so a
stale generated file can't ship — but never hand-edit the generated file.

## The rule

Every commit that changes what a user can see or do in the app gets a release
note. See `CLAUDE.md` → *Release notes & regression testing* for the binding
version of this rule; the short form:

- **Write a note for:** new features, changed behaviour, changed wording that
  matters, visual changes people would notice, and bug fixes.
- **Skip:** refactors, docs, tests, dependency bumps, and shell/build work
  that changes nothing visible (the Capacitor port is the reference example —
  real work, no release note).
- **One note per release, not per commit.** If you ship three commits in a
  session, they share one note. If you're adding to a note that hasn't shipped
  yet, edit it rather than creating a second one.

## Format

Filename: `NNNN-short-slug.md`. The 4-digit prefix is the **sequence** — it's
what `profiles.last_seen_release_seq` compares against, so it must increase by
one and must never be reused or renumbered.

```markdown
---
version: 0.10
date: 2026-07-31
title: Notifications & release notes
summary: One sentence, shown in the What's-new list under the title.
---

## Added

- **Bold lead** — what it does, written for the person using the app.

## Changed

- **Bold lead** — what's different now.

## Fixed

- **Bold lead** — what was broken, in terms of what people experienced.
```

Sections must be `Added`, `Changed`, `Fixed`, or `Removed`, and only the ones
you need. Bullets should use the `**lead** — description` shape; a bullet
without a bold lead renders as a plain line. Write for a person who uses the
app, not for someone reading the diff: "restaurant recommendations landed in
your watch list" beats "fixed `recommend_to_friend` domain routing".

## History note

Notes `0001`–`0009` were backfilled on 2026-07-31 from the git history
(commits `56521e1`…`1df1ffa`), grouped into the releases they logically formed
rather than one note per commit. Their dates are the real commit dates. From
`0010` onward they're written as the work ships.
