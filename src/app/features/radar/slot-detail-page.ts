import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LatLng, LocationService } from '../../core/location.service';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { distanceMiles } from '../explore/explore.service';
import { SlotItem, SlotsService } from './slots.service';

type SlotSort = 'queue' | 'rating' | 'newest' | 'az' | 'distance';

/**
 * One slot, full screen: the queue with Explore-style search + filters for
 * when a slot gets big. Reordering only makes sense in queue order with no
 * filters active — the ▲▼ controls hide otherwise.
 */
@Component({
  selector: 'pp-slot-detail-page',
  imports: [FormsModule, RouterLink, ServiceBadges],
  template: `
    @if (slot(); as s) {
      <div class="mx-auto max-w-md px-5 py-6">
        <div class="flex items-center gap-3">
          <button (click)="back()" class="text-2xl text-muted" aria-label="Back">‹</button>
          <span class="text-2xl">{{ s.emoji ?? '🎬' }}</span>
          <div class="min-w-0 flex-1">
            <h1 class="truncate font-display text-2xl font-semibold">{{ s.name }}</h1>
            <p class="text-xs text-muted">
              {{ s.items.length }} in the queue
              @if (s.on_complete === 'loop') {
                · <span class="font-bold text-violet">loops</span>
              }
            </p>
          </div>
        </div>

        <input
          type="search"
          placeholder="Search this slot…"
          [ngModel]="query()"
          (ngModelChange)="query.set($event); "
          class="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
        />

        <!-- filters -->
        <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          @if (!isEat()) {
            <button (click)="mineOnly.set(!mineOnly())" [class]="chip(mineOnly(), 'green')">📡 On my services</button>
            @for (r of runtimeChips; track r.value) {
              <button (click)="runtimeMax.set(runtimeMax() === r.value ? null : r.value)" [class]="chip(runtimeMax() === r.value)">
                {{ r.label }}
              </button>
            }
            <button (click)="minVote.set(minVote() === 7 ? null : 7)" [class]="chip(minVote() === 7)">★ 7+</button>
          } @else {
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
        </div>
        <div class="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          @for (g of tagChips(); track g.slug) {
            <button (click)="toggleTag(g.slug)" [class]="chip(tagSel().has(g.slug), 'gold')">{{ g.label }}</button>
          }
        </div>
        <div class="mt-2 flex items-center gap-2">
          <div class="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            @for (o of sortChips(); track o.value) {
              <button (click)="sort.set(o.value)" [class]="chip(sort() === o.value)">↕ {{ o.label }}</button>
            }
          </div>
          <span class="flex-none text-xs font-bold text-muted">{{ filtered().length }}</span>
          @if (filtersActive()) {
            <button (click)="clearFilters()" class="flex-none text-xs font-bold text-coral">Clear</button>
          }
        </div>

        @if (!filtered().length) {
          <div class="mt-10 flex flex-col items-center gap-3 text-center">
            <div class="text-4xl">🫥</div>
            <p class="font-bold">{{ s.items.length ? 'Nothing matches' : "Queue's empty" }}</p>
            <p class="max-w-64 text-sm text-muted-2">
              {{ s.items.length ? 'Loosen a filter.' : 'Add from Explore or any detail page.' }}
            </p>
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
                  <p class="truncate text-sm font-bold">{{ item.activity.title }}</p>
                  <p class="truncate text-xs text-muted">{{ sub(item) }}</p>
                  @if (!isEat() && item.activity.activity_availability?.length) {
                    <pp-service-badges
                      class="mt-1"
                      [services]="servicesOf(item)"
                      [highlight]="subs.mySlugs()"
                    />
                  }
                </div>
              </a>
              <div class="flex flex-none items-center gap-0.5">
                @if (canReorder()) {
                  <button (click)="slots.move(s.id, item.activity_id, -1)" [disabled]="first" class="px-1.5 py-1 text-muted disabled:opacity-25" aria-label="Move up">▲</button>
                  <button (click)="slots.move(s.id, item.activity_id, 1)" [disabled]="last" class="px-1.5 py-1 text-muted disabled:opacity-25" aria-label="Move down">▼</button>
                }
                <button (click)="slots.removeItem(s.id, item.activity_id)" class="px-1.5 py-1 text-muted" aria-label="Remove">✕</button>
              </div>
            </div>
          }
        </div>
        @if (!canReorder() && filtered().length) {
          <p class="mt-2 text-center text-[10px] text-muted">Reordering is available in Queue order with no filters.</p>
        }
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
  private readonly location = inject(LocationService);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly query = signal('');
  protected readonly mineOnly = signal(false);
  protected readonly tagSel = signal<ReadonlySet<string>>(new Set());
  protected readonly runtimeMax = signal<number | null>(null);
  protected readonly minVote = signal<number | null>(null);
  protected readonly priceSel = signal<ReadonlySet<number>>(new Set());
  protected readonly openNow = signal(false);
  protected readonly maxMiles = signal<number | null>(null);
  protected readonly sort = signal<SlotSort>('queue');
  protected readonly myLoc = signal<LatLng | null>(null);

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

  protected readonly slot = computed(() => this.slots.slots().find((s) => s.id === this.id()));
  protected readonly isEat = computed(() => (this.slot()?.config?.domain ?? 'watch') === 'eat');

  protected readonly sortChips = computed(() =>
    this.isEat()
      ? [
          { label: 'Queue', value: 'queue' as SlotSort },
          { label: 'Top rated', value: 'rating' as SlotSort },
          { label: 'Closest', value: 'distance' as SlotSort },
          { label: 'A–Z', value: 'az' as SlotSort },
        ]
      : [
          { label: 'Queue', value: 'queue' as SlotSort },
          { label: 'Top rated', value: 'rating' as SlotSort },
          { label: 'Newest', value: 'newest' as SlotSort },
          { label: 'A–Z', value: 'az' as SlotSort },
        ],
  );

  protected readonly tagChips = computed(() => {
    const kind = this.isEat() ? 'cuisine' : 'genre';
    const seen = new Map<string, string>();
    for (const item of this.slot()?.items ?? []) {
      for (const t of item.activity.activity_tags ?? []) {
        if (t.tag.kind === kind) seen.set(t.tag.slug, t.tag.label);
      }
    }
    return [...seen]
      .map(([slug, label]) => ({ slug, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 12);
  });

  protected readonly filtersActive = computed(
    () =>
      !!this.query().trim() ||
      this.mineOnly() ||
      this.tagSel().size > 0 ||
      this.runtimeMax() !== null ||
      this.minVote() !== null ||
      this.priceSel().size > 0 ||
      this.openNow() ||
      this.maxMiles() !== null,
  );

  protected readonly canReorder = computed(() => this.sort() === 'queue' && !this.filtersActive());

  protected readonly filtered = computed<SlotItem[]>(() => {
    const s = this.slot();
    if (!s) return [];
    const q = this.query().trim().toLowerCase();
    const myLoc = this.myLoc();
    const services = this.mineOnly() && this.subs.mySlugs().length ? new Set(this.subs.mySlugs()) : null;

    const out = s.items.filter((item) => {
      const a = item.activity;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      if (services && !(a.activity_availability ?? []).some((x) => services.has(x.service.slug))) return false;
      const sel = this.tagSel();
      if (sel.size && !(a.activity_tags ?? []).some((t) => sel.has(t.tag.slug))) return false;
      if (!this.isEat()) {
        const cap = this.runtimeMax();
        if (cap && a.duration_min && a.duration_min > cap) return false;
        if (this.minVote() && (a.metadata?.tmdb_vote ?? 0) < this.minVote()!) return false;
      } else {
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
    switch (this.sort()) {
      case 'rating':
        return out.sort((a, b) =>
          this.isEat()
            ? (b.activity.metadata?.rating ?? 0) - (a.activity.metadata?.rating ?? 0)
            : (b.activity.metadata?.tmdb_vote ?? 0) - (a.activity.metadata?.tmdb_vote ?? 0),
        );
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

  constructor() {
    this.slots.load();
    this.subs.load();
    this.location.get().then((loc) => this.myLoc.set(loc));
  }

  protected clearFilters() {
    this.query.set('');
    this.mineOnly.set(false);
    this.tagSel.set(new Set());
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

  protected toggleTag(slug: string) {
    this.tagSel.update((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  protected servicesOf(item: SlotItem) {
    return (item.activity.activity_availability ?? []).map((a) => a.service);
  }

  protected sub(item: SlotItem): string {
    const a = item.activity;
    if (a.type === 'restaurant') {
      const parts: string[] = [];
      if (a.metadata?.rating) parts.push(`★ ${a.metadata.rating}`);
      if (a.metadata?.price_level) parts.push('$'.repeat(a.metadata.price_level));
      const loc = this.myLoc();
      const mi = loc && a.location ? distanceMiles(loc, a.location) : null;
      if (mi != null) parts.push(`${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`);
      return parts.join(' · ') || 'Restaurant';
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
