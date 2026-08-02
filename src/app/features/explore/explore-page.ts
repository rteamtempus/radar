import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DOMAINS, Domain, DomainService, isPlaceDomain } from '../../core/domain.service';
import { CityPick, LatLng, LocationService } from '../../core/location.service';
import { SafetyService } from '../../core/safety.service';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { CityPicker } from '../../shared/ui/city-picker';
import { MapMarker, MapView } from '../../shared/ui/map-view';
import {
  BOOK_GENRE_CHIPS,
  BOOK_SUBJECT_QUERY,
  CUISINE_CHIPS,
  DO_THEME_CHIPS,
  WATCH_GENRE_CHIPS,
} from '../../core/vocab';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { ToastService } from '../../shared/ui/toast.service';
import { LibraryService } from '../library/library.service';
import { SlotCollage } from '../../shared/ui/slot-collage';
import {
  CityGuideEntry,
  DiscoveryPerson,
  DiscoverySlot,
  ExploreItem,
  ExploreService,
  FriendSignal,
  NearPerson,
  NearSlot,
  ServerPerson,
  distanceMiles,
} from './explore.service';

type WatchSort = 'popular' | 'rating' | 'newest' | 'az';
type EatSort = 'rating' | 'distance' | 'reviews';
type FriendFilter = 'want_to' | 'in_progress' | 'loved' | null;

const PAGE = 40;

/**
 * Explore: a searchable, filterable browser over everything Radar knows.
 *
 * v0.13 — two result models:
 *  * CATALOG mode (no query/filters): the local shared catalog, instant.
 *  * SERVER mode (watch/read, query or API-mappable filters active): pages
 *    straight from TMDB discover / Open Library with REAL totals and infinite
 *    scroll; every fetched row is upserted into the catalog, and local-only
 *    filters (hide seen, friend signals) still apply on top.
 * Eat/Do stay explicit-button (Places calls are billable) but gain "Show 20
 * more" pagination via Google's page tokens. Filter chips are the curated
 * vocabularies (core/vocab.ts), not whatever tags the catalog happens to hold.
 */
