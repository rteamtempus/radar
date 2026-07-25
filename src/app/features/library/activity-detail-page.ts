import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getSupabase } from '../../core/supabase.client';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { StarRating } from '../../shared/ui/star-rating';
import { ToastService } from '../../shared/ui/toast.service';
import {
  ActivitySummary,
  EngagementStatus,
  LibraryService,
  ServiceRef,
} from './library.service';

type ActivityDetail = ActivitySummary;

import { SERVICE_HOMEPAGES } from '../../core/streaming-links';
import { FriendProfile, FriendsService } from '../friends/friends.service';

@Component({
  selector: 'pp-activity-detail-page',
  imports: [FormsModule, ServiceBadges, StarRating],
  template: `
    @if (activity(); as a) {
      <div class="mx-auto max-w-md pb-8">
        <div class="relative">
          @if (a.image_url) {
            <img [src]="a.image_url" [alt]="a.title" class="h-105 w-full object-cover" />
            <div class="absolute inset-0 bg-gradient-to-t from-bg-warm via-transparent"></div>
          }
          <button
            (click)="back()"
            class="absolute top-4 left-4 flex size-10 items-center justify-center rounded-full bg-bg/60 text-xl backdrop-blur"
            aria-label="Back"
          >
            ‹
          </button>
          <div class="absolute right-0 bottom-0 left-0 p-5">
            <h1 class="font-display text-3xl font-bold drop-shadow">{{ a.title }}</h1>
            <p class="mt-1 text-sm font-bold text-muted-2">{{ subtitle() }}</p>
          </div>
        </div>

        <div class="flex flex-col gap-6 px-5 pt-5">
          @if (genreTags().length) {
            <div class="flex flex-wrap gap-2">
              @for (t of genreTags(); track t) {
                <span
                  class="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted-2"
                  >{{ t }}</span
                >
              }
            </div>
          }

          @if (a.description) {
            <p class="text-sm leading-relaxed text-muted-2">{{ a.description }}</p>
          }

          @if (isRestaurant()) {
            <!-- ============ restaurant: visit info ============ -->
            <div>
              <h2 class="mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">Visit</h2>
              <div class="flex flex-col gap-2">
                @if (activity()?.metadata?.open_now !== null && activity()?.metadata?.open_now !== undefined) {
                  <span
                    class="self-start rounded-full px-3 py-1.5 text-xs font-bold"
                    [class]="activity()?.metadata?.open_now ? 'bg-green/15 text-green' : 'bg-coral/15 text-coral'"
                  >
                    {{ activity()?.metadata?.open_now ? '● Open now' : '● Closed right now' }}
                  </span>
                }
                @if (activity()?.metadata?.address; as addr) {
                  <p class="text-sm text-muted-2">{{ addr }}</p>
                }
                <div class="flex gap-2">
                  @if (activity()?.metadata?.maps_url; as maps) {
                    <a [href]="maps" target="_blank" rel="noopener" class="flex-1 rounded-2xl bg-coral py-3 text-center text-sm font-bold text-ink">
                      🗺 Open in Maps
                    </a>
                  }
                  @if (activity()?.metadata?.phone; as phone) {
                    <a [href]="'tel:' + phone" class="rounded-2xl border border-line px-4 py-3 text-sm font-bold text-muted-2">📞</a>
                  }
                  @if (activity()?.metadata?.website; as site) {
                    <a [href]="site" target="_blank" rel="noopener" class="rounded-2xl border border-line px-4 py-3 text-sm font-bold text-muted-2">↗</a>
                  }
                </div>
                @if (activity()?.metadata?.hours; as hours) {
                  <details class="mt-1 text-xs text-muted-2">
                    <summary class="cursor-pointer font-bold text-muted">Hours</summary>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                      @for (line of hours; track line) {
                        <span>{{ line }}</span>
                      }
                    </div>
                  </details>
                }
              </div>
            </div>
          } @else {
            <!-- ============ media: streaming availability ============ -->
            <div>
              <h2 class="mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">Available on</h2>
              @if (services().length === 0) {
                <p class="text-sm text-muted">
                  {{ checkingAvailability() ? 'Checking availability…' : 'Not streaming on your services right now.' }}
                </p>
              }
              <div class="flex flex-col gap-2">
                @for (s of services(); track s.slug) {
                  <div class="flex items-center gap-3 rounded-2xl bg-surface p-3">
                    <pp-service-badges [services]="[s]" />
                    <span class="flex-1 text-sm font-bold">{{ s.name }}</span>
                    <a
                      [href]="homepage(s)"
                      target="_blank"
                      rel="noopener"
                      class="rounded-full bg-coral px-4 py-2 text-xs font-bold text-ink"
                      >Open ↗</a
                    >
                  </div>
                }
              </div>
            </div>
          }

          <div>
            <h2 class="mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">My status</h2>
            <div class="grid grid-cols-3 gap-2">
              @for (s of statusOptions(); track s.key) {
                <button
                  (click)="setStatus(s.key)"
                  class="rounded-2xl border py-2.5 text-sm font-bold"
                  [class]="
                    status() === s.key
                      ? 'border-coral bg-coral/15 text-coral'
                      : 'border-line text-muted-2'
                  "
                >
                  {{ s.label }}
                </button>
              }
            </div>
            <p class="mt-1.5 text-[11px] text-muted">
              {{
                isRestaurant()
                  ? 'Want to try → your Want-to-try slot · statuses drive your radar.'
                  : 'Want to → Up next · Watching → Watching now · statuses drive your slots.'
              }}
            </p>
            @if (status() === 'completed') {
              <div class="mt-3 flex items-center gap-3">
                <pp-star-rating [rating]="rating()" (rated)="rate($event)" />
                @if (rating(); as r) {
                  <span class="text-sm font-bold text-gold">{{ r }}/10</span>
                }
              </div>
              <button
                (click)="toggleRewatch()"
                class="mt-3 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left text-sm font-bold"
                [class]="
                  isRewatchable() ? 'border-violet bg-violet/10 text-violet' : 'border-line text-muted-2'
                "
              >
                <span class="text-lg">🔁</span>
                {{ isRestaurant() ? 'Would go again' : 'Would watch again' }}
                @if (isRewatchable()) {
                  <span class="ml-auto">✓ {{ isRestaurant() ? 'a go-to spot' : 'in your Rewatch slot' }}</span>
                }
              </button>
            }
          </div>

          @if (friends.friends().length) {
            <div>
              <h2 class="mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">
                Recommend to a friend
              </h2>
              <div class="flex flex-wrap gap-2">
                @for (f of friends.friends(); track f.id) {
                  <button
                    (click)="recommend(f)"
                    [disabled]="recommendedTo().has(f.id)"
                    class="rounded-full border-2 px-3.5 py-2 text-sm font-bold"
                    [class]="
                      recommendedTo().has(f.id)
                        ? 'border-green bg-green/10 text-green'
                        : 'border-line text-muted-2'
                    "
                  >
                    {{ recommendedTo().has(f.id) ? '✓ Sent to ' + f.display_name : '🎁 ' + f.display_name }}
                  </button>
                }
              </div>
            </div>
          }

          <div>
            <h2 class="mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">My card</h2>
            <input
              type="text"
              maxlength="60"
              placeholder="Recommended by… (e.g. Dave)"
              [(ngModel)]="recommendedBy"
              class="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
            />
            <textarea
              rows="3"
              maxlength="500"
              placeholder="Notes to self — why it's on your radar, what episode you're on…"
              [(ngModel)]="notes"
              class="mt-2.5 w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-cream placeholder:text-muted focus:border-coral focus:outline-none"
            ></textarea>
            <button
              (click)="saveMeta()"
              [disabled]="metaSaved()"
              class="mt-2 rounded-xl bg-coral px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-60"
            >
              {{ metaSaved() ? '✓ Saved' : 'Save card' }}
            </button>
          </div>
        </div>
      </div>
    } @else {
      <div class="flex min-h-dvh items-center justify-center">
        <div class="size-10 animate-spin rounded-full border-4 border-surface-2 border-t-coral"></div>
      </div>
    }
  `,
})
export class ActivityDetailPage {
  private lib = inject(LibraryService);
  private toast = inject(ToastService);
  protected readonly friends = inject(FriendsService);

