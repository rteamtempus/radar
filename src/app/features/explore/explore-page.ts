import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DOMAINS, Domain, DomainService, isPlaceDomain } from '../../core/domain.service';
import { LatLng, LocationService } from '../../core/location.service';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { ToastService } from '../../shared/ui/toast.service';
import { LibraryService } from '../library/library.service';
import { ExploreItem, ExploreService, FriendSignal, distanceMiles } from './explore.service';

type WatchSort = 'popular' | 'rating' | 'newest' | 'az';
type EatSort = 'rating' | 'distance' | 'reviews';
type FriendFilter = 'want_to' | 'in_progress' | 'loved' | null;

const PAGE = 40;

/**
 * Explore: a searchable, filterable browser over everything Radar knows —
 * the shared catalog + your friends' signals — topped up live from TMDB
 * (automatic) and Google Places (on demand, it's billable).
 */
@Component({
  selector: 'pp-explore-page',
  imports: [FormsModule, RouterLink, ServiceBadges],
  template: `
    <div class="mx-auto max-w-md px-5 py-6">
      <h1 class="font-display text-3xl font-semibold">Explore</h1>
      <div class="no-scrollbar mt-3 flex gap-1 overflow-x-auto rounded-full bg-surface p-1">
        @for (d of domains; track d.id) {
          <button
            (click)="switchDomain(d.id)"
            class="flex-1 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors"
            [class]="domain.domain() === d.id ? 'bg-coral text-ink' : 'text-muted-2'"
          >
            {{ d.emoji }} {{ d.label }}
          </button>
        }
      </div>

      <input
        type="search"
        [placeholder]="domain.def().searchPlaceholder"
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        class="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
      />

      <!-- ============ filters ============ -->
      @if (isWatch()) {
        <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          @for (t of typeChips; track t.value) {
            <button (click)="typeFilter.set(t.value)" [class]="chip(typeFilter() === t.value)">
              {{ t.label }}
            </button>
          }
          <button (click)="mineOnly.set(!mineOnly())" [class]="chip(mineOnly(), 'green')">
            📡 On my services
          </button>
          <button (click)="hideSeen.set(!hideSeen())" [class]="chip(hideSeen())">
            🙈 Hide seen
          </button>
        </div>
        <div class="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          @for (f of friendChips(); track f.value) {
            <button
              (click)="friendFilter.set(friendFilter() === f.value ? null : f.value)"
              [class]="chip(friendFilter() === f.value, 'violet')"
            >
              {{ f.label }}
            </button>
          }
          @for (r of runtimeChips; track r.value) {
            <button
              (click)="runtimeMax.set(runtimeMax() === r.value ? null : r.value)"
              [class]="chip(runtimeMax() === r.value)"
            >
              {{ r.label }}
            </button>
          }
          @for (d of decadeChips; track d.value) {
            <button
              (click)="decade.set(decade() === d.value ? null : d.value)"
              [class]="chip(decade() === d.value)"
            >
              {{ d.label }}
            </button>
          }
          <button (click)="minVote.set(minVote() === 7 ? null : 7)" [class]="chip(minVote() === 7)">★ 7+</button>
          <button (click)="minVote.set(minVote() === 8 ? null : 8)" [class]="chip(minVote() === 8)">★ 8+</button>
        </div>
      } @else if (isRead()) {
        <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          <button (click)="hideSeen.set(!hideSeen())" [class]="chip(hideSeen())">🙈 Hide read</button>
          <button (click)="minRating.set(minRating() === 4 ? null : 4)" [class]="chip(minRating() === 4)">★ 4+</button>
          @for (f of friendChips(); track f.value) {
            <button
              (click)="friendFilter.set(friendFilter() === f.value ? null : f.value)"
              [class]="chip(friendFilter() === f.value, 'violet')"
            >
              {{ f.label }}
            </button>
          }
        </div>
      } @else {
        <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          <button (click)="openNow.set(!openNow())" [class]="chip(openNow(), 'green')">● Open now</button>
          @for (m of distanceChips; track m.value) {
            <button
              (click)="maxMiles.set(maxMiles() === m.value ? null : m.value)"
              [class]="chip(maxMiles() === m.value)"
            >
              {{ m.label }}
            </button>
          }
          @for (p of priceChips; track p.value) {
            <button (click)="togglePrice(p.value)" [class]="chip(priceSel().has(p.value))">
              {{ p.label }}
            </button>
          }
          <button (click)="minRating.set(minRating() === 4 ? null : 4)" [class]="chip(minRating() === 4)">★ 4+</button>
          <button (click)="minRating.set(minRating() === 4.5 ? null : 4.5)" [class]="chip(minRating() === 4.5)">★ 4.5+</button>
          <button (click)="hideSeen.set(!hideSeen())" [class]="chip(hideSeen())">🙈 Hide been</button>
        </div>
        <div class="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          @for (f of friendChips(); track f.value) {
            <button
              (click)="friendFilter.set(friendFilter() === f.value ? null : f.value)"
              [class]="chip(friendFilter() === f.value, 'violet')"
            >
              {{ f.label }}
            </button>
          }
        </div>
      }

      <!-- genre / cuisine chips -->
      <div class="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
        @for (g of tagChips(); track g.slug) {
          <button (click)="toggleTag(g.slug)" [class]="chip(tagSel().has(g.slug), 'gold')">
            {{ g.label }}
          </button>
        }
      </div>

      <!-- sort + count + clear -->
      <div class="mt-2.5 flex items-center gap-2">
        <div class="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          @for (s of sortChips(); track s.value) {
            <button (click)="sort.set(s.value)" [class]="chip(sort() === s.value)">↕ {{ s.label }}</button>
          }
        </div>
        <span class="flex-none text-xs font-bold text-muted">{{ filtered().length }}</span>
        @if (anyFilterActive()) {
          <button (click)="clearFilters()" class="flex-none text-xs font-bold text-coral">Clear</button>
        }
      </div>

      <!-- ============ results ============ -->
      @if (explore.loading() && !filtered().length) {
        <div class="mt-4 flex flex-col gap-2.5">
          @for (i of [0, 1, 2, 3, 4]; track i) {
            <div class="h-20 animate-pulse rounded-2xl border border-line bg-surface"></div>
          }
        </div>
      } @else if (!filtered().length) {
        <div class="mt-10 flex flex-col items-center gap-3 text-center">
          <div class="text-4xl">🔭</div>
          <p class="font-bold">Nothing matches</p>
          <p class="max-w-64 text-sm text-muted-2">
            Loosen a filter{{ isEat() ? ' or pull in fresh spots below' : ' or keep typing — TMDB search kicks in automatically' }}.
          </p>
        </div>
      }

      <div class="mt-3 flex flex-col gap-2.5">
        @for (item of visible(); track item.id) {
          <div class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
            <a [routerLink]="['/library', item.id]" class="flex min-w-0 flex-1 items-center gap-3">
              @if (item.image_url) {
                <img [src]="item.image_url" alt="" loading="lazy" class="h-18 w-13 flex-none rounded-lg object-cover" />
              } @else {
                <div class="h-18 w-13 flex-none rounded-lg bg-surface-2"></div>
              }
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold">{{ item.title }}</p>
                <p class="truncate text-xs text-muted">{{ sub(item) }}</p>
                <div class="mt-1 flex items-center gap-1.5">
                  @if (!isEat()) {
                    <pp-service-badges [services]="servicesOf(item)" [highlight]="subs.mySlugs()" />
                  }
                  @for (f of signalsFor(item.id); track f.name) {
                    <span
                      class="flex size-5 items-center justify-center rounded-full text-[9px] font-extrabold"
                      [class]="signalClass(f)"
                      [title]="f.name + ' · ' + signalLabel(f)"
                      >{{ f.initial }}</span
                    >
                  }
                  @if (myStatus(item.id); as st) {
                    <span class="text-[10px] font-bold text-muted">{{ st }}</span>
                  }
                </div>
              </div>
            </a>
            @if (!myStatus(item.id)) {
              <button
                (click)="quickAdd(item)"
                class="flex-none rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green"
                [attr.aria-label]="'Add ' + item.title"
              >
                ＋
              </button>
            }
          </div>
        }
      </div>

      @if (filtered().length > shown()) {
        <button
          (click)="shown.set(shown() + pageSize)"
          class="mt-3 w-full rounded-2xl border border-line py-2.5 text-sm font-bold text-muted-2"
        >
          Show more ({{ filtered().length - shown() }} left)
        </button>
      }

      <!-- eat: explicit external pulls (Places calls are billable) -->
      @if (isEat()) {
        <div class="mt-4 flex gap-2">
          <button
            (click)="nearby()"
            [disabled]="pulling()"
            class="flex-1 rounded-2xl border border-dashed border-line py-2.5 text-sm font-bold text-muted-2 disabled:opacity-50"
          >
            📍 Pull nearby spots
          </button>
          @if (query().trim().length >= 2) {
            <button
              (click)="placesSearch()"
              [disabled]="pulling()"
              class="flex-1 rounded-2xl border border-dashed border-gold/50 py-2.5 text-sm font-bold text-gold disabled:opacity-50"
            >
              🔎 Search Google
            </button>
          }
        </div>
      }
      <p class="mt-3 text-center text-[10px] text-muted">
        {{
          isEat()
            ? 'Showing every place Radar knows — pulls add fresh ones from Google.'
            : isRead()
              ? 'Showing the shared catalog — typing searches Google Books automatically.'
              : 'Showing the shared catalog — typing searches TMDB automatically.'
        }}
      </p>
    </div>
  `,
})
export class ExplorePage implements OnDestroy {
  protected readonly explore = inject(ExploreService);
  protected readonly domain = inject(DomainService);
  protected readonly subs = inject(SubscriptionsService);
  private readonly lib = inject(LibraryService);
  private readonly location = inject(LocationService);
  private readonly toast = inject(ToastService);