@Component({
  selector: 'pp-explore-page',
  imports: [CityPicker, DecimalPipe, FormsModule, MapView, RouterLink, ServiceBadges, SlotCollage],
  template: `
    <div class="mx-auto max-w-md px-5 py-6">
      <div class="flex items-center justify-between">
        <h1 class="font-display text-3xl font-semibold">Explore</h1>
        <div class="flex gap-1 rounded-full bg-surface p-1">
          @for (m of modes; track m.key) {
            <button
              (click)="switchMode(m.key)"
              class="rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
              [class]="mode() === m.key ? 'bg-violet text-ink' : 'text-muted-2'"
            >
              {{ m.label }}
            </button>
          }
        </div>
      </div>

      @if (mode() !== 'people') {
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
      }

      <input
        type="search"
        [placeholder]="
          mode() === 'slots' ? 'Search slots…' : mode() === 'people' ? 'Search people…' : domain.def().searchPlaceholder
        "
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        class="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
      />

      @if (mode() === 'slots') {
        <!-- ============ slot discovery ============ -->
        <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          <button (click)="pickerOpen.set(true)" [class]="chip(!!location.custom(), 'green')">
            📍 {{ location.custom()?.name ?? 'Any city' }}
          </button>
          <button (click)="slotSort.set('popular')" [class]="chip(slotSort() === 'popular')">👍 Popular</button>
          <button (click)="slotSort.set('new')" [class]="chip(slotSort() === 'new')">✨ New</button>
          @for (t of slotTagChips(); track t.slug) {
            <button (click)="toggleTag(t.slug)" [class]="chip(tagSel().has(t.slug), 'gold')">{{ t.label }}</button>
          }
        </div>
        @if (location.custom(); as city) {
          <!-- geo mode: public slots pinned near the picked city (slots_near) -->
          @if (geoLoading()) {
            <div class="mt-4 grid grid-cols-2 gap-3">
              @for (i of [0, 1, 2, 3]; track i) {
                <div class="aspect-square animate-pulse rounded-2xl border border-line bg-surface"></div>
              }
            </div>
          } @else if (!nearSlots().length) {
            <div class="mt-10 flex flex-col items-center gap-3 text-center">
              <div class="text-4xl">🗺️</div>
              <p class="font-bold">No slots pinned near {{ city.name }} yet</p>
              <p class="max-w-64 text-sm text-muted-2">
                Make yours the first — pin a public slot to a city from its page.
              </p>
            </div>
          }
          <div class="mt-3 grid grid-cols-2 gap-3">
            @for (s of nearSlots(); track s.id) {
              <a [routerLink]="['/radar/slot', s.id]" class="rounded-2xl border border-line bg-surface p-3">
                <pp-slot-collage class="aspect-square w-full" [images]="s.images ?? []" [emoji]="s.emoji" />
                <p class="mt-2 truncate text-sm font-bold">{{ s.emoji }} {{ s.name }}</p>
                <p class="truncate text-[11px] text-muted">
                  {{ s.owner_name }} · {{ s.item_count }} items
                  @if (s.like_count) {
                    · 👍 {{ s.like_count }}
                  }
                </p>
                <p class="mt-1 truncate text-[10px] text-muted-2">
                  📍 {{ s.loc_name }}
                  @if (s.is_local) {
                    · <span class="font-bold text-green">local's list</span>
                  }
                </p>
              </a>
            }
          </div>
        } @else {
          @if (!filteredSlots().length) {
            <div class="mt-10 flex flex-col items-center gap-3 text-center">
              <div class="text-4xl">📡</div>
              <p class="font-bold">No slots found</p>
              <p class="max-w-64 text-sm text-muted-2">
                Public slots show up here — get your people publishing lists.
              </p>
            </div>
          }
          <div class="mt-3 grid grid-cols-2 gap-3">
            @for (s of filteredSlots(); track s.id) {
              <a [routerLink]="['/radar/slot', s.id]" class="rounded-2xl border border-line bg-surface p-3">
                <pp-slot-collage class="aspect-square w-full" [images]="collageOf(s)" [emoji]="s.emoji" />
                <p class="mt-2 truncate text-sm font-bold">{{ s.emoji }} {{ s.name }}</p>
                <p class="truncate text-[11px] text-muted">
                  {{ s.owner?.display_name ?? 'someone' }} · {{ s.items.length }} items
                  @if (likesOf(s)) {
                    · 👍 {{ likesOf(s) }}
                  }
                </p>
                @if (s.slot_tags.length) {
                  <p class="mt-1 truncate text-[10px] text-muted-2">
                    {{ tagLabels(s) }}
                  </p>
                }
              </a>
            }
          </div>
        }
      } @else if (mode() === 'people') {
        <!-- ============ people discovery ============ -->
        <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          <button (click)="pickerOpen.set(true)" [class]="chip(!!location.custom(), 'green')">
            📍 {{ location.custom()?.name ?? 'Any city' }}
          </button>
        </div>
        @if (location.custom() && query().trim().length < 2) {
          <!-- geo mode: opted-in public profiles in the city, best match first -->
          @if (geoLoading()) {
            <div class="mt-3 flex flex-col gap-2">
              @for (i of [0, 1, 2]; track i) {
                <div class="h-16 animate-pulse rounded-2xl bg-surface"></div>
              }
            </div>
          } @else if (!nearPeople().length) {
            <div class="mt-8 flex flex-col items-center gap-3 text-center">
              <div class="text-4xl">🫥</div>
              <p class="font-bold">Nobody discoverable here yet</p>
              <p class="max-w-64 text-sm text-muted-2">
                People choose to be findable by city in You → Location.
              </p>
            </div>
          }
          <div class="mt-3 flex flex-col gap-2">
            @for (p of nearPeople(); track p.id) {
              <a [routerLink]="['/friends', p.id]" class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                <span class="flex size-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold font-extrabold text-ink">
                  {{ p.display_name.charAt(0).toUpperCase() }}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold">{{ p.display_name }}</span>
                  <span class="block truncate text-[11px] text-muted">
                    📍 {{ p.home_name ?? 'nearby' }} · {{ p.public_slot_count }} public slot{{ p.public_slot_count === 1 ? '' : 's' }}
                  </span>
                </span>
                @if (p.match !== null) {
                  <span class="flex-none rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
                    {{ p.match }}% match
                  </span>
                } @else {
                  <span class="flex-none text-[10px] font-bold text-muted-2">new-ish</span>
                }
                <span class="text-muted">›</span>
              </a>
            }
          </div>
        } @else if (query().trim().length < 2) {
          @if (featured().length) {
            <h2 class="mt-4 mb-2 text-xs font-bold tracking-wide text-muted uppercase">⭐ Featured curators</h2>
          } @else {
            <p class="mt-6 text-center text-sm text-muted-2">
              Search for people by name — public profiles show up here.
            </p>
          }
          <div class="flex flex-col gap-2">
            @for (p of featured(); track p.id) {
              <a [routerLink]="['/friends', p.id]" class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                <span class="flex size-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-gold to-coral font-extrabold text-ink">
                  {{ p.display_name.charAt(0).toUpperCase() }}
                </span>
                <span class="min-w-0 flex-1 truncate font-bold">{{ p.display_name }}</span>
                <span class="flex-none rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">⭐ Featured</span>
                <span class="text-muted">›</span>
              </a>
            }
          </div>
        } @else {
          <div class="mt-3 flex flex-col gap-2">
            @if (!people().length) {
              <p class="mt-6 text-center text-sm font-bold text-muted-2">No public profiles match.</p>
            }
            @for (p of people(); track p.id) {
              <a [routerLink]="['/friends', p.id]" class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                <span class="flex size-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold font-extrabold text-ink">
                  {{ p.display_name.charAt(0).toUpperCase() }}
                </span>
                <span class="min-w-0 flex-1 truncate font-bold">{{ p.display_name }}</span>
                <span class="text-muted">›</span>
              </a>
            }
          </div>
        }
      } @else {

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
          <button (click)="pickerOpen.set(true)" [class]="chip(!!location.custom(), 'green')">
            📍 {{ location.custom()?.name ?? 'Near me' }}
          </button>
          <button (click)="openNow.set(!openNow())" [class]="chip(openNow(), 'green')">● Open now</button>
          @for (m of distanceChips; track m.value) {
            <button
              (click)="maxMiles.set(maxMiles() === m.value ? null : m.value)"
              [class]="chip(maxMiles() === m.value)"
            >
              {{ m.label }}
            </button>
          }
          @if (myLoc()) {
            <button (click)="everywhere.set(!everywhere())" [class]="chip(everywhere(), 'violet')">
              🌍 Everywhere
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

      <!-- genre / cuisine / theme chips (curated — core/vocab.ts) -->
      <div class="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
        @for (g of tagChips(); track g.slug) {
          <button (click)="toggleTag(g.slug)" [class]="chip(tagSel().has(g.slug), 'gold')">
            {{ g.label }}
          </button>
        }
      </div>

      <!-- person pill: "christopher nolan" typed → offer the filmography -->
      @if (isWatch() && (personSel() || personHint())) {
        <div class="mt-2 flex gap-2">
          @if (personSel(); as p) {
            <button (click)="clearPerson()" [class]="chip(true, 'violet')">
              🎬 {{ p.name }}'s films · ✕
            </button>
          } @else if (personHint(); as p) {
            <button (click)="pickPerson(p)" [class]="chip(false, 'violet')">
              🎬 See {{ p.name }}'s films →
            </button>
          }
        </div>
      }

      <!-- sort + count + clear -->
      <div class="mt-2.5 flex items-center gap-2">
        <div class="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          @if (serverSearchKind() === 'text') {
            <span class="flex-none py-1.5 text-xs font-bold text-muted">↕ Best match</span>
          } @else {
            @for (s of sortChips(); track s.value) {
              <button (click)="sort.set(s.value)" [class]="chip(sort() === s.value)">↕ {{ s.label }}</button>
            }
          }
        </div>
        <span class="flex-none text-xs font-bold text-muted">
          @if (serverMode()) {
            {{ serverTotal() === null ? '…' : (serverTotal() | number) + ' results' }}
            @if (serverShownNote(); as note) {
              · {{ note }}
            }
          } @else {
            {{ filtered().length }}
          }
        </span>
        @if (anyFilterActive()) {
          <button (click)="clearFilters()" class="flex-none text-xs font-bold text-coral">Clear</button>
        }
      </div>

      <!-- city guide: most-saved places near the picked city (public slots) -->
      @if (isEat() && location.custom() && cityGuide().length) {
        <div class="mt-4 rounded-2xl border border-gold/30 bg-gold/5 p-3.5">
          <div class="flex items-center justify-between">
            <p class="text-xs font-bold tracking-wide text-gold uppercase">
              🏆 {{ location.custom()?.name }} — most saved on Radar
            </p>
            <button (click)="mapOpen.set(!mapOpen())" class="flex-none text-xs font-bold text-gold">
              {{ mapOpen() ? 'List' : '🗺 Map' }}
            </button>
          </div>
          @if (mapOpen()) {
            <pp-map-view class="mt-2.5 block" [markers]="guideMarkers()" (markerTapped)="openMarker($event)" />
          }
          <div class="no-scrollbar mt-2.5 flex gap-2.5 overflow-x-auto">
            @for (g of cityGuide(); track g.id) {
              <a [routerLink]="['/library', g.id]" class="w-28 flex-none">
                @if (g.image_url) {
                  <img [src]="g.image_url" alt="" class="h-20 w-28 rounded-lg object-cover" />
                } @else {
                  <div class="h-20 w-28 rounded-lg bg-surface-2"></div>
                }
                <p class="mt-1 truncate text-xs font-bold">{{ g.title }}</p>
                <p class="truncate text-[10px] text-muted">
                  💾 {{ g.saves }} · {{ g.rating ? '★ ' + g.rating : (g.distance_km + ' km') }}
                </p>
              </a>
            }
          </div>
        </div>
      }

      <!-- ============ results ============ -->
      @if ((explore.loading() || serverLoading()) && !visible().length) {
        <div class="mt-4 flex flex-col gap-2.5">
          @for (i of [0, 1, 2, 3, 4]; track i) {
            <div class="h-20 animate-pulse rounded-2xl border border-line bg-surface"></div>
          }
        </div>
      } @else if (!visible().length) {
        <div class="mt-10 flex flex-col items-center gap-3 text-center">
          <div class="text-4xl">🔭</div>
          <p class="font-bold">Nothing matches</p>
          @if (isEat()) {
            <!-- An empty chip result here means RADAR hasn't scouted this,
                 not that the city lacks it — offer the one-call fix inline
                 instead of letting "no Chinese in Austin" stand. -->
            <p class="max-w-72 text-sm text-muted-2">
              Radar may just not have scouted
              {{ selectedCuisineLabel() ?? 'this kind of thing' }} near
              {{ location.custom()?.name ?? 'you' }} yet — one Google pull
              fills it in for everyone, or loosen a filter.
            </p>
            <button
              (click)="nearby()"
              [disabled]="pulling()"
              class="rounded-2xl border border-gold/50 px-5 py-2.5 text-sm font-bold text-gold disabled:opacity-50"
            >
              {{ pulling() ? 'Fetching…' : '📍 Pull nearby ' + (selectedCuisineLabel() ?? 'spots') + ' from Google' }}
            </button>
          } @else {
            <p class="max-w-64 text-sm text-muted-2">Loosen a filter.</p>
          }
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

      <!-- server mode: infinite scroll sentinel (TMDB / Open Library are free) -->
      @if (serverMode() && serverHasMore()) {
        <div #sentinel class="mt-3 flex justify-center py-3">
          <div class="size-6 animate-spin rounded-full border-3 border-surface-2 border-t-coral"></div>
        </div>
      }

      @if (!serverMode() && filtered().length > shown()) {
        <button
          (click)="shown.set(shown() + pageSize)"
          class="mt-3 w-full rounded-2xl border border-line py-2.5 text-sm font-bold text-muted-2"
        >
          Show more ({{ filtered().length - shown() }} left)
        </button>
      }

      <!-- eat/do: explicit external pulls (Places calls are billable) -->
      @if (isEat()) {
        <div class="mt-4 flex gap-2">
          <button
            (click)="nearby()"
            [disabled]="pulling()"
            class="flex-1 rounded-2xl border border-dashed border-line py-2.5 text-sm font-bold text-muted-2 disabled:opacity-50"
          >
            📍 Pull nearby{{ selectedCuisineLabel() ? ' ' + selectedCuisineLabel() : ' spots' }}
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
        @if (placesToken()) {
          <button
            (click)="morePlaces()"
            [disabled]="pulling()"
            class="mt-2 w-full rounded-2xl border border-dashed border-gold/50 py-2.5 text-sm font-bold text-gold disabled:opacity-50"
          >
            {{ pulling() ? 'Fetching…' : '⤵ Show 20 more from Google' }}
          </button>
        }
      }
      <p class="mt-3 text-center text-[10px] text-muted">
        {{
          isEat()
            ? myLoc() && !everywhere() && !maxMiles()
              ? 'Places within 30 mi of ' + (location.custom()?.name ?? 'you') + ' — 🌍 Everywhere shows the whole catalog.'
              : 'Showing every place Radar knows — pulls add fresh ones from Google.'
            : serverMode()
              ? isRead()
                ? 'Live from Open Library — most-wanted books first.'
                : 'Live from TMDB — scroll for more.'
              : isRead()
                ? 'The shared catalog — type or tap a genre to search all of Open Library.'
                : 'The shared catalog — type or tap a filter to search all of TMDB.'
        }}
      </p>
      }

      @if (pickerOpen()) {
        <pp-city-picker
          [title]="mode() === 'things' ? 'Explore location' : mode() === 'slots' ? 'Slots near…' : 'People in…'"
          [clearLabel]="mode() === 'things' ? '📍 Near me' : '🌍 Any city'"
          (picked)="onCityPicked($event)"
          (cleared)="onCityCleared()"
          (close)="pickerOpen.set(false)"
        />
      }
    </div>
  `,
})
export class ExplorePage implements OnDestroy {
  protected readonly explore = inject(ExploreService);
  protected readonly domain = inject(DomainService);
  protected readonly subs = inject(SubscriptionsService);
  protected readonly location = inject(LocationService);
  private readonly lib = inject(LibraryService);
  private readonly router = inject(Router);
  private readonly safety = inject(SafetyService);
  private readonly toast = inject(ToastService);

