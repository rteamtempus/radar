import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { getSupabase } from '../../core/supabase.client';
import { HistoryItem } from './netflix-csv';

export interface ImportProgress {
  done: number;
  total: number;
  matched: number;
  unmatched: string[];
}

const BATCH_SIZE = 25;
/** Cap huge histories to the most recent N unique titles (kept POC-friendly). */
const MAX_TITLES = 400;

@Injectable({ providedIn: 'root' })
export class ImportService {
  private auth = inject(AuthService);

  readonly running = signal(false);
  readonly progress = signal<ImportProgress | null>(null);

  capped(items: HistoryItem[]): { items: HistoryItem[]; dropped: number } {
    return {
      items: items.slice(0, MAX_TITLES),
      dropped: Math.max(0, items.length - MAX_TITLES),
    };
  }

  /** Batched import with live progress; recomputes affinities at the end. */
  async run(items: HistoryItem[]): Promise<ImportProgress> {
    const supabase = getSupabase();
    this.running.set(true);
    const state: ImportProgress = { done: 0, total: items.length, matched: 0, unmatched: [] };
    this.progress.set({ ...state });
    try {
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.functions.invoke<{
          matched: unknown[];
          unmatched: string[];
        }>('import-history', {
          body: {
            items: batch.map((b) => ({
              title: b.title,
              isSeries: b.isSeries,
              watchedAt: b.lastWatchedAt,
            })),
          },
        });
        if (error) throw new Error('Import request failed — you can retry; nothing is duplicated.');
        state.matched += data?.matched?.length ?? 0;
        state.unmatched.push(...(data?.unmatched ?? []));
        state.done = Math.min(i + batch.length, items.length);
        this.progress.set({ ...state });
      }
      const userId = this.auth.user()?.id;
      if (userId) await supabase.rpc('recompute_affinities', { p_user_id: userId });
      return state;
    } finally {
      this.running.set(false);
    }
  }
}
