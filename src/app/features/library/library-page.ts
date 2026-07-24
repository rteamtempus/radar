import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { PartyService } from '../party/party.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { StarRating } from '../../shared/ui/star-rating';
import {
  ActivitySummary,
  EngagementStatus,
  LibraryEntry,
  LibraryService,
} from './library.service';

type LibraryTab = 'in_progress' | 'want_to' | 'completed';

@Component({
  selector: 'pp-library-page',
  imports: [FormsModule, RouterLink, ServiceBadges, StarRating],
  template: `
    <div class="mx-auto max-w-md px-5 py-6">
      <h1 class="font-display text-3xl font-semibold">My Library</h1>

      <!-- morning-after outcome pulse (handoff §6.3 step 7) -->
      @if (outcome(); as o) {
        <div class="relative mt-4 rounded-3xl border border-line bg-surface p-5 shadow-xl">
          <button
            (click)="outcome.set(null)"
            class="absolute top-3 right-3 text-sm font-bold text-muted"
            aria-label="Dismiss"
          >
            ✕
          </button>
          <div class="flex items-center gap-3.5">
            @if (o.activity?.image_url) {
              <img [src]="o.activity?.image_url" alt="" class="h-20 w-14 rounded-xl object-cover" />
            }
            <div>
              <p class="text-xs text-muted">Last night you watched</p>
              <p class="font-display text-xl font-bold">How was {{ o.activity?.title ?? 'it' }}?</p>
            </div>
          </div>
          <div class="mt-3 flex justify-between px-2">
            @for (n of [1, 2, 3, 4, 5]; track n) {
              <button
                (click)="rateOutcome(o.partyId, n)"
                class="text-3xl"
                [class]="n <= outcomeStars() ? 'text-gold' : 'text-surface-2'"
                (mouseenter)="outcomeStars.set(n)"
              >
                ★
              </button>
            }
          </div>
          <button
            (click)="bailedOutcome(o.partyId)"
            class="mt-3 w-full text-center text-sm font-bold text-muted"
          >
            😴 We bailed halfway
          </button>
        </div>
      }

      <input
        type="search"
        placeholder="Search movies & shows…"
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        class="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
      />

      @if (query().trim().length >= 2) {
        <!-- ============ search results ============ -->
        @if (searching()) {
          <p class="mt-6 text-center text-sm font-bold text-muted-2">Searching…</p>
        } @else if (results().length === 0) {
          <p class="mt-6 text-center text-sm font-bold text-muted-2">
            Nothing found for “{{ query() }}”
          </p>
        }
        <div class="mt-4 flex flex-col gap-3">
          @for (r of results(); track r.id) {
            <div class="flex gap-3.5 rounded-2xl border border-line bg-surface p-3">
              <a [routerLink]="['/library', r.id]" class="flex-none">
                @if (r.image_url) {
                  <img
                    [src]="r.image_url"
                    [alt]="r.title"
                    class="h-23 w-16 rounded-xl object-cover shadow-md"
                  />
                } @else {
                  <div class="h-23 w-16 rounded-xl bg-surface-2"></div>
                }
              </a>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <a [routerLink]="['/library', r.id]" class="truncate font-display font-semibold">
                  {{ r.title }}
                </a>
                <span class="text-xs font-bold text-muted">{{ subtitle(r) }}</span>
                <div class="mt-auto flex gap-2">
                  @if (statusOf(r.id); as st) {
                    <span class="rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green">
                      ✓ {{ statusLabel(st) }}
                    </span>
                  } @else {
                    <button
                      (click)="add(r, 'want_to')"
                      class="rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green"
                    >
                      ＋ Want to
                    </button>
                    <button
                      (click)="add(r, 'completed')"
                      class="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted-2"
                    >
                      ✓ Seen it
                    </button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <!-- ============ library tabs ============ -->
        <div class="mt-4 flex gap-1.5 rounded-2xl bg-surface p-1.5">
          @for (t of tabs; track t.key) {
            <button
              (click)="tab.set(t.key)"
              class="flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors"
              [class]="tab() === t.key ? 'bg-coral text-ink' : 'text-muted-2'"
            >
              {{ t.label }}
            </button>
          }
        </div>

        @if (lib.loading() && lib.entries().length === 0) {
          <p class="mt-10 text-center text-sm font-bold text-muted-2">Loading…</p>
        } @else if (tabEntries().length === 0) {
          <div class="mt-10 flex flex-col items-center gap-3 text-center">
            <div class="text-4xl">🍿</div>
            <p class="font-bold">Nothing here yet</p>
            <p class="max-w-60 text-sm text-muted-2">Search above to add your first title.</p>
          </div>
        }

        <div class="mt-4 flex flex-col gap-3">
          @for (e of tabEntries(); track e.id) {
            <div class="flex gap-3.5 rounded-2xl border border-line bg-surface p-3">
              <a [routerLink]="['/library', e.activity.id]" class="flex-none">
                @if (e.activity.image_url) {
                  <img
                    [src]="e.activity.image_url"
                    [alt]="e.activity.title"
                    class="h-23 w-16 rounded-xl object-cover shadow-md"
                  />
                } @else {
                  <div class="h-23 w-16 rounded-xl bg-surface-2"></div>
                }
              </a>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <a
                  [routerLink]="['/library', e.activity.id]"
                  class="truncate font-display font-semibold"
                >
                  {{ e.activity.title }}
                </a>
                <span class="text-xs font-bold text-muted">{{ subtitle(e.activity) }}</span>
                <pp-service-badges class="mt-1" [services]="servicesOf(e)" [highlight]="subs.mySlugs()" />
                <div class="mt-auto pt-1.5">
                  @if (e.status === 'completed') {
                    <pp-star-rating [rating]="e.rating" (rated)="rate(e, $event)" />
                  } @else {
                    <div class="flex gap-2">
                      @if (e.status === 'want_to') {
                        <button
                          (click)="lib.setStatus(e.activity.id, 'in_progress')"
                          class="rounded-full border border-gold px-3 py-1.5 text-xs font-bold text-gold"
                        >
                          ▶ Started
                        </button>
                      }
                      <button
                        (click)="finish(e)"
                        class="rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green"
                      >
                        ✓ Finished
                      </button>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>
        @if (tab() === 'completed' && tabEntries().length > 0) {
          <p class="mt-4 text-center text-xs text-muted">Tap the stars — ratings teach PartyPick your taste.</p>
        }
      }
    </div>
  `,
})
export class LibraryPage implements OnDestroy {
  protected readonly lib = inject(LibraryService);
  protected readonly subs = inject(SubscriptionsService);
  private readonly partyService = inject(PartyService);

