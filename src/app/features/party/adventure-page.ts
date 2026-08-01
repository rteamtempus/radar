import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DOMAINS, Domain } from '../../core/domain.service';
import { CityPick } from '../../core/location.service';
import { PlatformService } from '../../core/platform/platform.service';
import { CityPicker } from '../../shared/ui/city-picker';
import { distanceMiles } from '../explore/explore.service';
import { RadarSlot, SlotsService } from '../radar/slots.service';
import { AdventureQuest, AdventureService, AdventureSummary } from './adventure.service';
import { PartyStatus } from './party.service';

const STATUS_LABELS: Record<PartyStatus, string> = {
  gathering: 'picking slots',
  swiping: 'swiping',
  voting: 'voting',
  decided: 'decided',
  completed: 'done',
  cancelled: 'cancelled',
};

/**
 * An adventure: the itinerary. Scheduled quests group under day headings,
 * undated ones sit in a "maybe" bucket you can reorder and promote by giving
 * them a time. One roster, one code — joining puts you in every quest.
 */
@Component({
  selector: 'pp-adventure-page',
  imports: [CityPicker, FormsModule, RouterLink, NgTemplateOutlet],
  template: `
    @if (adv.adventure(); as a) {
      <div class="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
        <a routerLink="/party" class="text-xs font-bold text-muted-2">← Quests</a>

        <div class="mt-3 flex items-start gap-3">
          <span class="text-4xl">{{ a.emoji ?? '🗺️' }}</span>
          <div class="min-w-0 flex-1">
            <h1 class="font-display text-3xl font-semibold">{{ a.name }}</h1>
            <p class="mt-0.5 text-sm text-muted-2">
              {{ adv.members().length }} on the trip ·
              {{ adv.quests().length }} {{ adv.quests().length === 1 ? 'quest' : 'quests' }}
              @if (a.status !== 'planning') {
                · <span class="font-bold text-gold">{{ a.status }}</span>
              }
            </p>
            @if (a.location || a.starts_on) {
              <p class="mt-0.5 text-xs font-bold text-gold">
                @if (a.location) {
                  📍 {{ a.location.name }}
                }
                @if (dateRange(a)) {
                  · {{ dateRange(a) }}
                }
              </p>
            }
          </div>
        </div>

        @if (a.status === 'planning' && a.join_code) {
          <button
            (click)="shareLink(a.join_code)"
            class="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-center"
          >
            <span class="text-xs font-bold tracking-wide text-muted uppercase">Invite code</span>
            <span class="font-display mt-0.5 block text-2xl font-bold tracking-[0.2em] text-gold">
              {{ a.join_code }}
            </span>
            <span class="mt-1 block text-[11px] text-muted">
              {{ copied() ? '✓ Link copied' : 'One code covers every quest — tap to share' }}
            </span>
          </button>
        }

        <!-- ============ trip settings (v0.14) — owner only ============ -->
        @if (a.status === 'planning' && isOwner()) {
          <div class="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p class="text-xs font-bold tracking-wide text-muted uppercase">Trip details</p>
            <div class="mt-2.5 flex items-center gap-2">
              <button
                (click)="tripPickerOpen.set(true)"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-warm px-3 py-2.5 text-left text-sm font-bold"
                [class.text-muted]="!a.location"
              >
                📍 {{ a.location?.name ?? 'Where to?' }}
              </button>
              @if (a.location) {
                <button
                  (click)="adv.setTrip(id(), { location: null })"
                  class="flex-none rounded-xl border border-line px-3 py-2.5 text-sm font-bold text-muted-2"
                  aria-label="Clear trip location"
                >
                  ✕
                </button>
              }
            </div>
            <div class="mt-2 flex items-center gap-2">
              <input
                type="date"
                [value]="a.starts_on ?? ''"
                (change)="setDates(a, 'starts_on', $event)"
                aria-label="Trip start date"
                class="min-w-0 flex-1 rounded-xl border border-line bg-bg-warm px-3 py-2.5 text-xs text-cream focus:border-gold focus:outline-none"
              />
              <span class="flex-none text-xs text-muted">→</span>
              <input
                type="date"
                [value]="a.ends_on ?? ''"
                (change)="setDates(a, 'ends_on', $event)"
                aria-label="Trip end date"
                class="min-w-0 flex-1 rounded-xl border border-line bg-bg-warm px-3 py-2.5 text-xs text-cream focus:border-gold focus:outline-none"
              />
            </div>
            <div class="mt-2.5 flex gap-2">
              <button
                (click)="adv.setTrip(id(), { visibility: 'members' })"
                class="flex-1 rounded-xl border py-2 text-xs font-bold"
                [class]="a.visibility === 'members' ? 'border-coral bg-coral/15 text-coral' : 'border-line text-muted-2'"
              >
                🤫 Members only
              </button>
              <button
                (click)="adv.setTrip(id(), { visibility: 'friends' })"
                class="flex-1 rounded-xl border py-2 text-xs font-bold"
                [class]="a.visibility === 'friends' ? 'border-coral bg-coral/15 text-coral' : 'border-line text-muted-2'"
              >
                👥 Friends can see
              </button>
            </div>
            <p class="mt-1.5 text-[11px] text-muted">
              {{
                a.visibility === 'friends'
                  ? 'Your friends see this upcoming trip (name, place, dates) — joining still takes the code.'
                  : 'Nobody outside the roster knows this exists. Perfect for surprises.'
              }}
            </p>
          </div>

          <!-- location-matched slot suggestions (idea 2's payoff) -->
          @if (a.location && suggestedSlots().length) {
            <div class="mt-3 rounded-2xl border border-gold/30 bg-gold/5 p-3.5">
              <p class="text-[11px] font-bold tracking-wide text-gold uppercase">
                Your slots near {{ a.location.name }} — turn one into a quest
              </p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                @for (s of suggestedSlots(); track s.id) {
                  <button
                    (click)="questFromSlot(s)"
                    [disabled]="busy()"
                    class="rounded-full border border-gold/50 px-3 py-1.5 text-xs font-bold text-gold disabled:opacity-50"
                  >
                    {{ s.emoji }} {{ s.name }} ({{ s.items.length }})
                  </button>
                }
              </div>
            </div>
          }
        }

        @if (tripPickerOpen()) {
          <pp-city-picker
            title="Trip destination"
            [allowNearMe]="false"
            (picked)="setTripLocation($event)"
            (close)="tripPickerOpen.set(false)"
          />
        }

        <!-- ============ the recap, once it's done ============ -->
        @if (a.status === 'completed') {
          <div class="mt-6 rounded-3xl border border-gold/40 bg-gold/10 p-5 text-center">
            <div class="text-4xl">🎊</div>
            <h2 class="font-display mt-2 text-2xl font-semibold text-gold">What a trip</h2>
            <p class="mt-1 text-xs text-muted-2">
              {{ adv.decided().length }}
              {{ adv.decided().length === 1 ? 'thing' : 'things' }} decided together with
              {{ names() }}.
            </p>
            @if (adv.decided().length) {
              <div class="mt-4 flex flex-col gap-2.5 text-left">
                @for (q of adv.decided(); track q.id) {
                  <div class="flex items-center gap-3 rounded-2xl bg-bg-warm p-2.5">
                    @if (q.activity?.image_url) {
                      <img [src]="q.activity!.image_url" alt="" class="h-14 w-10 flex-none rounded-lg object-cover" />
                    } @else {
                      <div class="flex h-14 w-10 flex-none items-center justify-center rounded-lg bg-surface-2">
                        {{ emojiFor(q.domain) }}
                      </div>
                    }
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-bold">{{ q.activity?.title }}</p>
                      <p class="truncate text-[11px] text-muted">
                        {{ q.title ?? domainLabel(q.domain) }}
                        @if (q.scheduled_at) {
                          · {{ when(q.scheduled_at) }}
                        }
                      </p>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }

        @if (a.status === 'cancelled') {
          <div class="mt-6 rounded-3xl border border-line bg-surface p-6 text-center">
            <div class="text-4xl">🫠</div>
            <h2 class="font-display mt-2 text-xl font-semibold">Called off</h2>
            <p class="mt-1 text-xs text-muted-2">This adventure was cancelled. It happens.</p>
          </div>
        }

        <!-- ============ the itinerary ============ -->
        @for (day of adv.days(); track day.day) {
          <h2 class="mt-7 mb-2.5 text-xs font-bold tracking-wide text-gold uppercase">
            {{ day.label }}
          </h2>
          <div class="flex flex-col gap-2.5">
            @for (q of day.quests; track q.id) {
              <ng-container *ngTemplateOutlet="questCard; context: { $implicit: q, scheduled: true }" />
            }
          </div>
        }

        @if (adv.unscheduled().length) {
          <h2 class="mt-7 mb-1 text-xs font-bold tracking-wide text-muted uppercase">
            🤷 Whenever
          </h2>
          <p class="mb-2.5 text-[11px] text-muted">
            These happen when they happen. Give one a date and it joins the schedule above.
          </p>
          <div class="flex flex-col gap-2.5">
            @for (q of adv.unscheduled(); track q.id; let i = $index) {
              <ng-container
                *ngTemplateOutlet="questCard; context: { $implicit: q, scheduled: false, index: i }"
              />
            }
          </div>
        }

        @if (!adv.quests().length) {
          <p class="mt-8 rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted-2">
            Nothing planned yet. Add your first quest below.
          </p>
        }

        <!-- ============ add a quest ============ -->
        @if (a.status === 'planning') {
          @if (adding()) {
            <div class="mt-6 rounded-2xl border border-coral/40 bg-coral/10 p-4">
              <p class="text-xs font-bold tracking-wide text-muted uppercase">New quest</p>
              <div class="mt-2.5 grid grid-cols-4 gap-2">
                @for (d of domains; track d.id) {
                  <button
                    (click)="newDomain.set(d.id)"
                    class="rounded-xl border-2 py-2.5 text-center"
                    [class]="newDomain() === d.id ? 'border-coral bg-coral/15' : 'border-line'"
                  >
                    <span class="block text-xl">{{ d.emoji }}</span>
                  </button>
                }
              </div>
              <input
                type="text"
                maxlength="40"
                [(ngModel)]="newTitle"
                placeholder="Call it something? (optional)"
                class="mt-2.5 w-full rounded-xl border border-line bg-bg-warm px-3 py-2.5 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
              />
              <div class="mt-2.5 flex gap-2">
                <button
                  (click)="addQuest()"
                  [disabled]="busy()"
                  class="flex-1 rounded-xl bg-coral py-2.5 text-sm font-bold text-ink disabled:opacity-50"
                >
                  Add it
                </button>
                <button (click)="adding.set(false)" class="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-muted-2">
                  Cancel
                </button>
              </div>
            </div>
          } @else {
            <button
              (click)="adding.set(true)"
              class="mt-6 rounded-2xl border-2 border-dashed border-line py-3.5 text-sm font-bold text-muted-2"
            >
              + Add a quest
            </button>
          }

          <!-- ============ finish ============ -->
          @if (isOwner()) {
            <div class="mt-8 flex flex-col gap-2.5 border-t border-line pt-6">
              <button
                (click)="finish('completed')"
                [disabled]="busy()"
                class="font-display rounded-2xl bg-gradient-to-br from-green to-gold py-3.5 text-lg font-semibold text-ink disabled:opacity-50"
              >
                🎊 Complete the adventure
              </button>
              <button
                (click)="confirmCancel.set(true)"
                class="rounded-2xl border border-line py-3 text-sm font-bold text-muted-2"
              >
                Cancel the adventure
              </button>
            </div>
          }
        }
      </div>

      <!-- are-you-sure for killing the whole thing -->
      @if (confirmCancel()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-6 backdrop-blur-sm">
          <div class="w-full max-w-xs rounded-3xl border border-line bg-surface p-7 text-center">
            <div class="text-6xl" [class.motion-safe:animate-bounce]="pooped()">
              {{ pooped() ? '💩' : '😃' }}
            </div>
            @if (pooped()) {
              <h2 class="font-display mt-4 text-3xl font-bold text-coral">Party Pooper!</h2>
              <p class="mt-1 text-sm text-muted-2">Calling the whole thing off…</p>
            } @else {
              <h2 class="font-display mt-4 text-2xl font-semibold">Cancel the adventure?</h2>
              <p class="mt-1.5 text-sm text-muted-2">
                Every quest that hasn't been decided gets cancelled too.
              </p>
              <div class="mt-6 flex flex-col gap-2.5">
                <button (click)="poop()" class="font-display rounded-2xl bg-coral py-3.5 text-lg font-semibold text-ink">
                  Yes, cancel it
                </button>
                <button (click)="confirmCancel.set(false)" class="py-2 text-sm font-bold text-muted-2">
                  Never mind
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- ============ per-quest card ============ -->
      <ng-template #questCard let-q let-scheduled="scheduled" let-index="index">
        <div class="rounded-2xl border border-line bg-surface p-4">
          <div class="flex items-start gap-3">
            <!-- decided quests show what won; undecided show the domain -->
            @if (q.activity?.image_url) {
              <img
                [src]="q.activity.image_url"
                [alt]="q.activity.title"
                class="h-16 w-11 flex-none rounded-lg object-cover shadow"
              />
            } @else {
              <span class="text-2xl">{{ emojiFor(q.domain) }}</span>
            }
            <a [routerLink]="['/party', q.id]" class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold">{{ q.title ?? domainLabel(q.domain) + ' quest' }}</p>
              <p class="truncate text-[11px] text-muted">
                @if (q.scheduled_at) {
                  {{ time(q.scheduled_at) }}@if (q.scheduled_end) {
                    –{{ time(q.scheduled_end) }}
                  }
                  ·
                }
                {{ statusLabel(q.status) }}
                @if (q.activity) {
                  · <span class="font-bold text-gold">{{ q.activity.title }}</span>
                }
              </p>
            </a>
            @if (!scheduled && adv.adventure()?.status === 'planning') {
              <div class="flex flex-none flex-col">
                <button (click)="adv.move(id(), q.id, -1)" [disabled]="index === 0" aria-label="Move up" class="px-1.5 text-xs text-muted-2 disabled:opacity-25">▲</button>
                <button (click)="adv.move(id(), q.id, 1)" [disabled]="index === adv.unscheduled().length - 1" aria-label="Move down" class="px-1.5 text-xs text-muted-2 disabled:opacity-25">▼</button>
              </div>
            }
          </div>

          @if (adv.adventure()?.status === 'planning') {
            <div class="mt-3 flex items-center gap-2">
              @if (editingTime() === q.id) {
                <!-- the actual picker, revealed on demand -->
                <input
                  type="datetime-local"
                  [value]="localValue(q.scheduled_at)"
                  (change)="setTime(q, $event)"
                  class="min-w-0 flex-1 rounded-xl border border-gold/50 bg-bg-warm px-2.5 py-2 text-xs text-cream focus:border-gold focus:outline-none"
                />
                <button (click)="editingTime.set(null)" class="flex-none rounded-xl border border-line px-2.5 py-2 text-xs font-bold text-muted-2">
                  Done
                </button>
              } @else if (q.scheduled_at) {
                <button
                  (click)="editingTime.set(q.id)"
                  class="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-line px-2.5 py-2 text-left text-xs font-bold text-cream"
                >
                  🕑 <span class="truncate">{{ when(q.scheduled_at) }} · {{ time(q.scheduled_at) }}</span>
                  <span class="ml-auto flex-none font-normal text-muted-2">change</span>
                </button>
                <button
                  (click)="adv.schedule(id(), q.id, null, null)"
                  class="flex-none rounded-xl border border-line px-2.5 py-2 text-xs font-bold text-muted-2"
                >
                  → Whenever
                </button>
              } @else {
                <button
                  (click)="editingTime.set(q.id)"
                  class="flex-1 rounded-xl border border-dashed border-gold/50 px-2.5 py-2 text-xs font-bold text-gold"
                >
                  📅 Pick a date & time
                </button>
              }
              <button (click)="remove(q)" aria-label="Remove quest" class="flex-none rounded-xl border border-line px-2.5 py-2 text-xs font-bold text-muted-2">
                ✕
              </button>
            </div>
          }
        </div>
      </ng-template>
    } @else {
      <div class="flex min-h-dvh items-center justify-center">
        <div class="size-10 animate-spin rounded-full border-4 border-surface-2 border-t-coral"></div>
      </div>
    }
  `,
})
export class AdventurePage implements OnDestroy {
  protected readonly adv = inject(AdventureService);
  private readonly auth = inject(AuthService);
  private readonly platform = inject(PlatformService);
  private readonly router = inject(Router);
  private readonly slots = inject(SlotsService);

