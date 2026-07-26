import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LatLng, LocationService } from '../../core/location.service';
import { PlatformService } from '../../core/platform/platform.service';
import { getSupabase } from '../../core/supabase.client';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { ToastService } from '../../shared/ui/toast.service';
import { distanceMiles } from '../explore/explore.service';
import { LibraryService } from '../library/library.service';
import { SlotItem, SlotView, SlotVisibility, SlotsService } from './slots.service';

type SlotSort = 'queue' | 'rating' | 'newest' | 'az' | 'distance';

interface TagOption {
  id: string;
  label: string;
  kind: string;
}

/**
 * One slot, full screen — mine (edit: reorder, visibility, tags, description,
 * owner stats) or someone else's (like, subscribe, fork, share; read-only).
 * Explore-style search/filters for big slots either way.
 */
@Component({
  selector: 'pp-slot-detail-page',
  imports: [FormsModule, RouterLink, ServiceBadges],
  template: `
    @if (view(); as s) {
      <div class="mx-auto max-w-md px-5 py-6">
        <div class="flex items-center gap-3">
          <button (click)="back()" class="text-2xl text-muted" aria-label="Back">‹</button>
          <span class="text-2xl">{{ s.emoji ?? '🎬' }}</span>
          <div class="min-w-0 flex-1">
            <h1 class="truncate font-display text-2xl font-semibold">{{ s.name }}</h1>
            <p class="text-xs text-muted">
              @if (!isOwner() && s.owner) {
                by
                <a [routerLink]="['/friends', s.owner.id]" class="font-bold text-coral">{{ s.owner.display_name }}</a>
                ·
              }
              {{ s.items.length }} in the queue
              @if (s.on_complete === 'loop') {
                · <span class="font-bold text-violet">loops</span>
              }
              @if (s.config.forked_from; as fork) {
                · forked from
                <a [routerLink]="['/friends', fork.profile_id]" class="font-bold text-coral">{{ fork.name }}</a>
              }
            </p>
          </div>
          <button (click)="share(s)" class="flex-none text-lg" aria-label="Share slot">📤</button>
        </div>

        @if (s.description) {
          <p class="mt-2 text-sm text-muted-2">{{ s.description }}</p>
        }
        @if (s.tags.length) {
          <div class="mt-2 flex flex-wrap gap-1.5">
            @for (t of s.tags; track t.id) {
              <span class="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-muted-2">{{ t.label }}</span>
            }
          </div>
        }

        <!-- social row -->
        <div class="mt-3 flex items-center gap-2">
          @if (!isOwner()) {
            <button
              (click)="toggleLike(s)"
              class="rounded-full border px-3.5 py-2 text-sm font-bold"
              [class]="s.likedByMe ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted-2'"
            >
              👍 {{ s.likeCount || '' }}
            </button>
            @if (!s.config.role) {
              <button
                (click)="toggleSubscribe(s)"
                class="flex-1 rounded-full border-2 py-2 text-sm font-bold"
                [class]="s.subscribedByMe ? 'border-green bg-green/10 text-green' : 'border-coral text-coral'"
              >
                {{ s.subscribedByMe ? '✓ On your radar' : '＋ Save to my radar' }}
              </button>
              <button (click)="doFork(s)" class="rounded-full border border-line px-3.5 py-2 text-sm font-bold text-muted-2">
                ⑂ Fork
              </button>
            }
            @if (completion(); as c) {
              <span class="flex-none text-xs font-bold text-muted">{{ c }}</span>
            }
          } @else {
            <!-- owner stats (idea #8): only you see these numbers -->
            <span class="text-xs font-bold text-muted">
              👍 {{ s.likeCount }} · {{ s.subscriberCount }} subscriber{{ s.subscriberCount === 1 ? '' : 's' }}
              <span class="text-muted/60">· only you see this</span>
            </span>
          }
        </div>

        @if (isOwner()) {
          <!-- visibility -->
          <div class="mt-3 flex gap-2">
            @for (v of visibilities; track v.key) {
              <button
                (click)="setVisibility(s, v.key)"
                class="flex-1 rounded-2xl border py-2 text-xs font-bold"
                [class]="s.visibility === v.key ? 'border-coral bg-coral/15 text-coral' : 'border-line text-muted-2'"
              >
                {{ v.label }}
              </button>
            }
          </div>

          <!-- description + tags editor -->
          <details class="mt-3 rounded-2xl border border-line bg-surface p-3.5">
            <summary class="cursor-pointer text-xs font-bold tracking-wide text-muted uppercase">
              Edit description & tags
            </summary>
            <textarea
              rows="2"
              maxlength="200"
              placeholder="What's this slot for?"
              [(ngModel)]="descDraft"
              class="mt-3 w-full resize-none rounded-xl border border-line bg-bg-warm px-3 py-2.5 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
            ></textarea>
            <button (click)="saveDescription(s)" class="mt-2 rounded-xl bg-coral px-3.5 py-2 text-xs font-bold text-ink">
              Save description
            </button>
            <p class="mt-3 text-[11px] font-bold tracking-wide text-muted uppercase">Tags (for search & parties)</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              @for (t of tagOptions(); track t.id) {
                <button
                  (click)="toggleTag(s, t)"
                  class="rounded-full border px-2.5 py-1.5 text-[11px] font-bold"
                  [class]="hasTag(s, t.id) ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted-2'"
                >
                  {{ t.label }}
                </button>
              }
            </div>
          </details>
        }

        <input
          type="search"
          placeholder="Search this slot…"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          class="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
        />

        <!-- filters -->
        <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          @if (isWatchSlot()) {
            <button (click)="mineOnly.set(!mineOnly())" [class]="chip(mineOnly(), 'green')">📡 On my services</button>
            @for (r of runtimeChips; track r.value) {
              <button (click)="runtimeMax.set(runtimeMax() === r.value ? null : r.value)" [class]="chip(runtimeMax() === r.value)">
                {{ r.label }}
              </button>
            }
            <button (click)="minVote.set(minVote() === 7 ? null : 7)" [class]="chip(minVote() === 7)">★ 7+</button>
          } @else if (isPlaceSlot()) {
            <button (click)="openNow.set(!openNow())" [class]="chip(openNow(), 'green')">● Open now</button>
            @for (m of distanceChips; track m.value) {
              <button (click)="maxMiles.set(maxMiles() === m.value ? null : m.value)" [class]="chip(maxMiles() === m.value)">
                {{ m.label }}
              </button>
            }
            @for (p of priceChips; track p.value) {
              <button (click)="togglePrice(p.value)" [class]="chip(priceSel().has(p.value))">{{ p.label }}</button>
            }
          }
          @for (o of sortChips(); track o.value) {
            <button (click)="sort.set(o.value)" [class]="chip(sort() === o.value)">↕ {{ o.label }}</button>
          }
          @if (filtersActive()) {
            <button (click)="clearFilters()" class="flex-none text-xs font-bold text-coral">Clear</button>
          }
        </div>

        @if (!filtered().length) {
          <div class="mt-10 flex flex-col items-center gap-3 text-center">
            <div class="text-4xl">🫥</div>
            <p class="font-bold">{{ s.items.length ? 'Nothing matches' : "Queue's empty" }}</p>
          </div>
        }

        <div class="mt-3 flex flex-col gap-2">
          @for (item of filtered(); track item.activity_id; let first = $first; let last = $last) {
            <div class="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-2.5">
              @if (canReorder()) {
                <span class="w-5 flex-none text-center text-xs font-bold text-muted">{{ $index + 1 }}</span>
              }
              <a [routerLink]="['/library', item.activity.id]" class="flex min-w-0 flex-1 items-center gap-2.5">
                @if (item.activity.image_url) {
                  <img [src]="item.activity.image_url" alt="" loading="lazy" class="h-16 w-11 flex-none rounded-lg object-cover" />
                } @else {
                  <div class="h-16 w-11 flex-none rounded-lg bg-surface-2"></div>
                }
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold">
                    {{ item.activity.title }}
                    @if (seenByMe(item)) {
                      <span class="text-green">✓</span>
                    }
                  </p>
                  <p class="truncate text-xs text-muted">{{ sub(item) }}</p>
                  @if (isWatchSlot() && item.activity.activity_availability?.length) {
                    <pp-service-badges class="mt-1" [services]="servicesOf(item)" [highlight]="subs.mySlugs()" />
                  }
                </div>
              </a>
              @if (isOwner()) {
                <div class="flex flex-none items-center gap-0.5">
                  @if (canReorder()) {
                    <button (click)="move(s, item, -1)" [disabled]="first" class="px-1.5 py-1 text-muted disabled:opacity-25" aria-label="Move up">▲</button>
                    <button (click)="move(s, item, 1)" [disabled]="last" class="px-1.5 py-1 text-muted disabled:opacity-25" aria-label="Move down">▼</button>
                  }
                  <button (click)="remove(s, item)" class="px-1.5 py-1 text-muted" aria-label="Remove">✕</button>
                </div>
              }
            </div>
          }
        </div>
      </div>
    } @else if (notFound()) {
      <div class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <div class="text-4xl">🔒</div>
        <p class="font-bold">This slot isn't available</p>
        <p class="text-sm text-muted-2">It may be private, or it was deleted.</p>
      </div>
    } @else {
      <div class="flex min-h-dvh items-center justify-center">
        <div class="size-10 animate-spin rounded-full border-4 border-surface-2 border-t-coral"></div>
      </div>
    }
  `,
})
export class SlotDetailPage {
  protected readonly slots = inject(SlotsService);
  protected readonly subs = inject(SubscriptionsService);
  private readonly auth = inject(AuthService);
  private readonly lib = inject(LibraryService);
  private readonly location = inject(LocationService);
  private readonly platform = inject(PlatformService);
  private readonly toast = inject(ToastService);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly view = signal<SlotView | null>(null);
  protected readonly notFound = signal(false);
  protected descDraft = '';
  protected readonly tagOptions = signal<TagOption[]>([]);

