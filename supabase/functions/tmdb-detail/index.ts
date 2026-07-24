// tmdb-detail — milestone 3
//
// POST { kind: 'movie' | 'tv', tmdbId: number }
// → full detail + US watch/providers upsert (flatrate → activity_availability,
//   offer='subscription'), refreshed when last_checked_at is older than 7 days.
//   Also used lazily by onboarding to hydrate the 24 calibration titles.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

serve(async (req) => {
  await requireUser(req);

  const { kind, tmdbId } = await req.json().catch(() => ({}));
  if ((kind !== 'movie' && kind !== 'tv') || typeof tmdbId !== 'number') {
    throw new HttpError(400, "Expected body { kind: 'movie' | 'tv', tmdbId: number }");
  }

  // TODO(milestone 3): tmdbFetch detail + watch/providers, upsert activity,
  // genres → tags, availability rows; return the hydrated activity.
  return json({ error: 'Not implemented yet (milestone 3)' }, 501);
});
