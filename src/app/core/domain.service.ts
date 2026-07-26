import { Injectable, signal } from '@angular/core';

/**
 * The activity-domain switcher ("everything you want to try"): one app, the
 * same slots/search/detail machinery, different catalogs.
 *   watch = movies & shows (TMDB) · eat = restaurants (Google Places) ·
 *   do = places to go (Google Places) · read = books (Google Books)
 */
export type Domain = 'watch' | 'eat' | 'do' | 'read';

export interface DomainDef {
  id: Domain;
  label: string;
  emoji: string;
  searchPlaceholder: string;
  tagline: string;
  wantLabel: string;
}

export const DOMAINS: DomainDef[] = [
  {
    id: 'watch',
    label: 'Watch',
    emoji: '🎬',
    searchPlaceholder: 'Search movies & shows…',
    tagline: 'Your personal TV guide — queues with a pulse.',
    wantLabel: 'Want to',
  },
  {
    id: 'eat',
    label: 'Eat',
    emoji: '🍜',
    searchPlaceholder: 'Search restaurants nearby…',
    tagline: 'Places worth trying — queues with a pulse.',
    wantLabel: 'Want to try',
  },
  {
    id: 'do',
    label: 'Do',
    emoji: '🎯',
    searchPlaceholder: 'Search things to do…',
    tagline: 'Adventures on deck — queues with a pulse.',
    wantLabel: 'Want to go',
  },
  {
    id: 'read',
    label: 'Read',
    emoji: '📚',
    searchPlaceholder: 'Search books…',
    tagline: 'Your reading list — queues with a pulse.',
    wantLabel: 'Want to read',
  },
];

/** Which domain an activity belongs to. */
export function domainOf(activityType: string): Domain {
  switch (activityType) {
    case 'restaurant':
      return 'eat';
    case 'outing':
      return 'do';
    case 'book':
      return 'read';
    default:
      return 'watch';
  }
}

/** Domains whose catalog is Google Places (geo, hours, price). */
export function isPlaceDomain(domain: Domain): boolean {
  return domain === 'eat' || domain === 'do';
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
