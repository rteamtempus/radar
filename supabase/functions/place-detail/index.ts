// place-detail — refresh a restaurant's details (hours, rating, phone…).
// Called on every detail view: Google's ToS wants fields refreshed rather
// than cached, and it keeps "open now" honest.
//
// POST { placeId: string }
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { placeDetails, upsertPlace } from '../_shared/places.ts';

serve(async (req) => {
  await requireUser(req);

  const { placeId } = await req.json().catch(() => ({}));
  if (typeof placeId !== 'string' || !placeId) {
    throw new HttpError(400, 'Expected body { placeId: string }');
  }

  const place = await placeDetails(placeId);
  const activity = await upsertPlace(serviceClient(), place);
  return json({ activity });
});