  readonly id = input.required<string>();

  // ---- trip settings (v0.14) ----
  protected readonly tripPickerOpen = signal(false);

  /** My slots (any domain) pinned within ~60 miles of the trip city. */
  protected readonly suggestedSlots = computed<RadarSlot[]>(() => {
    const loc = this.adv.adventure()?.location;
    if (!loc) return [];
    return this.slots
      .slots()
      .filter((s) => {
        if (!s.location || !s.items.length) return false;
        const mi = distanceMiles({ lat: loc.lat, lng: loc.lng }, s.location);
        return mi !== null && mi <= 60;
      })
      .slice(0, 6);
  });

  protected setTripLocation(pick: CityPick) {
    void this.adv.setTrip(this.id(), { location: pick });
  }

  protected setDates(a: AdventureSummary, field: 'starts_on' | 'ends_on', event: Event) {
    const value = (event.target as HTMLInputElement).value || null;
    void this.adv.setTrip(this.id(), { [field]: value });
  }

  /** Turn a location-matched slot into a quest in its own domain. */
  protected async questFromSlot(s: RadarSlot) {
    this.busy.set(true);
    await this.adv.addQuest(this.id(), s.config?.domain ?? 'watch', s.name);
    this.busy.set(false);
  }

  protected dateRange(a: AdventureSummary): string | null {
    if (!a.starts_on) return null;
    const fmt = (d: string) =>
      new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return a.ends_on && a.ends_on !== a.starts_on
      ? `${fmt(a.starts_on)}–${fmt(a.ends_on)}`
      : fmt(a.starts_on);
  }

