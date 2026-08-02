// places-search — Eat + Do domains
//
// POST { query?, lat?, lng?, kind?: 'eat'|'do', cuisine?, page_token?, restrict?,
//        min_rating?, price_levels?, open_now? }
// v0.16 live search: rating/price/open-now are applied BY GOOGLE (searchText
// filter params), so filtered results are correct even though our Pro-tier
// masks don't fetch those fields for storage.
// With a query → Places text search: location-biased when lat/lng present,
// HARD-restricted to a ~40 km box when `restrict` is true (the user picked a
// city — results must actually be there). Paginated via page_token (Google
// caps text search around 60 results, and provides NO total count — the
// response carries next_page_token when more exist). Without a query →
// popularity-ranked nearby (one page, API limit).
// `cuisine` is a curated chip slug (vocab.ts) → Places includedType.
// Everything touched is upserted into activities with a primaryType-derived
// curated tag.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { PlaceKind, placesNearby, placesTextSearch, upsertPlace } from '../_shared/places.ts';
import { includedTypeFor } from '../_shared/vocab.ts';

serve(async (req) => {
  await requireUser(req);

  const { query, lat, lng, kind, cuisine, page_token, restrict, min_rating, price_levels, open_now } =
    await req.json().catch(() => ({}));
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
  const minRating = typeof min_rating === 'number' ? Math.max(1, Math.min(5, min_rating)) : null;
  const priceLevels = Array.isArray(price_levels)
    ? price_levels.filter((p): p is number => typeof p === 'number' && p >= 1 && p <= 4)
    : null;
  const hasLiveFilters = !!(minRating || priceLevels?.length || open_now === true);

  let places;
  let nextPageToken: string | null = null;
  if (trimmed || token || hasLiveFilters) {
    // Filter-only live searches still need a textQuery — the cuisine label or
    // a generic one stands in ("chinese restaurant" / "restaurants").
    const effectiveQuery =
      trimmed ||
      (typeof cuisine === 'string' && cuisine
        ? cuisine.replace(/-/g, ' ') + (placeKind === 'eat' ? ' restaurant' : '')
        : placeKind === 'eat'
          ? 'restaurants'
          : 'things to do');
    const page = await placesTextSearch(effectiveQuery, location, placeKind, {
      includedType,
      pageToken: token,
      restrict: restrict === true,
      minRating,
      priceLevels,
      openNow: open_now === true,
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
