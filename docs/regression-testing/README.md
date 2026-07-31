# Regression testing

Manual test scripts for every feature in Radar, kept current as the app
changes. These exist so Rory and his partners can check a release without
guessing what to poke at — and so nobody has to rediscover how a feature is
supposed to behave six months from now.

## How this folder works

- **One file per feature area.** Each file is the *current* truth about how
  that feature should behave. When a feature changes, its file is **edited**,
  not appended to. There is no history in these files — that's what
  `docs/release-notes/` is for.
- **`RELEASES.md` is the index of what to retest.** Every release adds an entry
  listing which feature files it touched. That's your test plan for the
  release: read the entry, run those files.
- **Test IDs are stable.** `RT-NOTIF-03` means the same thing next year. If a
  test stops applying, delete it and leave the numbers around it alone — never
  renumber to close the gap.

## How to run a pass

1. Open `RELEASES.md`, find the release you're testing.
2. Run every test in the files it lists. That's the regression pass.
3. For a full sweep (before a store submission, say) run every file.

## Test accounts

Three seeded accounts on the live project, used throughout:

| Account | Email | Password | Notes |
| --- | --- | --- | --- |
| u1 | `pp-test-1@partypick.test` | `partypick-test-1!` | Friends with u2. Owns the public slot **High movies**. |
| u2 | `pp-test-2@partypick.test` | `partypick-test-2!` | Friends with u1. Subscribed to High movies. |
| u3 | `pp-test-3@partypick.test` | `partypick-test-3!` | **Outsider** — friends with nobody. Used for "can a stranger see this?" checks. Keep it that way. |

Existing party codes: `TESTP2`, `TESTP3`, `QUEST1`.

Anything that needs two people at once is easiest with one normal window and
one private/incognito window.

## Conventions in the test files

- **Steps** are what you do. **Expected** is what you should see. If they
  disagree, that's the bug — file it against the feature file's ID.
- Tests marked **[2 users]** need two accounts signed in at once.
- Tests marked **[live data]** hit a paid or rate-limited external API (Google
  Places, Google Books, TMDB, Gemini). Run them, but don't loop them.
- Tests marked **[native]** need a Capacitor build on a simulator or device,
  not the browser.
- "Cold start" means: force-quit / hard-refresh so nothing is cached in
  memory.

## Files

| File | Covers |
| --- | --- |
| `accounts-and-onboarding.md` | Sign up, sign in, onboarding, taste calibration, streaming services |
| `radar-and-slots.md` | Radar home, slots, queues, reordering, slot pages |
| `titles-and-statuses.md` | Title pages, the five statuses, ratings, notes, history |
| `explore.md` | Discovery browser, filters, friend signals, one-tap add |
| `friends-and-recommendations.md` | Friend codes, requests, friend profiles, recommending |
| `social-slots.md` | Visibility tiers, likes, saves, forks, taste match, slot & people discovery |
| `quests.md` | Party create/join/lobby/mood, AI picks, swiping, voting, reveal, pulse |
| `domains.md` | Watch / Eat / Do / Read behaviour and per-domain differences |
| `netflix-import.md` | CSV import |
| `notifications.md` | Notification bell, badges, What's new, release notes |
| `platform.md` | PWA install, update pill, native shells, offline, safe areas |
