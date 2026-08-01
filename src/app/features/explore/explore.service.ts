import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
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

/** A slot as it appears in discovery — someone else's, visible to me. */
export interface DiscoverySlot {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  visibility: string;
  created_at: string;
  config: { domain?: Domain; role?: string };
  owner: { id: string; display_name: string } | null;
  items: { position: number; activity: { image_url: string | null } }[];
  slot_tags: { tag: { slug: string; label: string } }[];
  likes: { count: number }[];
}

export interface DiscoveryPerson {
  id: string;
  display_name: string;
  visibility: string;
  settings: { featured?: boolean } | null;
}

/** TMDB person hint for the "Films by X" pill. */
export interface ServerPerson {
  id: number;
  name: string;
  department: string | null;
}

// ---- geo discovery shapes (RPCs from migration 0017) -----------------------

/** A public slot near a searched city (slots_near). */
export interface NearSlot {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  owner_id: string;
  owner_name: string;
  loc_name: string;
  distance_km: number;
  domain: Domain;
  item_count: number;
  like_count: number;
  is_local: boolean;
  images: (string | null)[] | null;
}

/** An opted-in public profile in a searched city (people_in_city). */
export interface NearPerson {
  id: string;
  display_name: string;
  home_name: string | null;
  distance_km: number;
  match: number | null;
  public_slot_count: number;
}

/** A most-saved place in a city (city_guide). */
export interface CityGuideEntry {
  id: string;
  title: string;
  image_url: string | null;
  type: string;
  rating: number | null;
  rating_count: number | null;
  price_level: number | null;
  address: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  saves: number;
  slot_names: string[] | null;
}

/** One page of server-driven results: ordered ids + real totals. */
export interface ServerPage {
  ids: string[];
  total: number;
  hasMore: boolean;
  person: ServerPerson | null;
}

/**
 * The Explore catalog: everything Radar collectively knows (the shared
 * activities table), enriched with friends' engagement signals. External
 * searches (TMDB auto, Places on demand) upsert into the same catalog and
 * merge in here. Also: slot + people discovery (social phase 4).
 */
@Injectable({ providedIn: 'root' })
export class ExploreService {
  private friendsService = inject(FriendsService);
  private auth = inject(AuthService);

  readonly items = signal<Map<string, ExploreItem>>(new Map());
  readonly friendSignals = signal<Map<string, FriendSignal[]>>(new Map());
  readonly loading = signal(false);

