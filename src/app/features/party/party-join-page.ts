import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdventureService } from './adventure.service';
import { PartyService } from './party.service';

/**
 * Enter a 6-char code, or arrive via the shared link /party/join?code=XXXXXX.
 * One field covers both: an adventure inherits its founding quest's code, so
 * adventures are tried FIRST — otherwise that code would drop you into day one
 * only, instead of the whole itinerary.
 */
@Component({
  selector: 'pp-party-join-page',
  imports: [FormsModule],
  template: `
    <div class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div class="text-center">
        <div class="mb-3 text-4xl">🔑</div>
        <h1 class="font-display text-3xl font-semibold">Join the fun</h1>
        <p class="mt-2 text-sm text-muted-2">
          Ask the host for their 6-character code — quest or adventure, same box.
        </p>
      </div>

      <form class="flex flex-col gap-3" (ngSubmit)="join()">
        <input
          type="text"
          name="code"
          maxlength="6"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          placeholder="PLAY42"
          [ngModel]="codeInput()"
          (ngModelChange)="codeInput.set($event.toUpperCase())"
          class="rounded-2xl border border-line bg-surface px-4 py-4 text-center font-display text-3xl font-semibold tracking-[0.3em] text-gold placeholder:text-muted focus:border-coral focus:outline-none"
        />
        <button
          type="submit"
          [disabled]="busy() || codeInput().length < 6"
          class="rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
        >
          {{ busy() ? 'Joining…' : 'Join →' }}
        </button>
      </form>

      @if (error()) {
        <p class="text-center text-sm font-bold text-coral">{{ error() }}</p>
      }
    </div>
  `,
})
export class PartyJoinPage {
  private partyService = inject(PartyService);
  private adventureService = inject(AdventureService);
  private router = inject(Router);

  /** Bound from ?code=XXXXXX (withComponentInputBinding). */
  readonly code = input<string>();

  protected readonly codeInput = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    // Deeplink case: code arrives via query param → join immediately.
    queueMicrotask(() => {
      const fromLink = this.code();
      if (fromLink?.length === 6) {
        this.codeInput.set(fromLink.toUpperCase());
        this.join();
      }
    });
  }

  protected async join() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      // Adventures first — see the class comment.
      const adventureId = await this.adventureService.joinByCode(this.codeInput()).catch(() => null);
      if (adventureId) {
        await this.router.navigate(['/adventure', adventureId]);
        return;
      }
      const partyId = await this.partyService.joinParty(this.codeInput());
      await this.router.navigate(['/party', partyId]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not join');
    } finally {
      this.busy.set(false);
    }
  }
}
