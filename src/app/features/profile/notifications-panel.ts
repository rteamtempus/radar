import { Component, inject, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationView, NotificationsService } from '../../core/notifications.service';
import { ReleaseNotesService } from '../../core/release-notes';

/**
 * The bell drop-down. The first row is synthetic when there are unread release
 * notes — release notes are bundled with the build, not rows in the inbox
 * (see core/release-notes.ts), so they collapse into ONE entry that opens the
 * whole backlog.
 */
@Component({
  selector: 'pp-notifications-panel',
  imports: [RouterLink],
  template: `
    <!-- click-away shield -->
    <div class="fixed inset-0 z-30" (click)="close.emit()"></div>

    <div
      class="absolute top-full right-0 z-40 mt-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/60"
    >
      <div class="flex items-center justify-between border-b border-line px-4 py-3">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Notifications</p>
        @if (notifications.unreadCount() > 0) {
          <button (click)="notifications.markAllRead()" class="text-[11px] font-bold text-muted-2">
            Mark all read
          </button>
        }
      </div>

      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        @if (releases.hasUnseen()) {
          <button
            (click)="whatsNew.emit()"
            class="flex w-full items-start gap-3 border-b border-line bg-gold/8 px-4 py-3 text-left"
          >
            <span class="text-lg leading-none">✨</span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold">
                What's new in Radar
                <span class="ml-1 rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] text-gold">
                  {{ releases.unseen().length }}
                </span>
              </span>
              <span class="mt-0.5 block text-xs leading-snug text-muted-2">
                {{ releases.unseen()[0].title }} — and
                {{ releases.unseen().length === 1 ? 'that is it' : (releases.unseen().length - 1) + ' more' }}.
                Tap to catch up.
              </span>
            </span>
            <span class="mt-1.5 size-2 flex-none rounded-full bg-gold"></span>
          </button>
        }

        @for (n of notifications.items(); track n.id) {
          <button
            (click)="openItem(n)"
            class="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-b-0"
            [class]="n.read_at ? '' : 'bg-coral/8'"
          >
            @if (n.imageUrl) {
              <img [src]="n.imageUrl" alt="" class="h-12 w-8 flex-none rounded-md object-cover" />
            } @else {
              <span class="text-lg leading-none">{{ n.icon }}</span>
            }
            <span class="min-w-0 flex-1">
              <span class="block text-sm leading-snug font-bold">{{ n.title }}</span>
              <span class="mt-0.5 block text-xs leading-snug text-muted-2">{{ n.body }}</span>
              <span class="mt-1 block text-[10px] font-bold text-muted">{{ ago(n.created_at) }}</span>
            </span>
            @if (!n.read_at) {
              <span class="mt-1.5 size-2 flex-none rounded-full bg-coral"></span>
            }
          </button>
        }

        @if (!releases.hasUnseen() && !notifications.items().length) {
          <p class="px-4 py-8 text-center text-xs text-muted-2">
            Nothing yet. Recommend something to a friend and you'll hear back here.
          </p>
        }
      </div>

      <a
        routerLink="/profile/whats-new"
        (click)="close.emit()"
        class="border-t border-line px-4 py-3 text-center text-[11px] font-bold text-muted-2"
      >
        All release notes →
      </a>
    </div>
  `,
})
export class NotificationsPanel {
  protected readonly notifications = inject(NotificationsService);
  protected readonly releases = inject(ReleaseNotesService);
  private readonly router = inject(Router);

  readonly close = output<void>();
  readonly whatsNew = output<void>();

  protected async openItem(n: NotificationView) {
    void this.notifications.markRead(n.id);
    this.close.emit();
    if (n.link) await this.router.navigateByUrl(n.link);
  }

  protected ago(iso: string): string {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString();
  }
}
