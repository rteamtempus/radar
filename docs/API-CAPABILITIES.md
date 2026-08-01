# Search-API capabilities — investigation notes (2026-07-31)

What Google Places (New), Google Books, and TMDB can and cannot do for
category filters, popularity sorting, pagination/totals, and complex search —
plus alternatives. Everything marked **[verified]** was probed live against
the real APIs with our keys on this date; the rest is from provider docs.

## The short version

| Capability | Places (New) | Google Books | TMDB |
| --- | --- | --- | --- |
| "Most common categories" endpoint | ✗ (fixed taxonomy instead) | ✗ (freeform strings) | ✓ effectively (fixed 19-genre list) |
| Clean per-item category | ✓ `primaryType` **[verified]** | ✗ | ✓ genre ids |
| Popularity sort | ✓ nearby (`rankPreference=POPULARITY`); text ranks by relevance | ✗ relevance/newest only **[verified]** | ✓ `sort_by=popularity.desc` **[verified]** |
| Pagination | ✓ `pageToken`, 20/page, ~60 cap **[verified]** | ✓ `startIndex` (buggy at depth) | ✓ `page`, 20/page, 500-page cap **[verified]** |
| Real total count | ✗ none in response **[verified]** | ✗ `totalItems` is junk **[verified]** | ✓ `total_results` **[verified]** |
| Search by category/author/etc. | Partial (free text loose; `includedType` reliable) | ✓ `inauthor:` `subject:` `intitle:` **[verified]** | ✓ via `discover` + person/keyword lookup **[verified]** |

## Google Places (New) — Eat + Do

**Categories.** There is no "most-used categories" API. But the type taxonomy
is a *fixed, documented list* (Table A), including ~50 cuisine-specific
restaurant types (`italian_restaurant`, `sushi_restaurant`,
`ramen_restaurant`…) and the Do-adjacent set (`museum`, `art_gallery`,
`amusement_park`, `bowling_alley`…). Two fixes for inconsistent chips:

1. **Tag from `primaryType`, not the `types` array.** Every place has one
   canonical `primaryType` + a localized `primaryTypeDisplayName`
   **[verified: "Caroline" → `american_restaurant` ("American Restaurant")]**.
   The `types` array is where the junk comes from (`point_of_interest`,
   `establishment`, `food`, `store` …). We currently tag from `types`.
2. **Ship a curated, stable chip list** drawn from Table A (the ~15 cuisines /
   ~10 outing types that matter), query them with `includedType`, and keep
   frequency-ranking within the catalog for ordering. Chips stop being
   whatever the last search dragged in.

**Popularity.** `searchNearby` already supports `rankPreference: POPULARITY`
(we use it). `searchText` ranks by relevance; no explicit popularity sort, but
`rating` × `userRatingCount` is returned for client-side ordering.

**Pagination & totals [verified].** `searchText` paginates: `pageSize` (max
20) + `nextPageToken` → pass back as `pageToken`. Page 2 confirmed working.
The response contains **only** `places` and `nextPageToken` — there is no
total-count field anywhere, and the docs cap text search at 60 results
(3 pages). `searchNearby` does **not** paginate at all (max 20, no token).
→ Infinite scroll: yes, to 60. "N results for this search": impossible from
Google; only "20+" phrasing or the count of what we've fetched.

**Complex search.** `textQuery` is free-form and understands category-ish
queries in principle, but it's loose — **[verified: "cheap sushi" biased to
Austin returned a Chinese takeout, a chicken joint, and a pizzeria]**. For
dependable category narrowing use `includedType` (one type per request);
free text is fine for vibe queries but shouldn't back a filter chip.

**Alternatives.** Foursquare has a rich category taxonomy + popularity data,
but its free tier is shrinking (pay-as-you-go; ~500 free Pro calls/month from
June 2026). Yelp Fusion's free tier is effectively gone. **Recommendation:
stay on Google Places** — the gaps (no totals, 60-result cap) are livable and
nobody else is cheaper for our volume.

## Google Books — Read