  protected readonly query = signal('');
  protected readonly mineOnly = signal(false);
  protected readonly runtimeMax = signal<number | null>(null);
  protected readonly minVote = signal<number | null>(null);
  protected readonly priceSel = signal<ReadonlySet<number>>(new Set());
  protected readonly openNow = signal(false);
  protected readonly maxMiles = signal<number | null>(null);
  protected readonly sort = signal<SlotSort>('queue');
  protected readonly myLoc = signal<LatLng | null>(null);

  protected readonly visibilities: { key: SlotVisibility; label: string }[] = [
    { key: 'public', label: '🌐 Public' },
    { key: 'friends', label: '👥 Friends' },
    { key: 'private', label: '🔒 Private' },
  ];
  protected readonly runtimeChips = [
    { label: '⏱ <90m', value: 90 },
    { label: '⏱ <2h', value: 120 },
  ];
  protected readonly priceChips = [
    { label: '$', value: 1 },
    { label: '$$', value: 2 },
    { label: '$$$', value: 3 },
    { label: '$$$$', value: 4 },
  ];
  protected readonly distanceChips = [
    { label: '📍 <1 mi', value: 1 },
    { label: '📍 <5 mi', value: 5 },
    { label: '📍 <10 mi', value: 10 },
  ];

  protected readonly isOwner = computed(
    () => !!this.view() && this.view()!.owner?.id === this.auth.user()?.id,
  );
  private readonly slotDomain = computed(() => this.view()?.config?.domain ?? 'watch');
  protected readonly isPlaceSlot = computed(() => ['eat', 'do'].includes(this.slotDomain()));
  protected readonly isWatchSlot = computed(() => this.slotDomain() === 'watch');

