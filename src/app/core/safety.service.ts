import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { getSupabase } from './supabase.client';

/**
 * Minimal report/block (migration 0016 — LOCATION-ANALYSIS G1/G2 prereq).
 * Reports go to `content_reports` for manual review. Blocking hides a person
 * from MY discovery surfaces: server-side in the geo RPCs, client-side here
 * for the plain Explore queries. It is UX hiding, not access revocation —
 * their public content stays public to everyone else.
 */
@Injectable({ providedIn: 'root' })
export class SafetyService {
  private auth = inject(AuthService);

  readonly blockedIds = signal<ReadonlySet<string>>(new Set());
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const me = this.auth.user()?.id;
    if (!me) return;
    const { data } = await getSupabase().from('user_blocks').select('blocked_id');
    this.blockedIds.set(new Set((data ?? []).map((r) => r.blocked_id)));
    this.loaded = true;
  }

  async report(targetType: 'slot' | 'profile', targetId: string, reason: string): Promise<boolean> {
    const me = this.auth.user()?.id;
    if (!me) return false;
    const { error } = await getSupabase().from('content_reports').insert({
      reporter_id: me,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim().slice(0, 500) || null,
    });
    return !error;
  }

  async block(userId: string): Promise<boolean> {
    const me = this.auth.user()?.id;
    if (!me || userId === me) return false;
    const { error } = await getSupabase()
      .from('user_blocks')
      .upsert({ blocker_id: me, blocked_id: userId }, { ignoreDuplicates: true });
    if (!error) this.blockedIds.update((s) => new Set(s).add(userId));
    return !error;
  }

  async unblock(userId: string): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    await getSupabase().from('user_blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
    this.blockedIds.update((s) => {
      const next = new Set(s);
      next.delete(userId);
      return next;
    });
  }

  /** Blocked profiles with names, for the profile-page management list. */
  async blockedProfiles(): Promise<{ id: string; display_name: string }[]> {
    await this.load();
    const ids = [...this.blockedIds()];
    if (!ids.length) return [];
    const { data } = await getSupabase().from('profiles').select('id, display_name').in('id', ids);
    return (data ?? []) as { id: string; display_name: string }[];
  }
}
