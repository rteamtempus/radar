import { Component, OnDestroy, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CityPick, CitySuggestion, LocationService } from '../../core/location.service';

/**
 * The one way a location is chosen anywhere in Radar: a bottom sheet with
 * Places city autocomplete (session-tokened — G8 billing) plus quick picks
 * (near me · home · recents). Emits a CityPick or null ("near me").
 *
 * Kept deliberately lean — Rory flagged search-bloat and reviews this UI.
 */
@Component({
  selector: 'pp-city-picker',
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60" (click)="close.emit()">
      <div
        class="w-full max-w-md rounded-t-3xl border-t border-line bg-bg-warm p-5 pb-8"
        (click)="$event.stopPropagation()"
      >
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-line"></div>
        <p class="text-xs font-bold tracking-wide text-muted uppercase">{{ title() }}</p>

        <input
          type="search"
          #searchInput
          placeholder="Search for a city…"
          [ngModel]="query()"
          (ngModelChange)="onQuery($event)"
          autofocus
          class="mt-3 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
        />

        @if (suggestions().length) {
          <div class="mt-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            @for (s of suggestions(); track s.place_id) {
              <button
                (click)="pickSuggestion(s)"
                class="flex items-baseline gap-2 border-b border-line px-4 py-3 text-left last:border-b-0"
              >
                <span class="font-bold">{{ s.main }}</span>
                <span class="min-w-0 truncate text-xs text-muted">{{ s.secondary }}</span>
              </button>
            }
          </div>
        } @else if (busy()) {
          <p class="mt-3 text-center text-xs text-muted">Searching…</p>
        }

        <!-- quick picks: near me · home · recents -->
        @if (!query().trim()) {
          <div class="mt-3 flex flex-wrap gap-2">
            @if (allowNearMe()) {
              <button (click)="clear()" class="rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green">
                {{ clearLabel() }}
              </button>
            }
            @if (location.home(); as h) {
              <button (click)="pick(h)" class="rounded-full border border-gold px-3 py-1.5 text-xs font-bold text-gold">
                🏠 {{ h.name }}
              </button>
            }
            @for (r of location.recents(); track r.place_id) {
              <button (click)="pick(r)" class="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted-2">
                {{ r.name }}
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class CityPicker implements OnDestroy {
  protected readonly location = inject(LocationService);

  /** Sheet heading, e.g. "Explore location" / "Slot location". */
  readonly title = input('Location');
  /** Show the clear option (off for home-city/slot pickers). */
  readonly allowNearMe = input(true);
  /** Label for the clear option — "Near me" for eat/do, "Any city" for lists. */
  readonly clearLabel = input('📍 Near me');

  readonly picked = output<CityPick>();
  readonly cleared = output<void>();
  readonly close = output<void>();

  protected readonly query = signal('');
  protected readonly suggestions = signal<CitySuggestion[]>([]);
  protected readonly busy = signal(false);
  // One autocomplete session per sheet-open: Google bills the session, not
  // each keystroke, as long as it ends in a resolve.
  private readonly session = crypto.randomUUID();
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private serial = 0;

  protected onQuery(q: string) {
    this.query.set(q);
    clearTimeout(this.debounce);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      this.suggestions.set([]);
      return;
    }
    this.debounce = setTimeout(() => void this.fetch(trimmed), 300);
  }

  private async fetch(input: string) {
    const serial = ++this.serial;
    this.busy.set(true);
    try {
      const results = await this.location.suggestCities(input, this.session);
      if (serial === this.serial) this.suggestions.set(results);
    } catch {
      if (serial === this.serial) this.suggestions.set([]);
    } finally {
      if (serial === this.serial) this.busy.set(false);
    }
  }

  protected async pickSuggestion(s: CitySuggestion) {
    try {
      const pick = await this.location.resolveCity(s.place_id, this.session);
      this.picked.emit(pick);
      this.close.emit();
    } catch {
      // leave the sheet open; the user can retap
    }
  }

  protected pick(p: CityPick) {
    this.picked.emit(p);
    this.close.emit();
  }

  protected clear() {
    this.cleared.emit();
    this.close.emit();
  }

  ngOnDestroy() {
    clearTimeout(this.debounce);
  }
}
