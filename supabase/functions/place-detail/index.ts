// place-detail — refresh a restaurant's details (hours, rating, phone…).
// Called on every detail view: Google's ToS wants fields refreshed rather
// than cached, and it keeps "open now" honest.
//
// v0.15 cost gate: the refresh is SHARED — one Google call freshens the row
// for every user, so we skip the call entirely when this place was
// detail-refreshed within the last 6 hours (metadata.detail_refreshed_at).
// Detail is the expensive tier (~1K free/mo); this makes detail spend scale
// with distinct-stale-places-viewed, not raw page views.
//
// POST { placeId: string }
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { placeDetails, upsertPlace } from '../_shared/places.ts';

const FRESH_MS = 6 * 60 * 60 * 1000;

serve(async (req) => {
  await requireUser(req);

  const { placeId } = await req.json().catch(() => ({}));
  if (typeof placeId !== 'string' || !placeId) {
    throw new HttpError(400, 'Expected body { placeId: string }');
  }

  const db = serviceClient();
  // Preserve the existing activity type (restaurant vs outing) on refresh.
  const { data: existing } = await db
    .from('activities')
    .select('*')
    .eq('external_source', 'google_places')
    .eq('external_id', placeId)
    .maybeSingle();
  const kind = existing?.type === 'outing' ? 'do' : 'eat';

  const refreshedAt = (existing?.metadata as Record<string, unknown> | null)?.[
    'detail_refreshed_at'
  ];
  if (typeof refreshedAt === 'string' && Date.now() - Date.parse(refreshedAt) < FRESH_MS) {
    return json({ activity: existing, fresh: true });
  }

  const place = await placeDetails(placeId);
  const activity = await upsertPlace(db, place, kind, { detail: true });
  return json({ activity });
});
