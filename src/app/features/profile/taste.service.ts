import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { getSupabase } from '../../core/supabase.client';
import { ToastService } from '../../shared/ui/toast.service';

export type TasteState = 'love' | 'avoid' | null;

export interface TasteTag {
  id: string;
  label: string;
  state: TasteState;
}

/**
 * Explicit like/dislike per genre (ideas doc §4.3). Writes
 * user_tag_affinities with source='explicit' (+1 love, −1 avoid) — the party
 * pipeline consumes these immediately with zero backend changes. Learned
 * (rating-derived) rows are left alone; recompute only replaces source='learned'.
 */
@Injectable({ providedIn: 'root' })
export class TasteService {
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly tags = signal<TasteTag[]>([]);

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const supabase = getSupabase();
    const [tagsRes, mineRes] = await Promise.all([
      supabase.from('tags').select('id, label').eq('kind', 'genre').order('label'),
      supabase
        .from('user_tag_affinities')
        .select('tag_id, weight')
        .eq('user_id', userId)
        .eq('source', 'explicit'),
    ]);
    const mine = new Map((mineRes.data ?? []).map((a) => [a.tag_id, a.weight]));
    this.tags.set(
      (tagsRes.data ?? []).map((t) => {
        const w = mine.get(t.id);
        return {
          id: t.id,
          label: t.label,
          state: w === undefined ? null : w > 0 ? 'love' : 'avoid',
        };
      }),
    );
  }

  /** Tap to cycle: neutral → love → avoid → neutral. */
  async cycle(tag: TasteTag): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const next: TasteState = tag.state === null ? 'love' : tag.state === 'love' ? 'avoid' : null;
    this.tags.update((all) => all.map((t) => (t.id === tag.id ? { ...t, state: next } : t)));

    const supabase = getSupabase();
    const { error } =
      next === null
        ? await supabase
            .from('user_tag_affinities')
            .delete()
            .eq('user_id', userId)
            .eq('tag_id', tag.id)
            .eq('source', 'explicit')
        : await supabase.from('user_tag_affinities').upsert(
            {
              user_id: userId,
              tag_id: tag.id,
              weight: next === 'love' ? 1 : -1,
              source: 'explicit',
            },
            { onConflict: 'user_id,tag_id' },
          );
    if (error) {
      this.toast.error('Could not save your taste — try again.');
      await this.load();
    }
  }
}
