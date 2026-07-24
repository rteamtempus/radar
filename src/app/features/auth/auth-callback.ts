import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * Landing page for magic-link and OAuth redirects. supabase-js parses the
 * token from the URL automatically; we wait for the session, make sure a
 * profile row exists, then head into the app.
 */
@Component({
  selector: 'pp-auth-callback',
  template: `
    <div class="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div class="size-10 animate-spin rounded-full border-4 border-surface-2 border-t-coral"></div>
      <p class="text-sm font-bold text-muted-2">Signing you in…</p>
    </div>
  `,
})
export class AuthCallback {
  private auth = inject(AuthService);
  private router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.auth.loaded()) return;
      if (this.auth.session()) {
        // TODO(milestone 4): route first-time users to /onboarding instead.
        this.auth.ensureProfile().finally(() => this.router.navigateByUrl('/library'));
      } else {
        this.router.navigateByUrl('/login');
      }
    });
  }
}
