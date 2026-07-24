// tmdb-search — milestone 3
//
// POST { query: string }
// → /search/multi filtered to movie+tv, upsert each hit into activities,
//   return the app-side rows (activities are the source of truth after
//   first touch).
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

serve(async (req) => {
  await requireUser(req);

  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || !query.trim()) {
    throw new HttpError(400, 'Expected body { query: string }');
  }

  // TODO(milestone 3): tmdbFetch('/search/multi', { query }), filter to
  // media_type movie|tv, upsert via _shared/tmdb.ts, return activities rows.
  return json({ error: 'Not implemented yet (milestone 3)' }, 501);
});
