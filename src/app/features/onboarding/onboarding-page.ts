import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { ActivitySummary } from '../library/library.service';
import { CalibrationVerdict, OnboardingService } from './onboarding.service';

type Step = 'name' | 'deck' | 'subs';
const SKIPPABLE_AFTER = 12;

@Component({
  selector: 'pp-onboarding-page',
  imports: [FormsModule, ServiceBadges],
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      @switch (step()) {
        <!-- ============ step 1: name ============ -->
        @case ('name') {
          <div class="flex flex-1 flex-col justify-center gap-6">
            <div class="text-center">
              <div class="mb-3 text-4xl">👋</div>
              <h1 class="font-display text-3xl font-semibold">What should we call you?</h1>
              <p class="mt-2 text-sm text-muted-2">Your friends see this in parties.</p>
            </div>
            <input
              type="text"
              maxlength="30"
              [(ngModel)]="name"
              class="rounded-2xl border border-line bg-surface px-4 py-3.5 text-center text-lg font-bold text-cream focus:border-coral focus:outline-none"
            />
            <button
              (click)="submitName()"
              [disabled]="!name.trim()"
              class="rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        }

        <!-- ============ step 2: calibration deck ============ -->
        @case ('deck') {
          @if (!deck().length) {
            <div class="flex flex-1 flex-col items-center justify-center gap-4">
              <div class="size-10 animate-spin rounded-full border-4 border-surface-2 border-t-coral"></div>
              <p class="text-sm font-bold text-muted-2">Warming up the projector…</p>
            </div>
          } @else if (card(); as c) {
            <div class="flex items-center justify-between">
              <div class="h-1.5 flex-1 rounded-full bg-surface-2">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-coral to-gold transition-all"
                  [style.width.%]="(index() / deck().length) * 100"
                ></div>
              </div>
              @if (index() >= skippableAfter) {
                <button (click)="finishDeck()" class="ml-4 text-sm font-bold text-muted-2">
                  Skip →
                </button>
              }
            </div>

            <div class="mt-5 text-center">
              <h1 class="font-display text-2xl font-semibold">Seen this one?</h1>
              <p class="mt-1 text-xs font-bold text-muted">
                Card {{ index() + 1 }} of {{ deck().length }}
                @if (index() < skippableAfter) {
                  · skippable after {{ skippableAfter }}
                }
              </p>
            </div>

            <div class="relative mt-4 flex-1 overflow-hidden rounded-3xl bg-surface shadow-2xl">
              @if (c.image_url) {
                <img [src]="c.image_url" [alt]="c.title" class="absolute inset-0 size-full object-cover" />
              }
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/95 to-transparent p-5 pt-16">
                <div class="font-display text-2xl font-bold drop-shadow">{{ c.title }}</div>
                <div class="mt-1 text-sm font-bold text-muted-2">{{ cardSubtitle(c) }}</div>
              </div>
            </div>

            <div class="mt-5 grid grid-cols-2 gap-3">
              <button
                (click)="answer('loved')"
                class="flex flex-col items-center gap-1 rounded-2xl border-2 border-green bg-green/10 py-3.5 font-bold text-green"
              >
                <span class="text-xl">♥</span> Loved it
              </button>
              <button
                (click)="answer('meh')"
                class="flex flex-col items-center gap-1 rounded-2xl border-2 border-gold bg-gold/10 py-3.5 font-bold text-gold"
              >
                <span class="text-xl">😐</span> Meh
              </button>
              <button
                (click)="answer('unseen')"
                class="flex flex-col items-center gap-1 rounded-2xl border-2 border-line py-3.5 font-bold text-muted-2"
              >
                <span class="text-xl">👀</span> Haven't seen
              </button>
              <button
                (click)="answer('never')"
                class="flex flex-col items-center gap-1 rounded-2xl border-2 border-line py-3.5 font-bold text-muted"
              >
                <span class="text-xl">🙅</span> Never would
              </button>
            </div>
            <p class="mt-3 text-center text-xs text-muted">Never seen it? No judgment.</p>
          }
        }

        <!-- ============ step 3: subscriptions ============ -->
        @case ('subs') {
          <div class="flex flex-1 flex-col gap-6 pt-6">
            <div class="text-center">
              <div class="mb-3 text-4xl">📺</div>
              <h1 class="font-display text-3xl font-semibold">What do you pay for?</h1>
              <p class="mt-2 text-sm text-muted-2">
                Parties only suggest things everyone can actually watch.
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              @for (s of subs.services(); track s.id) {
                <button
                  (click)="subs.toggle(s.id)"
                  class="flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left font-bold"
                  [class]="
                    subs.mine().has(s.id)
                      ? 'border-green bg-green/10 text-cream'
                      : 'border-line text-muted-2'
                  "
                >
                  <pp-service-badges [services]="[s]" />
                  <span class="min-w-0 flex-1 truncate text-sm">{{ s.name }}</span>
                  @if (subs.mine().has(s.id)) {
                    <span class="text-green">✓</span>
                  }
                </button>
              }
            </div>
            <button
              (click)="finish()"
              [disabled]="finishing()"
              class="mt-auto rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
            >
              {{ finishing() ? 'Saving…' : "Let's go →" }}
            </button>
            <p class="-mt-3 text-center text-xs text-muted">You can change these anytime in You.</p>
          </div>
        }
      }
    </div>
  `,
})
export class OnboardingPage {
  private auth = inject(AuthService);
  private onboarding = inject(OnboardingService);
  private router = inject(Router);
  protected readonly subs = inject(SubscriptionsService);

  protected readonly skippableAfter = SKIPPABLE_AFTER;
  protected readonly step = signal<Step>('name');
  protected name = '';

  protected readonly deck = signal<ActivitySummary[]>([]);
  protected readonly index = signal(0);
  protected readonly card = computed<ActivitySummary | undefined>(
    () => this.deck()[this.index()],
  );
  protected readonly finishing = signal(false);

  constructor() {
    this.name = this.auth.defaultDisplayName();
    // Start hydrating the deck + services while the user types their name.
    this.onboarding.loadDeck().then((deck) => this.deck.set(deck));
    this.subs.load();
  }

  protected async submitName() {
    await this.auth.updateDisplayName(this.name.trim());
    this.step.set('deck');
  }

  protected answer(verdict: CalibrationVerdict) {
    const c = this.card();
    if (!c) return;
    this.onboarding.answer(c.id, verdict); // fire-and-forget; deck keeps moving
    if (this.index() + 1 >= this.deck().length) this.finishDeck();
    else this.index.update((i) => i + 1);
  }

  protected finishDeck() {
    this.onboarding.finishDeck(); // recompute affinities in the background
    this.step.set('subs');
  }

  protected async finish() {
    this.finishing.set(true);
    try {
      await this.auth.markOnboarded();
      this.router.navigateByUrl('/radar');
    } finally {
      this.finishing.set(false);
    }
  }

  protected cardSubtitle(a: ActivitySummary): string {
    const parts: string[] = [];
    if (a.metadata?.release_year) parts.push(String(a.metadata.release_year));
    parts.push(a.type === 'movie' ? 'Movie' : 'Series');
    return parts.join(' · ');
  }
}