  /** Idea #4: my progress through this (someone else's) slot. */
  protected readonly completion = computed(() => {
    const s = this.view();
    if (!s || !s.items.length) return null;
    const done = s.items.filter((i) => this.seenByMe(i)).length;
    return done ? `${done}/${s.items.length} done` : null;
  });

  protected readonly sortChips = computed(() => {
    const base = [
      { label: 'Queue', value: 'queue' as SlotSort },
      { label: 'Top rated', value: 'rating' as SlotSort },
    ];
    if (this.isPlaceSlot()) base.push({ label: 'Closest', value: 'distance' as SlotSort });
    else base.push({ label: 'Newest', value: 'newest' as SlotSort });
    base.push({ label: 'A–Z', value: 'az' as SlotSort });
    return base;
  });

  protected readonly filtersActive = computed(
    () =>
      !!this.query().trim() ||
      this.mineOnly() ||
      this.runtimeMax() !== null ||
      this.minVote() !== null ||
      this.priceSel().size > 0 ||
      this.openNow() ||
      this.maxMiles() !== null,
  );

  protected readonly canReorder = computed(
    () => this.isOwner() && this.sort() === 'queue' && !this.filtersActive(),
  );

  protected readonly filtered = computed<SlotItem[]>(() => {
    const s = this.view();
    if (!s) return [];
    const q = this.query().trim().toLowerCase();
    const myLoc = this.myLoc();
    const services = this.mineOnly() && this.subs.mySlugs().length ? new Set(this.subs.mySlugs()) : null;

    const out = s.items.filter((item) => {
      const a = item.activity;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      if (services && !(a.activity_availability ?? []).some((x) => services.has(x.service.slug))) return false;
      if (this.isWatchSlot()) {
        const cap = this.runtimeMax();
        if (cap && a.duration_min && a.duration_min > cap) return false;
        if (this.minVote() && (a.metadata?.tmdb_vote ?? 0) < this.minVote()!) return false;
      } else if (this.isPlaceSlot()) {
        if (this.priceSel().size && !this.priceSel().has(a.metadata?.price_level ?? 0)) return false;
        if (this.openNow() && a.metadata?.open_now !== true) return false;
        const cap = this.maxMiles();
        if (cap) {
          const mi = myLoc && a.location ? distanceMiles(myLoc, a.location) : null;
          if (mi == null || mi > cap) return false;
        }
      }
      return true;
    });

    const dist = (x: SlotItem) =>
      myLoc && x.activity.location ? (distanceMiles(myLoc, x.activity.location) ?? 1e9) : 1e9;
    const score = (x: SlotItem) => x.activity.metadata?.rating ?? x.activity.metadata?.tmdb_vote ?? 0;
    switch (this.sort()) {
      case 'rating':
        return out.sort((a, b) => score(b) - score(a));
      case 'newest':
        return out.sort(
          (a, b) => (b.activity.metadata?.release_year ?? 0) - (a.activity.metadata?.release_year ?? 0),
        );
      case 'az':
        return out.sort((a, b) => a.activity.title.localeCompare(b.activity.title));
      case 'distance':
        return out.sort((a, b) => dist(a) - dist(b));
      default:
        return out.sort((a, b) => a.position - b.position);
    }
  });

