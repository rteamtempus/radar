import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FriendProfile, FriendsService } from './friends.service';

@Component({
  selector: 'pp-friends-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-5 px-5 py-6">
      <h1 class="font-display text-3xl font-semibold">Friends</h1>

      <!-- my code -->
      <div class="rounded-3xl border border-line bg-surface p-5 text-center">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">My friend code</p>
        <p class="mt-1 font-display text-3xl font-bold tracking-[0.25em] text-gold">
          {{ friends.myCode() ?? '······' }}
        </p>
        <button
          (click)="copyCode()"
          class="mt-2 rounded-full border border-line px-4 py-2 text-xs font-bold text-muted-2"
        >
          {{ copied() ? '✓ Copied' : '⧉ Copy code' }}
        </button>
      </div>

      <!-- add by code -->
      <form class="flex gap-2" (ngSubmit)="addByCode()">
        <input
          type="text"
          name="code"
          maxlength="6"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          placeholder="Friend's code"
          [ngModel]="code()"
          (ngModelChange)="code.set($event.toUpperCase())"
          class="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-center font-display text-lg font-semibold tracking-[0.2em] text-cream placeholder:tracking-normal placeholder:text-muted focus:border-coral focus:outline-none"
        />
        <button
          type="submit"
          [disabled]="code().length < 6 || busy()"
          class="rounded-2xl bg-coral px-5 text-sm font-bold text-ink disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <!-- search by name -->
      <div>
        <input
          type="search"
          placeholder="Or search by name…"
          [ngModel]="query()"
          (ngModelChange)="onQuery($event)"
          class="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
        />
        @if (results().length) {
          <div class="mt-2 flex flex-col gap-2">
            @for (r of results(); track r.id) {
              <div class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                <span class="flex size-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold text-sm font-extrabold text-ink">
                  {{ initial(r.display_name) }}
                </span>
                <span class="min-w-0 flex-1 truncate text-sm font-bold">{{ r.display_name }}</span>
                <button
                  (click)="request(r)"
                  class="rounded-full border border-green px-3 py-1.5 text-xs font-bold text-green"
                >
                  ＋ Add friend
                </button>
              </div>
            }
          </div>
        }
      </div>

      <!-- incoming requests -->
      @if (friends.incoming().length) {
        <div>
          <h2 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Friend requests</h2>
          <div class="flex flex-col gap-2">
            @for (r of friends.incoming(); track r.id) {
              <div class="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
                <span class="flex size-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold text-sm font-extrabold text-ink">
                  {{ initial(r.display_name) }}
                </span>
                <span class="min-w-0 flex-1 truncate text-sm font-bold">{{ r.display_name }}</span>
                <button (click)="friends.accept(r.id)" class="rounded-full bg-green px-3 py-1.5 text-xs font-bold text-ink">✓ Accept</button>
                <button (click)="friends.decline(r.id)" class="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted-2">✕</button>
              </div>
            }
          </div>
        </div>
      }

      <!-- friends list -->
      <div>
        <h2 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
          My friends {{ friends.friends().length ? '(' + friends.friends().length + ')' : '' }}
        </h2>
        @if (!friends.friends().length) {
          <p class="text-sm text-muted-2">
            No friends yet — swap codes with someone. Radar's better together.
          </p>
        }
        <div class="flex flex-col gap-2">
          @for (f of friends.friends(); track f.id) {
            <a
              [routerLink]="['/friends', f.id]"
              class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3"
            >
              <span class="flex size-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold font-extrabold text-ink">
                {{ initial(f.display_name) }}
              </span>
              <span class="min-w-0 flex-1 truncate font-bold">{{ f.display_name }}</span>
              <span class="text-muted">›</span>
            </a>
          }
        </div>
        @if (friends.outgoing().length) {
          <p class="mt-3 text-xs text-muted">
            Waiting on: {{ outgoingNames() }}
          </p>
        }
      </div>
    </div>
  `,
})
export class FriendsPage implements OnDestroy {
  protected readonly friends = inject(FriendsService);

  protected readonly code = signal('');
  protected readonly query = signal('');
  protected readonly results = signal<FriendProfile[]>([]);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  private debounce: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.friends.load();
  }

  ngOnDestroy() {
    clearTimeout(this.debounce);
  }

  protected initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  protected outgoingNames(): string {
    return this.friends
      .outgoing()
      .map((f) => f.display_name)
      .join(', ');
  }

  protected async copyCode() {
    const code = this.friends.myCode();
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async addByCode() {
    this.busy.set(true);
    if (await this.friends.addByCode(this.code())) this.code.set('');
    this.busy.set(false);
  }

  protected onQuery(q: string) {
    this.query.set(q);
    clearTimeout(this.debounce);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      this.results.set([]);
      return;
    }
    this.debounce = setTimeout(async () => {
      const results = await this.friends.search(trimmed);
      if (this.query().trim() === trimmed) this.results.set(results);
    }, 350);
  }

  protected async request(profile: FriendProfile) {
    this.results.update((r) => r.filter((x) => x.id !== profile.id));
    await this.friends.sendRequest(profile.id);
  }
}
