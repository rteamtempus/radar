import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../core/platform/platform.service';
import { SERVICE_HOMEPAGES } from '../../core/streaming-links';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { PartyCandidate, PartyService } from './party.service';
import { SwipeDeck } from './swipe-deck';

/**
 * The live party room. Renders the stage for parties.status; every client
 * follows along via the party's realtime channel (handoff §6.3):
 *   gathering → lobby + mood · swiping → deck · voting → point grid ·
 *   decided → reveal · completed → thanks
 */
@Component({
  selector: 'pp-party-shell-page',
  imports: [FormsModule, ServiceBadges, SwipeDeck],
  template: `
    @if (party.party(); as p) {
      <div class="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
        @switch (p.status) {
          @case ('gathering') {
            <!-- ============ lobby ============ -->
            <h1 class="font-display text-3xl font-semibold">The lobby</h1>
            <p class="mt-1 text-sm text-muted-2">
              {{
                party.members().length === 1
                  ? 'Waiting for friends… share the code'
                  : party.members().length + ' in so far'
              }}
            </p>

            <div class="mt-5 rounded-3xl border border-line bg-surface p-6 text-center">
              <p class="text-xs font-bold tracking-wide text-muted uppercase">Join code</p>
              <p class="mt-1 font-display text-4xl font-bold tracking-[0.25em] text-gold">
                {{ p.join_code }}
              </p>
              <button
                (click)="shareLink()"
                class="mt-3 rounded-full border border-line px-4 py-2 text-xs font-bold text-muted-2"
              >
                {{ copied() ? '✓ Link copied' : '📤 Share invite link' }}
              </button>
              <p class="mt-3 text-xs text-muted">
                No rush — people can join and swipe whenever. Text the link and check back.
              </p>
            </div>

            <div class="mt-6 flex flex-col gap-2.5">
              @for (m of party.members(); track m.id) {
                <div class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                  <span
                    class="flex size-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold text-sm font-extrabold text-ink"
                  >
                    {{ initial(m.profile?.display_name) }}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-sm font-bold">
                    {{ m.profile?.display_name ?? 'Someone' }}
                    @if (m.role === 'host') {
                      <span class="text-muted">· host</span>
                    }
                  </span>
                  @if (isReady(m.id)) {
                    <span class="text-xs font-bold text-green">✓ ready</span>
                  } @else {
                    <span class="text-xs font-bold text-muted">thinking…</span>
                  }
                </div>
              }
            </div>

            <!-- ============ mood check-in ============ -->
            @if (!party.myCheckin()) {
              <h2 class="mt-8 font-display text-xl font-semibold">How are you feeling?</h2>
              <p class="mt-1 text-xs font-bold text-muted">
                Pick up to 3 · <span class="text-gold">{{ vibeIds().size }} of 3</span>
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                @for (v of party.vibes(); track v.id) {
                  <button
                    (click)="toggleVibe(v.id)"
                    class="rounded-full border-2 px-4 py-2 text-sm font-bold"
                    [class]="
                      vibeIds().has(v.id) ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted-2'
                    "
                  >
                    {{ v.label }}
                  </button>
                }
              </div>

              <p class="mt-5 text-xs font-bold tracking-wide text-muted uppercase">Energy level</p>
              <input type="range" min="1" max="5" step="1" [(ngModel)]="energy" class="mt-2 w-full accent-gold" />
              <div class="flex justify-between text-xs font-bold text-muted">
                <span>😴 Comatose</span>
                <span class="text-gold">{{ energy }}/5</span>
                <span>Bouncing 🤸</span>
              </div>

              <input
                type="text"
                maxlength="120"
                [(ngModel)]="freeText"
                placeholder="Optional: “something like Severance but funnier”"
                class="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
              />

              <button
                (click)="submitMood()"
                [disabled]="busy()"
                class="mt-4 rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
              >
                I'm ready ✓
              </button>
            } @else {
              <div class="mt-8 rounded-2xl border border-green/40 bg-green/10 p-4 text-center">
                <p class="font-bold text-green">You're checked in ✓</p>
                <p class="mt-1 text-xs text-muted-2">
                  {{ party.readyCount() }} of {{ party.members().length }} ready
                </p>
              </div>
            }

            @if (party.isHost()) {
              <div class="mt-6">
                <button
                  (click)="generate()"
                  [disabled]="busy() || party.readyCount() === 0"
                  class="w-full rounded-2xl border-2 border-coral py-3.5 font-display text-lg font-semibold text-coral disabled:opacity-40"
                >
                  {{ busy() ? 'Summoning suggestions… (~20s)' : '✨ Generate suggestions' }}
                </button>
                @if (party.readyCount() < party.members().length) {
                  <p class="mt-2 text-center text-xs text-muted">
                    Not everyone's checked in — you can start anyway.
                  </p>
                }
              </div>
            }
          }

          @case ('swiping') {
            <!-- ============ swipe deck ============ -->
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-bold text-muted-2">Swiping together</span>
              <span class="text-xs font-bold text-muted">
                {{ party.finishedCount() }} of {{ party.members().length }} done
              </span>
            </div>
            <div class="mb-4 h-1.5 rounded-full bg-surface-2">
              <div
                class="h-full rounded-full bg-gradient-to-r from-green to-gold transition-all"
                [style.width.%]="
                  party.members().length ? (party.finishedCount() / party.members().length) * 100 : 0
                "
              ></div>
            </div>

            @if (party.myDeck().length) {
              <pp-swipe-deck
                [deck]="party.myDeck()"
                [vetoAvailable]="!party.myVetoUsed()"
                [highlight]="subs.mySlugs()"
                (decision)="party.swipe($event.candidateId, $event.direction)"
                (veto)="party.veto($event)"
              />
            } @else {
              <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div class="text-4xl">🎉</div>
                <p class="font-bold">You're done swiping!</p>
                <p class="text-sm text-muted-2">
                  Waiting for the others… {{ party.finishedCount() }} of {{ party.members().length }} finished.
                </p>
              </div>
            }

            @if (party.isHost()) {
              <button
                (click)="party.advanceToVoting()"
                class="mt-4 w-full rounded-2xl py-3.5 font-display text-lg font-semibold"
                [class]="
                  party.finishedCount() === party.members().length
                    ? 'bg-gradient-to-br from-violet to-coral text-ink shadow-lg shadow-coral/35'
                    : 'border-2 border-line text-muted-2'
                "
              >
                {{
                  party.finishedCount() === party.members().length
                    ? 'Everyone’s done → Vote!'
                    : 'Skip ahead to voting →'
                }}
              </button>
            }
          }

          @case ('voting') {
            <!-- ============ vote grid ============ -->
            <h1 class="font-display text-2xl font-semibold">Final {{ party.survivors().length }} — vote!</h1>
            <div class="mt-1.5 mb-4 flex items-center gap-2.5">
              <span class="text-sm text-muted-2">Your votes:</span>
              @for (pip of votePips(); track $index) {
                <span
                  class="size-4 rounded-full border-2 border-gold"
                  [class.bg-gold]="pip"
                ></span>
              }
              <span class="text-sm font-bold text-gold">{{ party.myVotesLeft() }} left</span>
            </div>

            <div class="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto">
              @for (c of party.survivors(); track c.id) {
                <button
                  (click)="party.addVote(c.id)"
                  class="relative min-h-40 overflow-hidden rounded-2xl bg-surface text-left shadow-lg"
                >
                  @if (c.activity.image_url) {
                    <img [src]="c.activity.image_url" [alt]="c.activity.title" class="absolute inset-0 size-full object-cover" />
                  }
                  <div class="absolute top-2 right-2 flex gap-1">
                    @for (dot of totalDots(c.id); track $index) {
                      <span class="size-3.5 rounded-full border-2 border-bg/40 bg-gold"></span>
                    }
                  </div>
                  <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/95 to-transparent p-3 pt-8">
                    <div class="font-display font-bold drop-shadow">{{ c.activity.title }}</div>
                    @if (myPoints(c.id); as mine) {
                      <span
                        class="mt-1 inline-block rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-bold text-ink"
                        (click)="$event.stopPropagation(); party.removeVote(c.id)"
                      >
                        my {{ mine }} {{ mine === 1 ? 'vote' : 'votes' }} · tap to remove
                      </span>
                    }
                  </div>
                </button>
              }
            </div>

            @if (party.isHost()) {
              <button
                (click)="party.revealWinner()"
                class="mt-4 w-full rounded-2xl bg-gradient-to-br from-violet to-coral py-4 font-display text-lg font-semibold text-ink"
                [class.opacity-50]="!party.allVoted()"
              >
                Reveal the winner ✨
              </button>
            } @else {
              <p class="mt-4 text-center text-xs font-bold text-muted">
                The host reveals the winner when everyone's voted.
              </p>
            }
          }

          @case ('decided') {
            <!-- ============ reveal ============ -->
            <div class="relative flex flex-1 flex-col items-center overflow-hidden pt-4">
              @for (cf of confetti; track $index) {
                <span
                  class="pointer-events-none absolute top-0 rounded-sm"
                  [style.left.%]="cf.left"
                  [style.width.px]="cf.w"
                  [style.height.px]="cf.h"
                  [style.background]="cf.color"
                  [style.animation]="'ppConfetti ' + cf.dur + 's ' + cf.delay + 's ease-in forwards'"
                ></span>
              }
              <p class="font-display text-sm font-bold tracking-[0.2em] text-gold">TONIGHT'S PICK</p>
              @if (party.winnerCandidate(); as w) {
                <div class="relative mt-5 w-52 overflow-hidden rounded-3xl shadow-2xl">
                  <span
                    class="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gold px-3.5 py-1 text-xs font-bold whitespace-nowrap text-ink"
                    >👑 Winner</span
                  >
                  @if (w.activity.image_url) {
                    <img [src]="w.activity.image_url" [alt]="w.activity.title" class="aspect-[2/3] w-full object-cover" />
                  } @else {
                    <div class="aspect-[2/3] w-full bg-surface"></div>
                  }
                </div>
                <h1 class="mt-4 text-center font-display text-3xl font-bold">{{ w.activity.title }}</h1>
                <p class="mt-1 text-sm text-muted-2">The room agrees. Grab the popcorn.</p>

                @if (watchOn(w); as svc) {
                  <a
                    [href]="svc.url"
                    (click)="platform.openExternal(svc.url, $event)"
                    class="mt-6 w-full rounded-2xl bg-coral py-4 text-center font-display text-lg font-semibold text-ink shadow-lg shadow-coral/40"
                  >
                    ▶ Watch on {{ svc.name }}
                  </a>
                }
                <div class="mt-3 flex justify-center">
                  <pp-service-badges [services]="servicesOf(w)" [highlight]="subs.mySlugs()" />
                </div>
              } @else {
                <p class="mt-8 text-sm text-muted-2">Loading the winner…</p>
              }

              @if (party.isHost()) {
                <button
                  (click)="startOver()"
                  [disabled]="busy()"
                  class="mt-auto pt-6 text-sm font-bold text-muted-2 disabled:opacity-50"
                >
                  {{ busy() ? 'Summoning fresh picks…' : '↺ Start over with new suggestions' }}
                </button>
              }
            </div>
          }

          @default {
            <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="text-4xl">🏁</div>
              <h1 class="font-display text-2xl font-semibold">That's a wrap</h1>
              <p class="text-sm text-muted-2">This party is {{ p.status }}.</p>
            </div>
          }
        }
        @if (error()) {
          <p class="mt-3 text-center text-sm font-bold text-coral">{{ error() }}</p>
        }
      </div>
    } @else {
      <div class="flex min-h-dvh items-center justify-center">
        <div class="size-10 animate-spin rounded-full border-4 border-surface-2 border-t-coral"></div>
      </div>
    }
  `,
})
export class PartyShellPage implements OnDestroy {
  protected readonly party = inject(PartyService);
  protected readonly subs = inject(SubscriptionsService);
  protected readonly platform = inject(PlatformService);

