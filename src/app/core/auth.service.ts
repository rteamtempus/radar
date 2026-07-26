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

  defaultDisplayName(): string {
    const user = this.user();
    return (
      (user?.user_metadata?.['full_name'] as string | undefined) ??
      user?.email?.split('@')[0] ??
      'Someone'
    );
  }

  /** Fetch the profile, creating it on first login. */
  async getOrCreateProfile(): Promise<ProfileRow | null> {
    const user = this.user();
    if (!user) return null;
    const supabase = getSupabase();
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, settings, visibility')
      .eq('id', user.id)
      .maybeSingle();
    if (data) return data as ProfileRow;
    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: user.id, display_name: this.defaultDisplayName() })
      .select('id, display_name, settings, visibility')
      .single();
    return created as ProfileRow | null;
  }

  async setProfileVisibility(visibility: 'public' | 'friends' | 'private'): Promise<void> {
    const user = this.user();
    if (!user) return;
    await getSupabase().from('profiles').update({ visibility }).eq('id', user.id);
  }

  /** Where to land after auth: onboarding for first-timers, else the app. */
  async postLoginUrl(): Promise<string> {
    const profile = await this.getOrCreateProfile();
    return profile?.settings?.onboarded ? '/radar' : '/onboarding';
  }

  async updateDisplayName(displayName: string): Promise<void> {
    const user = this.user();
    if (!user) return;
    await getSupabase().from('profiles').update({ display_name: displayName }).eq('id', user.id);
  }

  /** Stamp settings.onboarded so future logins skip /onboarding. */
  async markOnboarded(): Promise<void> {
    const user = this.user();
    if (!user) return;
    const profile = await this.getOrCreateProfile();
    await getSupabase()
      .from('profiles')
      .update({ settings: { ...(profile?.settings ?? {}), onboarded: true } })
      .eq('id', user.id);
  }
}

export interface ProfileRow {
  id: string;
  display_name: string;
  settings: { onboarded?: boolean } & Record<string, unknown>;
  visibility: 'public' | 'friends' | 'private';
}
