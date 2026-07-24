// TMDB API v3 client + upsert helpers. The key never leaves the edge runtime —
// all TMDB traffic goes through the edge functions (handoff §4). Every fetched
// title is upserted into `activities`, which is the source of truth after
// first touch.
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const TMDB_BASE = 'https://api.themoviedb.org/3';

export type TmdbKind = 'movie' | 'tv';

export interface TmdbListItem {
  id: number;
  media_type?: string;
  title?: string; // movies
  name?: string; // tv
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview?: string;
  genre_ids?: number[];
  vote_average?: number;
  popularity?: number;
  original_language?: string;
}

export interface TmdbDetail extends TmdbListItem {
  runtime?: number; // movies
  episode_run_time?: number[]; // tv
  number_of_seasons?: number;
  genres?: { id: number; name: string }[];
  'watch/providers'?: {
    results?: Record<string, { flatrate?: { provider_id: number }[] }>;
  };
}

export interface ActivityRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  image_url: string | null;
  duration_min: number | null;
  external_source: string | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
}

/** Supports both key formats: v4 read token (eyJ…, Bearer) and v3 key (query param). */
export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const key = Deno.env.get('TMDB_API_KEY') ?? '';
  const isV4 = key.startsWith('eyJ');
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  if (!isV4) url.searchParams.set('api_key', key);
  const res = await fetch(url, {
    headers: isV4
      ? { Authorization: `Bearer ${key}`, Accept: 'application/json' }
      : { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export function posterUrl(posterPath: string | null | undefined): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
}

/** activities.external_id convention: '<movie|tv>-<tmdb_id>', e.g. 'movie-603'. */
export function externalId(kind: TmdbKind, tmdbId: number): string {
  return `${kind}-${tmdbId}`;
}

// TMDB lists tier/channel variants as separate providers. Map them onto the
// canonical ids seeded in streaming_services (verified 2026-07-24, US region).
const PROVIDER_ALIASES: Record<number, number> = {
  175: 8, // Netflix Kids
  1796: 8, // Netflix Standard with Ads
  119: 9, // Amazon Prime Video (regional variant)
  613: 9, // Prime Video Free with Ads
  2100: 9, // Prime Video with Ads
  2243: 350, // Apple TV (+) Amazon Channel
  387: 386, // Peacock Premium Plus
  2553: 386, // Peacock Premium Plus Amazon Channel
  1825: 1899, // HBO Max Amazon Channel
  2616: 2303, // Paramount Plus Essential
  582: 2303, // Paramount+ Amazon Channel
  633: 2303, // Paramount+ Roku Premium Channel
  1853: 2303, // Paramount Plus Apple TV Channel
};

export function canonicalProviderId(id: number): number {
  return PROVIDER_ALIASES[id] ?? id;
}

// Genre id → name, cached per edge-function instance.
let genreMapPromise: Promise<Map<number, string>> | undefined;
export function tmdbGenres(): Promise<Map<number, string>> {
  genreMapPromise ??= (async () => {
    const [movie, tv] = await Promise.all([
      tmdbFetch<{ genres: { id: number; name: string }[] }>('/genre/movie/list'),
      tmdbFetch<{ genres: { id: number; name: string }[] }>('/genre/tv/list'),
    ]);
    const map = new Map<number, string>();
    for (const g of [...movie.genres, ...tv.genres]) map.set(g.id, g.name);
    return map;
  })();
  return genreMapPromise;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function releaseYear(item: TmdbListItem): number | null {
  const date = item.release_date ?? item.first_air_date;
  return date ? Number(date.slice(0, 4)) : null;
}

/** Upsert one TMDB title into activities (+ genre tags). Returns the row. */
export async function upsertActivity(
  service: SupabaseClient,
  kind: TmdbKind,
  item: TmdbListItem | TmdbDetail,
  genreNames: string[],
): Promise<ActivityRow> {
  const detail = item as TmdbDetail;
  const runtime =
    kind === 'movie' ? (detail.runtime ?? null) : (detail.episode_run_time?.[0] ?? null);

  const { data: activity, error } = await service
    .from('activities')
    .upsert(
      {
        type: kind === 'movie' ? 'movie' : 'tv_show',
        title: item.title ?? item.name ?? 'Untitled',
        description: item.overview || null,
        image_url: posterUrl(item.poster_path),
        ...(runtime !== null ? { duration_min: runtime } : {}),
        cost_level: 0,
        external_source: 'tmdb',
        external_id: externalId(kind, item.id),
        metadata: {
          release_year: releaseYear(item),
          tmdb_vote: item.vote_average ?? null,
          original_language: item.original_language ?? null,
          tmdb_popularity: item.popularity ?? null,
          ...(detail.number_of_seasons ? { seasons: detail.number_of_seasons } : {}),
        },
      },
      { onConflict: 'external_source,external_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`activities upsert failed: ${error.message}`);

  if (genreNames.length) {
    const tagRows = genreNames.map((label) => ({ kind: 'genre', slug: slugify(label), label }));
    await service.from('tags').upsert(tagRows, { onConflict: 'kind,slug', ignoreDuplicates: true });
    const { data: tags } = await service
      .from('tags')
      .select('id')
      .eq('kind', 'genre')
      .in('slug', tagRows.map((t) => t.slug));
    if (tags?.length) {
      await service.from('activity_tags').upsert(
        tags.map((t) => ({ activity_id: activity.id, tag_id: t.id })),
        { ignoreDuplicates: true },
      );
    }
  }

  return activity as ActivityRow;
}

/**
 * Replace the US subscription availability for an activity from a TMDB
 * watch/providers flatrate list. Rent/buy ignored for POC.
 */
export async function replaceAvailability(
  service: SupabaseClient,
  activityId: string,
  flatrate: { provider_id: number }[] | undefined,
): Promise<{ service_id: string; slug: string; name: string }[]> {
  const { data: services, error } = await service
    .from('streaming_services')
    .select('id, slug, name, tmdb_provider_id');
  if (error) throw new Error(`streaming_services read failed: ${error.message}`);

  const byTmdbId = new Map(services.map((s) => [s.tmdb_provider_id as number, s]));
  const matched = new Map<string, { service_id: string; slug: string; name: string }>();
  for (const p of flatrate ?? []) {
    const svc = byTmdbId.get(canonicalProviderId(p.provider_id));
    if (svc) matched.set(svc.id, { service_id: svc.id, slug: svc.slug, name: svc.name });
  }

  await service
    .from('activity_availability')
    .delete()
    .eq('activity_id', activityId)
    .eq('region', 'US')
    .eq('offer', 'subscription');
  if (matched.size) {
    await service.from('activity_availability').insert(
      [...matched.values()].map((m) => ({
        activity_id: activityId,
        service_id: m.service_id,
        region: 'US',
        offer: 'subscription',
        last_checked_at: new Date().toISOString(),
      })),
    );
  }
  return [...matched.values()];
}