  protected readonly recommendedTo = signal<ReadonlySet<string>>(new Set());

  protected readonly isRewatchable = computed(
    () => this.lib.entries().find((e) => e.activity.id === this.id())?.is_rewatchable ?? false,
  );

  protected async toggleRewatch() {
    try {
      await this.lib.setRewatchable(this.id(), !this.isRewatchable());
    } catch {
      this.toast.error('Could not update — try again.');
    }
  }

  protected async recommend(friend: FriendProfile) {
    if (await this.friends.recommend(friend.id, this.id())) {
      this.recommendedTo.update((s) => new Set([...s, friend.id]));
      this.toast.success(`Recommended to ${friend.display_name} ✓`);
    }
  }

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected notes = '';
  protected recommendedBy = '';
  protected readonly metaSaved = signal(false);
  private metaPrefilled = false;

  private readonly prefillMeta = effect(() => {
    const entry = this.lib.entries().find((e) => e.activity.id === this.id());
    if (entry && !this.metaPrefilled) {
      this.metaPrefilled = true;
      this.notes = entry.notes ?? '';
      this.recommendedBy = entry.recommended_by ?? '';
    }
  });

  protected async saveMeta() {
    try {
      await this.lib.updateMeta(this.id(), {
        notes: this.notes.trim() || null,
        recommended_by: this.recommendedBy.trim() || null,
      });
      this.metaSaved.set(true);
      setTimeout(() => this.metaSaved.set(false), 1500);
    } catch {
      this.toast.error('Could not save — try again.');
    }
  }

