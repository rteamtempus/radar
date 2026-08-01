import { Component, computed, inject, input, output, signal } from '@angular/core';
import { PlatformService } from '../../core/platform/platform.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { PartyCandidate, SwipeDirection } from './party.service';

const COMMIT_THRESHOLD_PX = 90;

/**
 * The group swipe deck (wireframe 06): full-bleed card with service badges and
 * a how-many-left counter. Drag with pointer events (rotate + translate) or use
 * the ✕ / ★ / ♥ buttons; 🚫 veto is anonymous and single-use.
 *
 * v0.11 dropped the fit ring and the AI blurb along with the scoring pipeline —
 * the deck is everyone's picked slots now, so there's no score to show.
 */
@Component({
  selector: 'pp-swipe-deck',
  imports: [ServiceBadges],
  template: `
    <div class="relative flex-1" style="min-height: 380px">
      <!-- next card peeking behind -->
      @if (deck()[1]; as next) {
        <div class="absolute inset-0 translate-y-2.5 scale-95 overflow-hidden rounded-3xl bg-surface opacity-60">
          @if (next.activity.image_url) {
            <img [src]="next.activity.image_url" class="size-full object-cover" [alt]="''" />
          }
        </div>
      }

      @if (top(); as c) {
        <div
          class="absolute inset-0 touch-none overflow-hidden overscroll-none rounded-3xl bg-surface shadow-2xl select-none will-change-transform"
          [style.transform]="cardTransform()"
          [style.transition]="dragging() ? 'none' : 'transform .25s ease'"
          (pointerdown)="onDown($event)"
          (pointermove)="onMove($event)"
          (pointerup)="onUp()"
          (pointercancel)="onCancel()"
        >
          @if (c.activity.image_url) {
            <img
              [src]="c.activity.image_url"
              [alt]="c.activity.title"
              class="pointer-events-none absolute inset-0 size-full object-cover"
              draggable="false"
            />
          }
          <div
            class="absolute top-4 right-4 rounded-full bg-bg/70 px-3 py-1.5 text-xs font-bold text-cream backdrop-blur"
          >
            {{ deck().length }} left
          </div>
          @if (dx() > 30) {
            <div class="absolute top-6 left-6 rotate-[-12deg] rounded-xl border-4 border-green px-3 py-1 font-display text-2xl font-bold text-green">
              YES
            </div>
          } @else if (dx() < -30) {
            <div class="absolute top-6 right-24 rotate-[12deg] rounded-xl border-4 border-coral px-3 py-1 font-display text-2xl font-bold text-coral">
              NOPE
            </div>
          }
          <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/95 via-bg/60 to-transparent p-5 pt-20">
            <div class="font-display text-3xl font-bold drop-shadow">{{ c.activity.title }}</div>
            <div class="mt-1 text-sm font-bold text-muted-2">{{ subtitle(c) }}</div>
            <pp-service-badges
              class="mt-3"
              [services]="servicesOf(c)"
              [highlight]="highlight()"
            />
          </div>
        </div>
      }
    </div>

    <div class="flex items-center justify-center gap-4 pt-5 pb-2">
      <button
        (click)="commit('left')"
        class="flex size-15 items-center justify-center rounded-full border-2 border-line bg-surface text-2xl text-coral"
        aria-label="No"
      >
        ✕
      </button>
      <button
        (click)="commit('super')"
        class="flex size-12 items-center justify-center rounded-full border-2 border-violet bg-violet/15 text-xl text-violet"
        aria-label="Super like"
      >
        ★
      </button>
      <button
        (click)="commit('right')"
        class="flex size-15 items-center justify-center rounded-full bg-green text-2xl text-ink"
        aria-label="Yes"
      >
        ♥
      </button>
    </div>
    <div class="pb-1 text-center">
      @if (vetoAvailable()) {
        <button (click)="doVeto()" class="text-sm font-bold text-muted">
          🚫 Veto this one <span class="text-muted/60">(anonymous)</span>
        </button>
      } @else {
        <span class="text-xs font-bold text-muted/50">veto used</span>
      }
    </div>
  `,
  host: { class: 'flex flex-col flex-1' },
})
export class SwipeDeck {
  private readonly platformService = inject(PlatformService);

  readonly deck = input.required<PartyCandidate[]>();
  readonly vetoAvailable = input(false);
  readonly highlight = input<string[] | null>(null);
  readonly decision = output<{ candidateId: string; direction: SwipeDirection }>();
  readonly veto = output<string>();

  protected readonly top = computed(() => this.deck()[0]);
  protected readonly dx = signal(0);
  protected readonly dragging = signal(false);
  private startX = 0;
  private flying = false;

  protected readonly cardTransform = computed(
    () => `translateX(${this.dx()}px) rotate(${this.dx() * 0.06}deg)`,
  );

  protected onDown(e: PointerEvent) {
    if (this.flying) return;
    this.dragging.set(true);
    this.startX = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  protected onMove(e: PointerEvent) {
    if (!this.dragging() || this.flying) return;
    this.dx.set(e.clientX - this.startX);
  }

  protected onUp() {
    if (!this.dragging()) return;
    this.dragging.set(false);
    const dx = this.dx();
    if (Math.abs(dx) >= COMMIT_THRESHOLD_PX) this.commit(dx > 0 ? 'right' : 'left');
    else this.dx.set(0);
  }

  protected onCancel() {
    this.dragging.set(false);
    this.dx.set(0);
  }

  protected commit(direction: SwipeDirection) {
    const c = this.top();
    if (!c || this.flying) return;
    this.platformService.haptic('light');
    this.flying = true;
    this.dx.set(direction === 'left' ? -600 : 600);
    setTimeout(() => {
      this.decision.emit({ candidateId: c.id, direction });
      this.dx.set(0);
      this.flying = false;
    }, 180);
  }

  protected doVeto() {
    const c = this.top();
    if (!c || this.flying) return;
    this.platformService.haptic('warning');
    this.flying = true;
    this.dx.set(-600);
    setTimeout(() => {
      this.veto.emit(c.id);
      this.dx.set(0);
      this.flying = false;
    }, 180);
  }

  protected servicesOf(c: PartyCandidate) {
    return (c.activity.activity_availability ?? []).map((a) => a.service);
  }

  protected subtitle(c: PartyCandidate): string {
    const parts: string[] = [];
    if (c.activity.metadata?.release_year) parts.push(String(c.activity.metadata.release_year));
    parts.push(c.activity.type === 'movie' ? 'Movie' : 'Series');
    if (c.activity.duration_min) {
      parts.push(
        c.activity.type === 'movie'
          ? `${Math.floor(c.activity.duration_min / 60)}h ${c.activity.duration_min % 60}m`
          : `~${c.activity.duration_min}m/ep`,
      );
    }
    return parts.join(' · ');
  }
}
