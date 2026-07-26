import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DOMAINS, Domain, DomainService } from '../../core/domain.service';
import { ToastService } from '../../shared/ui/toast.service';
import { LibraryEntry, LibraryService } from '../library/library.service';
import { PartyService } from '../party/party.service';
import { RadarSlot, SlotItem, SlotsService, SubscribedSlot } from './slots.service';

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
      <p class="mt-2 text-sm text-muted-2">{{ domain.def().tagline }}</p>

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
              <a [routerLink]="['/radar/slot', slot.id]" class="flex min-w-0 flex-1 items-center gap-2">
                <span class="text-lg">{{ slot.emoji ?? '🎬' }}</span>
                <span class="min-w-0 flex-1 truncate font-display text-lg font-semibold">{{ slot.name }}</span>
                @if (slot.on_complete === 'loop') {
                  <span class="flex-none rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-bold text-violet">LOOP</span>
                }
                <span class="flex-none text-xs font-bold text-muted">{{ slot.items.length }} ›</span>
              </a>
              <button
                (click)="confirmDelete(slot)"
                class="ml-1 flex-none text-sm text-muted"
                [attr.aria-label]="'Delete ' + slot.name"
              >
                {{ deletingSlot() === slot.id ? 'Sure?' : '✕' }}
              </button>
            </div>

            @if (!slot.items.length) {
              <p class="mt-3 text-center text-xs text-muted">Queue's empty — add from Explore or a detail page.</p>
            } @else {
              <a [routerLink]="['/radar/slot', slot.id]" class="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                @for (item of preview(slot); track item.activity_id) {
                  @if (item.activity.image_url) {
                    <img
                      [src]="item.activity.image_url"
                      [alt]="item.activity.title"
                      [title]="item.activity.title"
                      class="h-24 w-16 flex-none rounded-lg object-cover"
                    />
                  } @else {
                    <span class="flex h-24 w-16 flex-none items-center justify-center rounded-lg bg-surface-2 p-1 text-center text-[9px] font-bold text-muted">
                      {{ item.activity.title }}
                    </span>
                  }
                }
                @if (slot.items.length > previewCount) {
                  <span class="flex h-24 w-16 flex-none items-center justify-center rounded-lg bg-surface-2 text-sm font-bold text-muted-2">
                    +{{ slot.items.length - previewCount }}
                  </span>
                }
              </a>
            }
          </div>
        }
      </div>
      <p class="mt-3 text-center text-[11px] text-muted">
        Add things from <a routerLink="/explore" class="font-bold text-coral">Explore</a> or any detail page's My Radar section.
      </p>

      <!-- slots saved from other people (live references, read-only) -->
      @if (subscribedForDomain().length) {
        <h2 class="mt-6 mb-2 text-xs font-bold tracking-wide text-muted uppercase">Saved from others</h2>
        <div class="flex flex-col gap-4">
          @for (slot of subscribedForDomain(); track slot.id) {
            <a [routerLink]="['/radar/slot', slot.id]" class="block rounded-3xl border border-violet/30 bg-surface p-4">
              <div class="flex items-center gap-2">
                <span class="text-lg">{{ slot.emoji ?? '🎬' }}</span>
                <span class="min-w-0 flex-1 truncate font-display text-lg font-semibold">{{ slot.name }}</span>
                @if (newCount(slot); as n) {
                  <span class="flex-none rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-ink">+{{ n }} new</span>
                }
                <span class="flex-none text-xs font-bold text-muted">{{ slot.items.length }} ›</span>
              </div>
              <p class="mt-0.5 text-[11px] text-muted">
                by {{ slot.owner?.display_name ?? 'someone' }}
                @if (completionOf(slot); as c) {
                  · <span class="text-green">{{ c }}</span>
                }
              </p>
              @if (slot.items.length) {
                <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                  @for (item of preview(slot); track item.activity_id) {
                    @if (item.activity.image_url) {
                      <img [src]="item.activity.image_url" [alt]="item.activity.title" class="h-24 w-16 flex-none rounded-lg object-cover" />
                    }
                  }
                </div>
              }
            </a>
          }
        </div>
      }

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
export class RadarPage {
  protected readonly slots = inject(SlotsService);
  protected readonly domain = inject(DomainService);
  private readonly lib = inject(LibraryService);
  private readonly partyService = inject(PartyService);
  private readonly toast = inject(ToastService);

  protected readonly domains = DOMAINS;

  protected newName = '';
  protected newEmoji = '';
  protected newLoop = false;

  protected readonly deletingSlot = signal<string | null>(null);

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
    this.slots.loadSubscribed();
    this.partyService.pendingOutcome().then((o) => this.outcome.set(o));
  }

  protected readonly subscribedForDomain = computed(() =>
    this.slots.subscribed().filter((s) => (s.config?.domain ?? 'watch') === this.domain.domain()),
  );

  /** "+N new since you looked" (idea #9). */
  protected newCount(slot: SubscribedSlot): number {
    return slot.items.filter((i) => i.added_at && i.added_at > slot.last_seen_at).length;
  }

  /** "4/12 done" completion (idea #4), from my own history. */
  protected completionOf(slot: SubscribedSlot): string | null {
    if (!slot.items.length) return null;
    const mine = new Set(
      this.lib
        .entries()
        .filter((e) => e.status === 'completed')
        .map((e) => e.activity.id),
    );
    const done = slot.items.filter((i) => mine.has(i.activity_id)).length;
    return done ? `${done}/${slot.items.length} done` : null;
  }

  protected switchDomain(d: Domain) {
    this.domain.set(d);
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

  protected readonly previewCount = 8;

  protected preview(slot: RadarSlot): SlotItem[] {
    return [...slot.items].sort((a, b) => a.position - b.position).slice(0, this.previewCount);
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