  /** Route param. */
  readonly id = input.required<string>();

  protected energy = 3;
  protected freeText = '';
  protected readonly vibeIds = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly copied = signal(false);

  protected readonly confetti = Array.from({ length: 18 }, (_, i) => ({
    left: 4 + i * 5.2,
    w: 6 + (i % 3) * 3,
    h: 10 + (i % 2) * 6,
    color: ['#ff6f5e', '#ffc24b', '#7fce8f', '#b98cff', '#7fb6ce'][i % 5],
    dur: 1.6 + (i % 4) * 0.35,
    delay: (i % 5) * 0.12,
  }));

  private readonly openOnIdChange = effect(() => {
    this.party.open(this.id());
  });

  constructor() {
    this.subs.load();
  }

  ngOnDestroy() {
    this.party.close();
  }

  protected readonly isReady = (memberId: string) =>
    this.party.checkins().some((c) => c.member_id === memberId);

  protected readonly votePips = computed(() => {
    const used = 3 - this.party.myVotesLeft();
    return [0, 1, 2].map((i) => i < used);
  });

  protected initial(name: string | undefined | null): string {
    return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  }

  protected toggleVibe(id: string) {
    const next = new Set(this.vibeIds());
    if (next.has(id)) next.delete(id);
    else if (next.size < 3) next.add(id);
    this.vibeIds.set(next);
  }

