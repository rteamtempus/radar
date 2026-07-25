// Google Places API (New) client + upsert helpers. Key never leaves the edge
// runtime (same pattern as TMDB).
//
// ToS note: Google only permits long-term storage of the place id — other
// fields must be refreshed rather than cached indefinitely. We store the id in
// activities.external_id and refresh the rest on every place-detail call,
// mirroring the TMDB availability-freshness pattern.
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ActivityRow } from './tmdb.ts';

const PLACES_BASE = 'https://places.googleapis.com/v1';

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
  'places.photos',
  'places.googleMapsUri',
  'places.currentOpeningHours.openNow',
  'places.editorialSummary',
].join(',');

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
  types?: string[];
  photos?: { name: string }[];
  googleMapsUri?: string;
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

export async function placesTextSearch(
  query: string,
  location: { lat: number; lng: number } | null,
): Promise<GooglePlace[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: headers(SEARCH_FIELD_MASK),
    body: JSON.stringify({
      textQuery: query,
      includedType: 'restaurant',
      pageSize: 12,
      ...(location
        ? {
            locationBias: {
              circle: {
                center: { latitude: location.lat, longitude: location.lng },
                radius: 15000,
              },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Places searchText ${res.status}: ${await res.text()}`);
  return ((await res.json()).places ?? []) as GooglePlace[];
}

export async function placesNearby(location: {
  lat: number;
  lng: number;
}): Promise<GooglePlace[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
    method: 'POST',
    headers: headers(SEARCH_FIELD_MASK),
    body: JSON.stringify({
      includedTypes: ['restaurant'],
      maxResultCount: 12,
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: { center: { latitude: location.lat, longitude: location.lng }, radius: 8000 },
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

// Types too generic to be useful as cuisine tags.
const GENERIC_TYPES = new Set([
  'restaurant',
  'food',
  'point_of_interest',
  'establishment',
  'store',
  'food_store',
  'meal_takeaway',
  'meal_delivery',
]);

function cuisineTags(place: GooglePlace): { slug: string; label: string }[] {
  return (place.types ?? [])
    .filter((t) => !GENERIC_TYPES.has(t))
    .map((t) => {
      const slug = t.replace(/_restaurant$/, '').replace(/_/g, '-');
      const label = slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return { slug, label };
    })
    .slice(0, 4);
}

/** Upsert one Google place into activities (+ cuisine tags). */
export async function upsertPlace(
  service: SupabaseClient,
  place: GooglePlace,
): Promise<ActivityRow> {
  const photoUri = await resolvePhoto(place);
  const lat = place.location?.latitude ?? null;
  const lng = place.location?.longitude ?? null;

  const { data: activity, error } = await service
    .from('activities')
    .upsert(
      {
        type: 'restaurant',
        title: place.displayName?.text ?? 'Unknown place',
        description: place.editorialSummary?.text ?? null,
        ...(photoUri ? { image_url: photoUri } : {}),
        cost_level: PRICE_LEVELS[place.priceLevel ?? ''] ?? null,
        external_source: 'google_places',
        external_id: place.id,
        location: lat != null && lng != null ? { lat, lng } : null,
        metadata: {
          rating: place.rating ?? null,
          rating_count: place.userRatingCount ?? null,
          price_level: PRICE_LEVELS[place.priceLevel ?? ''] ?? null,
          address: place.formattedAddress ?? null,
          maps_url: place.googleMapsUri ?? null,
          open_now: place.currentOpeningHours?.openNow ?? null,
          hours: place.currentOpeningHours?.weekdayDescriptions ?? null,
          phone: place.nationalPhoneNumber ?? null,
          website: place.websiteUri ?? null,
        },
      },
      { onConflict: 'external_source,external_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`place upsert failed: ${error.message}`);

  const tags = cuisineTags(place);
  if (tags.length) {
    const rows = tags.map((t) => ({ kind: 'cuisine', slug: t.slug, label: t.label }));
    await service.from('tags').upsert(rows, { onConflict: 'kind,slug', ignoreDuplicates: true });
    const { data: tagRows } = await service
      .from('tags')
      .select('id')
      .eq('kind', 'cuisine')
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
