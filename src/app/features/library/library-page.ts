import { Component, signal } from '@angular/core';

type LibraryTab = 'in_progress' | 'want_to' | 'completed';

/**
 * Milestone 3: search (via tmdb-search edge function), add titles, statuses,
 * ratings, availability badges. This is the placeholder shell with the tab
 * structure from wireframe 02.
 */
@Component({
  selector: 'pp-library-page',
  template: `
    <div class="mx-auto max-w-md px-5 py-6">
      <h1 class="font-display text-3xl font-semibold">My Library</h1>

      <div class="mt-4 flex gap-1.5 rounded-2xl bg-surface p-1.5">
        @for (t of tabs; track t.key) {
          <button
            (click)="tab.set(t.key)"
            class="flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors"
            [class]="tab() === t.key ? 'bg-coral text-ink' : 'text-muted-2'"
          >
            {{ t.label }}
          </button>
        }
      </div>

      <div class="mt-10 flex flex-col items-center gap-3 text-center">
        <div class="text-4xl">🍿</div>
        <p class="font-bold">Nothing here yet</p>
        <p class="max-w-60 text-sm text-muted-2">
          Search will land in milestone 3 — then you can add your first title.
        </p>
      </div>
    </div>
  `,
})
export class LibraryPage {
  protected readonly tabs = [
    { key: 'in_progress' as LibraryTab, label: 'Watching' },
    { key: 'want_to' as LibraryTab, label: 'Want To' },
    { key: 'completed' as LibraryTab, label: 'Done' },
  ];
  protected readonly tab = signal<LibraryTab>('in_progress');
}