  protected async shareLink() {
    const code = this.party.party()?.join_code;
    if (!code) return;
    const result = await this.platform
      .share({
        title: 'Join my Radar quest',
        text: `Join with code ${code}`,
        url: `${location.origin}/party/join?code=${code}`,
      })
      .catch(() => null); // user dismissed the share sheet
    if (result === 'copied') {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  protected async submitMood() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.party.submitMood(this.energy, [...this.vibeIds()], this.freeText);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not save your check-in');
    } finally {
      this.busy.set(false);
    }
  }

  protected async generate() {
    this.busy.set(true);
    this.error.set('');
    const { error } = await this.party.generateCandidates();
    if (error) this.error.set(error);
    this.busy.set(false);
  }

  protected async startOver() {
    this.busy.set(true);
    this.error.set('');
    const { error } = await this.party.generateCandidates();
    if (error) this.error.set(error);
    this.busy.set(false);
  }

  protected myPoints(candidateId: string): number {
    return this.party.myPointsByCandidate()[candidateId] ?? 0;
  }

  protected totalDots(candidateId: string): unknown[] {
    return Array.from({ length: Math.min(this.party.voteTotals()[candidateId] ?? 0, 8) });
  }

  protected servicesOf(c: PartyCandidate) {
    return (c.activity.activity_availability ?? []).map((a) => a.service);
  }

  protected watchOn(c: PartyCandidate): { name: string; url: string } | null {
    const services = this.servicesOf(c);
    if (!services.length) return null;
    const mine = this.subs.mySlugs();
    const best = services.find((s) => mine.includes(s.slug)) ?? services[0];
    return { name: best.name, url: SERVICE_HOMEPAGES[best.slug] ?? '#' };
  }
}
