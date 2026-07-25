import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { Domain } from '../../core/domain.service';
import { getSupabase } from '../../core/supabase.client';
import { ToastService } from '../../shared/ui/toast.service';

export type SlotOnComplete = 'remove' | 'loop' | 'keep';
export type SlotRole = 'watching' | 'up_next' | 'rewatch' | 'recommended';

export interface SlotItemActivity {
  id: string;
  title: string;
  image_url: string | null;
  type: 'movie' | 'tv_show' | 'restaurant';
  duration_min: number | null;
  metadata: {
    release_year?: number | null;
    tmdb_vote?: number | null;
    rating?: number | null;
    rating_count?: number | null;
    price_level?: number | null;
    open_now?: boolean | null;
  };
  location?: { lat?: number; lng?: number } | null;
  activity_tags?: { tag: { slug: string; label: string; kind: string } }[];
  activity_availability?: { service: { slug: string; name: string } }[];
}

export interface SlotItem {
  activity_id: string;
  position: number;
  note: string | null;
  activity: SlotItemActivity;
}

export interface RadarSlot {
  id: string;
  name: string;
  emoji: string | null;
  position: number;
  on_complete: SlotOnComplete;
  config: { role?: SlotRole; domain?: Domain };
  items: SlotItem[];
}

const SLOT_SELECT =
  'id, name, emoji, position, on_complete, config, ' +
  'items:radar_slot_items(activity_id, position, note, ' +
  'activity:activities(id, title, image_url, type, duration_min, metadata, location, ' +
  'activity_tags(tag:tags(slug, label, kind)), ' +
  'activity_availability(service:streaming_services(slug, name))))';

/** Starter slots per domain (ideas doc §2). Roles let the app find them even
 * after a rename; a deleted role-slot just opts out. */
const DEFAULT_SLOTS: Record<
  Domain,
  { name: string; emoji: string; on_complete: SlotOnComplete; role: SlotRole }[]
> = {
  watch: [
    { name: 'Watching now', emoji: '📺', on_complete: 'remove', role: 'watching' },
    { name: 'Up next', emoji: '🍿', on_complete: 'remove', role: 'up_next' },
    { name: 'Rewatch', emoji: '🔁', on_complete: 'loop', role: 'rewatch' },
    { name: 'Recommended to me', emoji: '💡', on_complete: 'remove', role: 'recommended' },
  ],
  eat: [
    { name: 'Want to try', emoji: '🍜', on_complete: 'remove', role: 'up_next' },
    // Restaurants are repeatable — the go-to list keeps its spots.
    { name: 'Go-to spots', emoji: '⭐', on_complete: 'keep', role: 'rewatch' },
    { name: 'Recommended to me', emoji: '💡', on_complete: 'remove', role: 'recommended' },
  ],
};

function slotDomain(slot: RadarSlot): Domain {
  return slot.config?.domain ?? 'watch';
}

