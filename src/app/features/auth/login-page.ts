import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { isSupabaseConfigured } from '../../core/supabase.client';

@Component({
  selector: 'pp-login-page',
  imports: [FormsModule],
  template: `
    <div class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <div class="flex flex-col items-center gap-3 text-center">
        <div
          class="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-coral to-gold shadow-lg shadow-coral/35"
        >
          <span class="font-display text-3xl font-bold text-ink">P</span>
        </div>
        <h1 class="font-display text-3xl font-semibold">PartyPick</h1>
        <p class="text-sm text-muted-2">Pick what to watch, together.</p>
      </div>

      @if (!configured) {
        <div class="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold">
          Supabase isn't configured yet. Copy <code>.env.example</code> to <code>.env</code>, fill
          in the project URL + anon key, and restart <code>npm start</code>.
        </div>
      } @else {
        @if (sent()) {
          <div class="rounded-2xl border border-green/40 bg-green/10 p-5 text-center">
            <div class="mb-1 text-2xl">✉️</div>
            <p class="font-bold text-green">Check your email</p>
            <p class="mt-1 text-sm text-muted-2">
              We sent a magic link to <span class="text-cream">{{ email }}</span>
            </p>
          </div>
        } @else {
          <form class="flex flex-col gap-3" (ngSubmit)="sendMagicLink()">
            <input
              type="email"
              name="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              [(ngModel)]="email"
              class="rounded-2xl border border-line bg-surface px-4 py-3.5 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
            />
            <button
              type="submit"
              [disabled]="busy() || !email"
              class="rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
            >
              {{ busy() ? 'Sending…' : 'Email me a magic link' }}
            </button>
          </form>

          <div class="flex items-center gap-3 text-xs font-bold text-muted">
            <div class="h-px flex-1 bg-line"></div>
            or
            <div class="h-px flex-1 bg-line"></div>
          </div>

          <button
            type="button"
            (click)="google()"
            class="rounded-2xl border border-line bg-surface px-4 py-3.5 font-bold text-cream"
          >
            Continue with Google
          </button>
        }

        @if (error()) {
          <p class="text-center text-sm font-bold text-coral">{{ error() }}</p>
        }
      }
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected readonly configured = isSupabaseConfigured();
  protected email = '';
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  constructor() {
    // Already signed in? Straight to the app.
    if (this.auth.session()) this.router.navigateByUrl('/library');
  }

  protected async sendMagicLink() {
    this.busy.set(true);
    this.error.set('');
    const { error } = await this.auth.signInWithMagicLink(this.email.trim());
    this.busy.set(false);
    if (error) this.error.set(error.message);
    else this.sent.set(true);
  }

  protected async google() {
    this.error.set('');
    const { error } = await this.auth.signInWithGoogle();
    if (error) this.error.set(error.message);
  }
}
