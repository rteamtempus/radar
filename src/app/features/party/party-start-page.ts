import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PartyService, PartyStatus } from './party.service';

type TypeChoice = 'movie' | 'tv_show' | null;

const RUNTIME_CHIPS = [
  { label: '⏱ < 90 min', value: 90 },
  { label: '⏱ < 2 hrs', value: 120 },
  { label: '⏱ < 3 hrs', value: 180 },
  { label: 'Any length', value: null },
];

const STATUS_LABELS: Record<PartyStatus, string> = {
  gathering: 'Gathering',
  swiping: 'Swiping',
  voting: 'Voting',
  decided: 'Decided',
  completed: 'Done',
  cancelled: 'Cancelled',
};

@Component({
  selector: 'pp-party-start-page',
  imports: [RouterLink],
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <h1 class="font-display text-3xl font-semibold">Start a party</h1>
      <p class="mt-1 text-sm text-muted-2">Who's in tonight?</p>

      @if (activeParties().length) {
        <div class="mt-5 flex flex-col gap-2">
          @for (p of activeParties(); track p.id) {
            <a
              [routerLink]="['/party', p.id]"
              class="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3"
            >
              <span class="text-lg">🎉</span>
              <span class="flex-1 text-sm font-bold">
                Party {{ p.join_code }} <span class="text-muted-2">· {{ statusLabel(p.status) }}</span>
              </span>
              <span class="text-sm font-bold text-gold">Jump back in →</span>
            </a>
          }
        </div>
      }

      <h2 class="mt-7 mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">
        What are we deciding?
      </h2>
      <div class="flex gap-2.5">
        @for (t of typeChips; track t.label) {
          <button
            (click)="type.set(t.value)"
            class="flex-1 rounded-2xl border-2 px-3 py-3 text-sm font-bold"
            [class]="type() === t.value ? 'border-coral bg-coral/15 text-coral' : 'border-line text-muted-2'"
          >
            {{ t.label }}
          </button>
        }
      </div>

      <h2 class="mt-6 mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">Constraints</h2>
      <div class="flex flex-wrap gap-2">
        @for (c of runtimeChips; track c.label) {
          <button
            (click)="maxRuntime.set(c.value)"
            class="rounded-full border px-4 py-2 text-xs font-bold"
            [class]="maxRuntime() === c.value ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted-2'"
          >
            {{ c.label }}
          </button>
        }
      </div>

      <button
        (click)="streamableByAll.set(!streamableByAll())"
        class="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
      >
        <span
          class="flex h-6 w-11 flex-none items-center rounded-full p-1 transition-colors"
          [class]="streamableByAll() ? 'justify-end bg-green' : 'justify-start bg-surface-2'"
        >
          <span class="size-4 rounded-full bg-cream"></span>
        </span>
        <span class="text-sm font-bold">Only things everyone can stream</span>
      </button>

      <div class="mt-auto pt-8">
        <button
          (click)="start()"
          [disabled]="busy()"
          class="w-full rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-4 text-center font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
        >
          {{ busy() ? 'Setting up…' : 'Start the party →' }}
        </button>
        <a routerLink="/party/join" class="mt-4 block text-center text-sm font-bold text-muted-2">
          Have a code? <span class="text-coral">Join a party</span>
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
  private router = inject(Router);

  protected readonly typeChips = [
    { label: '🎬 Movies', value: 'movie' as TypeChoice },
    { label: '📺 Shows', value: 'tv_show' as TypeChoice },
    { label: '🎲 Either', value: null as TypeChoice },
  ];
  protected readonly runtimeChips = RUNTIME_CHIPS;

  protected readonly type = signal<TypeChoice>('movie');
  protected readonly maxRuntime = signal<number | null>(120);
  protected readonly streamableByAll = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly activeParties = signal<
    { id: string; status: PartyStatus; join_code: string | null }[]
  >([]);

  constructor() {
    this.partyService.myActiveParties().then((p) => this.activeParties.set(p));
  }

  protected statusLabel(status: PartyStatus): string {
    return STATUS_LABELS[status];
  }

  protected async start() {
    this.busy.set(true);
    this.error.set('');
    try {
      const id = await this.partyService.createParty({
        activityType: this.type(),
        maxDurationMin: this.maxRuntime(),
        mustBeStreamableByAll: this.streamableByAll(),
      });
      this.router.navigate(['/party', id]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not create the party');
    } finally {
      this.busy.set(false);
    }
  }
}
