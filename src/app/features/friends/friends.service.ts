import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { getSupabase } from '../../core/supabase.client';
import { ToastService } from '../../shared/ui/toast.service';

export interface FriendProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface ConnectionRow {
  user_id: string;
  friend_id: string;
  status: string;
  requester: FriendProfile;
  target: FriendProfile;
}

const CONNECTION_SELECT =
  'user_id, friend_id, status, ' +
  'requester:profiles!connections_user_id_fkey(id, display_name, avatar_url), ' +
  'target:profiles!connections_friend_id_fkey(id, display_name, avatar_url)';

/**
 * Friends: instant mutual add by friend code (add_friend_by_code RPC), or
 * name search → request → accept. Friendship unlocks friend-profile reads
 * (RLS in migration 0008) and recommend_to_friend.
 */
@Injectable({ providedIn: 'root' })
export class FriendsService {
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly friends = signal<FriendProfile[]>([]);
  readonly incoming = signal<FriendProfile[]>([]); // pending requests to me
  readonly outgoing = signal<FriendProfile[]>([]); // my pending requests
  readonly subscribedProfiles = signal<FriendProfile[]>([]); // one-directional follows
  readonly myCode = signal<string | null>(null);
  readonly loading = signal(false);

  async load(): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    this.loading.set(true);
    try {
      const supabase = getSupabase();
      const [conns, profile, subs] = await Promise.all([
        supabase.from('connections').select(CONNECTION_SELECT),
        supabase.from('profiles').select('friend_code').eq('id', me).maybeSingle(),
        supabase
          .from('profile_subscriptions')
          .select('profile:profiles!profile_subscriptions_profile_id_fkey(id, display_name, avatar_url)')
          .eq('subscriber_id', me),
      ]);
      this.myCode.set((profile.data?.friend_code as string | null) ?? null);
      this.subscribedProfiles.set(
        ((subs.data ?? []) as unknown as { profile: FriendProfile }[])
          .map((r) => r.profile)
          .sort((a, b) => a.display_name.localeCompare(b.display_name)),
      );

      const rows = (conns.data ?? []) as unknown as ConnectionRow[];
      const friends = new Map<string, FriendProfile>();
      const incoming: FriendProfile[] = [];
      const outgoing: FriendProfile[] = [];
      for (const row of rows) {
        const other = row.user_id === me ? row.target : row.requester;
        if (row.status === 'accepted') friends.set(other.id, other);
        else if (row.status === 'pending' && row.friend_id === me) incoming.push(other);
        else if (row.status === 'pending' && row.user_id === me) outgoing.push(other);
      }
      this.friends.set(
        [...friends.values()].sort((a, b) => a.display_name.localeCompare(b.display_name)),
      );
      this.incoming.set(incoming);
      this.outgoing.set(outgoing);
    } finally {
      this.loading.set(false);
    }
  }

  /** Instant mutual friendship — code possession = consent. */
  async addByCode(code: string): Promise<boolean> {
    const { error } = await getSupabase().rpc('add_friend_by_code', {
      p_code: code.trim().toUpperCase(),
    });
    if (error) {
      this.toast.error(error.message);
      return false;
    }
    this.toast.success('Friend added ✓');
    await this.load();
    return true;
  }

  /** Search profiles by name (excludes me + existing relationships). */
  async search(query: string): Promise<FriendProfile[]> {
    const me = this.auth.user()?.id;
    const { data } = await getSupabase()
      .from('profiles')
      .select('id, display_name, avatar_url')
      .ilike('display_name', `%${query.trim()}%`)
      .limit(10);
    const related = new Set([
      me,
      ...this.friends().map((f) => f.id),
      ...this.incoming().map((f) => f.id),
      ...this.outgoing().map((f) => f.id),
    ]);
    return ((data ?? []) as FriendProfile[]).filter((p) => !related.has(p.id));
  }

  async sendRequest(friendId: string): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    const { error } = await getSupabase()
      .from('connections')
      .insert({ user_id: me, friend_id: friendId, status: 'pending' });
    if (error) this.toast.error('Could not send the request.');
    else this.toast.success('Request sent ✓');
    await this.load();
  }

  async accept(friendId: string): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    await getSupabase()
      .from('connections')
      .update({ status: 'accepted' })
      .eq('user_id', friendId)
      .eq('friend_id', me);
    await this.load();
  }

  async decline(friendId: string): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    await getSupabase().from('connections').delete().eq('user_id', friendId).eq('friend_id', me);
    await this.load();
  }

  isSubscribedTo(profileId: string): boolean {
    return this.subscribedProfiles().some((p) => p.id === profileId);
  }

  /** Follow someone's radar (one-directional, no approval). */
  async subscribeProfile(profileId: string): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    const { error } = await getSupabase()
      .from('profile_subscriptions')
      .upsert({ subscriber_id: me, profile_id: profileId }, { ignoreDuplicates: true });
    if (error) this.toast.error('Could not subscribe.');
    await this.load();
  }

  async unsubscribeProfile(profileId: string): Promise<void> {
    const me = this.auth.user()?.id;
    if (!me) return;
    await getSupabase()
      .from('profile_subscriptions')
      .delete()
      .eq('subscriber_id', me)
      .eq('profile_id', profileId);
    await this.load();
  }

  /** One privacy-safe overlap number (0–100), or null when not allowed/computable. */
  async tasteMatch(profileId: string): Promise<number | null> {
    const { data } = await getSupabase().rpc('taste_match', { p_other: profileId });
    return (data as number | null) ?? null;
  }

  /** Drop a title into a friend's "Recommended to me" slot (RPC). */
  async recommend(friendId: string, activityId: string): Promise<boolean> {
    const { error } = await getSupabase().rpc('recommend_to_friend', {
      p_friend_id: friendId,
      p_activity_id: activityId,
    });
    if (error) {
      this.toast.error(error.message);
      return false;
    }
    return true;
  }
}
