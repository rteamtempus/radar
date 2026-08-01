// places-autocomplete — the city picker's backend (location suite, v0.14)
//
// Two modes, both cheap SKU tiers when used with session tokens:
//   POST { input, session_token }    → city suggestions (Autocomplete New,
//                                      localities only)
//   POST { place_id, session_token } → resolve to { name, place_id, lat, lng }
//                                      (Place Details, location-only mask —
//                                      ends the autocomplete session)
//
// Locations in Radar are ALWAYS picked through here (never free-typed, never
// reverse-geocoded), which is what keeps the whole suite inside the already-
// enabled Places API (New) — docs/LOCATION-ANALYSIS.md "API findings".
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

const PLACES_BASE = 'https://places.googleapis.com/v1';

interface Suggestion {
  place_id: string;
  main: string;
  secondary: string;
}

serve(async (req) => {
  await requireUser(req);

  const { input, place_id, session_token } = await req.json().catch(() => ({}));
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
  const session = typeof session_token === 'string' && session_token ? session_token : undefined;

  if (typeof place_id === 'string' && place_id) {
    // resolve: lean mask — id/name/location/address only
    const res = await fetch(
      `${PLACES_BASE}/places/${place_id}${session ? `?sessionToken=${session}` : ''}`,
      {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
        },
      },
    );
    if (!res.ok) throw new HttpError(502, `Place resolve failed (${res.status})`);
    const place = (await res.json()) as {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };
    if (place.location?.latitude == null || place.location?.longitude == null) {
      throw new HttpError(502, 'Place has no location');
    }
    return json({
      name: place.displayName?.text ?? place.formattedAddress ?? 'Unknown place',
      place_id: place.id,
      lat: place.location.latitude,
      lng: place.location.longitude,
    });
  }

  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (trimmed.length < 2) throw new HttpError(400, 'Send at least 2 characters');

  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({
      input: trimmed,
      // cities only — locality covers the world's cities; sublocality helps
      // with districts of megacities (Brooklyn, Shibuya)
      includedPrimaryTypes: ['locality', 'sublocality'],
      ...(session ? { sessionToken: session } : {}),
    }),
  });
  if (!res.ok) throw new HttpError(502, `Autocomplete failed (${res.status})`);
  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }[];
  };

  const suggestions: Suggestion[] = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      place_id: p.placeId!,
      main: p.structuredFormat?.mainText?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }))
    .slice(0, 6);

  return json({ suggestions });
});
