import { Component, computed, input } from '@angular/core';

/**
 * Spotify-style 2×2 cover collage for a slot (idea #1) — built from the
 * first item images, zero owner effort. Fewer than 4 images degrade
 * gracefully; none at all shows the slot emoji.
 */
@Component({
  selector: 'pp-slot-collage',
  template: `
    @if (covers().length) {
      <div class="grid size-full grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-xl bg-bg">
        @for (src of covers(); track $index) {
          <img [src]="src" alt="" loading="lazy" class="size-full object-cover" />
        }
        @for (blank of blanks(); track $index) {
          <div class="size-full bg-surface-2"></div>
        }
      </div>
    } @else {
      <div class="flex size-full items-center justify-center rounded-xl bg-surface-2 text-2xl">
        {{ emoji() ?? '🎬' }}
      </div>
    }
  `,
  host: { class: 'block' },
})
export class SlotCollage {
  readonly images = input<(string | null | undefined)[]>([]);
  readonly emoji = input<string | null>(null);

  protected readonly covers = computed(() =>
    this.images()
      .filter((i): i is string => !!i)
      .slice(0, 4),
  );
  protected readonly blanks = computed(() => {
    const n = this.covers().length;
    return n > 0 && n < 4 ? Array.from({ length: 4 - n }) : [];
  });
}
