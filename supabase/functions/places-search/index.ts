// places-search — Eat + Do domains
//
// POST { query?, lat?, lng?, kind?: 'eat'|'do', cuisine?, page_token? }
// With a query → Places text search (location-biased when lat/lng present),
// paginated via page_token (Google caps text search around 60 results, and
// provides NO total count — the response carries next_page_token when more
// exist). Without a query → popularity-ranked nearby (one page, API limit).
// `cuisine` is a curated chip slug (vocab.ts) → Places includedType.
// Everything touched is upserted into activities with a primaryType-derived
// curated tag.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { PlaceKind, placesNearby, placesTextSearch, upsertPlace } from '../_shared/places.ts';
import { includedTypeFor } from '../_shared/vocab.ts';

serve(async (req) => {
  await requireUser(req);

  const { query, lat, lng, kind, cuisine, page_token } = await req.json().catch(() => ({}));
  const placeKind: PlaceKind = kind === 'do' ? 'do' : 'eat';
  const location =
    typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  const trimmed = typeof query === 'string' ? query.trim() : '';
  const token = typeof page_token === 'string' && page_token ? page_token : null;
  if (!trimmed && !location && !token) {
    throw new HttpError(400, 'Send a query, a location, or a page token');
  }

  const includedType =
    typeof cuisine === 'string' && cuisine ? includedTypeFor(cuisine, placeKind) : null;

  let places;
  let nextPageToken: string | null = null;
  if (trimmed || token) {
    const page = await placesTextSearch(trimmed, location, placeKind, {
      includedType,
      pageToken: token,
    });
    places = page.places;
    nextPageToken = page.nextPageToken;
  } else {
    places = await placesNearby(location!, placeKind, includedType);
  }

  const db = serviceClient();
  const results = [];
  for (const place of places) {
    results.push(await upsertPlace(db, place, placeKind));
  }

  return json({ results, next_page_token: nextPageToken });
});
