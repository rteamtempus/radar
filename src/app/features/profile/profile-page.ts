import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { ServiceBadges } from '../../shared/ui/service-badges';

@Component({
  selector: 'pp-profile-page',
  imports: [FormsModule, ServiceBadges],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-6 px-5 py-6">
      <h1 class="font-display text-3xl font-semibold">You</h1>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Display name</p>
        <div class="mt-2 flex gap-2">
          <input
            type="text"
            maxlength="30"
            [(ngModel)]="name"
            class="min-w-0 flex-1 rounded-xl border border-line bg-bg-warm px-3 py-2.5 font-bold text-cream focus:border-coral focus:outline-none"
          />
          <button
            (click)="saveName()"
            [disabled]="!name.trim() || saved()"
            class="rounded-xl bg-coral px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-60"
          >
            {{ saved() ? '✓' : 'Save' }}
          </button>
        </div>
        <p class="mt-3 text-xs text-muted">Signed in as {{ auth.user()?.email }}</p>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">My streaming services</p>
        <div class="mt-3 grid grid-cols-2 gap-2.5">
          @for (s of subs.services(); track s.id) {
            <button
              (click)="subs.toggle(s.id)"
              class="flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-left"
              [class]="
                subs.mine().has(s.id) ? 'border-green bg-green/10' : 'border-line opacity-60'
              "
            >
              <pp-service-badges [services]="[s]" />
              <span class="min-w-0 flex-1 truncate text-xs font-bold">{{ s.name }}</span>
            </button>
          }
        </div>
      </div>

      <button
        (click)="signOut()"
        class="rounded-2xl border border-line bg-surface px-4 py-3.5 font-bold text-coral"
      >
        Sign out
      </button>
    </div>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly subs = inject(SubscriptionsService);
  private router = inject(Router);

  protected name = '';
  protected readonly saved = signal(false);

  constructor() {
    this.subs.load();
    this.auth.getOrCreateProfile().then((p) => {
      if (p && !this.name) this.name = p.display_name;
    });
  }

  protected async saveName() {
    await this.auth.updateDisplayName(this.name.trim());
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 1500);
  }

  protected async signOut() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
