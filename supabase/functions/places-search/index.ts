// places-search — Eat + Do domains
//
// POST { query?: string, lat?: number, lng?: number, kind?: 'eat' | 'do' }
// With a query → Places text search (location-biased when lat/lng present);
// without → popularity-ranked nearby search. 'eat' = restaurants; 'do' =
// museums, galleries, mini golf, parks… Everything touched is upserted into
// activities (restaurant / outing respectively).
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { PlaceKind, placesNearby, placesTextSearch, upsertPlace } from '../_shared/places.ts';

serve(async (req) => {
  await requireUser(req);

  const { query, lat, lng, kind } = await req.json().catch(() => ({}));
  const placeKind: PlaceKind = kind === 'do' ? 'do' : 'eat';
  const location =
    typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed && !location) {
    throw new HttpError(400, 'Send a query, a location, or both');
  }

  const places = trimmed
    ? await placesTextSearch(trimmed, location, placeKind)
    : await placesNearby(location!, placeKind);

  const db = serviceClient();
  const results = [];
  for (const place of places) {
    results.push(await upsertPlace(db, place, placeKind));
  }

  return json({ results });
});
