---
version: 0.15
date: 2026-08-02
title: Search results that stay where you're looking
summary: Eat & Do results stick to your area (or your picked city) by default, city searches stop drifting to other towns, and book search only matches titles and authors.
---

## Fixed

- **No more New York restaurants in Kansas City** — With a location (yours or
  a picked city), Eat and Do now show places within 30 miles by default
  instead of the whole catalog sorted by rating. A 🌍 Everywhere chip brings
  the full catalog back when you want it.
- **City searches stay in the city** — Searching Google with a picked city now
  hard-limits results to that area. Before, the city was only a "suggestion"
  Google would happily ignore for far-away places it liked better. Plain
  near-me searches are unchanged, so looking a place up by name still works
  from any distance.
- **Book search stops wandering** — Searching Read now matches book titles
  and author names only. No more results dragged in because your words
  appeared somewhere in a book's subject tags or description. Author search
  ("brandon sanderson") works exactly as before.
- **Empty results explain themselves** — When a cuisine or filter comes up
  empty in Eat & Do, the app now says why (Radar may simply not have scouted
  that here yet) and offers a one-tap "Pull nearby from Google" right there —
  one call, and the answer is remembered for everyone. Filters themselves
  never call Google; they narrow what Radar already knows.
