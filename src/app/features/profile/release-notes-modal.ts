import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReleaseNote } from '../../core/release-notes';
import { ReleaseNoteCard } from '../../shared/ui/release-note-card';

/**
 * "What's new" — every release the user hasn't opened yet, in one modal.
 * Deliberately not one notification per release: you catch up in a single tap.
 */
@Component({
  selector: 'pp-release-notes-modal',
  imports: [RouterLink, ReleaseNoteCard],
  template: `
    <div class="fixed inset-0 z-40 flex flex-col bg-bg/90 backdrop-blur-sm" (click)="close.emit()">
      <div
        class="mx-auto flex max-h-full w-full max-w-md flex-col"
        style="padding-top: calc(1rem + env(safe-area-inset-top))"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between px-5 pb-3">
          <div>
            <h2 class="font-display text-2xl font-semibold">What's new</h2>
            <p class="text-xs text-muted">
              {{ notes().length }} {{ notes().length === 1 ? 'release' : 'releases' }} since you last looked
            </p>
          </div>
          <button
            (click)="close.emit()"
            aria-label="Close"
            class="flex size-9 flex-none items-center justify-center rounded-full border border-line text-lg text-muted-2"
          >
            ✕
          </button>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-6">
          @for (note of notes(); track note.seq) {
            <pp-release-note-card [note]="note" />
          }
          <a
            routerLink="/profile/whats-new"
            (click)="close.emit()"
            class="py-2 text-center text-xs font-bold text-muted-2"
          >
            See every release →
          </a>
        </div>
      </div>
    </div>
  `,
})
export class ReleaseNotesModal {
  readonly notes = input.required<readonly ReleaseNote[]>();
  readonly close = output<void>();
}
