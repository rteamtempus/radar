import { Injectable, signal } from '@angular/core';

/**
 * The activity-domain switcher ("everything you want to try"): one app, the
 * same slots/search/detail machinery, different catalogs. 'watch' = movies &
 * shows (TMDB), 'eat' = restaurants (Google Places). More domains later
 * (events/Ticketmaster is next).
 */
export type Domain = 'watch' | 'eat';

export interface DomainDef {
  id: Domain;
  label: string;
  emoji: string;
  searchPlaceholder: string;
}

export const DOMAINS: DomainDef[] = [
  { id: 'watch', label: 'Watch', emoji: '🎬', searchPlaceholder: 'Search movies & shows…' },
  { id: 'eat', label: 'Eat', emoji: '🍜', searchPlaceholder: 'Search restaurants nearby…' },
];

/** Which domain an activity belongs to. */
export function domainOf(activityType: string): Domain {
  return activityType === 'restaurant' ? 'eat' : 'watch';
}

const STORAGE_KEY = 'radar-domain';

@Injectable({ providedIn: 'root' })
export class DomainService {
  readonly domain = signal<Domain>(
    (localStorage.getItem(STORAGE_KEY) as Domain | null) ?? 'watch',
  );

  set(domain: Domain) {
    this.domain.set(domain);
    localStorage.setItem(STORAGE_KEY, domain);
  }

  def(): DomainDef {
    return DOMAINS.find((d) => d.id === this.domain()) ?? DOMAINS[0];
  }
}
