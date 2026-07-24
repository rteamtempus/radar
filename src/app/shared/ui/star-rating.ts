import { Component, input, output } from '@angular/core';

/** 1–10 star row (wireframe: inline rating on Done cards). */
@Component({
  selector: 'pp-star-rating',
  template: `
    @for (n of scale; track n) {
      <button
        type="button"
        class="text-lg leading-none"
        [class.text-gold]="n <= (rating() ?? 0)"
        [class.text-surface-2]="n > (rating() ?? 0)"
        [attr.aria-label]="'Rate ' + n + ' of 10'"
        (click)="rated.emit(n)"
      >
        ★
      </button>
    }
  `,
  host: { class: 'flex gap-0.5' },
})
export class StarRating {
  readonly scale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly rating = input<number | null>(null);
  readonly rated = output<number>();
}