  protected readonly domains = DOMAINS;
  protected readonly pageSize = PAGE;

  // ---- filter state ----
  protected readonly query = signal('');
  protected readonly typeFilter = signal<'all' | 'movie' | 'tv_show'>('all');
  protected readonly mineOnly = signal(false);
  protected readonly hideSeen = signal(true);
  protected readonly friendFilter = signal<FriendFilter>(null);
  protected readonly tagSel = signal<ReadonlySet<string>>(new Set());
  protected readonly runtimeMax = signal<number | null>(null);
  protected readonly decade = signal<number | null>(null);
  protected readonly minVote = signal<number | null>(null);
  protected readonly priceSel = signal<ReadonlySet<number>>(new Set());
  protected readonly minRating = signal<number | null>(null);
  protected readonly openNow = signal(false);
  protected readonly maxMiles = signal<number | null>(null);
  protected readonly sort = signal<WatchSort | EatSort>('popular');
  protected readonly shown = signal(PAGE);
  protected readonly pulling = signal(false);

  protected readonly myLoc = signal<LatLng | null>(null);
  private debounce: ReturnType<typeof setTimeout> | undefined;

  protected readonly typeChips = [
    { label: 'All', value: 'all' as const },
    { label: '🎬 Movies', value: 'movie' as const },
    { label: '📺 Shows', value: 'tv_show' as const },
  ];
  protected readonly runtimeChips = [
    { label: '⏱ <90m', value: 90 },
    { label: '⏱ <2h', value: 120 },
  ];
  protected readonly decadeChips = [
    { label: '2020s', value: 2020 },
    { label: '2010s', value: 2010 },
    { label: '2000s', value: 2000 },
    { label: '90s & older', value: 1 },
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

  /** eat + do are both Google-Places-backed (geo, price, hours). */
  protected readonly isEat = computed(() => isPlaceDomain(this.domain.domain()));
  protected readonly isWatch = computed(() => this.domain.domain() === 'watch');
  protected readonly isRead = computed(() => this.domain.domain() === 'read');

  protected readonly friendChips = computed(() => {
    switch (this.domain.domain()) {
      case 'eat':
        return [
          { label: '👀 Friends want to try', value: 'want_to' as FriendFilter },
          { label: '♥ Friends loved', value: 'loved' as FriendFilter },
        ];
      case 'do':
        return [
          { label: '👀 Friends want to go', value: 'want_to' as FriendFilter },
          { label: '♥ Friends loved', value: 'loved' as FriendFilter },
        ];
      case 'read':
        return [
          { label: '👀 Friends want to read', value: 'want_to' as FriendFilter },
          { label: '📖 Friends reading', value: 'in_progress' as FriendFilter },
          { label: '♥ Friends loved', value: 'loved' as FriendFilter },
        ];
      default:
        return [
          { label: '👀 Friends want to', value: 'want_to' as FriendFilter },
          { label: '▶ Friends watching', value: 'in_progress' as FriendFilter },
          { label: '♥ Friends loved', value: 'loved' as FriendFilter },
        ];
    }
  });

  protected readonly sortChips = computed(() => {
    if (this.isEat()) {
      return [
        { label: 'Top rated', value: 'rating' as EatSort },
        { label: 'Closest', value: 'distance' as EatSort },
        { label: 'Most reviewed', value: 'reviews' as EatSort },
      ];
    }
    if (this.isRead()) {
      return [
        { label: 'Top rated', value: 'rating' as WatchSort },
        { label: 'Newest', value: 'newest' as WatchSort },
        { label: 'A–Z', value: 'az' as WatchSort },
      ];
    }
    return [
      { label: 'Popular', value: 'popular' as WatchSort },
      { label: 'Top rated', value: 'rating' as WatchSort },
      { label: 'Newest', value: 'newest' as WatchSort },
      { label: 'A–Z', value: 'az' as WatchSort },
    ];
  });

  /** Top genres/cuisines/themes present in the current catalog, by frequency. */
  protected readonly tagChips = computed(() => {
    const d = this.domain.domain();
    const kind = d === 'eat' ? 'cuisine' : d === 'do' ? 'theme' : 'genre';
    const counts = new Map<string, { label: string; n: number }>();
    for (const item of this.explore.items().values()) {
      for (const t of item.activity_tags ?? []) {
        if (t.tag.kind !== kind) continue;
        const cur = counts.get(t.tag.slug) ?? { label: t.tag.label, n: 0 };
        cur.n++;
        counts.set(t.tag.slug, cur);
      }
    }
    return [...counts]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 14)
      .map(([slug, v]) => ({ slug, label: v.label }));
  });

