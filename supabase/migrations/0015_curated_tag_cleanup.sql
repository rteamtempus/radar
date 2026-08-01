-- ============================================================================
-- RADAR — 0015_curated_tag_cleanup
-- Filter chips are now CURATED vocabularies (functions/_shared/vocab.ts +
-- src/app/core/vocab.ts) instead of whatever strings the APIs handed us, and
-- taggers write only curated slugs (Places primaryType → cuisine/theme,
-- Open Library subjects → genre buckets). This migration sweeps out the junk
-- tags the old taggers minted (bar, night_club, food_store, "England"…) so
-- old catalog rows stop polluting anything that reads the tag table.
--
-- Safety rails:
--   * tags referenced by slot_tags are KEPT — people chose those on purpose.
--   * genre-kind tags are shared between TMDB titles and books; only tags
--     attached EXCLUSIVELY to books (or nothing) are candidates, and the TMDB
--     genre vocabulary is whitelisted explicitly.
--   * deletes cascade to activity_tags (FK on delete cascade), nothing else.
-- ============================================================================

-- ---- cuisine + theme: keep only the curated slugs --------------------------

delete from tags t
where t.kind = 'cuisine'
  and t.slug not in (
    'pizza','burgers','mexican','italian','chinese','japanese','sushi','ramen',
    'thai','indian','korean','vietnamese','mediterranean','american','bbq',
    'seafood','steak','breakfast','cafe','dessert','vegan'
  )
  and not exists (select 1 from slot_tags st where st.tag_id = t.id);

delete from tags t
where t.kind = 'theme'
  and t.slug not in (
    'museum','art','amusement-park','zoo','aquarium','bowling','park','hiking',
    'landmark','theater','games','spa'
  )
  and not exists (select 1 from slot_tags st where st.tag_id = t.id);

-- ---- genre: sweep book-only junk ("England", "Juvenile Fiction"…) ----------
-- Keep: the fixed TMDB genre vocabulary, the curated book buckets, anything a
-- slot uses, and anything attached to a non-book activity.

delete from tags t
where t.kind = 'genre'
  and t.slug not in (
    -- TMDB movie + tv genres (slugified names, as upsertActivity writes them)
    'action','adventure','animation','comedy','crime','documentary','drama',
    'family','fantasy','history','horror','music','mystery','romance',
    'science-fiction','thriller','tv-movie','war','western',
    'action-and-adventure','kids','news','reality','sci-fi-and-fantasy',
    'soap','talk','war-and-politics',
    -- curated book buckets (vocab.ts BOOK_BUCKETS)
    'historical-fiction','young-adult','children','biography','science',
    'self-help','business','cooking','poetry','classics','comics'
  )
  and not exists (select 1 from slot_tags st where st.tag_id = t.id)
  and not exists (
    select 1
    from activity_tags at2
    join activities a on a.id = at2.activity_id
    where at2.tag_id = t.id and a.type <> 'book'
  );
