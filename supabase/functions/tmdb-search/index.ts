// tmdb-search
//
// POST { query: string, page? }
// → /search/multi filtered to movie+tv (with posters), each hit upserted into
//   activities + genre tags. v0.13: returns real pagination ({ total, page,
//   has_more }) and, when the query looks like a person ("christopher nolan"),
//   a `person` hint the client renders as a filmography pill — tapping it
//   switches to tmdb-discover with_people.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { TmdbKind, TmdbListItem, tmdbFetch, tmdbGenres, upsertActivity } from '../_shared/tmdb.ts';

interface MultiItem extends TmdbListItem {
  known_for_department?: string;
  profile_path?: string | null;
}

serve(async (req) => {
  await requireUser(req);

  const { query, page } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || !query.trim()) {
    throw new HttpError(400, 'Expected body { query: string }');
  }
  const pageNum = Math.max(1, Math.min(500, Number(page) || 1));

  const data = await tmdbFetch<{
    results: MultiItem[];
    total_results: number;
    total_pages: number;
  }>('/search/multi', {
    query: query.trim(),
    include_adult: 'false',
    page: pageNum,
  });

  const hits = data.results.filter(
    (r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path,
  );

  // The pill: the first person TMDB matched (search/multi mixes them in).
  const personHit = data.results.find((r) => r.media_type === 'person');
  const person = personHit
    ? {
        id: personHit.id,
        name: personHit.name ?? '',
        department: personHit.known_for_department ?? null,
      }
    : null;

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

  return json({
    results,
    total: data.total_results,
    page: pageNum,
    has_more: pageNum < data.total_pages,
    person,
  });
});
