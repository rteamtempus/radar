import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { isSupabaseConfigured } from '../../core/supabase.client';

type Mode = 'signin' | 'signup';

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
        @if (confirmationNeeded()) {
          <div class="rounded-2xl border border-gold/40 bg-gold/10 p-5 text-center text-sm">
            <div class="mb-1 text-2xl">📬</div>
            <p class="font-bold text-gold">Confirm your email to finish signing up</p>
            <p class="mt-1 text-muted-2">
              Your Supabase project still has "Confirm email" turned on, so it sent a confirmation
              link. For the POC, turn it off under Authentication → Sign In / Up → Email — then
              sign-ups are instant and no email is ever sent.
            </p>
          </div>
        }

        <form class="flex flex-col gap-3" (ngSubmit)="submit()">
          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            [(ngModel)]="email"
            class="rounded-2xl border border-line bg-surface px-4 py-3.5 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
          />
          <input
            type="password"
            name="password"
            required
            minlength="6"
            [autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'"
            [placeholder]="mode() === 'signup' ? 'Choose a password (6+ characters)' : 'Password'"
            [(ngModel)]="password"
            class="rounded-2xl border border-line bg-surface px-4 py-3.5 text-cream placeholder:text-muted focus:border-coral focus:outline-none"
          />
          <button
            type="submit"
            [disabled]="busy() || !email || password.length < 6"
            class="rounded-2xl bg-gradient-to-br from-coral to-gold px-4 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-coral/35 disabled:opacity-50"
          >
            {{ busy() ? 'One sec…' : mode() === 'signup' ? 'Create account' : 'Sign in' }}
          </button>
        </form>

        <button type="button" (click)="toggleMode()" class="text-sm font-bold text-muted-2">
          @if (mode() === 'signin') {
            New here? <span class="text-coral">Create an account</span>
          } @else {
            Already have an account? <span class="text-coral">Sign in</span>
          }
        </button>

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
  protected password = '';
  protected readonly mode = signal<Mode>('signin');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmationNeeded = signal(false);

  constructor() {
    // Already signed in? Straight to the app.
    if (this.auth.session()) this.router.navigateByUrl('/library');
  }

  protected toggleMode() {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
    this.error.set('');
    this.confirmationNeeded.set(false);
  }

  protected async submit() {
    this.busy.set(true);
    this.error.set('');
    this.confirmationNeeded.set(false);
    const email = this.email.trim();

    if (this.mode() === 'signup') {
      const { data, error } = await this.auth.signUpWithPassword(email, this.password);
      this.busy.set(false);
      if (error) {
        this.error.set(error.message);
      } else if (data.session) {
        await this.enter();
      } else {
        // No session back from signUp = the project still requires email
        // confirmation (or this email already has an account).
        this.confirmationNeeded.set(true);
      }
      return;
    }

    const { error } = await this.auth.signInWithPassword(email, this.password);
    this.busy.set(false);
    if (error) this.error.set(error.message);
    else await this.enter();
  }

  protected async google() {
    this.error.set('');
    const { error } = await this.auth.signInWithGoogle();
    if (error) this.error.set(error.message);
  }

  private async enter() {
    this.router.navigateByUrl(await this.auth.postLoginUrl());
  }
}
