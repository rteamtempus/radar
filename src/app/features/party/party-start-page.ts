import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DOMAINS, Domain, DomainService } from '../../core/domain.service';
import { AdventureSummary, AdventureService } from './adventure.service';
import { ActivePartySummary, PartyService, PartyStatus } from './party.service';

const STATUS_LABELS: Record<PartyStatus, string> = {
  gathering: 'Picking slots',
  swiping: 'Swiping',
  voting: 'Voting',
  decided: 'Decided',
  completed: 'Done',
  cancelled: 'Cancelled',
};

/**
 * Starting a quest is now one decision: what KIND of thing are we deciding?
 * Everything else (what's in the running) comes from the slots people pick in
 * the lobby — no runtime caps, no streamable-by-all, no AI shortlist.
 */
@Component({
  selector: 'pp-party-start-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <h1 class="font-display text-3xl font-semibold">Start a quest</h1>
      <p class="mt-1 text-sm text-muted-2">What are we deciding together?</p>

      @if (adventures().length) {
        <h2 class="mt-7 mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">
          Your adventures
        </h2>
        <div class="flex flex-col gap-2">
          @for (a of adventures(); track a.id) {
            <a
              [routerLink]="['/adventure', a.id]"
              class="flex items-center gap-3 rounded-2xl border border-violet/40 bg-violet/10 px-4 py-3"
            >
              <span class="text-lg">{{ a.emoji ?? '🗺️' }}</span>
              <span class="min-w-0 flex-1 truncate text-sm font-bold">{{ a.name }}</span>
              <span class="flex-none text-sm font-bold text-violet">Open →</span>
            </a>
          }
        </div>
      }

      @if (looseParties().length) {
        <h2 class="mt-7 mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">
          Still going
        </h2>
        <div class="flex flex-col gap-2">
          @for (p of looseParties(); track p.id) {
            <a
              [routerLink]="['/party', p.id]"
              class="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3"
            >
              <span class="text-lg">{{ emojiFor(p.domain) }}</span>
              <span class="min-w-0 flex-1 truncate text-sm font-bold">
                {{ p.title ?? 'Quest ' + p.join_code }}
                <span class="text-muted-2">· {{ statusLabel(p.status) }}</span>
              </span>
              <span class="flex-none text-sm font-bold text-gold">Jump back in →</span>
            </a>
          }
        </div>
      }

      <h2 class="mt-7 mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">
        Pick a kind
      </h2>
      <div class="grid grid-cols-2 gap-3">
        @for (d of domains; track d.id) {
          <button
            (click)="domain.set(d.id)"
            class="rounded-2xl border-2 px-3 py-5 text-center"
            [class]="domain() === d.id ? 'border-coral bg-coral/15' : 'border-line'"
          >
            <span class="block text-3xl">{{ d.emoji }}</span>
            <span
              class="mt-1.5 block text-sm font-bold"
              [class]="domain() === d.id ? 'text-coral' : 'text-muted-2'"
            >
              {{ d.label }}
            </span>
          </button>
        }
      </div>

      <input
        type="text"
        maxlength="40"
        [(ngModel)]="title"
        placeholder="Name it? (optional) — “Friday horror night”"
        class="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
      />

      <p class="mt-4 text-xs leading-relaxed text-muted">
        Next: everyone picks up to 3 slots — theirs, yours, or ones they've saved — and you swipe
        through everything in them together.
      </p>

      <div class="mt-auto pt-8">
        <button
          (click)="start()"
          [disabled]="busy()"
          class="font-display w-full rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-4 text-center text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
        >
          {{ busy() ? 'Setting up…' : 'Start the quest →' }}
        </button>
        <a routerLink="/party/join" class="mt-4 block text-center text-sm font-bold text-muted-2">
          Have a code? <span class="text-coral">Join a quest or adventure</span>
        </a>
        @if (error()) {
          <p class="mt-3 text-center text-sm font-bold text-coral">{{ error() }}</p>
        }
      </div>
    </div>
  `,
})
export class PartyStartPage {
  private partyService = inject(PartyService);
  private adventureService = inject(AdventureService);
  private domains_ = inject(DomainService);
  private router = inject(Router);

  protected readonly domains = DOMAINS;
  protected readonly domain = signal<Domain>(this.domains_.domain());
  protected title = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly activeParties = signal<ActivePartySummary[]>([]);
  protected readonly adventures = signal<AdventureSummary[]>([]);

  /** Quests inside an adventure are listed on the adventure, not here. */
  protected readonly looseParties = () => this.activeParties().filter((p) => !p.adventure_id);

  constructor() {
    this.partyService.myActiveParties().then((p) => this.activeParties.set(p));
    this.adventureService.myAdventures().then((a) => this.adventures.set(a));
  }

  protected statusLabel(status: PartyStatus): string {
    return STATUS_LABELS[status];
  }

  protected emojiFor(domain: Domain): string {
    return DOMAINS.find((d) => d.id === domain)?.emoji ?? '🎬';
  }

  protected async start() {
    this.busy.set(true);
    this.error.set('');
    try {
      const id = await this.partyService.createParty({
        domain: this.domain(),
        title: this.title,
      });
      this.router.navigate(['/party', id]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not create the quest');
    } finally {
      this.busy.set(false);
    }
  }
}
