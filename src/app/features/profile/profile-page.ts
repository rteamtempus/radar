import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * Milestone 4+: display name, subscriptions editing. For now: who am I + sign out.
 */
@Component({
  selector: 'pp-profile-page',
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-6 px-5 py-6">
      <h1 class="font-display text-3xl font-semibold">You</h1>
      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Signed in as</p>
        <p class="mt-1 font-bold">{{ auth.user()?.email }}</p>
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
  private router = inject(Router);

  protected async signOut() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
