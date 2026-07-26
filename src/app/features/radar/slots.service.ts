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
  type: 'movie' | 'tv_show' | 'restaurant' | 'outing' | 'book';
  duration_min: number | null;
  metadata: {
    release_year?: number | null;
    tmdb_vote?: number | null;
    rating?: number | null;
    rating_count?: number | null;
    price_level?: number | null;
    open_now?: boolean | null;
    authors?: string[];
    page_count?: number | null;
  };
  location?: { lat?: number; lng?: number } | null;
  activity_tags?: { tag: { slug: string; label: string; kind: string } }[];
  activity_availability?: { service: { slug: string; name: string } }[];
}

export interface SlotItem {
  activity_id: string;
  position: number;
  note: string | null;
  added_at?: string;
  activity: SlotItemActivity;
}

export type SlotVisibility = 'public' | 'friends' | 'private';

export interface RadarSlot {
  id: string;
  name: string;
  emoji: string | null;
  position: number;
  on_complete: SlotOnComplete;
  visibility: SlotVisibility;
  description: string | null;
  config: {
    role?: SlotRole;
    domain?: Domain;
    forked_from?: { profile_id: string; name: string };
  };
  items: SlotItem[];
}

/** A slot viewed socially — includes the owner and my relationship to it. */
export interface SlotView extends RadarSlot {
  owner: { id: string; display_name: string } | null;
  tags: { id: string; slug: string; label: string; kind: string }[];
  likeCount: number;
  likedByMe: boolean;
  subscriberCount: number;
  subscribedByMe: boolean;
}

export interface SubscribedSlot extends RadarSlot {
  owner: { id: string; display_name: string } | null;
  last_seen_at: string;
}

