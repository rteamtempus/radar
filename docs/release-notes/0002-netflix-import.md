---
version: 0.2
date: 2026-07-24
title: Netflix history import
summary: Upload the viewing history Netflix gives you and Radar fills in years of watches in one go.
---

## Added

- **Netflix history import** — On the You page, upload the CSV Netflix exports
  from your account page. Radar matches each title, groups episodes back into
  the show they belong to, and marks them finished.
- **Import preview** — You see what was found and how many titles will be
  imported before anything is written, capped at the 400 most recent.
- **Live progress** — A progress bar during the import and a summary of
  anything that couldn't be matched at the end.

## Changed

- **Imports never overwrite you** — Ratings and want-to entries you already had
  survive a re-import untouched.
- **Imported titles count as seen** — Party picks stop suggesting films you
  watched years ago, and your taste profile updates from the new history.
