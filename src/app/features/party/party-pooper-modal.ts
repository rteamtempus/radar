import { Component, output, signal } from '@angular/core';

/**
 * "Are you sure?" for bailing on a quest. Confirming does NOT close straight
 * away — the happy face flips to 💩 and the modal sits there calling you a
 * party pooper for a beat before the cancel actually fires. Leaning into
 * silly on purpose.
 */
@Component({
  selector: 'pp-party-pooper-modal',
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-6 backdrop-blur-sm">
      <div class="w-full max-w-xs rounded-3xl border border-line bg-surface p-7 text-center">
        <div class="text-6xl" [class.motion-safe:animate-bounce]="pooped()">
          {{ pooped() ? '💩' : '😃' }}
        </div>

        @if (pooped()) {
          <h2 class="font-display mt-4 text-3xl font-bold text-coral">Party Pooper!</h2>
          <p class="mt-1 text-sm text-muted-2">Cancelling the quest…</p>
        } @else {
          <h2 class="font-display mt-4 text-2xl font-semibold">Cancel the quest?</h2>
          <p class="mt-1.5 text-sm text-muted-2">
            Everyone's picks and swipes go with it. No take-backs.
          </p>
          <div class="mt-6 flex flex-col gap-2.5">
            <button
              (click)="confirm()"
              class="rounded-2xl bg-coral py-3.5 font-display text-lg font-semibold text-ink"
            >
              Yes, cancel it
            </button>
            <button (click)="dismissed.emit()" class="py-2 text-sm font-bold text-muted-2">
              Never mind, carry on
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class PartyPooperModal {
  /** Fires after the 💩 beat — the parent does the actual cancelling. */
  readonly confirmed = output<void>();
  readonly dismissed = output<void>();

  protected readonly pooped = signal(false);

  protected confirm() {
    if (this.pooped()) return;
    this.pooped.set(true);
    setTimeout(() => this.confirmed.emit(), 1400);
  }
}
