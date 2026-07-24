import { Component, computed, input } from '@angular/core';

/** SVG arc "% FIT" ring, coral→gold (wireframe component kit). */
@Component({
  selector: 'pp-score-ring',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 120 120">
      <defs>
        <linearGradient [id]="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff6f5e" />
          <stop offset="1" stop-color="#ffc24b" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill="rgba(8,6,5,.5)" stroke="rgba(255,255,255,.14)" stroke-width="9" />
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="none"
        [attr.stroke]="'url(#' + gradientId + ')'"
        stroke-width="9"
        stroke-linecap="round"
        stroke-dasharray="339"
        [attr.stroke-dashoffset]="339 - (339 * percent()) / 100"
        transform="rotate(-90 60 60)"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="font-display font-bold text-white" [style.font-size.px]="size() / 3">{{ percent() }}</span>
      <span class="text-[7px] font-bold text-gold/80">% FIT</span>
    </div>
  `,
  host: { class: 'relative block', '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
})
export class ScoreRing {
  private static nextId = 0;
  protected readonly gradientId = `ppRing${ScoreRing.nextId++}`;

  /** final_score, displayed as a percentage (clamped 0–100). */
  readonly score = input.required<number | null>();
  readonly size = input(62);

  protected readonly percent = computed(() =>
    Math.max(0, Math.min(100, Math.round((this.score() ?? 0) * 100))),
  );
}
