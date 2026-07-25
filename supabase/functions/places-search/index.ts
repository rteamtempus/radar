// places-search — restaurants vertical
//
// POST { query?: string, lat?: number, lng?: number }
// With a query → Places text search (location-biased when lat/lng present);
// without → popularity-ranked nearby restaurants. Everything touched is
// upserted into activities (type='restaurant').
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { placesNearby, placesTextSearch, upsertPlace } from '../_shared/places.ts';

serve(async (req) => {
  await requireUser(req);

  const { query, lat, lng } = await req.json().catch(() => ({}));
  const location =
    typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed && !location) {
    throw new HttpError(400, 'Send a query, a location, or both');
  }

  const places = trimmed
    ? await placesTextSearch(trimmed, location)
    : await placesNearby(location!);

  const db = serviceClient();
  const results = [];
  for (const place of places) {
    results.push(await upsertPlace(db, place));
  }

  return json({ results });
});
