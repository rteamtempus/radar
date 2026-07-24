import { Injectable, computed, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** null until the initial getSession() resolves — see `loaded` */
  readonly session = signal<Session | null>(null);
  readonly loaded = signal(false);
  readonly user = computed(() => this.session()?.user ?? null);

  constructor() {
    if (!isSupabaseConfigured()) {
      this.loaded.set(true);
      return;
    }
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.loaded.set(true);
    });
    supabase.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  /**
   * Password auth (not magic link): PWAs handle the email→app hop badly, and
   * the free-tier email quota is tiny. Requires "Confirm email" to be OFF in
   * Supabase (Authentication → Sign In / Up → Email) so no email is ever sent.
   */
  signUpWithPassword(email: string, password: string) {
    return getSupabase().auth.signUp({ email, password });
  }

  signInWithPassword(email: string, password: string) {
    return getSupabase().auth.signInWithPassword({ email, password });
  }

  signInWithGoogle() {
    return getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async signOut() {
    await getSupabase().auth.signOut();
  }

  /**
   * Create the app-facing profile row on first login.
   * TODO(milestone 4): prompt for a display name during onboarding instead of
   * defaulting to the email prefix.
   */
  async ensureProfile(): Promise<void> {
    const user = this.user();
    if (!user) return;
    const displayName =
      (user.user_metadata?.['full_name'] as string | undefined) ??
      user.email?.split('@')[0] ??
      'Someone';
    await getSupabase()
      .from('profiles')
      .upsert({ id: user.id, display_name: displayName }, { onConflict: 'id', ignoreDuplicates: true });
  }
}