  private readonly loadOnId = effect(() => {
    const id = this.id();
    this.view.set(null);
    this.notFound.set(false);
    void this.refresh(id);
  });

  constructor() {
    this.slots.load();
    this.subs.load();
    this.lib.load();
    this.location.get().then((loc) => this.myLoc.set(loc));
  }

  private async refresh(id = this.id()) {
    const view = await this.slots.fetchSlotView(id);
    if (!view) {
      this.notFound.set(true);
      return;
    }
    this.view.set(view);
    this.descDraft = view.description ?? '';
    if (view.subscribedByMe) this.slots.markSeen(id);
    if (view.owner?.id === this.auth.user()?.id) this.loadTagOptions(view);
  }

  private async loadTagOptions(view: SlotView) {
    const domain = view.config?.domain ?? 'watch';
    const kinds: ('cuisine' | 'theme' | 'genre' | 'vibe')[] =
      domain === 'eat' ? ['cuisine', 'vibe'] : domain === 'do' ? ['theme', 'vibe'] : ['genre', 'vibe'];
    const { data } = await getSupabase()
      .from('tags')
      .select('id, label, kind')
      .in('kind', kinds)
      .order('label');
    this.tagOptions.set((data ?? []) as TagOption[]);
  }

  // ---- actions ----
  protected async setVisibility(s: SlotView, v: SlotVisibility) {
    await this.slots.setVisibility(s.id, v);
    this.view.set({ ...s, visibility: v });
  }

  protected async saveDescription(s: SlotView) {
    await this.slots.setDescription(s.id, this.descDraft);
    this.view.set({ ...s, description: this.descDraft.trim() || null });
    this.toast.success('Saved ✓');
  }

  protected hasTag(s: SlotView, tagId: string): boolean {
    return s.tags.some((t) => t.id === tagId);
  }

