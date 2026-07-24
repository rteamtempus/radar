import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../shared/ui/toast.service';
import { ActivitySummary, LibraryService } from '../library/library.service';
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
      <h1 class="font-display text-3xl font-semibold">Radar</h1>
      <p class="mt-1 text-sm text-muted-2">Your personal TV guide — queues with a pulse.</p>

      @if (slots.loading() && !slots.slots().length) {
        <div class="mt-5 flex flex-col gap-3">
          @for (i of [0, 1, 2]; track i) {
            <div class="h-24 animate-pulse rounded-3xl border border-line bg-surface"></div>
          }
        </div>
      }

      <div class="mt-5 flex flex-col gap-4">
        @for (slot of slots.slots(); track slot.id) {
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
  private readonly lib = inject(LibraryService);
  private readonly toast = inject(ToastService);

  protected newName = '';
  protected newEmoji = '';
  protected newLoop = false;

  protected readonly addingTo = signal<string | null>(null);
  protected readonly addQuery = signal('');
  protected readonly addResults = signal<ActivitySummary[]>([]);
  protected readonly addSearching = signal(false);
  protected readonly deletingSlot = signal<string | null>(null);
  private debounce: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.slots.ensureDefaults();
  }

  ngOnDestroy() {
    clearTimeout(this.debounce);
  }

  protected sorted(slot: RadarSlot): SlotItem[] {
    return [...slot.items].sort((a, b) => a.position - b.position);
  }

  protected subtitle(item: SlotItem): string {
    const parts: string[] = [];
    if (item.activity.metadata?.release_year) parts.push(String(item.activity.metadata.release_year));
    parts.push(item.activity.type === 'movie' ? 'Movie' : 'Series');
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
        const results = await this.lib.search(trimmed);
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
    this.slots.createSlot(this.newName, this.newEmoji, this.newLoop);
    this.newName = '';
    this.newEmoji = '';
    this.newLoop = false;
  }
}
