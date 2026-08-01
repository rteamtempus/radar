---
version: 0.13
date: 2026-08-01
title: Search that actually searches
summary: Explore now searches all of TMDB and a better book catalog with real result counts and endless scrolling — and the filter chips stop being random.
---

## Added

- **Real result counts** — Searching or filtering Watch and Read now shows how
  many results actually exist ("1,563 results"), not just how many happen to be
  loaded.
- **Endless scrolling** — Keep scrolling and Watch and Read keep loading, page
  after page, until you've seen everything that matches.
- **Search by filmography** — Type a director or actor's name ("christopher
  nolan") and a pill offers their films, most popular first.
- **Filters that search everything** — Genre, decade, rating floor, runtime,
  movies-vs-shows and on-my-services now query all of TMDB, not just what
  Radar had already seen. Pick Horror + 2010s + ★7+ and you're browsing the
  real thing.
- **More from Google** — Eat and Do searches can fetch the next 20 results
  with a "Show 20 more" button (Google caps searches around 60).
- **Cuisine-narrowed pulls** — Select a cuisine chip before pulling nearby
  spots and Google is asked for exactly that ("Pull nearby Sushi").

## Changed

- **Books run on a better catalog** — Book search switched to Open Library:
  one result per actual book instead of a pile of editions and box sets,
  ordered by how many people want to read it. The blank-titled junk and
  7-page pamphlets are gone. Existing books on your radar are untouched.
- **"Most wanted" book sorting** — Read's sort options are now Most wanted,
  Top rated and Newest, and they order the whole catalog, not just the loaded
  page.
- **Consistent filter chips** — Genre, cuisine and theme chips are now fixed,
  curated lists instead of whatever categories the last search dragged in. No
  more "Food Store" or "England" chips.
- **Cleaner place categories** — Places are tagged by their single primary
  category (what Google actually considers them), so a steakhouse that also
  has a bar stops showing up as "Bar · Night Club".

## Fixed

- **Genre browsing for books finds the genre** — Browsing a book genre used to
  lean on loose matching that could surface wildly popular unrelated books;
  it now returns books that are actually that genre.
