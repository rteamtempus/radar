// tmdb-discover — filter-driven Watch browsing with real totals (v0.13).
//
// POST {
//   kind?: 'movie' | 'tv' | 'both'      (default 'both')
//   page?: number
//   genres?: string[]                   curated slugs (vocab.ts) → per-kind ids
//   decade?: number                     2020 | 2010 | 2000 | 1 ("90s & older")
//   vote_gte?: number                   TMDB vote floor
//   runtime_lte?: number                minutes (movies only — TMDB can't cap tv)
//   providers?: string[]                streaming_services slugs → with_watch_providers
//   person_id?: number                  from tmdb-search's `person` hint
//   sort?: 'popular' | 'rating' | 'newest'
// }
// → { results, total, page, has_more }. 'both' fans out to /discover/movie +
//   /discover/tv on the same page number and interleaves; total is the sum.
//   Rating sort gets a vote_count floor so a 10.0 with 3 votes doesn't win.
import { json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { TmdbKind, TmdbListItem, tmdbFetch, tmdbGenres, upsertActivity } from '../_shared/tmdb.ts';
import { genreIdsFor } from '../_shared/vocab.ts';

const SORT_MAP: Record<string, string> = {
  popular: 'popularity.desc',
  rating: 'vote_average.desc',
  newest: 'primary_release_date.desc',
};
// TV uses a different date field for "newest".
const TV_SORT_MAP: Record<string, string> = { ...SORT_MAP, newest: 'first_air_date.desc' };

interface DiscoverPage {
  results: TmdbListItem[];
  total_results: number;
  total_pages: number;
}

serve(async (req) => {
  await requireUser(req);

  const body = await req.json().catch(() => ({}));
  const kind: 'movie' | 'tv' | 'both' = ['movie', 'tv'].includes(body.kind) ? body.kind : 'both';
  const pageNum = Math.max(1, Math.min(500, Number(body.page) || 1));
  const genreSlugs: string[] = Array.isArray(body.genres) ? body.genres : [];
  const decade = Number(body.decade) || null;
  const voteGte = Number(body.vote_gte) || null;
  const runtimeLte = Number(body.runtime_lte) || null;
  const providerSlugs: string[] = Array.isArray(body.providers) ? body.providers : [];
  const personId = Number(body.person_id) || null;
  const sort = SORT_MAP[body.sort as string] ? (body.sort as string) : 'popular';

  const db = serviceClient();

  // provider slugs → TMDB ids (seeded on streaming_services)
  let providerIds: number[] = [];
  if (providerSlugs.length) {
    const { data } = await db
      .from('streaming_services')
      .select('slug, tmdb_provider_id')
      .in('slug', providerSlugs);
    providerIds = (data ?? [])
      .map((s) => s.tmdb_provider_id as number)
      .filter((n): n is number => !!n);
  }

  const fetchKind = (k: TmdbKind): Promise<DiscoverPage> => {
    const genreIds = genreIdsFor(genreSlugs, k);
    // A movie-only genre (horror, romance…) has no tv ids — asking tv for
    // "anything" would flood the results, so return an empty page instead.
    if (genreSlugs.length && !genreIds.length) {
      return Promise.resolve({ results: [], total_results: 0, total_pages: 0 });
    }
    const dateField = k === 'movie' ? 'primary_release_date' : 'first_air_date';
    return tmdbFetch<DiscoverPage>(`/discover/${k}`, {
      page: pageNum,
      include_adult: 'false',
      sort_by: (k === 'tv' ? TV_SORT_MAP : SORT_MAP)[sort],
      with_genres: genreIds.length ? genreIds.join('|') : undefined,
      // rating/newest sorts need a votes floor or obscure junk dominates
      'vote_count.gte': sort === 'popular' ? undefined : 200,
      'vote_average.gte': voteGte ?? undefined,
      'with_runtime.lte': k === 'movie' && runtimeLte ? runtimeLte : undefined,
      with_watch_providers: providerIds.length ? providerIds.join('|') : undefined,
      watch_region: providerIds.length ? 'US' : undefined,
      with_people: k === 'movie' && personId ? personId : undefined,
      // decade windows
      [`${dateField}.gte`]: decade && decade !== 1 ? `${decade}-01-01` : undefined,
      [`${dateField}.lte`]:
        decade === 1 ? '1999-12-31' : decade ? `${decade + 9}-12-31` : undefined,
    });
  };

  // with_people only exists on /discover/movie — a person search is movie-only.
  const kinds: TmdbKind[] =
    personId ? ['movie'] : kind === 'both' ? ['movie', 'tv'] : [kind as TmdbKind];
  const pages = await Promise.all(kinds.map(fetchKind));

  // Interleave movie/tv so 'both' doesn't show 20 films then 20 shows.
  const interleaved: { kind: TmdbKind; item: TmdbListItem }[] = [];
  const max = Math.max(...pages.map((p) => p.results.length), 0);
  for (let i = 0; i < max; i++) {
    pages.forEach((p, idx) => {
      const item = p.results[i];
      if (item?.poster_path) interleaved.push({ kind: kinds[idx], item });
    });
  }

  const genres = await tmdbGenres();
  const results = await Promise.all(
    interleaved.map(({ kind: k, item }) =>
      upsertActivity(
        db,
        k,
        item,
        (item.genre_ids ?? []).map((id) => genres.get(id)).filter((g): g is string => !!g),
      ),
    ),
  );

  return json({
    results,
    total: pages.reduce((sum, p) => sum + p.total_results, 0),
    page: pageNum,
    has_more: pages.some((p) => pageNum < p.total_pages),
  });
});
