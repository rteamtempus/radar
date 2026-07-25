import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DOMAINS, Domain, DomainService } from '../../core/domain.service';
import { LocationService } from '../../core/location.service';
import { ToastService } from '../../shared/ui/toast.service';
import { ActivitySummary, LibraryEntry, LibraryService } from '../library/library.service';
import { PartyService } from '../party/party.service';
import { RadarSlot, SlotItem, SlotsService } from './slots.service';

/**
 * The Radar home: your slots — curated, active queues (ideas doc §2).
 * Finishing a title removes it (or loops it) automatically; the Library
 * remains the full status/history view underneath.
 */
@Component({
  selector: 'pp-radar-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-md px-5 py-6">
      <div class="flex items-center justify-between">
        <h1 class="font-display text-3xl font-semibold">Radar</h1>
        <div class="flex gap-1 rounded-full bg-surface p-1">
          @for (d of domains; track d.id) {
            <button
              (click)="switchDomain(d.id)"
              class="rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
              [class]="domain.domain() === d.id ? 'bg-coral text-ink' : 'text-muted-2'"
            >
              {{ d.emoji }} {{ d.label }}
            </button>
          }
        </div>
      </div>
      <p class="mt-1 text-sm text-muted-2">
        {{ domain.domain() === 'eat' ? 'Places worth trying — queues with a pulse.' : 'Your personal TV guide — queues with a pulse.' }}
      </p>

      <input
        type="search"
        [placeholder]="domain.def().searchPlaceholder"
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        class="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
      />
      @if (domain.domain() === 'eat' && query().trim().length < 2) {
        <button
          (click)="nearby()"
          class="mt-2 w-full rounded-2xl border border-dashed border-line py-2.5 text-sm font-bold text-muted-2"
        >
          📍 What's good nearby?
        </button>
      }

      @if (query().trim().length >= 2 || (domain.domain() === 'eat' && results().length)) {
        @if (searching()) {
          <p class="mt-4 text-center text-sm font-bold text-muted-2">Searching…</p>
        } @else if (!results().length) {
          <p class="mt-4 text-center text-sm font-bold text-muted-2">Nothing found for “{{ query() }}”</p>
        }
        <div class="mt-3 flex flex-col gap-2">
          @for (r of results(); track r.id) {
            <div class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
              <a [routerLink]="['/library', r.id]" class="flex min-w-0 flex-1 items-center gap-3">
                @if (r.image_url) {
                  <img [src]="r.image_url" alt="" class="h-16 w-11 flex-none rounded-lg object-cover" />
                } @else {
                  <div class="h-16 w-11 flex-none rounded-lg bg-surface-2"></div>
                }
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold">{{ r.title }}</p>
                  <p class="truncate text-xs text-muted">{{ resultSub(r) }}</p>
                </div>
              </a>
              @if (statusOf(r.id)) {
                <span class="flex-none rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green">✓</span>
              } @else {
                <button
                  (click)="quickAdd(r)"
                  class="flex-none rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green"
                >
                  {{ r.type === 'restaurant' ? '＋ Want to try' : '＋ Want to' }}
                </button>
              }
            </div>
          }
        </div>
      }

      <!-- stale-show nudge -->
      @if (staleEntry(); as stale) {
        <div class="mt-4 flex items-center gap-3.5 rounded-3xl border border-gold/40 bg-gold/10 p-4">
          @if (stale.activity.image_url) {
            <img [src]="stale.activity.image_url" alt="" class="h-16 w-11 rounded-lg object-cover" />
          }
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold">Still watching {{ stale.activity.title }}?</p>
            <p class="text-xs text-muted-2">It's been a couple of months.</p>
            <div class="mt-2 flex gap-2">
              <button (click)="keepStale(stale)" class="rounded-full bg-gold px-3 py-1.5 text-xs font-bold text-ink">
                Keep it
              </button>
              <button (click)="dropStale(stale)" class="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted-2">
                Off the radar
              </button>
            </div>
          </div>
        </div>
      }

      <!-- morning-after outcome pulse -->
      @if (outcome(); as o) {
        <div class="relative mt-4 rounded-3xl border border-line bg-surface p-5 shadow-xl">
          <button (click)="outcome.set(null)" class="absolute top-3 right-3 text-sm font-bold text-muted" aria-label="Dismiss">✕</button>
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
          <button (click)="bailedOutcome(o.partyId)" class="mt-3 w-full text-center text-sm font-bold text-muted">
            😴 We bailed halfway
          </button>
        </div>
      }

      @if (slots.loading() && !slots.slots().length) {
        <div class="mt-5 flex flex-col gap-3">
          @for (i of [0, 1, 2]; track i) {
            <div class="h-24 animate-pulse rounded-3xl border border-line bg-surface"></div>
          }
        </div>
      }

      <div class="mt-5 flex flex-col gap-4">
        @for (slot of slots.forDomain(domain.domain()); track slot.id) {
          <div class="rounded-3xl border border-line bg-surface p-4">
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ slot.emoji ?? '🎬' }}</span>
              <span class="flex-1 truncate font-display text-lg font-semibold">{{ slot.name }}</span>
              @if (slot.on_complete === 'loop') {
                <span class="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-bold text-violet">LOOP</span>
              }
              <span class="text-xs font-bold text-muted">{{ slot.items.length }}</span>
              <button
                (click)="confirmDelete(slot)"
                class="ml-1 text-sm text-muted"
                [attr.aria-label]="'Delete ' + slot.name"
              >
                {{ deletingSlot() === slot.id ? 'Sure?' : '✕' }}
              </button>
            </div>

            @if (!slot.items.length) {
              <p class="mt-3 text-center text-xs text-muted">Queue's empty — add something ↓</p>
            }

            <div class="mt-3 flex flex-col gap-2">
              @for (item of sorted(slot); track item.activity_id; let first = $first; let last = $last) {
                <div class="flex items-center gap-2.5 rounded-2xl bg-bg-warm p-2">
                  <a [routerLink]="['/library', item.activity.id]" class="flex min-w-0 flex-1 items-center gap-2.5">
                    @if (item.activity.image_url) {
                      <img [src]="item.activity.image_url" alt="" class="h-14 w-10 flex-none rounded-lg object-cover" />
                    } @else {
                      <div class="h-14 w-10 flex-none rounded-lg bg-surface-2"></div>
                    }
                    <div class="min-w-0">
                      <p class="truncate text-sm font-bold">{{ item.activity.title }}</p>
                      <p class="text-xs text-muted">{{ subtitle(item) }}</p>
                    </div>
                  </a>
                  <div class="flex flex-none items-center gap-0.5">
                    <button
                      (click)="slots.move(slot.id, item.activity_id, -1)"
                      [disabled]="first"
                      class="px-1.5 py-1 text-muted disabled:opacity-25"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      (click)="slots.move(slot.id, item.activity_id, 1)"
                      [disabled]="last"
                      class="px-1.5 py-1 text-muted disabled:opacity-25"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                    <button
                      (click)="slots.removeItem(slot.id, item.activity_id)"
                      class="px-1.5 py-1 text-muted"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              }
            </div>

            @if (addingTo() === slot.id) {
              <input
                type="search"
                placeholder="Search to add…"
                [ngModel]="addQuery()"
                (ngModelChange)="onAddQuery($event)"
                class="mt-3 w-full rounded-xl border border-line bg-bg-warm px-3.5 py-2.5 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
              />
              @if (addSearching()) {
                <p class="mt-2 text-center text-xs font-bold text-muted-2">Searching…</p>
              }
              <div class="mt-2 flex flex-col gap-1.5">
                @for (r of addResults(); track r.id) {
                  <button
                    (click)="addResult(slot, r)"
                    class="flex items-center gap-2.5 rounded-xl bg-bg-warm p-2 text-left"
                  >
                    @if (r.image_url) {
                      <img [src]="r.image_url" alt="" class="h-12 w-8 flex-none rounded-md object-cover" />
                    }
                    <span class="min-w-0 flex-1 truncate text-sm font-bold">{{ r.title }}</span>
                    <span class="text-xs text-muted">{{ r.metadata.release_year }}</span>
                    <span class="font-bold text-green">＋</span>
                  </button>
                }
              </div>
            } @else {
              <button
                (click)="openAdd(slot.id)"
                class="mt-3 w-full rounded-xl border border-dashed border-line py-2 text-xs font-bold text-muted-2"
              >
                ＋ Add to {{ slot.name }}
              </button>
            }
          </div>
        }
      </div>

      <!-- new slot -->
      <div class="mt-5 rounded-3xl border border-dashed border-line p-4">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">New slot</p>
        <div class="mt-2.5 flex gap-2">
          <input
            type="text"
            maxlength="4"
            placeholder="🎬"
            [(ngModel)]="newEmoji"
            class="w-14 rounded-xl border border-line bg-surface px-2 py-2.5 text-center text-cream focus:border-coral focus:outline-none"
          />
          <input
            type="text"
            maxlength="40"
            placeholder="e.g. High movies"
            [(ngModel)]="newName"
            class="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
          />
        </div>
        <label class="mt-2.5 flex items-center gap-2 text-xs font-bold text-muted-2">
          <input type="checkbox" [(ngModel)]="newLoop" class="accent-violet" />
          Loop — finished titles go to the back instead of leaving
        </label>
        <button
          (click)="create()"
          [disabled]="!newName.trim()"
          class="mt-3 w-full rounded-xl bg-coral py-2.5 text-sm font-bold text-ink disabled:opacity-50"
        >
          Create slot
        </button>
      </div>
    </div>
  `,
})
export class RadarPage implements OnDestroy {
  protected readonly slots = inject(SlotsService);
  protected readonly domain = inject(DomainService);
  private readonly location = inject(LocationService);
  private readonly lib = inject(LibraryService);
  private readonly partyService = inject(PartyService);
  private readonly toast = inject(ToastService);

  protected readonly domains = DOMAINS;

  protected newName = '';
  protected newEmoji = '';
  protected newLoop = false;

  protected readonly addingTo = signal<string | null>(null);
  protected readonly addQuery = signal('');
  protected readonly addResults = signal<ActivitySummary[]>([]);
  protected readonly addSearching = signal(false);
  protected readonly deletingSlot = signal<string | null>(null);
  private debounce: ReturnType<typeof setTimeout> | undefined;

  // global search
  protected readonly query = signal('');
  protected readonly results = signal<ActivitySummary[]>([]);
  protected readonly searching = signal(false);
  private searchDebounce: ReturnType<typeof setTimeout> | undefined;

  // pulses
  private readonly dismissedStale = signal<ReadonlySet<string>>(new Set());
  protected readonly outcome = signal<{
    partyId: string;
    activity: { title: string; image_url: string | null } | null;
  } | null>(null);
  protected readonly outcomeStars = signal(0);

  protected readonly staleEntry = computed(() => {
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    return this.lib
      .entries()
      .filter(
        (e) =>
          e.status === 'in_progress' &&
          !this.dismissedStale().has(e.id) &&
          new Date(e.updated_at).getTime() < cutoff,
      )
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0];
  });

  private readonly seedDefaults = effect(() => {
    this.slots.ensureDefaults(this.domain.domain());
  });

  constructor() {
    this.lib.load();
    this.partyService.pendingOutcome().then((o) => this.outcome.set(o));
  }

  protected switchDomain(d: Domain) {
    this.domain.set(d);
    this.query.set('');
    this.results.set([]);
    this.addingTo.set(null);
  }

  protected resultSub(r: ActivitySummary): string {
    if (r.type === 'restaurant') {
      const parts: string[] = [];
      if (r.metadata.rating) parts.push(`★ ${r.metadata.rating}`);
      if (r.metadata.price_level) parts.push('$'.repeat(r.metadata.price_level));
      if (r.metadata.address) parts.push(r.metadata.address.split(',')[0]);
      return parts.join(' · ') || 'Restaurant';
    }
    return `${r.metadata.release_year ?? ''} · ${r.type === 'movie' ? 'Movie' : 'Series'}`;
  }

  /** Eat domain: popularity-ranked nearby restaurants (needs location). */
  protected async nearby() {
    this.searching.set(true);
    this.query.set('');
    try {
      const loc = await this.location.get();
      if (!loc) {
        this.toast.error('Location is off — allow it in your browser, or search by name.');
        return;
      }
      this.results.set(await this.lib.searchPlaces('', loc));
    } catch {
      this.toast.error('Nearby search failed — is the Places key set up?');
    } finally {
      this.searching.set(false);
    }
  }

  ngOnDestroy() {
    clearTimeout(this.debounce);
    clearTimeout(this.searchDebounce);
  }

  protected statusOf(activityId: string): boolean {
    return this.lib
      .entries()
      .some(
        (e) =>
          e.activity.id === activityId &&
          ['want_to', 'in_progress', 'completed'].includes(e.status),
      );
  }

  protected onQuery(q: string) {
    this.query.set(q);
    clearTimeout(this.searchDebounce);
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    this.searching.set(true);
    this.searchDebounce = setTimeout(async () => {
      try {
        const results =
          this.domain.domain() === 'eat'
            ? await this.lib.searchPlaces(trimmed, await this.location.get())
            : await this.lib.search(trimmed);
        if (this.query().trim() === trimmed) this.results.set(results);
      } catch {
        this.toast.error('Search failed — check your connection.');
      } finally {
        this.searching.set(false);
      }
    }, 350);
  }

  protected async quickAdd(result: ActivitySummary) {
    try {
      await this.lib.setStatus(result.id, 'want_to'); // syncs into the up-next role slot
      this.lib.hydrate(result);
      this.toast.success(
        `${result.title} → ${result.type === 'restaurant' ? 'Want to try' : 'Up next'} ✓`,
      );
    } catch {
      this.toast.error(`Couldn't add “${result.title}” — try again.`);
    }
  }

  protected async keepStale(entry: LibraryEntry) {
    this.dismissedStale.update((s) => new Set([...s, entry.id]));
    await this.lib.touch(entry.activity.id);
  }

  protected async dropStale(entry: LibraryEntry) {
    this.dismissedStale.update((s) => new Set([...s, entry.id]));
    try {
      await this.lib.setStatus(entry.activity.id, 'abandoned');
      this.toast.success(`${entry.activity.title} is off the radar.`);
    } catch {
      this.toast.error('Could not update — try again.');
    }
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

  protected sorted(slot: RadarSlot): SlotItem[] {
    return [...slot.items].sort((a, b) => a.position - b.position);
  }

  protected subtitle(item: SlotItem): string {
    const a = item.activity;
    if (a.type === 'restaurant') {
      const parts: string[] = [];
      if (a.metadata?.rating) parts.push(`★ ${a.metadata.rating}`);
      if (a.metadata?.price_level) parts.push('$'.repeat(a.metadata.price_level));
      return parts.join(' · ') || 'Restaurant';
    }
    const parts: string[] = [];
    if (a.metadata?.release_year) parts.push(String(a.metadata.release_year));
    parts.push(a.type === 'movie' ? 'Movie' : 'Series');
    return parts.join(' · ');
  }

  protected openAdd(slotId: string) {
    this.addingTo.set(slotId);
    this.addQuery.set('');
    this.addResults.set([]);
  }

  protected onAddQuery(q: string) {
    this.addQuery.set(q);
    clearTimeout(this.debounce);
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    this.addSearching.set(true);
    this.debounce = setTimeout(async () => {
      try {
        const slot = this.slots.slots().find((s) => s.id === this.addingTo());
        const results =
          (slot?.config?.domain ?? 'watch') === 'eat'
            ? await this.lib.searchPlaces(trimmed, await this.location.get())
            : await this.lib.search(trimmed);
        if (this.addQuery().trim() === trimmed) this.addResults.set(results.slice(0, 5));
      } catch {
        this.toast.error('Search failed — try again.');
      } finally {
        this.addSearching.set(false);
      }
    }, 350);
  }

  protected async addResult(slot: RadarSlot, result: ActivitySummary) {
    this.addingTo.set(null);
    await this.slots.addItem(slot.id, result.id);
    this.lib.hydrate(result); // availability/runtime in the background
    this.toast.success(`Added to ${slot.name} ✓`);
  }

  /** Two-tap delete: ✕ → "Sure?" → gone (auto-resets after 3s). */
  protected confirmDelete(slot: RadarSlot) {
    if (this.deletingSlot() === slot.id) {
      this.deletingSlot.set(null);
      this.slots.deleteSlot(slot.id);
    } else {
      this.deletingSlot.set(slot.id);
      setTimeout(() => {
        if (this.deletingSlot() === slot.id) this.deletingSlot.set(null);
      }, 3000);
    }
  }

  protected create() {
    this.slots.createSlot(this.newName, this.newEmoji, this.newLoop, this.domain.domain());
    this.newName = '';
    this.newEmoji = '';
    this.newLoop = false;
  }
}
