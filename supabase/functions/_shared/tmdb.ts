// TMDB API v3 client (v4 Bearer-token auth). The key never leaves the edge
// runtime — all TMDB traffic goes through these functions (handoff §4).

const TMDB_BASE = 'https://api.themoviedb.org/3';

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${Deno.env.get('TMDB_API_KEY')}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export function posterUrl(posterPath: string | null): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
}

/** activities.external_id convention: '<movie|tv>-<tmdb_id>', e.g. 'movie-603'. */
export function externalId(kind: 'movie' | 'tv', tmdbId: number): string {
  return `${kind}-${tmdbId}`;
}

// TODO(milestone 3): upsertActivityFromTmdb(service, kind, detail) — upsert
// into activities (keyed on external_source='tmdb'), map genres → tags
// (kind='genre'), store release_year/content_rating/tmdb_vote/
// original_language/tmdb_popularity in metadata, and upsert US flatrate
// watch/providers into activity_availability (offer='subscription',
// last_checked_at=now(), refresh when older than 7 days).
