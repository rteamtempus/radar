import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { getSupabase } from '../../core/supabase.client';
import { SlotsService } from '../radar/slots.service';

export type EngagementStatus =
  | 'want_to'
  | 'in_progress'
  | 'completed'
  | 'abandoned'
  | 'not_interested';

export interface ServiceRef {
  slug: string;
  name: string;
}

export interface ActivitySummary {
  id: string;
  type: 'movie' | 'tv_show';
  title: string;
  description: string | null;
  image_url: string | null;
  duration_min: number | null;
  external_id: string | null;
  metadata: {
    release_year?: number | null;
    tmdb_vote?: number | null;
    seasons?: number | null;
  };
  activity_availability?: { service: ServiceRef }[];
  activity_tags?: { tag: { slug: string; label: string; kind: string } }[];
}

export interface LibraryEntry {
  id: string;
  status: EngagementStatus;
  rating: number | null;
  notes: string | null;
  recommended_by: string | null;
  updated_at: string;
  activity: ActivitySummary;
}

const ENTRY_SELECT =
  'id, status, rating, notes, recommended_by, updated_at, ' +
  'activity:activities(id, type, title, description, image_url, duration_min, external_id, metadata, ' +
  'activity_tags(tag:tags(slug, label, kind)), ' +
  'activity_availability(service:streaming_services(slug, name)))';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private auth = inject(AuthService);
  private slots = inject(SlotsService);

  readonly entries = signal<LibraryEntry[]>([]);
  readonly loading = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await getSupabase()
        .from('user_engagements')
        .select(ENTRY_SELECT)
        .in('status', ['want_to', 'in_progress', 'completed'])
        .order('updated_at', { ascending: false });
      if (error) throw error;
      this.entries.set((data ?? []) as unknown as LibraryEntry[]);
    } finally {
      this.loading.set(false);
    }
  }

  async search(query: string): Promise<ActivitySummary[]> {
    const { data, error } = await getSupabase().functions.invoke<{ results: ActivitySummary[] }>(
      'tmdb-search',
      { body: { query } },
    );
    if (error) throw error;
    return data?.results ?? [];
  }

  async setStatus(activityId: string, status: EngagementStatus): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const now = new Date().toISOString();
    const { error } = await getSupabase()
      .from('user_engagements')
      .upsert(
        {
          user_id: userId,
          activity_id: activityId,
          status,
          ...(status === 'in_progress' ? { started_at: now } : {}),
          ...(status === 'completed' ? { completed_at: now } : {}),
        },
        { onConflict: 'user_id,activity_id' },
      );
    if (error) throw error;
    // Slots are "active playlists": finishing a title updates its slots.
    if (status === 'completed') this.slots.handleCompleted(activityId);
    await this.load();
  }

  /** Save the item-card extras: personal notes + "recommended by". */
  async updateMeta(
    activityId: string,
    fields: { notes?: string | null; recommended_by?: string | null },
  ): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const { error } = await getSupabase()
      .from('user_engagements')
      .upsert({ user_id: userId, activity_id: activityId, ...fields }, { onConflict: 'user_id,activity_id' });
    if (error) throw error;
    await this.load();
  }

  /** "Keep it on the radar" — bump updated_at so the stale nudge resets. */
  async touch(activityId: string): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    await getSupabase()
      .from('user_engagements')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('activity_id', activityId);
    await this.load();
  }

  /** Rate 1–10, then refresh learned tag affinities. */
  async rate(activityId: string, rating: number): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('user_engagements')
      .update({ rating })
      .eq('user_id', userId)
      .eq('activity_id', activityId);
    if (error) throw error;
    await supabase.rpc('recompute_affinities', { p_user_id: userId });
    await this.load();
  }

  /**
   * Fire-and-forget full hydration (runtime + availability) via tmdb-detail.
   * external_id convention: '<movie|tv>-<tmdbId>'.
   */
  hydrate(activity: Pick<ActivitySummary, 'external_id'>): Promise<void> {
    const match = activity.external_id?.match(/^(movie|tv)-(\d+)$/);
    if (!match) return Promise.resolve();
    return getSupabase()
      .functions.invoke('tmdb-detail', {
        body: { kind: match[1], tmdbId: Number(match[2]) },
      })
      .then(() => undefined)
      .catch(() => undefined);
  }
}
