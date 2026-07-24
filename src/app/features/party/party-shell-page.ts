import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PartyService } from './party.service';

/**
 * The live party room. Renders the stage for parties.status; every client
 * follows along via the party's realtime channel:
 *   gathering → lobby + mood check-in (this milestone)
 *   swiping / voting / decided → milestones 6–7
 */
@Component({
  selector: 'pp-party-shell-page',
  imports: [FormsModule],
  template: `
    @if (party.party(); as p) {
      <div class="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
        @switch (p.status) {
          @case ('gathering') {
            <!-- ============ lobby ============ -->
            <h1 class="font-display text-3xl font-semibold">The lobby</h1>
            <p class="mt-1 text-sm text-muted-2">
              {{
                party.members().length === 1
                  ? 'Waiting for friends… share the code'
                  : party.members().length + ' in so far'
              }}
            </p>

            <div class="mt-5 rounded-3xl border border-line bg-surface p-6 text-center">
              <p class="text-xs font-bold tracking-wide text-muted uppercase">Join code</p>
              <p class="mt-1 font-display text-4xl font-bold tracking-[0.25em] text-gold">
                {{ p.join_code }}
              </p>
              <button
                (click)="copyLink()"
                class="mt-3 rounded-full border border-line px-4 py-2 text-xs font-bold text-muted-2"
              >
                {{ copied() ? '✓ Link copied' : '⧉ Copy invite link' }}
              </button>
            </div>

            <div class="mt-6 flex flex-col gap-2.5">
              @for (m of party.members(); track m.id) {
                <div class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                  <span
                    class="flex size-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold text-sm font-extrabold text-ink"
                  >
                    {{ initial(m.profile?.display_name) }}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-sm font-bold">
                    {{ m.profile?.display_name ?? 'Someone' }}
                    @if (m.role === 'host') {
                      <span class="text-muted">· host</span>
                    }
                  </span>
                  @if (isReady(m.id)) {
                    <span class="text-xs font-bold text-green">✓ ready</span>
                  } @else {
                    <span class="text-xs font-bold text-muted">thinking…</span>
                  }
                </div>
              }
            </div>

            <!-- ============ mood check-in ============ -->
            @if (!party.myCheckin()) {
              <h2 class="mt-8 font-display text-xl font-semibold">How are you feeling?</h2>
              <p class="mt-1 text-xs font-bold text-muted">
                Pick up to 3 · <span class="text-gold">{{ vibeIds().size }} of 3</span>
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                @for (v of party.vibes(); track v.id) {
                  <button
                    (click)="toggleVibe(v.id)"
                    class="rounded-full border-2 px-4 py-2 text-sm font-bold"
                    [class]="
                      vibeIds().has(v.id) ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted-2'
                    "
                  >
                    {{ v.label }}
                  </button>
                }
              </div>

              <p class="mt-5 text-xs font-bold tracking-wide text-muted uppercase">Energy level</p>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                [(ngModel)]="energy"
                class="mt-2 w-full accent-gold"
              />
              <div class="flex justify-between text-xs font-bold text-muted">
                <span>😴 Comatose</span>
                <span class="text-gold">{{ energy }}/5</span>
                <span>Bouncing 🤸</span>
              </div>

              <input
                type="text"
                maxlength="120"
                [(ngModel)]="freeText"
                placeholder="Optional: “something like Severance but funnier”"
                class="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
              />

              <button
                (click)="submitMood()"
                [disabled]="busy()"
                class="mt-4 rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
              >
                I'm ready ✓
              </button>
            } @else {
              <div class="mt-8 rounded-2xl border border-green/40 bg-green/10 p-4 text-center">
                <p class="font-bold text-green">You're checked in ✓</p>
                <p class="mt-1 text-xs text-muted-2">
                  {{ party.readyCount() }} of {{ party.members().length }} ready
                </p>
              </div>
            }

            @if (party.isHost()) {
              <div class="mt-6">
                <button
                  (click)="generate()"
                  [disabled]="busy() || party.readyCount() === 0"
                  class="w-full rounded-2xl border-2 border-coral py-3.5 font-display text-lg font-semibold text-coral disabled:opacity-40"
                >
                  {{ busy() ? 'Summoning suggestions…' : '✨ Generate suggestions' }}
                </button>
                @if (party.readyCount() < party.members().length) {
                  <p class="mt-2 text-center text-xs text-muted">
                    Not everyone's checked in — you can start anyway.
                  </p>
                }
              </div>
            }
            @if (error()) {
              <p class="mt-3 text-center text-sm font-bold text-coral">{{ error() }}</p>
            }
          }
          @case ('swiping') {
            <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="text-4xl">🃏</div>
              <h1 class="font-display text-2xl font-semibold">Swipe deck</h1>
              <p class="text-sm text-muted-2">Coming in milestone 7.</p>
            </div>
          }
          @case ('voting') {
            <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="text-4xl">🗳️</div>
              <h1 class="font-display text-2xl font-semibold">Voting</h1>
              <p class="text-sm text-muted-2">Coming in milestone 7.</p>
            </div>
          }
          @default {
            <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="text-4xl">🏁</div>
              <h1 class="font-display text-2xl font-semibold">{{ p.status }}</h1>
              <p class="text-sm text-muted-2">Reveal & outcome land in milestone 7.</p>
            </div>
          }
        }
      </div>
    } @else {
      <div class="flex min-h-dvh items-center justify-center">
        <div class="size-10 animate-spin rounded-full border-4 border-surface-2 border-t-coral"></div>
      </div>
    }
  `,
})
export class PartyShellPage implements OnDestroy {
  protected readonly party = inject(PartyService);

  /** Route param. */
  readonly id = input.required<string>();

  protected energy = 3;
  protected freeText = '';
  protected readonly vibeIds = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly copied = signal(false);

  private readonly openOnIdChange = effect(() => {
    this.party.open(this.id());
  });

  protected readonly isReady = (memberId: string) =>
    this.party.checkins().some((c) => c.member_id === memberId);

  ngOnDestroy() {
    this.party.close();
  }

  protected initial(name: string | undefined | null): string {
    return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  }

  protected toggleVibe(id: string) {
    const next = new Set(this.vibeIds());
    if (next.has(id)) next.delete(id);
    else if (next.size < 3) next.add(id);
    this.vibeIds.set(next);
  }

  protected async copyLink() {
    const code = this.party.party()?.join_code;
    if (!code) return;
    await navigator.clipboard.writeText(`${location.origin}/party/join?code=${code}`);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async submitMood() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.party.submitMood(this.energy, [...this.vibeIds()], this.freeText);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not save your check-in');
    } finally {
      this.busy.set(false);
    }
  }

  protected async generate() {
    this.busy.set(true);
    this.error.set('');
    const { error } = await this.party.generateCandidates();
    if (error) this.error.set(error);
    this.busy.set(false);
    // On success the party row flips to 'swiping' and realtime moves everyone.
  }
}
