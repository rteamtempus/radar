import { Component } from '@angular/core';

/**
 * Milestone 4: calibration deck (24 seed titles, Loved / Meh / Haven't seen /
 * Never would, skippable after 12) + streaming subscriptions checklist.
 */
@Component({
  selector: 'pp-onboarding-page',
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <div class="text-4xl">🎬</div>
      <h1 class="font-display text-2xl font-semibold">Taste calibration</h1>
      <p class="text-sm text-muted-2">Coming in milestone 4 — the swipeable calibration deck and subscriptions checklist.</p>
    </div>
  `,
})
export class OnboardingPage {}
