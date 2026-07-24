// tmdb-search
//
// POST { query: string }
// → /search/multi filtered to movie+tv (with posters), each hit upserted into
//   activities + genre tags; returns the app-side rows so the client works
//   against our ids from the first touch.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { TmdbKind, TmdbListItem, tmdbFetch, tmdbGenres, upsertActivity } from '../_shared/tmdb.ts';

const MAX_RESULTS = 12;

serve(async (req) => {
  await requireUser(req);

  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || !query.trim()) {
    throw new HttpError(400, 'Expected body { query: string }');
  }

  const data = await tmdbFetch<{ results: TmdbListItem[] }>('/search/multi', {
    query: query.trim(),
    include_adult: 'false',
  });
  const hits = data.results
    .filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
    .slice(0, MAX_RESULTS);

  const genres = await tmdbGenres();
  const service = serviceClient();
  const results = await Promise.all(
    hits.map((hit) =>
      upsertActivity(
        service,
        hit.media_type as TmdbKind,
        hit,
        (hit.genre_ids ?? []).map((id) => genres.get(id)).filter((g): g is string => !!g),
      ),
    ),
  );

  return json({ results });
});
