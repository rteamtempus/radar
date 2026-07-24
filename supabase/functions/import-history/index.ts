// import-history — Netflix watch-history import
//
// POST { items: [{ title: string, isSeries?: boolean, watchedAt?: string|null }] }
// (max 25 per call — the client batches and shows progress). For each title:
// TMDB best-match → upsert into activities (+ genre tags) → insert a completed
// user_engagement (source='import_netflix_csv'). Existing engagements are
// NEVER overwritten (ignoreDuplicates), so ratings and want_to entries survive
// re-imports. Imported titles then count as "seen" in the party pipeline and
// feed affinities (unrated completed = 6.5 in the formula).
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { TmdbKind, TmdbListItem, tmdbFetch, tmdbGenres, upsertActivity } from '../_shared/tmdb.ts';

const MAX_ITEMS = 25;

interface ImportItem {
  title: string;
  isSeries?: boolean;
  watchedAt?: string | null;
}

async function pooled<T>(items: T[], size: number, run: (item: T) => Promise<unknown>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await run(item).catch((e) => console.error('import task failed:', e?.message ?? e));
      }
    }),
  );
}

/** Best TMDB hit: right media kind preferred, exact title match beats rank. */
function pickMatch(results: TmdbListItem[], title: string, isSeries: boolean): TmdbListItem | null {
  const hits = results.filter(
    (r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path,
  );
  if (!hits.length) return null;
  const wanted = isSeries ? 'tv' : 'movie';
  const lower = title.toLowerCase();
  const scored = hits.map((h, i) => {
    const name = (h.title ?? h.name ?? '').toLowerCase();
    let score = -i; // TMDB rank as the base
    if (name === lower) score += 100;
    if (h.media_type === wanted) score += 10;
    return { h, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].h;
}

serve(async (req) => {
  const user = await requireUser(req);
  const { items } = await req.json().catch(() => ({}));
  if (!Array.isArray(items) || !items.length) {
    throw new HttpError(400, 'Expected body { items: [{ title }] }');
  }
  if (items.length > MAX_ITEMS) {
    throw new HttpError(400, `Send at most ${MAX_ITEMS} items per call`);
  }
  const valid: ImportItem[] = items.filter(
    (i: ImportItem) => typeof i?.title === 'string' && i.title.trim(),
  );

  const db = serviceClient();
  const genres = await tmdbGenres();
  const matched: { input: string; title: string; activity_id: string }[] = [];
  const unmatched: string[] = [];

  await pooled(valid, 5, async (item) => {
    const search = await tmdbFetch<{ results: TmdbListItem[] }>('/search/multi', {
      query: item.title.trim(),
      include_adult: 'false',
    });
    const hit = pickMatch(search.results ?? [], item.title.trim(), !!item.isSeries);
    if (!hit) {
      unmatched.push(item.title);
      return;
    }
    const activity = await upsertActivity(
      db,
      hit.media_type as TmdbKind,
      hit,
      (hit.genre_ids ?? []).map((id) => genres.get(id)).filter((g): g is string => !!g),
    );
    const { error } = await db.from('user_engagements').upsert(
      {
        user_id: user.id,
        activity_id: activity.id,
        status: 'completed',
        source: 'import_netflix_csv',
        completed_at: item.watchedAt ?? null,
      },
      { onConflict: 'user_id,activity_id', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    matched.push({ input: item.title, title: activity.title, activity_id: activity.id });
  });

  return json({ matched, unmatched });
});