  protected readonly domains = DOMAINS;
  protected readonly pageSize = PAGE;

  // ---- discovery modes ----
  protected readonly modes = [
    { key: 'things' as const, label: 'Things' },
    { key: 'slots' as const, label: 'Slots' },
    { key: 'people' as const, label: 'People' },
  ];
  protected readonly mode = signal<'things' | 'slots' | 'people'>('things');
  protected readonly slotSort = signal<'popular' | 'new'>('popular');
  private readonly allSlots = signal<DiscoverySlot[]>([]);
  protected readonly featured = signal<DiscoveryPerson[]>([]);
  protected readonly people = signal<DiscoveryPerson[]>([]);

  // ---- geo discovery (v0.14): custom city → RPC-backed lists ----
  protected readonly pickerOpen = signal(false);
  protected readonly geoLoading = signal(false);
  protected readonly nearSlots = signal<NearSlot[]>([]);
  protected readonly nearPeople = signal<NearPerson[]>([]);
  protected readonly cityGuide = signal<CityGuideEntry[]>([]);
  private geoSerial = 0;

  protected readonly mapOpen = signal(false);

  protected readonly guideMarkers = computed<MapMarker[]>(() =>
    this.cityGuide().map((g) => ({
      lat: g.lat,
      lng: g.lng,
      label: `${g.title} · 💾 ${g.saves}`,
      link: ['/library', g.id],
    })),
  );