@Injectable({ providedIn: 'root' })
export class SlotsService {
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly slots = signal<RadarSlot[]>([]);
  readonly loading = signal(false);
  private loaded = false;

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loading.set(true);
    try {
      // IMPORTANT: explicit owner filter — friend-read RLS (0008) means an
      // unfiltered query would include friends' slots on MY radar.
      const { data, error } = await getSupabase()
        .from('radar_slots')
        .select(SLOT_SELECT)
        .eq('owner_id', userId)
        .order('position')
        .order('position', { referencedTable: 'radar_slot_items' });
      if (error) throw error;
      this.slots.set((data ?? []) as unknown as RadarSlot[]);
      this.loaded = true;
    } finally {
      this.loading.set(false);
    }
  }

  /** Slots for one domain (pre-domain slots count as 'watch'). */
  forDomain(domain: Domain): RadarSlot[] {
    return this.slots().filter((s) => slotDomain(s) === domain);
  }

  /** First visit to a domain: seed its starter slots. */
  async ensureDefaults(domain: Domain): Promise<void> {
    if (!this.loaded) await this.load();
    if (this.forDomain(domain).length) return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const base = Math.max(-1, ...this.slots().map((s) => s.position)) + 1;
    await getSupabase()
      .from('radar_slots')
      .insert(
        DEFAULT_SLOTS[domain].map((s, i) => ({
          owner_id: userId,
          name: s.name,
          emoji: s.emoji,
          on_complete: s.on_complete,
          position: base + i,
          config: { role: s.role, domain },
        })),
      );
    await this.load();
  }

  async createSlot(name: string, emoji: string, loop: boolean, domain: Domain): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !name.trim()) return;
    const position = Math.max(-1, ...this.slots().map((s) => s.position)) + 1;
    const { error } = await getSupabase().from('radar_slots').insert({
      owner_id: userId,
      name: name.trim(),
      emoji: emoji.trim() || null,
      on_complete: loop ? 'loop' : 'remove',
      position,
      config: { domain },
    });
    if (error) this.toast.error('Could not create the slot.');
    await this.load();
  }

  async deleteSlot(slotId: string): Promise<void> {
    const { error } = await getSupabase().from('radar_slots').delete().eq('id', slotId);
    if (error) this.toast.error('Could not delete the slot.');
    await this.load();
  }

  async addItem(slotId: string, activityId: string): Promise<void> {
    const slot = this.slots().find((s) => s.id === slotId);
    const position = Math.max(-1, ...(slot?.items.map((i) => i.position) ?? [])) + 1;
    const { error } = await getSupabase()
      .from('radar_slot_items')
      .upsert(
        { slot_id: slotId, activity_id: activityId, position, added_by: this.auth.user()?.id },
        { onConflict: 'slot_id,activity_id', ignoreDuplicates: true },
      );
    if (error) this.toast.error('Could not add to the slot.');
    await this.load();
  }

  async removeItem(slotId: string, activityId: string): Promise<void> {
    await getSupabase()
      .from('radar_slot_items')
      .delete()
      .eq('slot_id', slotId)
      .eq('activity_id', activityId);
    await this.load();
  }

  /** Spotify-queue style reorder: swap with the neighbor above/below. */
  async move(slotId: string, activityId: string, dir: -1 | 1): Promise<void> {
    const slot = this.slots().find((s) => s.id === slotId);
    if (!slot) return;
    const sorted = [...slot.items].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((i) => i.activity_id === activityId);
    const neighbor = sorted[index + dir];
    if (index === -1 || !neighbor) return;
    const me = sorted[index];
    const supabase = getSupabase();
    await Promise.all([
      supabase
        .from('radar_slot_items')
        .update({ position: neighbor.position })
        .eq('slot_id', slotId)
        .eq('activity_id', me.activity_id),
      supabase
        .from('radar_slot_items')
        .update({ position: me.position })
        .eq('slot_id', slotId)
        .eq('activity_id', neighbor.activity_id),
    ]);
    await this.load();
  }

  /**
   * Status-driven slots (the detail page drives the radar):
   *   want_to → Up next · in_progress → Watching now · completed → the
   *   on_complete behavior (+ Rewatch when marked rewatchable) ·
   *   abandoned/not_interested → out of the flow slots.
   * Role slots the user deleted are silently skipped.
   */
  async syncStatus(
    activityId: string,
    status: string,
    isRewatchable: boolean,
    domain: Domain,
  ): Promise<void> {
    if (!this.loaded) await this.load();
    switch (status) {
      case 'want_to':
        await this.addToRole('up_next', activityId, domain);
        await this.removeFromRole('watching', activityId, domain);
        break;
      case 'in_progress':
        await this.addToRole('watching', activityId, domain);
        await this.removeFromRole('up_next', activityId, domain);
        break;
      case 'completed':
        await this.handleCompleted(activityId);
        if (isRewatchable) await this.addToRole('rewatch', activityId, domain);
        break;
      case 'abandoned':
      case 'not_interested':
        await this.removeFromRole('watching', activityId, domain);
        await this.removeFromRole('up_next', activityId, domain);
        if (status === 'not_interested') {
          await this.removeFromRole('rewatch', activityId, domain);
          await this.removeFromRole('recommended', activityId, domain);
        }
        break;
    }
    await this.load();
  }

  /** The "Would watch/go again" toggle ↔ the rewatch-role slot. */
  async setRewatch(activityId: string, on: boolean, domain: Domain): Promise<void> {
    if (!this.loaded) await this.load();
    if (on) await this.addToRole('rewatch', activityId, domain);
    else await this.removeFromRole('rewatch', activityId, domain);
    await this.load();
  }

  private byRole(role: SlotRole, domain: Domain): RadarSlot | undefined {
    return this.slots().find((s) => s.config?.role === role && slotDomain(s) === domain);
  }

  private async addToRole(role: SlotRole, activityId: string, domain: Domain) {
    const slot = this.byRole(role, domain);
    if (!slot || slot.items.some((i) => i.activity_id === activityId)) return;
    const position = Math.max(-1, ...slot.items.map((i) => i.position)) + 1;
    await getSupabase()
      .from('radar_slot_items')
      .upsert(
        { slot_id: slot.id, activity_id: activityId, position, added_by: this.auth.user()?.id },
        { onConflict: 'slot_id,activity_id', ignoreDuplicates: true },
      );
  }

  private async removeFromRole(role: SlotRole, activityId: string, domain: Domain) {
    const slot = this.byRole(role, domain);
    if (!slot) return;
    await getSupabase()
      .from('radar_slot_items')
      .delete()
      .eq('slot_id', slot.id)
      .eq('activity_id', activityId);
  }

  /**
   * Called when an engagement flips to completed: 'remove' slots drop the
   * title, 'loop' slots cycle it to the back, 'keep' slots leave it.
   * Queries directly (not the signal) so it works from anywhere in the app.
   */
  async handleCompleted(activityId: string): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const supabase = getSupabase();
    const { data } = await supabase
      .from('radar_slot_items')
      .select('slot_id, position, slot:radar_slots!inner(on_complete, owner_id)')
      .eq('activity_id', activityId)
      .eq('slot.owner_id', userId); // only MY slots — never touch a friend's
    const rows = (data ?? []) as unknown as {
      slot_id: string;
      position: number;
      slot: { on_complete: SlotOnComplete };
    }[];
    for (const row of rows) {
      if (row.slot.on_complete === 'remove') {
        await supabase
          .from('radar_slot_items')
          .delete()
          .eq('slot_id', row.slot_id)
          .eq('activity_id', activityId);
      } else if (row.slot.on_complete === 'loop') {
        const { data: siblings } = await supabase
          .from('radar_slot_items')
          .select('position')
          .eq('slot_id', row.slot_id)
          .order('position', { ascending: false })
          .limit(1);
        const back = (siblings?.[0]?.position ?? 0) + 1;
        await supabase
          .from('radar_slot_items')
          .update({ position: back })
          .eq('slot_id', row.slot_id)
          .eq('activity_id', activityId);
      }
    }
    if (rows.length && this.loaded) await this.load();
  }
}