  async load(domain: Domain): Promise<void> {
    this.loading.set(true);
    try {
      const types: ('movie' | 'tv_show' | 'restaurant' | 'outing' | 'book')[] =
        domain === 'eat'
          ? ['restaurant']
          : domain === 'do'
            ? ['outing']
            : domain === 'read'
              ? ['book']
              : ['movie', 'tv_show'];
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

  // ---- server-driven search (v0.13): real totals + pagination --------------
  // Watch = tmdb-search (free text) / tmdb-discover (filters, person);
  // Read = books-search (Open Library). Rows are upserted server-side and
  // merged into the catalog; the caller keeps the ordered id list.

  async searchWatch(params: {
    query?: string;
    page: number;
    kind: 'movie' | 'tv' | 'both';
    genres: string[];
    decade: number | null;
    voteGte: number | null;
    runtimeLte: number | null;
    providers: string[];
    personId: number | null;
    sort: 'popular' | 'rating' | 'newest';
  }): Promise<ServerPage> {
    const q = params.query?.trim() ?? '';
    const filterless =
      !params.genres.length &&
      !params.decade &&
      !params.voteGte &&
      !params.runtimeLte &&
      !params.providers.length &&
      !params.personId;

    // Plain text with no filters → title search (with the person hint);
    // anything with filters → discover (text can't combine with it on TMDB).
    if (q && filterless) {
      const { data, error } = await getSupabase().functions.invoke<{
        results: ActivitySummary[];
        total: number;
        has_more: boolean;
        person: ServerPerson | null;
      }>('tmdb-search', { body: { query: q, page: params.page } });
      if (error) throw error;
      this.merge(data?.results ?? []);
      return {
        ids: (data?.results ?? []).map((r) => r.id),
        total: data?.total ?? 0,
        hasMore: data?.has_more ?? false,
        person: data?.person ?? null,
      };
    }

    const { data, error } = await getSupabase().functions.invoke<{
      results: ActivitySummary[];
      total: number;
      has_more: boolean;
    }>('tmdb-discover', {
      body: {
        kind: params.kind,
        page: params.page,
        genres: params.genres,
        decade: params.decade ?? undefined,
        vote_gte: params.voteGte ?? undefined,
        runtime_lte: params.runtimeLte ?? undefined,
        providers: params.providers,
        person_id: params.personId ?? undefined,
        sort: params.sort,
      },
    });
    if (error) throw error;
    this.merge(data?.results ?? []);
    return {
      ids: (data?.results ?? []).map((r) => r.id),
      total: data?.total ?? 0,
      hasMore: data?.has_more ?? false,
      person: null,
    };
  }

  async searchRead(params: {
    query?: string;
    subject?: string;
    page: number;
    sort: 'want_to_read' | 'rating' | 'new';
  }): Promise<ServerPage> {
    const { data, error } = await getSupabase().functions.invoke<{
      results: ActivitySummary[];
      total: number;
      has_more: boolean;
    }>('books-search', {
      body: {
        query: params.query?.trim() || undefined,
        subject: params.subject || undefined,
        page: params.page,
        sort: params.sort,
      },
    });
    if (error) throw error;
    this.merge(data?.results ?? []);
    return {
      ids: (data?.results ?? []).map((r) => r.id),
      total: data?.total ?? 0,
      hasMore: data?.has_more ?? false,
      person: null,
    };
  }

  /**
   * Discoverable slots: PUBLIC only (G1 resolution, 2026-08-01 — search never
   * surfaces friends-only slots; those live on friend profiles and in quests).
   * Minus my own and minus role slots (personal queues aren't curated lists).
   * Popularity = like count (subscriber counts are owner-private by design).
   */
  async searchSlots(): Promise<DiscoverySlot[]> {
    const me = this.auth.user()?.id;
    const { data } = await getSupabase()
      .from('radar_slots')
      .select(
        'id, name, emoji, description, visibility, created_at, config, ' +
          'owner:profiles!radar_slots_owner_id_fkey(id, display_name), ' +
          'items:radar_slot_items(position, activity:activities(image_url)), ' +
          'slot_tags(tag:tags(slug, label)), ' +
          'likes:slot_likes(count)',
      )
      .eq('visibility', 'public')
      .neq('owner_id', me ?? '')
      .limit(200);
    return ((data ?? []) as unknown as DiscoverySlot[]).filter((s) => !s.config?.role);
  }

  // ---- geo discovery (v0.14 — SECURITY DEFINER RPCs, public content only) --

  async slotsNear(loc: LatLng, domain: Domain, radiusKm = 50): Promise<NearSlot[]> {
    const { data, error } = await getSupabase().rpc('slots_near', {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_radius_km: radiusKm,
      p_domain: domain,
    });
    if (error) throw error;
    return (data ?? []) as unknown as NearSlot[];
  }

  async peopleInCity(loc: LatLng, radiusKm = 50): Promise<NearPerson[]> {
    const { data, error } = await getSupabase().rpc('people_in_city', {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_radius_km: radiusKm,
    });
    if (error) throw error;
    return (data ?? []) as unknown as NearPerson[];
  }

  async cityGuide(loc: LatLng, domain: 'eat' | 'do', radiusKm = 50): Promise<CityGuideEntry[]> {
    const { data, error } = await getSupabase().rpc('city_guide', {
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_radius_km: radiusKm,
      p_domain: domain,
    });
    if (error) throw error;
    return (data ?? []) as unknown as CityGuideEntry[];
  }

  /** Featured curators (idea #15): public profiles flagged in settings. */
  async featuredPeople(): Promise<DiscoveryPerson[]> {
    const { data } = await getSupabase()
      .from('profiles')
      .select('id, display_name, visibility, settings')
      .eq('visibility', 'public')
      .eq('settings->>featured', 'true')
      .limit(20);
    return (data ?? []) as unknown as DiscoveryPerson[];
  }

  /** Public-profile search by name. */
  async searchPeople(query: string): Promise<DiscoveryPerson[]> {
    const me = this.auth.user()?.id;
    const { data } = await getSupabase()
      .from('profiles')
      .select('id, display_name, visibility, settings')
      .eq('visibility', 'public')
      .ilike('display_name', `%${query.trim()}%`)
      .neq('id', me ?? '')
      .limit(20);
    return (data ?? []) as unknown as DiscoveryPerson[];
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