  protected openMarker(m: MapMarker) {
    if (m.link) void this.router.navigate(m.link);
  }

  protected onCityPicked(pick: CityPick) {
    this.location.setCustom(pick);
  }

  protected onCityCleared() {
    this.location.setCustom(null);
  }

  /** Reload geo lists whenever the mode, domain, or picked city changes. */
  private readonly geoRefresh = effect(() => {
    const custom = this.location.custom();
    const mode = this.mode();
    const d = this.domain.domain();
    void this.loadGeo(custom, mode, d);
  });

  private async loadGeo(custom: CityPick | null, mode: string, d: Domain): Promise<void> {
    const serial = ++this.geoSerial;
    if (!custom) {
      this.nearSlots.set([]);
      this.nearPeople.set([]);
      this.cityGuide.set([]);
      if (isPlaceDomain(d)) this.location.get().then((loc) => serial === this.geoSerial && this.myLoc.set(loc));
      return;
    }
    // distances & Places bias now anchor on the picked city
    this.myLoc.set({ lat: custom.lat, lng: custom.lng });
    this.geoLoading.set(true);
    try {
      if (mode === 'slots') {
        const rows = await this.explore.slotsNear(custom, d);
        if (serial === this.geoSerial) this.nearSlots.set(rows);
      } else if (mode === 'people') {
        const rows = await this.explore.peopleInCity(custom);
        if (serial === this.geoSerial) this.nearPeople.set(rows);
      } else if (isPlaceDomain(d)) {
        const rows = await this.explore.cityGuide(custom, d === 'do' ? 'do' : 'eat');
        if (serial === this.geoSerial) this.cityGuide.set(rows.slice(0, 10));
      }
    } catch {
      if (serial === this.geoSerial) this.toast.error('Could not load nearby results.');
    } finally {
      if (serial === this.geoSerial) this.geoLoading.set(false);
    }
  }