  protected readonly activity = signal<ActivityDetail | null>(null);
  protected readonly checkingAvailability = signal(true);

  protected readonly isRestaurant = computed(() => this.activity()?.type === 'restaurant');

  protected readonly statusOptions = computed<{ key: EngagementStatus; label: string }[]>(() =>
    this.isRestaurant()
      ? [
          { key: 'want_to', label: 'Want to try' },
          { key: 'completed', label: 'Been there' },
          { key: 'not_interested', label: 'Not for me' },
        ]
      : [
          { key: 'want_to', label: 'Want to' },
          { key: 'in_progress', label: 'Watching' },
          { key: 'completed', label: 'Done' },
          { key: 'abandoned', label: 'Stopped' },
          { key: 'not_interested', label: 'Not for me' },
        ],
  );

  protected readonly status = computed(
    () => this.lib.entries().find((e) => e.activity.id === this.id())?.status,
  );
  protected readonly rating = computed(
    () => this.lib.entries().find((e) => e.activity.id === this.id())?.rating ?? null,
  );
  protected readonly services = computed<ServiceRef[]>(() =>
    (this.activity()?.activity_availability ?? []).map((a) => a.service),
  );
  protected readonly genreTags = computed(() =>
    (this.activity()?.activity_tags ?? [])
      .filter((t) => t.tag.kind === 'genre' || t.tag.kind === 'cuisine')
      .map((t) => t.tag.label),
  );

  constructor() {
    if (this.lib.entries().length === 0) this.lib.load();
    this.friends.load();
    queueMicrotask(() => this.fetch());
  }

  private async fetch() {
    await this.loadFromDb();
    // Refresh runtime/availability from TMDB, then re-read.
    const a = this.activity();
    if (a?.external_id) {
      await this.lib.hydrate(a);
      await this.loadFromDb();
    }
    this.checkingAvailability.set(false);
  }

  private async loadFromDb() {
    const { data } = await getSupabase()
      .from('activities')
      .select(
        'id, type, title, description, image_url, duration_min, external_id, metadata, ' +
          'activity_availability(service:streaming_services(slug, name)), ' +
          'activity_tags(tag:tags(slug, label, kind))',
      )
      .eq('id', this.id())
      .single();
    if (data) this.activity.set(data as unknown as ActivityDetail);
  }

  protected subtitle(): string {
    const a = this.activity();
    if (!a) return '';
    if (a.type === 'restaurant') {
      const parts: string[] = [];
      if (a.metadata?.price_level) parts.push('$'.repeat(a.metadata.price_level));
      if (a.metadata?.rating) {
        parts.push(
          `★ ${a.metadata.rating}${a.metadata.rating_count ? ` (${a.metadata.rating_count})` : ''}`,
        );
      }
      return parts.join(' · ') || 'Restaurant';
    }
    const parts: string[] = [];
    if (a.metadata?.release_year) parts.push(String(a.metadata.release_year));
    parts.push(a.type === 'movie' ? 'Movie' : 'Series');
    if (a.type === 'movie' && a.duration_min) {
      parts.push(`${Math.floor(a.duration_min / 60)}h ${a.duration_min % 60}m`);
    }
    if (a.metadata?.tmdb_vote) parts.push(`★ ${Number(a.metadata.tmdb_vote).toFixed(1)}`);
    return parts.join(' · ');
  }

  protected homepage(s: ServiceRef): string {
    return SERVICE_HOMEPAGES[s.slug] ?? '#';
  }

  protected setStatus(status: EngagementStatus) {
    return this.lib.setStatus(this.id(), status);
  }

  protected rate(rating: number) {
    return this.lib.rate(this.id(), rating);
  }

  protected back() {
    history.back();
  }
}
