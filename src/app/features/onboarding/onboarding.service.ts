import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { getSupabase } from '../../core/supabase.client';
import { Database } from '../../core/types/database.types';
import { ActivitySummary } from '../library/library.service';

type EngagementInsert = Database['public']['Tables']['user_engagements']['Insert'];

/**
 * The 24-title calibration set (handoff §5.3): well-known TMDB titles spanning
 * genres and eras. Hydrated lazily through tmdb-detail on first onboarding
 * load — after the first user ever, they're already in `activities`.
 */
export const CALIBRATION_TITLES: { kind: 'movie' | 'tv'; tmdbId: number }[] = [
  { kind: 'movie', tmdbId: 603 }, // The Matrix — sci-fi action
  { kind: 'tv', tmdbId: 2316 }, // The Office — sitcom
  { kind: 'movie', tmdbId: 597 }, // Titanic — romance epic
  { kind: 'movie', tmdbId: 694 }, // The Shining — horror classic
  { kind: 'tv', tmdbId: 1396 }, // Breaking Bad — prestige crime
  { kind: 'movie', tmdbId: 862 }, // Toy Story — family animation
  { kind: 'movie', tmdbId: 680 }, // Pulp Fiction — crime
  { kind: 'tv', tmdbId: 97546 }, // Ted Lasso — feel-good comedy
  { kind: 'movie', tmdbId: 155 }, // The Dark Knight — superhero
  { kind: 'movie', tmdbId: 313369 }, // La La Land — musical romance
  { kind: 'tv', tmdbId: 66732 }, // Stranger Things — sci-fi horror
  { kind: 'movie', tmdbId: 13 }, // Forrest Gump — drama
  { kind: 'movie', tmdbId: 419430 }, // Get Out — modern horror
  { kind: 'tv', tmdbId: 1399 }, // Game of Thrones — fantasy epic
  { kind: 'movie', tmdbId: 8363 }, // Superbad — raunchy comedy
  { kind: 'movie', tmdbId: 120 }, // LOTR: Fellowship — fantasy
  { kind: 'tv', tmdbId: 1418 }, // The Big Bang Theory — network sitcom
  { kind: 'movie', tmdbId: 496243 }, // Parasite — prestige thriller
  { kind: 'movie', tmdbId: 27205 }, // Inception — mind-bending
  { kind: 'tv', tmdbId: 87108 }, // Chernobyl — prestige miniseries
  { kind: 'movie', tmdbId: 109445 }, // Frozen — family animation
  { kind: 'movie', tmdbId: 245891 }, // John Wick — action
  { kind: 'tv', tmdbId: 82856 }, // The Mandalorian — franchise sci-fi
  { kind: 'movie', tmdbId: 438631 }, // Dune — modern sci-fi epic
];

export type CalibrationVerdict = 'loved' | 'meh' | 'unseen' | 'never';

const DECK_SELECT = 'id, type, title, description, image_url, duration_min, external_id, metadata';

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<unknown>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await run(item).catch(() => undefined); // a dead title just drops out of the deck
      }
    }),
  );
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private auth = inject(AuthService);

  /** Load the deck in calibration order, hydrating missing titles via tmdb-detail. */
  async loadDeck(): Promise<ActivitySummary[]> {
    const supabase = getSupabase();
    const ids = CALIBRATION_TITLES.map((t) => `${t.kind}-${t.tmdbId}`);
    const fetchExisting = async () =>
      ((await supabase.from('activities').select(DECK_SELECT).in('external_id', ids)).data ??
        []) as unknown as ActivitySummary[];

    let rows = await fetchExisting();
    const have = new Set(rows.map((r) => r.external_id));
    const missing = CALIBRATION_TITLES.filter((t) => !have.has(`${t.kind}-${t.tmdbId}`));
    if (missing.length) {
      await pool(missing, 4, (t) =>
        supabase.functions.invoke('tmdb-detail', { body: { kind: t.kind, tmdbId: t.tmdbId } }),
      );
      rows = await fetchExisting();
    }

    const byExternalId = new Map(rows.map((r) => [r.external_id, r]));
    return ids.map((id) => byExternalId.get(id)).filter((r): r is ActivitySummary => !!r);
  }

  /** Handoff §6.1: Loved→9, Meh→5, Never→not_interested, Haven't seen→no row. */
  async answer(activityId: string, verdict: CalibrationVerdict): Promise<void> {
    if (verdict === 'unseen') return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const row: EngagementInsert = {
      user_id: userId,
      activity_id: activityId,
      source: 'calibration',
      status: 'not_interested',
    };
    if (verdict !== 'never') {
      row.status = 'completed';
      row.rating = verdict === 'loved' ? 9 : 5;
      row.completed_at = new Date().toISOString();
    }
    await getSupabase()
      .from('user_engagements')
      .upsert(row, { onConflict: 'user_id,activity_id' });
  }

  /** Compute initial tag affinities from the deck answers. */
  async finishDeck(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    await getSupabase().rpc('recompute_affinities', { p_user_id: userId });
  }
}