  protected switchMode(m: 'things' | 'slots' | 'people') {
    this.mode.set(m);
    this.query.set('');
    this.tagSel.set(new Set());
    if (m === 'slots' && !this.allSlots().length) {
      this.explore.searchSlots().then((s) => this.allSlots.set(s));
    }
    if (m === 'people' && !this.featured().length) {
      this.explore
        .featuredPeople()
        .then((p) => this.featured.set(p.filter((x) => !this.safety.blockedIds().has(x.id))));
    }
  }

  protected readonly filteredSlots = computed(() => {
    const q = this.query().trim().toLowerCase();
    const d = this.domain.domain();
    const sel = this.tagSel();
    const blocked = this.safety.blockedIds();
    const list = this.allSlots().filter((s) => {
      if (blocked.has(s.owner?.id ?? '')) return false;
      if ((s.config?.domain ?? 'watch') !== d) return false;
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !(s.description ?? '').toLowerCase().includes(q) &&
        !(s.owner?.display_name ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      if (sel.size && !s.slot_tags.some((t) => sel.has(t.tag.slug))) return false;
      return true;
    });
    return this.slotSort() === 'new'
      ? list.sort((a, b) => b.created_at.localeCompare(a.created_at))
      : list.sort((a, b) => this.likesOf(b) - this.likesOf(a) || b.items.length - a.items.length);
  });

  protected readonly slotTagChips = computed(() => {
    const d = this.domain.domain();
    const seen = new Map<string, string>();
    for (const s of this.allSlots()) {
      if ((s.config?.domain ?? 'watch') !== d) continue;
      for (const t of s.slot_tags) seen.set(t.tag.slug, t.tag.label);
    }
    return [...seen].map(([slug, label]) => ({ slug, label })).slice(0, 12);
  });

  protected likesOf(s: DiscoverySlot): number {
    return s.likes?.[0]?.count ?? 0;
  }

  protected collageOf(s: DiscoverySlot): (string | null)[] {
    return [...s.items].sort((a, b) => a.position - b.position).map((i) => i.activity.image_url);
  }

  protected tagLabels(s: DiscoverySlot): string {
    return s.slot_tags.map((t) => t.tag.label).join(' · ');
  }

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
  /**
   * v0.15: with a location anchor, the eat/do catalog defaults to a 30-mile
   * radius — the pre-anchor behavior (global catalog sorted by rating) read
   * as "restaurants in New York while I'm near Kansas City". 🌍 Everywhere
   * lifts it back to the whole catalog.
   */
  protected readonly everywhere = signal(false);
  private readonly DEFAULT_MILES = 30;
  protected readonly sort = signal<WatchSort | EatSort>('popular');
  protected readonly shown = signal(PAGE);
  protected readonly pulling = signal(false);

  protected readonly myLoc = signal<LatLng | null>(null);
  private debounce: ReturnType<typeof setTimeout> | undefined;

  // ---- server-driven results (v0.13) ----
  protected readonly serverIds = signal<string[]>([]);
  protected readonly serverTotal = signal<number | null>(null);
  protected readonly serverHasMore = signal(false);
  protected readonly serverLoading = signal(false);
  private readonly serverPage = signal(0);
  /** Person TMDB matched on the last text search — rendered as a pill. */
  protected readonly personHint = signal<ServerPerson | null>(null);
  /** Person the user tapped — discover with_people. */
  protected readonly personSel = signal<ServerPerson | null>(null);
  /** Google text-search continuation token (eat/do "Show 20 more"). */
  protected readonly placesToken = signal<string | null>(null);
  private serverSerial = 0;
  private serverDebounce: ReturnType<typeof setTimeout> | undefined;

  private readonly sentinel = viewChild<ElementRef<HTMLDivElement>>('sentinel');
  private readonly observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void this.loadMoreServer();
    },
    { rootMargin: '600px' },
  );

  /** Server mode: watch/read with a query or any API-mappable filter active. */
  protected readonly serverMode = computed(() => {
    if (this.mode() !== 'things') return false;
    const q = this.query().trim().length >= 2;
    if (this.isWatch()) {
      return (
        q ||
        this.personSel() !== null ||
        this.tagSel().size > 0 ||
        this.decade() !== null ||
        this.minVote() !== null ||
        this.runtimeMax() !== null ||
        this.typeFilter() !== 'all' ||
        this.mineOnly()
      );
    }
    if (this.isRead()) return q || this.tagSel().size > 0;
    return false;
  });

  /** 'text' = TMDB free-text (relevance order) · 'discover' · 'read' · null */
  protected readonly serverSearchKind = computed(() => {
    if (!this.serverMode()) return null;
    if (this.isRead()) return 'read';
    const filterless =
      !this.personSel() &&
      !this.tagSel().size &&
      this.decade() === null &&
      this.minVote() === null &&
      this.runtimeMax() === null &&
      this.typeFilter() === 'all' &&
      !this.mineOnly();
    return filterless ? 'text' : 'discover';
  });

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
        { label: 'Most wanted', value: 'popular' as WatchSort },
        { label: 'Top rated', value: 'rating' as WatchSort },
        { label: 'Newest', value: 'newest' as WatchSort },
        ...(this.serverMode() ? [] : [{ label: 'A–Z', value: 'az' as WatchSort }]),
      ];
    }
    return [
      { label: 'Popular', value: 'popular' as WatchSort },
      { label: 'Top rated', value: 'rating' as WatchSort },
      { label: 'Newest', value: 'newest' as WatchSort },
      ...(this.serverMode() ? [] : [{ label: 'A–Z', value: 'az' as WatchSort }]),
    ];
  });

  /**
   * Curated chips per domain (core/vocab.ts) — FIXED lists, so they're
   * consistent no matter what the last search dragged into the catalog.
   */
  protected readonly tagChips = computed(() => {
    switch (this.domain.domain()) {
      case 'eat':
        return CUISINE_CHIPS;
      case 'do':
        return DO_THEME_CHIPS;
      case 'read':
        return BOOK_GENRE_CHIPS;
      default:
        return WATCH_GENRE_CHIPS;
    }
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
        // Explicit chip > anchored 30-mile default > no cap (🌍 or no anchor).
        const cap =
          this.maxMiles() ?? (myLoc && !this.everywhere() ? this.DEFAULT_MILES : null);
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

  /**
   * Server results in API order, with the LOCAL-only filters applied on top
   * (hide seen, friend signals, per-domain bits the APIs can't express —
   * runtime caps on TV, extra genre chips beyond the one OL searched).
   */
  protected readonly serverVisible = computed<ExploreItem[]>(() => {
    const items = this.explore.items();
    const signals = this.explore.friendSignals();
    const mine = new Map(this.lib.entries().map((e) => [e.activity.id, e.status]));
    const out: ExploreItem[] = [];
    for (const id of this.serverIds()) {
      const item = items.get(id);
      if (!item) continue;
      const myStatus = mine.get(item.id);
      if (this.hideSeen() && myStatus && ['completed', 'not_interested', 'abandoned'].includes(myStatus)) continue;
      if (this.isWatch()) {
        const cap = this.runtimeMax();
        if (cap && item.duration_min && item.duration_min > cap) continue;
      }
      if (this.isRead() && this.minRating() && (item.metadata?.rating ?? 0) < this.minRating()!) continue;
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
    return out;
  });

  /** "· M shown" when local filters trimmed the fetched pages. */
  protected readonly serverShownNote = computed(() => {
    const fetched = this.serverIds().length;
    const shown = this.serverVisible().length;
    return shown < fetched ? `${shown} shown` : null;
  });

  protected readonly visible = computed(() =>
    this.serverMode() ? this.serverVisible() : this.filtered().slice(0, this.shown()),
  );

  // Refetch page 1 whenever a server-mapped input changes (debounced — typing
  // and chip-tapping both land here). Catalog mode clears server state.
  private readonly serverRefresh = effect(() => {
    const on = this.serverMode();
    // read everything that should trigger a refetch
    const inputs = JSON.stringify({
      d: this.domain.domain(),
      q: this.query().trim(),
      tags: [...this.tagSel()].sort(),
      type: this.typeFilter(),
      dec: this.decade(),
      vote: this.minVote(),
      rt: this.runtimeMax(),
      mine: this.mineOnly(),
      sort: this.sort(),
      person: this.personSel()?.id ?? null,
    });
    void inputs;
    clearTimeout(this.serverDebounce);
    if (!on) {
      this.serverIds.set([]);
      this.serverTotal.set(null);
      this.serverHasMore.set(false);
      this.serverPage.set(0);
      return;
    }
    this.serverDebounce = setTimeout(() => void this.fetchServer(1), 350);
  });

  // (Re)attach the infinite-scroll sentinel as it enters/leaves the DOM.
  private readonly watchSentinel = effect(() => {
    const el = this.sentinel()?.nativeElement;
    this.observer.disconnect();
    if (el) this.observer.observe(el);
  });

  private async fetchServer(page: number): Promise<void> {
    const serial = ++this.serverSerial;
    this.serverLoading.set(true);
    if (page === 1) {
      this.serverTotal.set(null);
      this.personHint.set(null);
    }
    try {
      const result = this.isRead()
        ? await this.explore.searchRead({
            query: this.query(),
            subject: this.readSubject(),
            page,
            sort: this.sort() === 'rating' ? 'rating' : this.sort() === 'newest' ? 'new' : 'want_to_read',
          })
        : await this.explore.searchWatch({
            query: this.query(),
            page,
            kind: this.typeFilter() === 'all' ? 'both' : this.typeFilter() === 'movie' ? 'movie' : 'tv',
            genres: [...this.tagSel()],
            decade: this.decade(),
            voteGte: this.minVote(),
            runtimeLte: this.runtimeMax(),
            providers: this.mineOnly() ? this.subs.mySlugs() : [],
            personId: this.personSel()?.id ?? null,
            sort: this.sort() === 'rating' ? 'rating' : this.sort() === 'newest' ? 'newest' : 'popular',
          });
      if (serial !== this.serverSerial) return; // a newer query superseded this one
      this.serverIds.update((ids) => (page === 1 ? result.ids : [...ids, ...result.ids.filter((id) => !ids.includes(id))]));
      this.serverTotal.set(result.total);
      this.serverHasMore.set(result.hasMore);
      this.serverPage.set(page);
      if (result.person) this.personHint.set(result.person);
    } catch {
      if (serial === this.serverSerial) this.toast.error('Search failed — try again.');
    } finally {
      if (serial === this.serverSerial) this.serverLoading.set(false);
    }
  }

  private async loadMoreServer(): Promise<void> {
    if (this.serverLoading() || !this.serverHasMore() || !this.serverMode()) return;
    await this.fetchServer(this.serverPage() + 1);
  }

  /** First selected book chip → its Open Library subject query. */
  private readSubject(): string | undefined {
    const first = [...this.tagSel()][0];
    return first ? BOOK_SUBJECT_QUERY[first] : undefined;
  }

  protected pickPerson(p: ServerPerson) {
    this.personSel.set(p);
    this.query.set('');
  }

  protected clearPerson() {
    this.personSel.set(null);
  }

  protected readonly selectedCuisineLabel = computed(() => {
    const first = [...this.tagSel()][0];
    return this.tagChips().find((c) => c.slug === first)?.label ?? null;
  });

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
    if (isPlaceDomain(d)) {
      this.location.effective().then((loc) => this.myLoc.set(loc));
    }
  });

  constructor() {
    this.lib.load();
    this.subs.load();
    this.safety.load();
  }

  ngOnDestroy() {
    clearTimeout(this.debounce);
    clearTimeout(this.serverDebounce);
    this.observer.disconnect();
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
    this.sort.set(d === 'watch' || d === 'read' ? 'popular' : 'rating');
    this.hideSeen.set(d === 'watch');
    this.personSel.set(null);
    this.personHint.set(null);
    this.placesToken.set(null);
    this.everywhere.set(false);
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
    this.everywhere.set(false);
    this.shown.set(PAGE);
    this.personSel.set(null);
    this.placesToken.set(null);
  }

  protected onQuery(q: string) {
    this.query.set(q);
    this.shown.set(this.pageSize);
    this.placesToken.set(null); // a new query invalidates the old Google page token
    clearTimeout(this.debounce);
    const trimmed = q.trim();
    if (this.mode() === 'people') {
      if (trimmed.length < 2) return;
      this.debounce = setTimeout(async () => {
        const found = await this.explore.searchPeople(trimmed);
        this.people.set(found.filter((x) => !this.safety.blockedIds().has(x.id)));
      }, 400);
      return;
    }
    // Things: watch/read are handled by the serverRefresh effect; Places is
    // button-only (billable). Slots filter client-side.
  }

  protected async nearby() {
    this.pulling.set(true);
    try {
      const loc = await this.location.effective();
      this.myLoc.set(loc);
      if (!loc) {
        this.toast.error('Pick a city (📍) or allow location in your browser settings.');
        return;
      }
      const { rows } = await this.lib.searchPlaces('', loc, this.placeKind(), {
        cuisine: [...this.tagSel()][0] ?? null,
      });
      this.explore.merge(rows);
      this.placesToken.set(null); // nearby doesn't paginate (API limit)
    } catch {
      this.toast.error('Could not pull nearby places.');
    } finally {
      this.pulling.set(false);
    }
  }

  protected async placesSearch() {
    this.pulling.set(true);
    try {
      const { rows, nextPageToken } = await this.lib.searchPlaces(
        this.query().trim(),
        await this.location.effective(),
        this.placeKind(),
        // A picked city is a hard fence; GPS stays a soft bias so long-range
        // name searches ("that place in Chicago") keep working.
        { cuisine: [...this.tagSel()][0] ?? null, restrict: !!this.location.custom() },
      );
      this.explore.merge(rows);
      this.placesToken.set(nextPageToken);
    } catch {
      this.toast.error('Google search failed — try again.');
    } finally {
      this.pulling.set(false);
    }
  }

  /** Next 20 from Google via the continuation token (same query, same chip). */
  protected async morePlaces() {
    const token = this.placesToken();
    if (!token) return;
    this.pulling.set(true);
    try {
      const { rows, nextPageToken } = await this.lib.searchPlaces(
        this.query().trim(),
        await this.location.effective(),
        this.placeKind(),
        {
          cuisine: [...this.tagSel()][0] ?? null,
          pageToken: token,
          restrict: !!this.location.custom(),
        },
      );
      this.explore.merge(rows);
      this.placesToken.set(nextPageToken);
    } catch {
      this.toast.error('Could not fetch more — try again.');
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