  // ---- the filter pipeline ----
  protected readonly filtered = computed<ExploreItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const signals = this.explore.friendSignals();
    const myLoc = this.myLoc();
    const mine = new Map(this.lib.entries().map((e) => [e.activity.id, e.status]));
    const services =
      this.mineOnly() && this.subs.mySlugs().length ? new Set(this.subs.mySlugs()) : null;

    const out: ExploreItem[] = [];
    for (const item of this.explore.items().values()) {
      if (q && !item.title.toLowerCase().includes(q)) continue;
      if (this.isWatch() && this.typeFilter() !== 'all' && item.type !== this.typeFilter()) continue;

      const myStatus = mine.get(item.id);
      if (this.hideSeen() && myStatus && ['completed', 'not_interested', 'abandoned'].includes(myStatus)) continue;

      if (services) {
        const on = (item.activity_availability ?? []).some((a) => services.has(a.service.slug));
        if (!on) continue;
      }

      const sel = this.tagSel();
      if (sel.size && !(item.activity_tags ?? []).some((t) => sel.has(t.tag.slug))) continue;

      if (this.isWatch()) {
        const cap = this.runtimeMax();
        if (cap && item.duration_min && item.duration_min > cap) continue;
        const dec = this.decade();
        const year = item.metadata?.release_year ?? null;
        if (dec === 1 && year && year >= 2000) continue;
        if (dec && dec !== 1 && (!year || year < dec || year >= dec + 10)) continue;
        if (this.minVote() && (item.metadata?.tmdb_vote ?? 0) < this.minVote()!) continue;
      } else if (this.isEat()) {
        if (this.priceSel().size && !this.priceSel().has(item.metadata?.price_level ?? 0)) continue;
        if (this.minRating() && (item.metadata?.rating ?? 0) < this.minRating()!) continue;
        if (this.openNow() && item.metadata?.open_now !== true) continue;
        const cap = this.maxMiles();
        if (cap) {
          const mi = myLoc && item.location ? distanceMiles(myLoc, item.location) : null;
          if (mi == null || mi > cap) continue;
        }
      } else if (this.isRead()) {
        if (this.minRating() && (item.metadata?.rating ?? 0) < this.minRating()!) continue;
      }

      const ff = this.friendFilter();
      if (ff) {
        const list = signals.get(item.id) ?? [];
        const hit =
          ff === 'loved'
            ? list.some((s) => s.status === 'completed' && (s.rating ?? 0) >= 8)
            : list.some((s) => s.status === ff);
        if (!hit) continue;
      }

      out.push(item);
    }
    return out.sort(this.comparator(myLoc));
  });

  protected readonly visible = computed(() => this.filtered().slice(0, this.shown()));

  protected readonly anyFilterActive = computed(
    () =>
      this.typeFilter() !== 'all' ||
      this.mineOnly() ||
      this.friendFilter() !== null ||
      this.tagSel().size > 0 ||
      this.runtimeMax() !== null ||
      this.decade() !== null ||
      this.minVote() !== null ||
      this.priceSel().size > 0 ||
      this.minRating() !== null ||
      this.openNow() ||
      this.maxMiles() !== null,
  );

  private readonly loadOnDomain = effect(() => {
    const d = this.domain.domain();
    this.resetForDomain(d);
    this.explore.load(d);
    if (d === 'eat') this.location.get().then((loc) => this.myLoc.set(loc));
  });

  constructor() {
    this.lib.load();
    this.subs.load();
  }

  ngOnDestroy() {
    clearTimeout(this.debounce);
  }

  // ---- interactions ----
  protected switchDomain(d: Domain) {
    this.domain.set(d);
  }

  private resetForDomain(d: Domain) {
    this.query.set('');
    this.tagSel.set(new Set());
    this.friendFilter.set(null);
    this.shown.set(PAGE);
    this.sort.set(d === 'watch' ? 'popular' : 'rating');
    this.hideSeen.set(d === 'watch');
  }

  protected clearFilters() {
    this.typeFilter.set('all');
    this.mineOnly.set(false);
    this.friendFilter.set(null);
    this.tagSel.set(new Set());
    this.runtimeMax.set(null);
    this.decade.set(null);
    this.minVote.set(null);
    this.priceSel.set(new Set());
    this.minRating.set(null);
    this.openNow.set(false);
    this.maxMiles.set(null);
    this.shown.set(PAGE);
  }

  protected onQuery(q: string) {
    this.query.set(q);
    this.shown.set(this.pageSize);
    clearTimeout(this.debounce);
    const trimmed = q.trim();
    // Free APIs top up automatically (TMDB / Google Books); Places is button-only.
    if (this.isEat() || trimmed.length < 2) return;
    this.debounce = setTimeout(async () => {
      try {
        this.explore.merge(
          this.isRead() ? await this.lib.searchBooks(trimmed) : await this.lib.search(trimmed),
        );
      } catch {
        /* background top-up; local results still shown */
      }
    }, 450);
  }

  protected async nearby() {
    this.pulling.set(true);
    try {
      const loc = await this.location.get();
      this.myLoc.set(loc);
      if (!loc) {
        this.toast.error('Location is off — allow it in your browser settings.');
        return;
      }
      this.explore.merge(await this.lib.searchPlaces('', loc, this.placeKind()));
    } catch {
      this.toast.error('Could not pull nearby places.');
    } finally {
      this.pulling.set(false);
    }
  }

  protected async placesSearch() {
    this.pulling.set(true);
    try {
      this.explore.merge(
        await this.lib.searchPlaces(this.query().trim(), await this.location.get(), this.placeKind()),
      );
    } catch {
      this.toast.error('Google search failed — try again.');
    } finally {
      this.pulling.set(false);
    }
  }

  private placeKind(): 'eat' | 'do' {
    return this.domain.domain() === 'do' ? 'do' : 'eat';
  }

  protected async quickAdd(item: ExploreItem) {
    try {
      await this.lib.setStatus(item.id, 'want_to');
      this.lib.hydrate(item);
      this.toast.success(`${item.title} → ${this.domain.def().wantLabel} ✓`);
    } catch {
      this.toast.error('Could not add — try again.');
    }
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

  // ---- row helpers ----
  protected chip(active: boolean, tone: 'coral' | 'green' | 'gold' | 'violet' = 'coral'): string {
    const base = 'flex-none rounded-full border px-3 py-1.5 text-xs font-bold whitespace-nowrap ';
    if (!active) return base + 'border-line text-muted-2';
    const tones = {
      coral: 'border-coral bg-coral/15 text-coral',
      green: 'border-green bg-green/15 text-green',
      gold: 'border-gold bg-gold/15 text-gold',
      violet: 'border-violet bg-violet/15 text-violet',
    };
    return base + tones[tone];
  }

  protected servicesOf(item: ExploreItem) {
    return (item.activity_availability ?? []).map((a) => a.service);
  }

  protected signalsFor(activityId: string): FriendSignal[] {
    return (this.explore.friendSignals().get(activityId) ?? []).slice(0, 3);
  }

  protected signalClass(f: FriendSignal): string {
    if (f.status === 'completed' && (f.rating ?? 0) >= 8) return 'bg-violet/20 text-violet';
    if (f.status === 'in_progress') return 'bg-green/20 text-green';
    if (f.status === 'want_to') return 'bg-gold/20 text-gold';
    return 'bg-surface-2 text-muted-2';
  }

  protected signalLabel(f: FriendSignal): string {
    if (f.status === 'completed') return (f.rating ?? 0) >= 8 ? 'loved it' : 'has seen it';
    return f.status === 'in_progress' ? 'watching now' : 'wants to';
  }

  protected myStatus(activityId: string): string | null {
    const status = this.lib.entries().find((e) => e.activity.id === activityId)?.status;
    if (!status) return null;
    const labels: Record<string, string> = this.isEat()
      ? { want_to: '👀 on my list', completed: '✓ been', not_interested: '✕' }
      : this.isRead()
        ? { want_to: '👀 on my list', in_progress: '📖 reading', completed: '✓ read', abandoned: '⏸', not_interested: '✕' }
        : { want_to: '👀 on my list', in_progress: '▶ watching', completed: '✓ seen', abandoned: '⏸', not_interested: '✕' };
    return labels[status] ?? null;
  }

  protected sub(item: ExploreItem): string {
    if (item.type === 'book') {
      const parts: string[] = [];
      if (item.metadata?.authors?.length) parts.push(item.metadata.authors[0]);
      if (item.metadata?.release_year) parts.push(String(item.metadata.release_year));
      if (item.metadata?.page_count) parts.push(`${item.metadata.page_count}p`);
      if (item.metadata?.rating) parts.push(`★ ${item.metadata.rating}`);
      return parts.join(' · ') || 'Book';
    }
    if (item.type === 'restaurant' || item.type === 'outing') {
      const parts: string[] = [];
      if (item.metadata?.rating) {
        parts.push(`★ ${item.metadata.rating}${item.metadata.rating_count ? ` (${item.metadata.rating_count})` : ''}`);
      }
      if (item.metadata?.price_level) parts.push('$'.repeat(item.metadata.price_level));
      const loc = this.myLoc();
      const mi = loc && item.location ? distanceMiles(loc, item.location) : null;
      if (mi != null) parts.push(`${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`);
      return parts.join(' · ') || (item.type === 'outing' ? 'Place to go' : 'Restaurant');
    }
    const parts: string[] = [];
    if (item.metadata?.release_year) parts.push(String(item.metadata.release_year));
    parts.push(item.type === 'movie' ? 'Movie' : 'Series');
    if (item.metadata?.tmdb_vote) parts.push(`★ ${Number(item.metadata.tmdb_vote).toFixed(1)}`);
    return parts.join(' · ');
  }

  private comparator(myLoc: LatLng | null): (a: ExploreItem, b: ExploreItem) => number {
    const sort = this.sort();
    const pop = (x: ExploreItem) => (x.metadata as { tmdb_popularity?: number })?.tmdb_popularity ?? 0;
    const vote = (x: ExploreItem) => x.metadata?.tmdb_vote ?? 0;
    const year = (x: ExploreItem) => x.metadata?.release_year ?? 0;
    const rating = (x: ExploreItem) => x.metadata?.rating ?? 0;
    const reviews = (x: ExploreItem) => x.metadata?.rating_count ?? 0;
    const dist = (x: ExploreItem) =>
      myLoc && x.location ? (distanceMiles(myLoc, x.location) ?? 1e9) : 1e9;
    switch (sort) {
      case 'popular':
        return (a, b) => pop(b) - pop(a);
      case 'newest':
        return (a, b) => year(b) - year(a);
      case 'az':
        return (a, b) => a.title.localeCompare(b.title);
      case 'distance':
        return (a, b) => dist(a) - dist(b);
      case 'reviews':
        return (a, b) => reviews(b) - reviews(a);
      case 'rating':
        return this.isEat()
          ? (a, b) => rating(b) - rating(a) || reviews(b) - reviews(a)
          : (a, b) => vote(b) - vote(a);
      default:
        return (a, b) => pop(b) - pop(a);
    }
  }
}