  protected async toggleTag(s: SlotView, tag: TagOption) {
    const on = !this.hasTag(s, tag.id);
    await this.slots.setSlotTag(s.id, tag.id, on);
    this.view.set({
      ...s,
      tags: on ? [...s.tags, { ...tag, slug: '' }] : s.tags.filter((t) => t.id !== tag.id),
    });
  }

  protected async toggleLike(s: SlotView) {
    const on = !s.likedByMe;
    this.view.set({ ...s, likedByMe: on, likeCount: s.likeCount + (on ? 1 : -1) });
    await this.slots.setLike(s.id, on);
  }

  protected async toggleSubscribe(s: SlotView) {
    const on = !s.subscribedByMe;
    this.view.set({ ...s, subscribedByMe: on, subscriberCount: s.subscriberCount + (on ? 1 : -1) });
    await this.slots.setSubscribed(s.id, on);
    if (on) this.toast.success(`${s.name} saved to your radar ✓`);
  }

  protected async doFork(s: SlotView) {
    const newId = await this.slots.fork(s);
    if (newId) this.toast.success(`Forked — ${s.name} is yours now ✓`);
  }

  protected async share(s: SlotView) {
    const result = await this.platform
      .share({ title: s.name, text: `${s.emoji ?? ''} ${s.name} on Radar`, url: `${location.origin}/radar/slot/${s.id}` })
      .catch(() => null);
    if (result === 'copied') this.toast.success('Link copied ✓');
  }

  protected async move(s: SlotView, item: SlotItem, dir: -1 | 1) {
    await this.slots.move(s.id, item.activity_id, dir);
    await this.refresh();
  }

  protected async remove(s: SlotView, item: SlotItem) {
    await this.slots.removeItem(s.id, item.activity_id);
    await this.refresh();
  }

  protected clearFilters() {
    this.query.set('');
    this.mineOnly.set(false);
    this.runtimeMax.set(null);
    this.minVote.set(null);
    this.priceSel.set(new Set());
    this.openNow.set(false);
    this.maxMiles.set(null);
  }

  protected chip(active: boolean, tone: 'coral' | 'green' | 'gold' = 'coral'): string {
    const base = 'flex-none rounded-full border px-3 py-1.5 text-xs font-bold whitespace-nowrap ';
    if (!active) return base + 'border-line text-muted-2';
    const tones = {
      coral: 'border-coral bg-coral/15 text-coral',
      green: 'border-green bg-green/15 text-green',
      gold: 'border-gold bg-gold/15 text-gold',
    };
    return base + tones[tone];
  }

  protected togglePrice(p: number) {
    this.priceSel.update((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  protected seenByMe(item: SlotItem): boolean {
    return this.lib
      .entries()
      .some((e) => e.activity.id === item.activity_id && e.status === 'completed');
  }

  protected servicesOf(item: SlotItem) {
    return (item.activity.activity_availability ?? []).map((a) => a.service);
  }

  protected sub(item: SlotItem): string {
    const a = item.activity;
    if (a.type === 'book') {
      const parts: string[] = [];
      if (a.metadata?.authors?.length) parts.push(a.metadata.authors[0]);
      if (a.metadata?.release_year) parts.push(String(a.metadata.release_year));
      if (a.metadata?.page_count) parts.push(`${a.metadata.page_count}p`);
      return parts.join(' · ') || 'Book';
    }
    if (a.type === 'restaurant' || a.type === 'outing') {
      const parts: string[] = [];
      if (a.metadata?.rating) parts.push(`★ ${a.metadata.rating}`);
      if (a.metadata?.price_level) parts.push('$'.repeat(a.metadata.price_level));
      const loc = this.myLoc();
      const mi = loc && a.location ? distanceMiles(loc, a.location) : null;
      if (mi != null) parts.push(`${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`);
      return parts.join(' · ') || (a.type === 'outing' ? 'Place to go' : 'Restaurant');
    }
    const parts: string[] = [];
    if (a.metadata?.release_year) parts.push(String(a.metadata.release_year));
    parts.push(a.type === 'movie' ? 'Movie' : 'Series');
    if (a.metadata?.tmdb_vote) parts.push(`★ ${Number(a.metadata.tmdb_vote).toFixed(1)}`);
    return parts.join(' · ');
  }

  protected back() {
    history.back();
  }
}