const SLOT_SELECT =
  'id, name, emoji, position, on_complete, visibility, description, config, ' +
  'items:radar_slot_items(activity_id, position, note, added_at, ' +
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
  do: [
    { name: 'Want to go', emoji: '🎯', on_complete: 'remove', role: 'up_next' },
    { name: 'Favorites', emoji: '⭐', on_complete: 'keep', role: 'rewatch' },
    { name: 'Recommended to me', emoji: '💡', on_complete: 'remove', role: 'recommended' },
  ],
  read: [
    { name: 'Reading', emoji: '📖', on_complete: 'remove', role: 'watching' },
    { name: 'Want to read', emoji: '📚', on_complete: 'remove', role: 'up_next' },
    { name: 'Favorites', emoji: '⭐', on_complete: 'keep', role: 'rewatch' },
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

  // ------------------------------------------------------------- social layer

  /** Fetch ANY visible slot (mine or someone else's) with social context. */
  async fetchSlotView(slotId: string): Promise<SlotView | null> {
    const me = this.auth.user()?.id;
    const supabase = getSupabase();
    const [slotRes, tagsRes, likesRes, subsRes] = await Promise.all([
      supabase
        .from('radar_slots')
        .select(SLOT_SELECT + ', owner:profiles!radar_slots_owner_id_fkey(id, display_name)')
        .eq('id', slotId)
        .maybeSingle(),
      supabase.from('slot_tags').select('tag:tags(id, slug, label, kind)').eq('slot_id', slotId),
      supabase.from('slot_likes').select('user_id').eq('slot_id', slotId),
      supabase.from('slot_subscriptions').select('subscriber_id').eq('slot_id', slotId),
    ]);
    if (!slotRes.data) return null;
    const likes = (likesRes.data ?? []) as { user_id: string }[];
    const subs = (subsRes.data ?? []) as { subscriber_id: string }[];
    return {
      ...(slotRes.data as unknown as RadarSlot & { owner: SlotView['owner'] }),
      tags: ((tagsRes.data ?? []) as unknown as { tag: SlotView['tags'][number] }[]).map((t) => t.tag),
      likeCount: likes.length,
      likedByMe: likes.some((l) => l.user_id === me),
      subscriberCount: subs.length,
      subscribedByMe: subs.some((s) => s.subscriber_id === me),
    };
  }

  async setVisibility(slotId: string, visibility: SlotVisibility): Promise<void> {
    await getSupabase().from('radar_slots').update({ visibility }).eq('id', slotId);
    await this.load();
  }

  async setDescription(slotId: string, description: string): Promise<void> {
    await getSupabase()
      .from('radar_slots')
      .update({ description: description.trim() || null })
      .eq('id', slotId);
    await this.load();
  }

  async setSlotTag(slotId: string, tagId: string, on: boolean): Promise<void> {
    const supabase = getSupabase();
    if (on) {
      await supabase.from('slot_tags').upsert({ slot_id: slotId, tag_id: tagId }, { ignoreDuplicates: true });
    } else {
      await supabase.from('slot_tags').delete().eq('slot_id', slotId).eq('tag_id', tagId);
    }
  }

  async setLike(slotId: string, on: boolean): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    const supabase = getSupabase();
    if (on) await supabase.from('slot_likes').upsert({ slot_id: slotId, user_id: me }, { ignoreDuplicates: true });
    else await supabase.from('slot_likes').delete().eq('slot_id', slotId).eq('user_id', me);
  }

  async setSubscribed(slotId: string, on: boolean): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    const supabase = getSupabase();
    if (on) {
      const { error } = await supabase
        .from('slot_subscriptions')
        .upsert({ subscriber_id: me, slot_id: slotId }, { ignoreDuplicates: true });
      if (error) this.toast.error('Could not subscribe to that slot.');
    } else {
      await supabase.from('slot_subscriptions').delete().eq('subscriber_id', me).eq('slot_id', slotId);
    }
    await this.loadSubscribed();
  }

  readonly subscribed = signal<SubscribedSlot[]>([]);

  /** Slots I've saved from other people — live references, read-only. */
  async loadSubscribed(): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    const { data } = await getSupabase()
      .from('slot_subscriptions')
      .select(
        `last_seen_at, slot:radar_slots(${SLOT_SELECT}, owner:profiles!radar_slots_owner_id_fkey(id, display_name))`,
      )
      .eq('subscriber_id', me);
    const rows = (data ?? []) as unknown as { last_seen_at: string; slot: (RadarSlot & { owner: SubscribedSlot['owner'] }) | null }[];
    this.subscribed.set(
      rows
        .filter((r) => r.slot) // slots that went private drop out (RLS)
        .map((r) => ({ ...r.slot!, last_seen_at: r.last_seen_at })),
    );
  }

  /** Opening a subscribed slot resets its "+N new" badge. */
  async markSeen(slotId: string): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    await getSupabase()
      .from('slot_subscriptions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('subscriber_id', me)
      .eq('slot_id', slotId);
  }

  /** Idea #5: duplicate someone's slot as my own editable copy, attributed. */
  async fork(view: SlotView): Promise<string | null> {
    const me = this.auth.user()?.id;
    if (!me || !view.owner) return null;
    const supabase = getSupabase();
    const position = Math.max(-1, ...this.slots().map((s) => s.position)) + 1;
    const { data: created, error } = await supabase
      .from('radar_slots')
      .insert({
        owner_id: me,
        name: view.name,
        emoji: view.emoji,
        on_complete: view.on_complete,
        description: view.description,
        position,
        config: {
          domain: view.config?.domain ?? 'watch',
          forked_from: { profile_id: view.owner.id, name: view.owner.display_name },
        },
      })
      .select('id')
      .single();
    if (error || !created) {
      this.toast.error('Could not fork the slot.');
      return null;
    }
    if (view.items.length) {
      await supabase.from('radar_slot_items').insert(
        view.items.map((i) => ({
          slot_id: created.id,
          activity_id: i.activity_id,
          position: i.position,
          added_by: me,
        })),
      );
    }
    if (view.tags.length) {
      await supabase
        .from('slot_tags')
        .insert(view.tags.map((t) => ({ slot_id: created.id, tag_id: t.id })));
    }
    await this.load();
    return created.id;
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
