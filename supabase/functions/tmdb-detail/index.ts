// tmdb-detail
//
// POST { kind: 'movie' | 'tv', tmdbId: number }
// → full detail (+runtime) and US flatrate watch/providers upserted; also how
//   onboarding lazily hydrates the calibration titles. Availability is
//   replaced on every call, which covers the 7-day-freshness rule for any
//   title a detail view touches.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { TmdbDetail, replaceAvailability, tmdbFetch, upsertActivity } from '../_shared/tmdb.ts';

serve(async (req) => {
  await requireUser(req);

  const { kind, tmdbId } = await req.json().catch(() => ({}));
  if ((kind !== 'movie' && kind !== 'tv') || typeof tmdbId !== 'number') {
    throw new HttpError(400, "Expected body { kind: 'movie' | 'tv', tmdbId: number }");
  }

  const detail = await tmdbFetch<TmdbDetail>(`/${kind}/${tmdbId}`, {
    append_to_response: 'watch/providers',
  });

  const service = serviceClient();
  const activity = await upsertActivity(
    service,
    kind,
    detail,
    (detail.genres ?? []).map((g) => g.name),
  );
  const availability = await replaceAvailability(
    service,
    activity.id,
    detail['watch/providers']?.results?.['US']?.flatrate,
  );

  return json({ activity, availability });
});
