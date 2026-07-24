import { Component } from '@angular/core';

/**
 * Milestones 5–7: subscribes to the party's Realtime channel and renders the
 * right stage for parties.status:
 *   gathering → lobby + mood check-in · swiping → swipe deck
 *   voting → vote grid · decided → reveal · completed → outcome
 */
@Component({
  selector: 'pp-party-shell-page',
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <div class="text-4xl">🛋️</div>
      <h1 class="font-display text-2xl font-semibold">Party room</h1>
      <p class="text-sm text-muted-2">Coming in milestones 5–7 — lobby, mood, swipe, vote, reveal.</p>
    </div>
  `,
})
export class PartyShellPage {}