**The junk is structural.** We already send `printType=books`; it only
excludes magazines. The junk (blank titles, 7-page pamphlets, box sets, and
four "house edition" reprints of the same novel **[verified in the top-10 for
"harry potter"]**) are all legitimately "books" to Google, because the catalog
is *edition-level* with no work-level grouping and no quality signal. API-side
there is no fix — only client heuristics (require authors + cover +
pageCount ≥ ~80, dedupe on title+first author).

**Popularity.** `orderBy` accepts only `relevance` (default) and `newest`.
`popularity` is rejected with a 400 **[verified]**. `averageRating` /
`ratingsCount` exist but are sparsely populated. There is no way to get
"most popular first" from this API.

**Totals [verified].** `totalItems` returned exactly **300 for every query
tried** (harry potter, an author search, a subject search) — it is an
estimate so bad it's a constant. Do not display it. `startIndex` pagination
works but is community-notorious for duplicates/gaps at deeper offsets.

**Complex search [verified — the good news].** Field-scoped queries all work
and combine: `inauthor:"Brandon Sanderson"` → his books;
`subject:"cooking" italian` → Italian cookbooks; `intitle:dune
inauthor:herbert` → Dune. Author/category search needs no new API.

**Alternative — Open Library (recommended) [verified].** Free, no key, CORS
open, work-level grouping. `search.json?q=harry+potter&sort=want_to_read`
returned: **one row per actual book** (Philosopher's Stone, Chamber of
Secrets… in series-popularity order, no duplicate editions), a **real total**
(`numFound=3878`), real popularity signals (`want_to_read_count=19854` on
book 1), ratings (`ratings_average` + count), `edition_count`, covers via
covers.openlibrary.org. Sorts: `want_to_read`, `readinglog`, `already_read`,
`rating`, `editions`, `new`/`old`. Scoped params: `author=`, `subject=`,
`title=`. Weaknesses: no description in search results (needs a per-work
follow-up fetch), metadata quality varies on obscure titles, and it's a
nonprofit API — be polite with rate. **Hybrid shape that fits us:** Open
Library for search/browse/popularity/totals; keep Google volume data where
we already have it (nothing forces a migration of existing rows —
`external_source` distinguishes them).

## TMDB — Watch

The most capable of the three; no replacement needed.

**Search matches names only [verified].** `search/movie?query=christopher
nolan` → 4 results, all *titles* containing the words. People/genres/keywords
are not matched by `search/movie|tv`.

**Discover is the real search engine [verified].** `discover/movie|tv` takes
combinable filters: `with_genres`, `with_keywords`, `with_people` /
`with_cast` / `with_crew`, year/date ranges, `with_runtime.lte`,
`vote_average.gte`, **`with_watch_providers`** (server-side "on my
services"), and `sort_by` popularity/rating/revenue/date. The two-step
pattern covers author-style search: `search/person` ("christopher nolan" →
id 525) → `discover?with_people=525&sort_by=popularity.desc` → 61 films,
The Odyssey first. Same with `search/keyword` ("time travel" → id 4379 →
1,114 films, Interstellar first). `search/multi` returns movies + TV +
people in one query for a smart searchbox.

**Pagination & totals [verified].** Everything returns `page`,
`total_pages`, `total_results` (real numbers: "heist" → 263 across 14 pages;
discover horror-2025 → 5,204), 20/page, hard cap page ≤ 500. Infinite scroll
with an accurate "N results" header: fully supported.

**Categories.** `/genre/movie/list` + `/genre/tv/list` are fixed ~19-entry
lists — stable chips for free. Keywords are the long tail (searchable, not
enumerable).

## What this means for the filter-chip problem

None of the APIs tells you "most-used filters". The consistent-chips fix is
the same everywhere: **curated fixed vocabularies per domain** (Places Table A
subset · TMDB genre list · a bucketed subject list for books), tag incoming
items against them from the *clean* field (`primaryType`, genre ids, mapped
subjects), and keep using catalog frequency only to *order* chips, never to
*invent* them. The junk chips exist because we currently mint a tag for
whatever string the APIs hand us.
