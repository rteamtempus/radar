-- ============================================================================
-- PARTYPICK POC — seed data
-- Idempotent (safe to re-run).
-- ============================================================================

-- Streaming services. tmdb_provider_id values from the handoff doc — VERIFY
-- against GET https://api.themoviedb.org/3/watch/providers/movie?watch_region=US
-- before relying on them (milestone 2 checklist item).
insert into streaming_services (slug, name, tmdb_provider_id) values
  ('netflix',        'Netflix',            8),
  ('prime-video',    'Amazon Prime Video', 9),
  ('disney-plus',    'Disney+',            337),
  ('hulu',           'Hulu',               15),
  ('max',            'Max',                1899),
  ('apple-tv-plus',  'Apple TV+',          350),
  ('paramount-plus', 'Paramount+',         531),
  ('peacock',        'Peacock',            386)
on conflict (slug) do nothing;

-- Vibe vocabulary (handoff §5.3) — the bridge between mood check-ins and
-- activities of any type.
insert into tags (kind, slug, label) values
  ('vibe', 'cozy',         'Cozy'),
  ('vibe', 'hype',         'Hype'),
  ('vibe', 'mindless-fun', 'Mindless fun'),
  ('vibe', 'deep',         'Deep'),
  ('vibe', 'dark',         'Dark'),
  ('vibe', 'funny',        'Funny'),
  ('vibe', 'scary-ok',     'Scary-ok'),
  ('vibe', 'romantic',     'Romantic'),
  ('vibe', 'nostalgic',    'Nostalgic'),
  ('vibe', 'mind-bending', 'Mind-bending')
on conflict (kind, slug) do nothing;

-- Calibration set: the 24 well-known TMDB titles live as a constant in the
-- frontend (milestone 4) and are fetched + upserted lazily through the
-- tmdb-detail edge function on first onboarding load — no seed rows here
-- because activities need live TMDB metadata.
