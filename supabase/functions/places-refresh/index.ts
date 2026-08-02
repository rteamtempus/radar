// places-refresh — the scheduled ToS + data-consistency sweep (v0.16).
//
// Invoked daily by pg_cron (migration 0020) with the service-role key — NOT
// by users. Two passes over ACTIVE places only (rows sitting in someone's
// slot or engagement history; abandoned catalog rows are left to age out):
//
//   1. COMPLIANCE (lean): rows whose coords are older than 25 days get a
//      location/businessStatus-only Details call — the Essentials tier
//      (~10K free/mo, its own pool), so staying legal is effectively $0.
//      This is LOCATION-ANALYSIS G3's plan-of-record, finally built.
//   2. BACKFILL (rich, capped): active rows with no stored rating yet get
//      one full detail refresh, healing the "some cards have ratings, some
//      don't" gap the Pro-tier search masks created. Capped low — this
//      rides the expensive (~1K free/mo) tier.
//
// POST {} → { refreshed, backfilled, scanned }
import { json, serve } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { GooglePlace, placeDetails, upsertPlace } from '../_shared/places.ts';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const STALE_DAYS = 25; // refresh before the 30-day coord-cache limit
const LEAN_CAP = 150; // per run — Essentials pool
const RICH_CAP = 25; // per run — Enterprise+Atmosphere pool

/** Coords + status only — bills at the Essentials tier. */
async function leanDetails(placeId: string): Promise<GooglePlace | null> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '',
      'X-Goog-FieldMask': 'id,location,businessStatus',
    },
  });
  if (!res.ok) return null; // NOT_FOUND etc. — leave the row for manual review
  return (await res.json()) as GooglePlace;
}

serve(async (req) => {
  // Cron-only: the platform gateway has already signature-verified the JWT
  // (verify_jwt on); here we just require its role claim to be service_role,
  // which no user token carries.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let role = '';
  try {
    role = JSON.parse(atob(token.split('.')[1] ?? '')).role ?? '';
  } catch {
    /* not a JWT */
  }
  if (role !== 'service_role') {
    return json({ error: 'forbidden' }, 403);
  }

  const db = serviceClient();

  // Active = referenced by a slot or an engagement.
  const [slotRefs, engRefs] = await Promise.all([
    db.from('radar_slot_items').select('activity_id'),
    db.from('user_engagements').select('activity_id'),
  ]);
  if (slotRefs.error || engRefs.error) {
    return json(
      { error: 'active-ids query failed', slot: slotRefs.error?.message, eng: engRefs.error?.message },
      500,
    );
  }
  const activeIds = new Set<string>([
    ...(slotRefs.data ?? []).map((r) => r.activity_id),
    ...(engRefs.data ?? []).map((r) => r.activity_id),
  ]);
  if (!activeIds.size) return json({ refreshed: 0, backfilled: 0, scanned: 0 });

  // NOTE: not `.in('id', [...activeIds])` — hundreds of UUIDs overflow the
  // PostgREST URL and the query fails silently. Fetch the (bounded) source
  // slice and intersect in code instead.
  const { data: allRows, error: rowsError } = await db
    .from('activities')
    .select('id, external_id, type, metadata, location')
    .eq('external_source', 'google_places')
    .limit(5000);
  if (rowsError) return json({ error: rowsError.message }, 500);
  const rows = (allRows ?? []).filter((r) => activeIds.has(r.id));

  const now = Date.now();
  const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;
  let refreshed = 0;
  let backfilled = 0;

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const coordsAt = typeof meta['coords_refreshed_at'] === 'string'
      ? Date.parse(meta['coords_refreshed_at'] as string)
      : 0;
    const needsCompliance = now - coordsAt > staleMs;
    const needsBackfill = meta['rating'] == null;

    if (needsBackfill && backfilled < RICH_CAP) {
      // One rich call heals compliance AND the missing card data.
      try {
        const place = await placeDetails(row.external_id!);
        await upsertPlace(db, place, row.type === 'outing' ? 'do' : 'eat', { detail: true });
        backfilled++;
        continue;
      } catch {
        // fall through to the lean pass if the rich call failed
      }
    }

    if (needsCompliance && refreshed < LEAN_CAP) {
      const place = await leanDetails(row.external_id!);
      if (place?.location?.latitude != null && place.location.longitude != null) {
        await db
          .from('activities')
          .update({
            location: { lat: place.location.latitude, lng: place.location.longitude },
            metadata: {
              ...meta,
              business_status: place.businessStatus ?? meta['business_status'] ?? null,
              coords_refreshed_at: new Date(now).toISOString(),
            },
          })
          .eq('id', row.id);
        refreshed++;
      }
    }

    if (refreshed >= LEAN_CAP && backfilled >= RICH_CAP) break;
  }

  return json({ refreshed, backfilled, scanned: rows.length });
});
