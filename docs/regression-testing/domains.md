# Domains — Watch, Eat, Do, Read

The four verticals share one set of machinery (slots, search, detail pages,
statuses, recommendations) but differ in wording, data source and filters. This
file is the cross-domain checklist; the behaviour itself is tested in the
feature files.

**Shipped in:** v0.6 (Eat) · v0.8 (Do, Read)

Data sources: Watch → TMDB · Eat and Do → Google Places (New) · Read → Google
Books. All external calls happen in edge functions — **never from the
browser**. If a network tab ever shows a TMDB, Google or Gemini key, that's a
release-blocking bug.

---

### RT-DOM-01 — The switcher

**Steps:** On Radar and on Explore, look at the domain switcher.
**Expected:** Watch, Eat, Do and Read in a scrollable row on both. Your choice
persists across navigation and reloads.

### RT-DOM-02 — Per-domain starter slots

| Domain | Expected starter slots |
| --- | --- |
| Watch | Watching now · Up next · Rewatch (loops) · Recommended to me |
| Eat | Want to try · Go-to spots (keeps) · Recommended to me |
| Do | Want to go · Favourites · Recommended to me |
| Read | Reading · Want to read · Favourites · Recommended to me |

**Steps:** Check each domain on a fresh account.
**Expected:** The table above. Role slots in one domain never show up in
another.

### RT-DOM-03 — Per-domain statuses

| Domain | Statuses | Again-toggle |
| --- | --- | --- |
| Watch | Want to · Watching · Done · Stopped · Not for me | Would watch again |
| Eat | Want to try · Been there · Not for me | Would go again |
| Do | Want to go · Been there · Not for me | Would go again |
| Read | Want to read · Reading · Finished · Not for me | Would read again |

**Expected:** The wording is right in every domain. You never see "Watching" a
restaurant.

### RT-DOM-04 — Eat detail [live data]

**Steps:** Open a restaurant.
**Expected:** Open-now badge, address, price level, rating, cuisine chips,
collapsible hours, and links to Maps, phone and website. The details refresh
when you view it (Google's terms allow storing only the place id long-term).

### RT-DOM-05 — Do detail [live data]

**Steps:** Search Do nearby and open a result.
**Expected:** Museums, galleries, zoos, amusement parks and similar, over a
wider radius than restaurants. Tags read as themes rather than cuisines.
Refreshing the detail does not turn it into a restaurant.

### RT-DOM-06 — Read detail [live data]

**Steps:** Search a book and open it.
**Expected:** Author, page count, year, rating, category tags, and a link out
to Google Books.

### RT-DOM-07 — Location handling

**Steps:** Grant, then deny, location permission; try Eat and Do.
**Expected:** Granted — nearby and distance work. Denied — the app says so
gracefully and everything else still works. No hanging spinner, no repeated
prompts.

### RT-DOM-08 — Recommendations route per domain [2 users]

Covered by `friends-and-recommendations.md` RT-FRND-09. Re-run it whenever a
domain is added or `recommend_to_friend` is touched.

### RT-DOM-09 — Quests are watch-only

**Steps:** Try to start a quest from Eat, Do or Read.
**Expected:** Not offered. This is a known limitation, not a bug — the pipeline
is media-only today.

### RT-DOM-10 — Adding a fifth domain

Whenever a domain is added, this whole file must be updated *and* re-run:
starter slots, statuses, filters, detail layout, recommendation routing, and
the Explore filter set for the new domain.
