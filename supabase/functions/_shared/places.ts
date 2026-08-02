// Google Places API (New) client + upsert helpers. Key never leaves the edge
// runtime (same pattern as TMDB).
//
// ToS note: Google only permits long-term storage of the place id — other
// fields must be refreshed rather than cached indefinitely. We store the id in
// activities.external_id and refresh the rest on every place-detail call,
// mirroring the TMDB availability-freshness pattern.
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ActivityRow } from './tmdb.ts';
import { placeTag } from './vocab.ts';

const PLACES_BASE = 'https://places.googleapis.com/v1';

// ── Field masks set the BILLING TIER (docs/LOCATION-ANALYSIS.md G8) ─────────
// Google prices each request by its most expensive requested field:
// Essentials (~10K free/mo) < Pro (~5K) < Enterprise (~1K) < Ent+Atmosphere
// (~1K). Search masks therefore stay PRO-TIER ONLY — rating/price/hours/
// editorialSummary are Enterprise(+Atmosphere) and moved to the detail call,
// which is per-view and far rarer. upsertPlace MERGES metadata so a place
// that has been detailed once keeps its cached rating on search cards.
const PLACE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.photos',
  'places.googleMapsUri',
  'places.businessStatus',
];
// nextPageToken must be in the mask or Google omits it — but only text search
// has it; searchNearby rejects unknown mask fields.
const SEARCH_FIELD_MASK = [...PLACE_FIELDS, 'nextPageToken'].join(',');
const NEARBY_FIELD_MASK = PLACE_FIELDS.join(',');

// Detail is the rich (Enterprise+Atmosphere) call — the refresh-on-view path.
const DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'types',
  'photos',
  'googleMapsUri',
  'businessStatus',
  'currentOpeningHours',
  'editorialSummary',
  'nationalPhoneNumber',
  'websiteUri',
].join(',');

export interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryType?: string;
  types?: string[];
  photos?: { name: string }[];
  googleMapsUri?: string;
  businessStatus?: string; // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  editorialSummary?: { text?: string };
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

function headers(fieldMask: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '',
    'X-Goog-FieldMask': fieldMask,
  };
}

/** 'eat' = restaurants; 'do' = permanent go-and-do-something establishments. */
export type PlaceKind = 'eat' | 'do';

const NEARBY_TYPES: Record<PlaceKind, string[]> = {
  eat: ['restaurant'],
  do: [
    'tourist_attraction',
    'museum',
    'art_gallery',
    'amusement_park',
    'aquarium',
    'zoo',
    'bowling_alley',
    'park',
    'performing_arts_theater',
    'historical_landmark',
  ],
};

/**
 * Text search, paginated: pass the previous call's nextPageToken to get the
 * next 20 (Google caps text search around 60 results total). There is NO
 * total-count field in the response — the API simply doesn't have one
 * (docs/API-CAPABILITIES.md).
 */
const PRICE_LEVEL_NAMES = [
  '',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
];

export async function placesTextSearch(
  query: string,
  location: { lat: number; lng: number } | null,
  kind: PlaceKind,
  opts: {
    includedType?: string | null;
    pageToken?: string | null;
    restrict?: boolean;
    // v0.16 live-search filters — applied by GOOGLE, not client-side
    minRating?: number | null; // 1.0–5.0, 0.5 steps
    priceLevels?: number[] | null; // 1–4 ($–$$$$)
    openNow?: boolean;
  } = {},
): Promise<{ places: GooglePlace[]; nextPageToken: string | null }> {
  // v0.15: `restrict` (set when the user explicitly picked a city) fences
  // results to a ~40 km rectangle — locationRestriction is a hard filter,
  // while locationBias is only a suggestion Google happily ignores for
  // "relevant" far-away results (docs/API-CAPABILITIES.md). GPS "near me"
  // searches keep the soft bias so long-range name searches still work.
  const restriction =
    location && opts.restrict
      ? (() => {
          const dLat = 40 / 111.32;
          const dLng = 40 / (111.32 * Math.max(0.2, Math.cos((location.lat * Math.PI) / 180)));
          return {
            locationRestriction: {
              rectangle: {
                low: { latitude: location.lat - dLat, longitude: location.lng - dLng },
                high: { latitude: location.lat + dLat, longitude: location.lng + dLng },
              },
            },
          };
        })()
      : null;
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: headers(SEARCH_FIELD_MASK),
    body: JSON.stringify({
      textQuery: query,
      // A curated chip narrows to its Places type; otherwise 'eat' pins to
      // restaurants and 'do' lets free text work ("mini golf", "art museum").
      ...(opts.includedType
        ? { includedType: opts.includedType }
        : kind === 'eat'
          ? { includedType: 'restaurant' }
          : {}),
      pageSize: 20,
      ...(opts.minRating ? { minRating: Math.round(opts.minRating * 2) / 2 } : {}),
      ...(opts.openNow ? { openNow: true } : {}),
      ...(opts.priceLevels?.length
        ? { priceLevels: opts.priceLevels.map((p) => PRICE_LEVEL_NAMES[p]).filter(Boolean) }
        : {}),
      ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
      ...(restriction ??
        (location
          ? {
              locationBias: {
                circle: {
                  center: { latitude: location.lat, longitude: location.lng },
                  radius: 15000,
                },
              },
            }
          : {})),
    }),
  });
  if (!res.ok) throw new Error(`Places searchText ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { places?: GooglePlace[]; nextPageToken?: string };
  return { places: data.places ?? [], nextPageToken: data.nextPageToken ?? null };
}

/** Nearby is popularity-ranked and NOT paginatable (API limit: one page of 20). */
export async function placesNearby(
  location: { lat: number; lng: number },
  kind: PlaceKind,
  includedType?: string | null,
): Promise<GooglePlace[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
    method: 'POST',
    headers: headers(NEARBY_FIELD_MASK),
    body: JSON.stringify({
      includedTypes: includedType ? [includedType] : NEARBY_TYPES[kind],
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: { center: { latitude: location.lat, longitude: location.lng }, radius: kind === 'eat' ? 8000 : 25000 },
      },
    }),
  });
  if (!res.ok) throw new Error(`Places searchNearby ${res.status}: ${await res.text()}`);
  return ((await res.json()).places ?? []) as GooglePlace[];
}

export async function placeDetails(placeId: string): Promise<GooglePlace> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: headers(DETAIL_FIELD_MASK),
  });
  if (!res.ok) throw new Error(`Place details ${res.status}: ${await res.text()}`);
  return (await res.json()) as GooglePlace;
}

/** Resolve the first photo to a public googleusercontent URL (no key in it). */
async function resolvePhoto(place: GooglePlace): Promise<string | null> {
  const name = place.photos?.[0]?.name;
  if (!name) return null;
  try {
    const res = await fetch(
      `${PLACES_BASE}/${name}/media?maxWidthPx=500&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '' } },
    );
    if (!res.ok) return null;
    return ((await res.json()).photoUri as string | undefined) ?? null;
  } catch {
    return null;
  }
}

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/**
 * v0.13: ONE tag per place, from `primaryType` through the curated vocab.
 * The old approach minted a tag for every entry in the `types` array, which
 * is where the random filter chips came from (bar, night_club, food_store…).
 * A primaryType outside the curated list gets no tag — the place still shows
 * up everywhere, it just doesn't light a chip.
 */
