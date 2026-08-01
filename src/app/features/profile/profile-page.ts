import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, HomeLocation } from '../../core/auth.service';
import { LocationService } from '../../core/location.service';
import { NotificationsService } from '../../core/notifications.service';
import { SafetyService } from '../../core/safety.service';
import { CityPicker } from '../../shared/ui/city-picker';
import { ReleaseNote, ReleaseNotesService } from '../../core/release-notes';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { LibraryEntry, LibraryService } from '../library/library.service';
import { NotificationBadge } from '../../shared/ui/notification-badge';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { StarRating } from '../../shared/ui/star-rating';
import { ToastService } from '../../shared/ui/toast.service';
import { ImportService } from './import.service';
import { HistoryItem, parseNetflixHistory } from './netflix-csv';
import { NotificationsPanel } from './notifications-panel';
import { ReleaseNotesModal } from './release-notes-modal';
import { TasteService } from './taste.service';

@Component({
  selector: 'pp-profile-page',
  imports: [
    CityPicker,
    FormsModule,
    RouterLink,
    NotificationBadge,
    NotificationsPanel,
    ReleaseNotesModal,
    ServiceBadges,
    StarRating,
  ],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-6 px-5 py-6">
      <div class="flex items-center gap-3">
        <h1 class="font-display flex-1 text-3xl font-semibold">You</h1>

        <div class="relative flex-none">
          <button
            (click)="panelOpen.set(!panelOpen())"
            aria-label="Notifications"
            class="relative flex size-11 items-center justify-center rounded-full border border-line bg-surface"
            [class.border-coral]="notifications.badgeCount() > 0"
          >
            <!-- bell -->
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
              [class]="notifications.badgeCount() > 0 ? 'text-coral' : 'text-muted-2'">
              <path d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.4 1.8 6H4.2C4.8 14.4 6 13 6 9Z" />
              <path d="M10 19a2 2 0 0 0 4 0" />
            </svg>
            <pp-notification-badge [count]="notifications.badgeCount()" />
          </button>

          @if (panelOpen()) {
            <pp-notifications-panel
              (close)="panelOpen.set(false)"
              (whatsNew)="openWhatsNew()"
            />
          }
        </div>

        <div
          class="flex size-11 flex-none items-center justify-center rounded-full bg-gradient-to-br from-coral to-gold font-display text-lg font-semibold text-ink"
          [attr.aria-label]="name || 'Your profile'"
        >
          {{ initial() }}
        </div>
      </div>

      @if (whatsNewNotes(); as notes) {
        <pp-release-notes-modal [notes]="notes" (close)="whatsNewNotes.set(null)" />
      }

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Display name</p>
        <div class="mt-2 flex gap-2">
          <input
            type="text"
            maxlength="30"
            [(ngModel)]="name"
            class="min-w-0 flex-1 rounded-xl border border-line bg-bg-warm px-3 py-2.5 font-bold text-cream focus:border-coral focus:outline-none"
          />
          <button
            (click)="saveName()"
            [disabled]="!name.trim() || saved()"
            class="rounded-xl bg-coral px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-60"
          >
            {{ saved() ? '✓' : 'Save' }}
          </button>
        </div>
        <p class="mt-3 text-xs text-muted">Signed in as {{ auth.user()?.email }}</p>
        <p class="mt-4 text-xs font-bold tracking-wide text-muted uppercase">Profile visibility</p>
        <div class="mt-2 flex gap-2">
          @for (v of visibilityOptions; track v.key) {
            <button
              (click)="setVisibility(v.key)"
              class="flex-1 rounded-2xl border py-2 text-xs font-bold"
              [class]="profileVisibility() === v.key ? 'border-coral bg-coral/15 text-coral' : 'border-line text-muted-2'"
            >
              {{ v.label }}
            </button>
          }
        </div>
        <p class="mt-1.5 text-[11px] text-muted">
          Public: anyone can view your page & public slots · Friends: friends only · Private: just you.
        </p>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Location</p>
        <div class="mt-2 flex items-center gap-2">
          <button
            (click)="pickerOpen.set(true)"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-warm px-3 py-2.5 text-left text-sm font-bold"
          >
            <span>🏠</span>
            <span class="min-w-0 truncate" [class.text-muted]="!homeCity()">
              {{ homeCity()?.name ?? 'Set your home city' }}
            </span>
          </button>
          @if (homeCity()) {
            <button
              (click)="clearHome()"
              class="flex-none rounded-xl border border-line px-3 py-2.5 text-sm font-bold text-muted-2"
              aria-label="Clear home city"
            >
              ✕
            </button>
          }
        </div>
        <p class="mt-1.5 text-[11px] text-muted">
          City-level only — used for "near home" defaults and the locals signal. Never your exact position.
        </p>

        <button
          (click)="toggleDiscoverable()"
          class="mt-3 flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left"
          [class]="geoDiscoverable() ? 'border-green bg-green/10' : 'border-line'"
        >
          <span class="text-lg">{{ geoDiscoverable() ? '📡' : '🫥' }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-bold">Discoverable by city</span>
            <span class="block text-xs text-muted-2">
              Let people searching your home city find your public profile & slots. Off by default.
            </span>
          </span>
          <span class="flex-none text-xs font-bold" [class]="geoDiscoverable() ? 'text-green' : 'text-muted-2'">
            {{ geoDiscoverable() ? 'On' : 'Off' }}
          </span>
        </button>
        @if (geoDiscoverable() && profileVisibility() !== 'public') {
          <p class="mt-1.5 text-[11px] font-bold text-gold">
            Heads up: only public profiles appear in city search — yours is {{ profileVisibility() }}.
          </p>
        }

        @if (blocked().length) {
          <p class="mt-4 text-xs font-bold tracking-wide text-muted uppercase">Blocked</p>
          <div class="mt-2 flex flex-col gap-2">
            @for (b of blocked(); track b.id) {
              <div class="flex items-center gap-2 text-sm">
                <span class="min-w-0 flex-1 truncate font-bold">{{ b.display_name }}</span>
                <button (click)="unblock(b.id)" class="flex-none text-xs font-bold text-coral">Unblock</button>
              </div>
            }
          </div>
        }
      </div>

      @if (pickerOpen()) {
        <pp-city-picker
          title="Home city"
          [allowNearMe]="false"
          (picked)="setHome($event)"
          (close)="pickerOpen.set(false)"
        />
      }

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">My streaming services</p>
        <div class="mt-3 grid grid-cols-2 gap-2.5">
          @for (s of subs.services(); track s.id) {
            <button
              (click)="subs.toggle(s.id)"
              class="flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-left"
              [class]="
                subs.mine().has(s.id) ? 'border-green bg-green/10' : 'border-line opacity-60'
              "
            >
              <pp-service-badges [services]="[s]" />
              <span class="min-w-0 flex-1 truncate text-xs font-bold">{{ s.name }}</span>
            </button>
          }
        </div>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">History</p>
        @if (!history().length) {
          <p class="mt-2 text-xs text-muted-2">Nothing finished yet — your watches land here.</p>
        }
        <div class="mt-3 flex flex-col gap-2.5">
          @for (e of history(); track e.id) {
            <div class="flex items-center gap-3">
              <a [routerLink]="['/library', e.activity.id]" class="flex min-w-0 flex-1 items-center gap-3">
                @if (e.activity.image_url) {
                  <img [src]="e.activity.image_url" alt="" class="h-14 w-10 flex-none rounded-lg object-cover" />
                } @else {
                  <div class="h-14 w-10 flex-none rounded-lg bg-surface-2"></div>
                }
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold">{{ e.activity.title }}</p>
                  @if (e.recommended_by) {
                    <p class="truncate text-[11px] text-muted">via {{ e.recommended_by }}</p>
                  }
                </div>
              </a>
              <pp-star-rating class="flex-none" [rating]="e.rating" (rated)="rate(e, $event)" />
            </div>
          }
        </div>
        @if (history().length >= historyLimit()) {
          <button (click)="historyLimit.set(historyLimit() + 20)" class="mt-3 w-full text-center text-xs font-bold text-muted-2">
            Show more
          </button>
        }
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">My taste</p>
        <p class="mt-2 text-xs text-muted-2">
          Tap to cycle: neutral → <span class="text-green">love</span> →
          <span class="text-coral">avoid</span>. This shapes your taste match with friends.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          @for (t of taste.tags(); track t.id) {
            <button
              (click)="taste.cycle(t)"
              class="rounded-full border-2 px-3.5 py-1.5 text-xs font-bold"
              [class]="
                t.state === 'love'
                  ? 'border-green bg-green/15 text-green'
                  : t.state === 'avoid'
                    ? 'border-coral bg-coral/15 text-coral line-through'
                    : 'border-line text-muted-2'
              "
            >
              @if (t.state === 'love') {
                ♥
              } @else if (t.state === 'avoid') {
                🚫
              }
              {{ t.label }}
            </button>
          }
        </div>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Netflix watch history</p>
        <p class="mt-2 text-xs leading-relaxed text-muted-2">
          Netflix → Account → your profile → <span class="text-cream">Viewing activity</span> →
          "Download all". Import the CSV to mark everything you've watched — parties stop
          suggesting things you've seen, and your taste profile gets much smarter.
        </p>

        @if (importer.running()) {
          @if (importer.progress(); as p) {
            <div class="mt-4">
              <div class="flex justify-between text-xs font-bold text-muted-2">
                <span>Importing… {{ p.done }} of {{ p.total }}</span>
                <span class="text-green">{{ p.matched }} matched</span>
              </div>
              <div class="mt-1.5 h-2 rounded-full bg-surface-2">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-coral to-gold transition-all"
                  [style.width.%]="p.total ? (p.done / p.total) * 100 : 0"
                ></div>
              </div>
              <p class="mt-2 text-xs text-muted">Keep this screen open — a couple of minutes for big histories.</p>
            </div>
          }
        } @else if (pendingItems(); as items) {
          <div class="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3.5">
            <p class="text-sm font-bold">
              Found {{ items.length }} titles
              <span class="font-normal text-muted-2">({{ seriesCount() }} shows · {{ items.length - seriesCount() }} movies)</span>
            </p>
            @if (droppedCount() > 0) {
              <p class="mt-1 text-xs text-muted-2">
                Big history! Importing the {{ items.length }} most recent; {{ droppedCount() }} older titles skipped.
              </p>
            }
            <div class="mt-3 flex gap-2">
              <button
                (click)="startImport()"
                class="flex-1 rounded-xl bg-coral px-4 py-2.5 text-sm font-bold text-ink"
              >
                Import →
              </button>
              <button
                (click)="pendingItems.set(null)"
                class="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-muted-2"
              >
                Cancel
              </button>
            </div>
          </div>
        } @else {
          <label
            class="mt-4 block cursor-pointer rounded-xl border-2 border-dashed border-line p-4 text-center text-sm font-bold text-muted-2"
          >
            📂 Choose NetflixViewingHistory.csv
            <input type="file" accept=".csv,text/csv" class="hidden" (change)="onFile($event)" />
          </label>
          @if (lastSummary()) {
            <p class="mt-3 text-xs text-muted-2">{{ lastSummary() }}</p>
          }
        }
      </div>

      <a
        routerLink="/profile/whats-new"
        class="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4"
      >
        <span class="text-lg leading-none">✨</span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-bold">What's new</span>
          <span class="block text-xs text-muted-2">
            Every release, newest first — you're on v{{ latestVersion() }}
          </span>
        </span>
        <span class="text-muted-2">→</span>
      </a>

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
  protected readonly notifications = inject(NotificationsService);
  protected readonly releases = inject(ReleaseNotesService);
  protected readonly subs = inject(SubscriptionsService);
  protected readonly importer = inject(ImportService);
  protected readonly taste = inject(TasteService);
  private readonly lib = inject(LibraryService);
  private readonly location = inject(LocationService);
  private readonly safety = inject(SafetyService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly historyLimit = signal(20);
  protected readonly history = computed(() =>
    this.lib
      .entries()
      .filter((e) => e.status === 'completed')
      .slice(0, this.historyLimit()),
  );

  protected async rate(entry: LibraryEntry, rating: number) {
    try {
      await this.lib.rate(entry.activity.id, rating);
    } catch {
      this.toast.error('Could not save your rating — try again.');
    }
  }

  protected readonly panelOpen = signal(false);
  /** Non-null while the What's-new modal is up; holds the notes it was opened with. */
  protected readonly whatsNewNotes = signal<readonly ReleaseNote[] | null>(null);
  protected readonly latestVersion = computed(() => this.releases.all[0]?.version ?? '0');
  protected readonly initial = computed(() =>
    (this.name || this.auth.user()?.email || '?').trim().charAt(0).toUpperCase(),
  );

  /**
   * Snapshot the unseen notes BEFORE marking them seen — otherwise
   * `releases.unseen()` empties the moment the watermark moves and the modal
   * renders nothing.
   */
  protected openWhatsNew() {
    const notes = this.releases.unseen();
    this.panelOpen.set(false);
    if (!notes.length) return;
    this.whatsNewNotes.set(notes);
    const userId = this.auth.user()?.id;
    if (userId) void this.releases.markAllSeen(userId);
  }

  protected name = '';
  protected readonly saved = signal(false);
  protected readonly profileVisibility = signal<'public' | 'friends' | 'private'>('friends');
  protected readonly visibilityOptions: { key: 'public' | 'friends' | 'private'; label: string }[] = [
    { key: 'public', label: '🌐 Public' },
    { key: 'friends', label: '👥 Friends' },
    { key: 'private', label: '🔒 Private' },
  ];

  protected async setVisibility(v: 'public' | 'friends' | 'private') {
    this.profileVisibility.set(v);
    await this.auth.setProfileVisibility(v);
  }

  // ---- location & safety (v0.14) ----
  protected readonly pickerOpen = signal(false);
  protected readonly homeCity = signal<HomeLocation | null>(null);
  protected readonly geoDiscoverable = signal(false);
  protected readonly blocked = signal<{ id: string; display_name: string }[]>([]);

  protected async setHome(pick: HomeLocation) {
    this.homeCity.set(pick);
    this.location.setHome(pick);
    await this.auth.setHomeLocation(pick);
    this.toast.success(`Home city set to ${pick.name} ✓`);
  }

  protected async clearHome() {
    this.homeCity.set(null);
    this.location.setHome(null);
    await this.auth.setHomeLocation(null);
  }

  protected async toggleDiscoverable() {
    const next = !this.geoDiscoverable();
    this.geoDiscoverable.set(next);
    await this.auth.setGeoDiscoverable(next);
  }

  protected async unblock(userId: string) {
    await this.safety.unblock(userId);
    this.blocked.set(this.blocked().filter((b) => b.id !== userId));
  }

  protected readonly pendingItems = signal<HistoryItem[] | null>(null);
  protected readonly droppedCount = signal(0);
  protected readonly lastSummary = signal('');
  protected readonly seriesCount = computed(
    () => this.pendingItems()?.filter((i) => i.isSeries).length ?? 0,
  );

  protected async onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = parseNetflixHistory(await file.text());
      if (!parsed.length) throw new Error('No titles found in that file.');
      const { items, dropped } = this.importer.capped(parsed);
      this.pendingItems.set(items);
      this.droppedCount.set(dropped);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  protected async startImport() {
    const items = this.pendingItems();
    if (!items) return;
    this.pendingItems.set(null);
    try {
      const result = await this.importer.run(items);
      const skipped = result.unmatched.length;
      this.lastSummary.set(
        `Imported ${result.matched} titles ✓` +
          (skipped
            ? ` · ${skipped} couldn't be matched (${result.unmatched.slice(0, 3).join(', ')}${skipped > 3 ? '…' : ''})`
            : ''),
      );
      this.toast.success(`Watch history imported — ${result.matched} titles added.`);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Import failed — try again.');
    }
  }

  constructor() {
    this.subs.load();
    this.taste.load();
    this.lib.load();
    this.notifications.load();
    this.auth.getOrCreateProfile().then((p) => {
      if (p && !this.name) this.name = p.display_name;
      if (p?.visibility) this.profileVisibility.set(p.visibility);
      this.homeCity.set(p?.home_location ?? null);
      this.geoDiscoverable.set(p?.geo_discoverable ?? false);
      if (p?.home_location) this.location.setHome(p.home_location);
    });
    this.safety.blockedProfiles().then((b) => this.blocked.set(b));
  }

  protected async saveName() {
    await this.auth.updateDisplayName(this.name.trim());
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 1500);
  }

  protected async signOut() {
    this.notifications.reset(); // drop the channel + this account's inbox
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