  protected readonly outcome = signal<{
    partyId: string;
    activity: { title: string; image_url: string | null } | null;
  } | null>(null);
  protected readonly outcomeStars = signal(0);

  protected readonly tabs = [
    { key: 'in_progress' as LibraryTab, label: 'Watching' },
    { key: 'want_to' as LibraryTab, label: 'Want To' },
    { key: 'completed' as LibraryTab, label: 'Done' },
  ];
  protected readonly tab = signal<LibraryTab>('want_to');

  protected readonly query = signal('');
  protected readonly results = signal<ActivitySummary[]>([]);
  protected readonly searching = signal(false);
  private debounce: ReturnType<typeof setTimeout> | undefined;

  protected readonly tabEntries = computed(() =>
    this.lib.entries().filter((e) => e.status === this.tab()),
  );

  constructor() {
    this.lib.load();
    this.subs.load();
    this.partyService.pendingOutcome().then((o) => this.outcome.set(o));
  }

  protected async rateOutcome(partyId: string, rating: number) {
    this.outcomeStars.set(rating);
    await this.partyService.recordOutcome(partyId, { rating });
    this.outcome.set(null);
  }

  protected async bailedOutcome(partyId: string) {
    await this.partyService.recordOutcome(partyId, { bailed: true });
    this.outcome.set(null);
  }

  ngOnDestroy() {
    clearTimeout(this.debounce);
  }

  protected onQuery(q: string) {
    this.query.set(q);
    clearTimeout(this.debounce);
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    this.searching.set(true);
    this.debounce = setTimeout(async () => {
      try {
        const results = await this.lib.search(trimmed);
        if (this.query().trim() === trimmed) this.results.set(results);
      } finally {
        this.searching.set(false);
      }
    }, 350);
  }

  protected statusOf(activityId: string): EngagementStatus | undefined {
    return this.lib.entries().find((e) => e.activity.id === activityId)?.status;
  }

  protected statusLabel(status: EngagementStatus): string {
    return status === 'want_to' ? 'On your list' : status === 'in_progress' ? 'Watching' : 'Seen it';
  }

  protected async add(result: ActivitySummary, status: EngagementStatus) {
    await this.lib.setStatus(result.id, status);
    this.lib.hydrate(result); // runtime + availability in the background
  }

  protected async finish(entry: LibraryEntry) {
    await this.lib.setStatus(entry.activity.id, 'completed');
    this.tab.set('completed'); // rating stars are right there
  }

  protected rate(entry: LibraryEntry, rating: number) {
    return this.lib.rate(entry.activity.id, rating);
  }

  protected servicesOf(entry: LibraryEntry) {
    return (entry.activity.activity_availability ?? []).map((a) => a.service);
  }

  protected subtitle(a: ActivitySummary): string {
    const parts: string[] = [];
    if (a.metadata?.release_year) parts.push(String(a.metadata.release_year));
    parts.push(a.type === 'movie' ? 'Movie' : 'Series');
    if (a.type === 'movie' && a.duration_min) {
      parts.push(`${Math.floor(a.duration_min / 60)}h ${a.duration_min % 60}m`);
    }
    if (a.type === 'tv_show' && a.metadata?.seasons) {
      parts.push(`${a.metadata.seasons} season${a.metadata.seasons === 1 ? '' : 's'}`);
    }
    return parts.join(' · ');
  }
}