function categoryTags(place: GooglePlace, kind: PlaceKind): { slug: string; label: string }[] {
  const tag = placeTag(place.primaryType, kind);
  return tag ? [tag] : [];
}

/**
 * Upsert one Google place into activities (+ cuisine/theme tags).
 *
 * Metadata is MERGED, never replaced: search responses are lean (Pro-tier
 * mask — no rating/price/hours), so a search hit on an already-detailed place
 * must not null out the rich fields the last detail call cached. Only keys
 * actually present in this response overwrite; same for description (detail
 * only) and cost_level.
 */
export async function upsertPlace(
  service: SupabaseClient,
  place: GooglePlace,
  kind: PlaceKind = 'eat',
  opts: { detail?: boolean } = {},
): Promise<ActivityRow> {
  const lat = place.location?.latitude ?? null;
  const lng = place.location?.longitude ?? null;

  const { data: existing } = await service
    .from('activities')
    .select('id, description, cost_level, image_url, metadata')
    .eq('external_source', 'google_places')
    .eq('external_id', place.id)
    .maybeSingle();
  const prior = (existing?.metadata ?? {}) as Record<string, unknown>;

  // Photo media is its own billable SKU, and a 20-result search used to fire
  // 20 of them EVERY time — even for places we'd seen before (v0.15 fix).
  // Only resolve when the place is new to us or has no image yet.
  const photoUri = existing?.image_url ? null : await resolvePhoto(place);

  // Only fields this response actually carried; undefined = keep prior value.
  const incoming: Record<string, unknown> = {
    rating: place.rating,
    rating_count: place.userRatingCount,
    price_level: place.priceLevel != null ? PRICE_LEVELS[place.priceLevel] : undefined,
    address: place.formattedAddress,
    maps_url: place.googleMapsUri,
    business_status: place.businessStatus,
    open_now: place.currentOpeningHours?.openNow,
    hours: place.currentOpeningHours?.weekdayDescriptions,
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    coords_refreshed_at: new Date().toISOString(), // ToS: 30-day coord cache (G3)
    // Stamped only by rich detail calls — place-detail's 6h freshness gate
    // reads this, so search-upserts must never touch it.
    detail_refreshed_at: opts.detail ? new Date().toISOString() : undefined,
  };
  const metadata = { ...prior };
  for (const [k, v] of Object.entries(incoming)) if (v !== undefined) metadata[k] = v;

  const { data: activity, error } = await service
    .from('activities')
    .upsert(
      {
        type: kind === 'eat' ? 'restaurant' : 'outing',
        title: place.displayName?.text ?? 'Unknown place',
        description: place.editorialSummary?.text ?? existing?.description ?? null,
        ...(photoUri ? { image_url: photoUri } : {}),
        cost_level:
          place.priceLevel != null
            ? (PRICE_LEVELS[place.priceLevel] ?? null)
            : (existing?.cost_level ?? null),
        external_source: 'google_places',
        external_id: place.id,
        location: lat != null && lng != null ? { lat, lng } : null,
        metadata,
      },
      { onConflict: 'external_source,external_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`place upsert failed: ${error.message}`);

  const tagKind = kind === 'eat' ? 'cuisine' : 'theme';
  const tags = categoryTags(place, kind);
  if (tags.length) {
    const rows = tags.map((t) => ({ kind: tagKind, slug: t.slug, label: t.label }));
    await service.from('tags').upsert(rows, { onConflict: 'kind,slug', ignoreDuplicates: true });
    const { data: tagRows } = await service
      .from('tags')
      .select('id')
      .eq('kind', tagKind)
      .in('slug', tags.map((t) => t.slug));
    if (tagRows?.length) {
      await service.from('activity_tags').upsert(
        tagRows.map((t) => ({ activity_id: activity.id, tag_id: t.id })),
        { ignoreDuplicates: true },
      );
    }
  }

  return activity as ActivityRow;
}
