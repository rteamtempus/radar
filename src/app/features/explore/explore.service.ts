import { Injectable, inject, signal } from '@angular/core';
import { Domain } from '../../core/domain.service';
import { LatLng } from '../../core/location.service';
import { getSupabase } from '../../core/supabase.client';
import { FriendsService } from '../friends/friends.service';
import { ActivitySummary } from '../library/library.service';

/** Catalog row for Explore — ActivitySummary plus geo for distance. */
export interface ExploreItem extends ActivitySummary {
  location?: { lat?: number; lng?: number } | null;
}

export interface FriendSignal {
  name: string;
  initial: string;
  status: 'want_to' | 'in_progress' | 'completed';
  rating: number | null;
}

const CATALOG_SELECT =
  'id, type, title, description, image_url, duration_min, external_source, external_id, metadata, location, ' +
  'activity_tags(tag:tags(slug, label, kind)), ' +
  'activity_availability(service:streaming_services(slug, name))';

/** Miles between two points (haversine). */
export function distanceMiles(a: LatLng, b: { lat?: number; lng?: number }): number | null {
  if (b.lat == null || b.lng == null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * The Explore catalog: everything Radar collectively knows (the shared
 * activities table), enriched with friends' engagement signals. External
 * searches (TMDB auto, Places on demand) upsert into the same catalog and
 * merge in here.
 */
@Injectable({ providedIn: 'root' })
export class ExploreService {
  private friendsService = inject(FriendsService);

  readonly items = signal<Map<string, ExploreItem>>(new Map());
  readonly friendSignals = signal<Map<string, FriendSignal[]>>(new Map());
  readonly loading = signal(false);

  async load(domain: Domain): Promise<void> {
    this.loading.set(true);
    try {
      const types: ('movie' | 'tv_show' | 'restaurant')[] =
        domain === 'eat' ? ['restaurant'] : ['movie', 'tv_show'];
      const { data } = await getSupabase()
        .from('activities')
        .select(CATALOG_SELECT)
        .in('type', types)
        .order('created_at', { ascending: false })
        .limit(600);
      const map = new Map<string, ExploreItem>();
      for (const row of (data ?? []) as unknown as ExploreItem[]) map.set(row.id, row);
      this.items.set(map);
      await this.loadFriendSignals();
    } finally {
      this.loading.set(false);
    }
  }

  /** Merge externally-searched rows (already upserted server-side). */
  merge(rows: ActivitySummary[]): void {
    if (!rows.length) return;
    this.items.update((map) => {
      const next = new Map(map);
      for (const row of rows) {
        const existing = next.get(row.id);
        next.set(row.id, { ...existing, ...row } as ExploreItem);
      }
      return next;
    });
  }

  /** activity_id → friends who want/are watching/finished it (RLS-visible). */
  private async loadFriendSignals(): Promise<void> {
    await this.friendsService.load();
    const friends = this.friendsService.friends();
    if (!friends.length) {
      this.friendSignals.set(new Map());
      return;
    }
    const byId = new Map(friends.map((f) => [f.id, f]));
    const { data } = await getSupabase()
      .from('user_engagements')
      .select('user_id, activity_id, status, rating')
      .in('user_id', friends.map((f) => f.id))
      .in('status', ['want_to', 'in_progress', 'completed']);
    const map = new Map<string, FriendSignal[]>();
    for (const row of data ?? []) {
      const friend = byId.get(row.user_id);
      if (!friend) continue;
      const list = map.get(row.activity_id) ?? [];
      list.push({
        name: friend.display_name,
        initial: friend.display_name.trim().charAt(0).toUpperCase() || '?',
        status: row.status as FriendSignal['status'],
        rating: row.rating,
      });
      map.set(row.activity_id, list);
    }
    this.friendSignals.set(map);
  }
}