  protected readonly domains = DOMAINS;
  protected readonly adding = signal(false);
  protected readonly newDomain = signal<Domain>('eat');
  protected newTitle = '';
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  protected readonly confirmCancel = signal(false);
  protected readonly pooped = signal(false);
  /** Quest id whose datetime picker is open (one at a time keeps it calm). */
  protected readonly editingTime = signal<string | null>(null);

  private readonly openOnIdChange = effect(() => {
    void this.adv.open(this.id());
  });

  constructor() {
    this.slots.load(); // for the location-matched quest suggestions
  }

  ngOnDestroy() {
    this.adv.close();
  }

  protected isOwner(): boolean {
    return this.adv.adventure()?.owner_id === this.auth.user()?.id;
  }

  protected names(): string {
    const list = this.adv.members().map((m) => m.profile?.display_name ?? 'someone');
    if (list.length <= 1) return list[0] ?? 'you';
    return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  }

  protected emojiFor(domain: Domain): string {
    return DOMAINS.find((d) => d.id === domain)?.emoji ?? '🎬';
  }

  protected domainLabel(domain: Domain): string {
    return DOMAINS.find((d) => d.id === domain)?.label ?? 'Watch';
  }

  protected statusLabel(status: PartyStatus): string {
    return STATUS_LABELS[status];
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /** `datetime-local` wants a local-clock string, not the ISO/UTC one. */
  protected localValue(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  protected setTime(q: AdventureQuest, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.editingTime.set(null); // picking a value closes the picker
    void this.adv.schedule(this.id(), q.id, value ? new Date(value).toISOString() : null, null);
  }

  protected async remove(q: AdventureQuest) {
    await this.adv.removeQuest(this.id(), q.id);
  }

  protected async addQuest() {
    this.busy.set(true);
    const partyId = await this.adv.addQuest(this.id(), this.newDomain(), this.newTitle);
    this.busy.set(false);
    if (partyId) {
      this.adding.set(false);
      this.newTitle = '';
    }
  }

  protected async shareLink(code: string) {
    const result = await this.platform
      .share({
        title: 'Join my Radar adventure',
        text: `Join with code ${code}`,
        url: `${location.origin}/party/join?code=${code}`,
      })
      .catch(() => null); // share sheet dismissed
    if (result === 'copied') {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  protected poop() {
    this.pooped.set(true);
    setTimeout(() => void this.finish('cancelled'), 1400);
  }

  protected async finish(status: 'completed' | 'cancelled') {
    this.busy.set(true);
    const ok = await this.adv.finish(this.id(), status);
    this.busy.set(false);
    this.confirmCancel.set(false);
    this.pooped.set(false);
    if (ok && status === 'cancelled') await this.router.navigate(['/party']);
  }
}
