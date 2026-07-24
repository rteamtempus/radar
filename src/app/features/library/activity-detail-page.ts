import { Component, computed, inject, input, signal } from '@angular/core';
import { getSupabase } from '../../core/supabase.client';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { StarRating } from '../../shared/ui/star-rating';
import {
  ActivitySummary,
  EngagementStatus,
  LibraryService,
  ServiceRef,
} from './library.service';

interface ActivityDetail extends ActivitySummary {
  activity_tags?: { tag: { label: string; kind: string } }[];
}

import { SERVICE_HOMEPAGES } from '../../core/streaming-links';

@Component({
  selector: 'pp-activity-detail-page',
  imports: [ServiceBadges, StarRating],
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

          <div>
            <h2 class="mb-2.5 text-xs font-bold tracking-wide text-muted uppercase">My status</h2>
            <div class="flex gap-2">
              @for (s of statusOptions; track s.key) {
                <button
                  (click)="setStatus(s.key)"
                  class="flex-1 rounded-2xl border py-2.5 text-sm font-bold"
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
            @if (status() === 'completed') {
              <div class="mt-3 flex items-center gap-3">
                <pp-star-rating [rating]="rating()" (rated)="rate($event)" />
                @if (rating(); as r) {
                  <span class="text-sm font-bold text-gold">{{ r }}/10</span>
                }
              </div>
            }
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

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly activity = signal<ActivityDetail | null>(null);
  protected readonly checkingAvailability = signal(true);

  protected readonly statusOptions = [
    { key: 'want_to' as EngagementStatus, label: 'Want to' },
    { key: 'in_progress' as EngagementStatus, label: 'Watching' },
    { key: 'completed' as EngagementStatus, label: 'Done' },
  ];

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
      .filter((t) => t.tag.kind === 'genre')
      .map((t) => t.tag.label),
  );

  constructor() {
    if (this.lib.entries().length === 0) this.lib.load();
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
          'activity_tags(tag:tags(label, kind))',
      )
      .eq('id', this.id())
      .single();
    if (data) this.activity.set(data as unknown as ActivityDetail);
  }

  protected subtitle(): string {
    const a = this.activity();
    if (!a) return '';
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
