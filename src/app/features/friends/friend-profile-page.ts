import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { getSupabase } from '../../core/supabase.client';
import { StarRating } from '../../shared/ui/star-rating';
import { FriendsService } from './friends.service';

interface FriendActivityRef {
  id: string;
  title: string;
  image_url: string | null;
}

interface FriendSlot {
  id: string;
  name: string;
  emoji: string | null;
  position: number;
  items: { position: number; activity: FriendActivityRef }[];
}

interface FriendWatch {
  rating: number | null;
  updated_at: string;
  activity: FriendActivityRef;
}

interface SharedParty {
  id: string;
  status: string;
  created_at: string;
  decided: { title: string } | null;
}

/**
 * A friend's profile: their radar (slots — readable via the friend RLS
 * policies), their recent watches (engagements with visibility='friends'),
 * and the parties you've been in together (party RLS means "their parties"
 * = the ones we share).
 */
@Component({
  selector: 'pp-friend-profile-page',
  imports: [RouterLink, StarRating],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-6 px-5 py-6">
      <div class="flex items-center gap-4">
        <button (click)="back()" class="text-2xl text-muted" aria-label="Back">‹</button>
        <span class="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold text-xl font-extrabold text-ink">
          {{ initial(name()) }}
        </span>
        <div class="min-w-0 flex-1">
          <h1 class="truncate font-display text-2xl font-semibold">{{ name() || '…' }}</h1>
          <p class="text-xs text-muted-2">
            {{ isFriend() ? 'Friend' : 'Radar profile' }}
            @if (tasteMatch() !== null) {
              · <span class="font-bold text-gold">{{ tasteMatch() }}% taste match</span>
            }
          </p>
        </div>
      </div>

      @if (isPrivate()) {
        <div class="flex flex-col items-center gap-3 py-16 text-center">
          <div class="text-4xl">🔒</div>
          <p class="font-bold">This profile is private</p>
        </div>
      } @else {
        @if (canSubscribe()) {
          <button
            (click)="toggleSubscribe()"
            class="rounded-2xl border-2 py-3 text-sm font-bold"
            [class]="
              friendsService.isSubscribedTo(id())
                ? 'border-green bg-green/10 text-green'
                : 'border-coral text-coral'
            "
          >
            {{ friendsService.isSubscribedTo(id()) ? '✓ Subscribed to their radar' : '＋ Subscribe to their radar' }}
          </button>
        }
      }

      @if (!isPrivate()) {
      <!-- their radar -->
      <div>
        <h2 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Their radar</h2>
        @if (!slots().length) {
          <p class="text-sm text-muted-2">Nothing on their radar yet.</p>
        }
        <div class="flex flex-col gap-3">
          @for (slot of slots(); track slot.id) {
            <div class="rounded-2xl border border-line bg-surface p-4">
              <a [routerLink]="['/radar/slot', slot.id]" class="flex items-center text-sm font-bold">
                <span class="min-w-0 flex-1 truncate">{{ slot.emoji }} {{ slot.name }}
                  <span class="font-normal text-muted"> · {{ slot.items.length }}</span></span>
                <span class="text-muted">›</span>
              </a>
              @if (slot.items.length) {
                <div class="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
                  @for (item of slot.items; track item.activity.id) {
                    <a [routerLink]="['/library', item.activity.id]" class="flex-none">
                      @if (item.activity.image_url) {
                        <img
                          [src]="item.activity.image_url"
                          [alt]="item.activity.title"
                          [title]="item.activity.title"
                          class="h-20 w-14 rounded-lg object-cover"
                        />
                      } @else {
                        <div class="flex h-20 w-14 items-center justify-center rounded-lg bg-surface-2 p-1 text-center text-[9px] font-bold text-muted">
                          {{ item.activity.title }}
                        </div>
                      }
                    </a>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- recent watches -->
      <div>
        <h2 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Recently watched</h2>
        @if (!watches().length) {
          <p class="text-sm text-muted-2">No shared watch history yet.</p>
        }
        <div class="flex flex-col gap-2.5">
          @for (w of watches(); track w.activity.id) {
            <a [routerLink]="['/library', w.activity.id]" class="flex items-center gap-3">
              @if (w.activity.image_url) {
                <img [src]="w.activity.image_url" alt="" class="h-14 w-10 flex-none rounded-lg object-cover" />
              } @else {
                <div class="h-14 w-10 flex-none rounded-lg bg-surface-2"></div>
              }
              <span class="min-w-0 flex-1 truncate text-sm font-bold">{{ w.activity.title }}</span>
              @if (w.rating) {
                <pp-star-rating class="pointer-events-none flex-none" [rating]="w.rating" />
              }
            </a>
          }
        </div>
      </div>

      <!-- parties together -->
      <div>
        <h2 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Parties together</h2>
        @if (!parties().length) {
          <p class="text-sm text-muted-2">No parties together yet — start one from ✦.</p>
        }
        <div class="flex flex-col gap-2">
          @for (p of parties(); track p.id) {
            <a [routerLink]="['/party', p.id]" class="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
              <span class="text-lg">🎉</span>
              <span class="min-w-0 flex-1 truncate text-sm font-bold">
                {{ p.decided?.title ?? 'Party' }}
                <span class="font-normal text-muted"> · {{ p.status }} · {{ dateOf(p) }}</span>
              </span>
              <span class="text-muted">›</span>
            </a>
          }
        </div>
      </div>
      }
    </div>
  `,
})
export class FriendProfilePage {
  protected readonly friendsService = inject(FriendsService);
  private readonly auth = inject(AuthService);

  /** Route param: the profile id (friend or stranger — RLS scopes content). */
  readonly id = input.required<string>();

  protected readonly name = signal('');
  protected readonly visibility = signal<'public' | 'friends' | 'private'>('friends');
  protected readonly tasteMatch = signal<number | null>(null);
  protected readonly slots = signal<FriendSlot[]>([]);
  protected readonly watches = signal<FriendWatch[]>([]);
  protected readonly parties = signal<SharedParty[]>([]);

  protected readonly isMe = computed(() => this.id() === this.auth.user()?.id);
  protected readonly isFriend = computed(() =>
    this.friendsService.friends().some((f) => f.id === this.id()),
  );
  protected readonly isPrivate = computed(() => this.visibility() === 'private' && !this.isMe());
  protected readonly canSubscribe = computed(
    () => !this.isMe() && (this.visibility() === 'public' || this.isFriend()),
  );

  constructor() {
    this.friendsService.load();
    queueMicrotask(() => this.load());
  }

  protected async toggleSubscribe() {
    if (this.friendsService.isSubscribedTo(this.id())) {
      await this.friendsService.unsubscribeProfile(this.id());
    } else {
      await this.friendsService.subscribeProfile(this.id());
    }
  }

  private async load() {
    const friendId = this.id();
    const supabase = getSupabase();
    this.friendsService.tasteMatch(friendId).then((m) => this.tasteMatch.set(m));
    const [profile, slots, watches, memberships] = await Promise.all([
      supabase.from('profiles').select('display_name, visibility').eq('id', friendId).maybeSingle(),
      supabase
        .from('radar_slots')
        .select(
          'id, name, emoji, position, items:radar_slot_items(position, activity:activities(id, title, image_url))',
        )
        .eq('owner_id', friendId)
        .order('position'),
      supabase
        .from('user_engagements')
        .select('rating, updated_at, activity:activities(id, title, image_url)')
        .eq('user_id', friendId)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('party_members')
        .select(
          'party:parties!inner(id, status, created_at, decided:activities!parties_decided_activity_id_fkey(title))',
        )
        .eq('user_id', friendId)
        .order('created_at', { ascending: false, referencedTable: 'party' }),
    ]);

    this.name.set((profile.data?.display_name as string | undefined) ?? '');
    this.visibility.set(
      ((profile.data as { visibility?: 'public' | 'friends' | 'private' } | null)?.visibility) ??
        'friends',
    );
    this.slots.set(
      ((slots.data ?? []) as unknown as FriendSlot[]).map((s) => ({
        ...s,
        items: [...s.items].sort((a, b) => a.position - b.position),
      })),
    );
    this.watches.set((watches.data ?? []) as unknown as FriendWatch[]);
    this.parties.set(
      ((memberships.data ?? []) as unknown as { party: SharedParty }[]).map((m) => m.party),
    );
  }

  protected initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  protected dateOf(p: SharedParty): string {
    return new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  protected back() {
    history.back();
  }
}
