// The notification inbox. Rows are written ONLY by SECURITY DEFINER triggers
// and RPCs (migration 0012) — the client reads, marks read, and dismisses.
//
// Adding a new notification kind is a DB producer + one entry in `describe()`
// below. Nothing else in the app needs to change: `verb` is free text and the
// row carries its own `payload` and `link`.
import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { ReleaseNotesService } from './release-notes';
import { getSupabase, isSupabaseConfigured } from './supabase.client';

export interface NotificationRow {
  id: string;
  actor_id: string | null;
  verb: string;
  object_type: string | null;
  object_id: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/** What a row looks like on screen. */
export interface NotificationView extends NotificationRow {
  icon: string;
  title: string;
  body: string;
  imageUrl: string | null;
}

const str = (p: Record<string, unknown>, key: string): string | null => {
  const v = p[key];
  return typeof v === 'string' && v.trim() ? v : null;
};

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private auth = inject(AuthService);
  private releases = inject(ReleaseNotesService);
  private channel: RealtimeChannel | undefined;
  private loadedFor: string | null = null;

  readonly rows = signal<NotificationRow[]>([]);
  readonly loading = signal(false);

  readonly items = computed<NotificationView[]>(() =>
    this.rows().map((r) => ({ ...r, ...describe(r) })),
  );

  readonly unreadCount = computed(() => this.rows().filter((r) => !r.read_at).length);

  /**
   * What the badge shows. The What's-new entry is synthetic (release notes are
   * bundled, not rows — see release-notes.ts), so it contributes exactly one
   * whatever the number of unread notes.
   */
  readonly badgeCount = computed(
    () => this.unreadCount() + (this.releases.hasUnseen() ? 1 : 0),
  );

  /** Newest 50, plus the release-note watermark. Cheap enough to re-run. */
  async load(force = false): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !isSupabaseConfigured()) return;
    if (this.loadedFor === userId && !force) return;
    this.loadedFor = userId;
    this.loading.set(true);

    const [{ data }] = await Promise.all([
      getSupabase()
        .from('notifications')
        .select('id, actor_id, verb, object_type, object_id, link, payload, read_at, created_at')
        .eq('user_id', userId) // explicit owner filter — RLS is not the only guard
        .order('created_at', { ascending: false })
        .limit(50),
      this.releases.load(userId),
    ]);

    this.rows.set((data ?? []) as NotificationRow[]);
    this.loading.set(false);
    this.subscribe(userId);
  }

  /** Mark one read locally + server-side; safe to call on an already-read row. */
  async markRead(id: string): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const row = this.rows().find((r) => r.id === id);
    if (!row || row.read_at) return;
    const now = new Date().toISOString();
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, read_at: now } : r)));
    await getSupabase()
      .from('notifications')
      .update({ read_at: now })
      .eq('id', id)
      .eq('user_id', userId);
  }

  async markAllRead(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.unreadCount()) return;
    const now = new Date().toISOString();
    this.rows.update((rows) => rows.map((r) => (r.read_at ? r : { ...r, read_at: now })));
    await getSupabase()
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null);
  }

  async dismiss(id: string): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.rows.update((rows) => rows.filter((r) => r.id !== id));
    await getSupabase().from('notifications').delete().eq('id', id).eq('user_id', userId);
  }

  /** Called on sign-out so the next account starts clean. */
  reset(): void {
    this.channel?.unsubscribe();
    this.channel = undefined;
    this.loadedFor = null;
    this.rows.set([]);
    this.releases.reset();
  }

  private subscribe(userId: string): void {
    if (this.channel) return;
    this.channel = getSupabase()
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => void this.load(true),
      )
      .subscribe();
  }
}

/**
 * verb → how it reads. Unknown verbs (a newer DB than this build) fall back to
 * something harmless rather than rendering blank.
 */
function describe(r: NotificationRow): Pick<NotificationView, 'icon' | 'title' | 'body' | 'imageUrl'> {
  const p = r.payload ?? {};
  const who = str(p, 'actor_name') ?? 'A friend';
  const title = str(p, 'title') ?? 'something';
  const slot = `${str(p, 'slot_emoji') ?? '🎯'} ${str(p, 'slot_name') ?? 'a slot'}`;
  const image = str(p, 'image_url');
  const rating = typeof p['rating'] === 'number' ? (p['rating'] as number) : null;

  switch (r.verb) {
    case 'recommendation_received':
      return {
        icon: '💡',
        title: `${who} sent you ${title}`,
        body: 'It is waiting in your Recommended to me slot.',
        imageUrl: image,
      };
    case 'recommendation_started':
      return {
        icon: '▶️',
        title: `${who} started ${title}`,
        body: 'The one you recommended.',
        imageUrl: image,
      };
    case 'recommendation_completed':
      return {
        icon: '✅',
        title: `${who} finished ${title}`,
        body: rating ? `They rated it ${rating}/10 — you recommended it.` : 'You recommended it.',
        imageUrl: image,
      };
    case 'slot_completed':
      return {
        icon: '🏁',
        title: `${who} finished ${slot}`,
        body: `They got through all ${p['item_count'] ?? ''} of your picks.`.replace('  ', ' '),
        imageUrl: null,
      };
    case 'friend_added':
      return {
        icon: '🤝',
        title: `${who} added you as a friend`,
        body: 'Take a look at what is on their radar.',
        imageUrl: null,
      };
    default:
      return { icon: '🔔', title: who, body: 'Tap to take a look.', imageUrl: image };
  }
}
