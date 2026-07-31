import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ReleaseNotesService } from '../../core/release-notes';
import { ReleaseNoteCard } from '../../shared/ui/release-note-card';

/** The archive: every release Radar has shipped, newest first. */
@Component({
  selector: 'pp-whats-new-page',
  imports: [RouterLink, ReleaseNoteCard],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-4 px-5 py-6">
      <a routerLink="/profile" class="text-xs font-bold text-muted-2">← You</a>
      <div>
        <h1 class="font-display text-3xl font-semibold">What's new</h1>
        <p class="mt-1 text-sm text-muted-2">
          Everything that has changed in Radar, newest first.
        </p>
      </div>

      @for (note of releases.all; track note.seq) {
        <pp-release-note-card [note]="note" />
      }
    </div>
  `,
})
export class WhatsNewPage {
  protected readonly releases = inject(ReleaseNotesService);
  private readonly auth = inject(AuthService);

  constructor() {
    // Reading the archive counts as catching up — clears the What's-new entry.
    const userId = this.auth.user()?.id;
    if (userId) void this.releases.load(userId).then(() => this.releases.markAllSeen(userId));
  }
}
