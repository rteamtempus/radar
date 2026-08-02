# Explore

The discovery browser. Since v0.13 it has **two result models**:

- **Catalog mode** — no search, no API-mappable filters: the local shared
  catalog, filtered client-side, instant.
- **Server mode** (Watch and Read) — type a query or activate a mappable
  filter: results page straight from TMDB / Open Library with a **real result
  count** and infinite scroll. Everything fetched joins the shared catalog.
- Eat and Do stay **explicit-button** (Google calls are billable) with
  "Show 20 more" pagination.

**Shipped in:** v0.7 (Things browser) · v0.9 (Slots and People modes) ·
v0.13 (server-driven search, curated chips, Open Library) · v0.14 (📍 custom
location for Eat/Do, city guides)

Slots and People modes are covered in `social-slots.md`. The 📍 location
chip, precedence rule, city guides and maps are covered in
`location-and-safety.md` (RT-LOC-01…04, 09).

---

## Modes and chips

### RT-EXPL-01 — Three modes

**Steps:** Open the Explore tab.
**Expected:** Mode switches for **Things**, **Slots** and **People**, plus the
domain switcher. Things is the default.

### RT-EXPL-02 — Chips are curated and stable

**Steps:** Note the genre/cuisine/theme chip rows in each domain. Run several
searches, switch domains back and forth, reload.
**Expected:** The chip lists never change: fixed genre list for Watch and
Read, fixed cuisines for Eat, fixed themes for Do. **No junk chips** — nothing
like "Food Store", "Bar", "England", or one-off categories from past searches.

### RT-EXPL-03 — Sorting

**Steps:** Sort by each option per domain.
**Expected:** Watch/Read: Popular ("Most wanted" for Read), Top rated, Newest
— and in server mode these re-run the search so the ORDER covers the whole
catalog, not just loaded rows. A–Z appears only in catalog mode. On a free-text
Watch search the sort row reads "Best match" (TMDB relevance) instead of chips.

---

## Server mode (Watch)

### RT-EXPL-04 — Searching shows real totals + endless scroll

**Steps:** In Watch, type "heist". Scroll to the bottom repeatedly.
**Expected:** A result count appears (hundreds — the TMDB total, not the
loaded count). Reaching the bottom loads more automatically with a spinner
until everything's seen. No "Show more" button in server mode.

### RT-EXPL-05 — Filters query all of TMDB

**Steps:** Clear the search. Tap Horror + 2010s + ★7+.
**Expected:** Results appear WITHOUT typing anything — thousands of results,
ordered by popularity, films Radar had never seen before. Adding
runtime/type/on-my-services narrows further, and the count updates each time.

### RT-EXPL-06 — The person pill

**Steps:** Type "christopher nolan".
**Expected:** Alongside title matches, a violet pill offers "See Christopher
Nolan's films →". Tapping it clears the query and lists his filmography by
popularity (with the real count). The active pill shows an ✕ that returns to
normal browsing.

### RT-EXPL-07 — Local filters still apply on top

**Steps:** In a server search, enable Hide seen and a friends filter.
**Expected:** Fetched results are trimmed locally; the header reads like
"1,563 results · 12 shown" so the difference is explained.

### RT-EXPL-08 — Catalog mode is untouched

**Steps:** Clear query and all filters.
**Expected:** The instant local-catalog browse, exactly as before, with the
count showing the catalog matches and the old Show-more paging.

## Server mode (Read)

### RT-EXPL-09 — Book search is popularity-first, junk-free, title/author-scoped

**Steps:** In Read, search "harry potter". Then search something generic like
"dragon cooking". Then try syntax-hostile input (`dune (deluxe) "edition" +x:`).
**Expected:** One row per actual book (no duplicate house editions, no blank
titles, no 7-page pamphlets), the real books first in want-to-read order, a
real total, and infinite scroll. Searching an author's name ("brandon
sanderson") finds their books without any special syntax. Since v0.15 the
query matches **titles and authors only** — no results dragged in by subject
tags or description text — and weird punctuation must not error.

### RT-EXPL-10 — Genre browsing finds the genre

**Steps:** Clear the search and tap the Sci-Fi chip.
**Expected:** Actual science fiction (Three-Body, Hyperion…), not
mega-popular unrelated books. Add a query on top and popularity ordering
kicks in within the genre.

## Eat / Do (explicit, billable)

### RT-EXPL-11 — Google pulls are explicit + paginated [live data]

**Steps:** In Eat, type a search and press **Search Google**. Then press
**Show 20 more from Google**.
**Expected:** Nothing hits Google until pressed. The first pull returns up to
20; Show-20-more appends the next page and disappears when Google runs out
(~60 results max — Google provides no total count, so none is claimed).

### RT-EXPL-12 — Cuisine-narrowed pulls [live data]

**Steps:** Select the Sushi chip, then press **Pull nearby Sushi**.
**Expected:** The nearby button names the cuisine and Google returns that kind
of place. New places carry at most ONE curated cuisine/theme tag (from their
primary category); places with only a generic category get none.

### RT-EXPL-13 — Eat filters + the anchored radius (v0.15)

**Steps:** Exercise open-now, distance rings, price, rating floor, hide-been,
friends chips, cuisine chips against the local catalog.
**Expected:** Each narrows the list client-side, count updates, Clear all
restores.

### RT-EXPL-16 — Anchored catalog defaults to 30 miles (v0.15)

**Steps:** In Eat with a location anchor (GPS allowed OR a 📍 city picked),
note the list and the footer. Tap **🌍 Everywhere**. Then tap a distance ring.
**Expected:** By default only places within ~30 mi of the anchor show, and
the footer says so ("Places within 30 mi of Austin…"). 🌍 Everywhere restores
the full multi-city catalog (footer flips back). An explicit distance ring
always wins over both. With no anchor at all (GPS denied, no city), the full
catalog shows — never an empty list. Clear resets 🌍.

### RT-EXPL-17 — City-picked Google searches stay in the city (v0.15) [live data]

**Steps:** Pick a city (📍), type a generic query ("ramen"), Search Google.
Compare with a near-me (no city) name search for a distant specific place.
**Expected:** With a city picked, every Google result is inside that metro
(~40 km fence — hard restriction). Without a picked city, name searches still
find far-away places (GPS stays a soft bias).

## Rows (all domains)

### RT-EXPL-14 — Rows read well

**Steps:** Look at result rows in each domain.
**Expected:** Poster, context line (year/vote · rating/price/miles ·
author/pages), service badges with mine highlighted (Watch), coloured friend
initials, my status, one-tap add. One-tap add works from server results too.

### RT-EXPL-15 — Friend signals [2 users]

**Steps:** As u2, mark a title Want to / Watching / rate one 8+. View those in
u1's Explore.
**Expected:** Gold/green/violet initial chips on the rows, in both catalog and
server modes.
