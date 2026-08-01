// Curated category vocabularies — the fix for junk filter chips
// (docs/API-CAPABILITIES.md). Incoming items are tagged against these fixed
// lists from each API's CLEAN field (Places primaryType, TMDB genre ids,
// Open Library subjects); the client renders chips from the same lists
// (mirrored in src/app/core/vocab.ts — keep the slugs in sync).

// ---- Eat: Places primaryType → curated cuisine ------------------------------

export interface CuisineDef {
  slug: string;
  label: string;
  /** Places types that mean this cuisine; [0] is used as includedType for API search. */
  types: string[];
}

export const CUISINES: CuisineDef[] = [
  { slug: 'pizza', label: 'Pizza', types: ['pizza_restaurant'] },
  { slug: 'burgers', label: 'Burgers', types: ['hamburger_restaurant'] },
  { slug: 'mexican', label: 'Mexican', types: ['mexican_restaurant'] },
  { slug: 'italian', label: 'Italian', types: ['italian_restaurant'] },
  { slug: 'chinese', label: 'Chinese', types: ['chinese_restaurant'] },
  { slug: 'japanese', label: 'Japanese', types: ['japanese_restaurant'] },
  { slug: 'sushi', label: 'Sushi', types: ['sushi_restaurant'] },
  { slug: 'ramen', label: 'Ramen', types: ['ramen_restaurant'] },
  { slug: 'thai', label: 'Thai', types: ['thai_restaurant'] },
  { slug: 'indian', label: 'Indian', types: ['indian_restaurant'] },
  { slug: 'korean', label: 'Korean', types: ['korean_restaurant'] },
  { slug: 'vietnamese', label: 'Vietnamese', types: ['vietnamese_restaurant'] },
  { slug: 'mediterranean', label: 'Mediterranean', types: ['mediterranean_restaurant', 'greek_restaurant', 'lebanese_restaurant', 'turkish_restaurant'] },
  { slug: 'american', label: 'American', types: ['american_restaurant'] },
  { slug: 'bbq', label: 'BBQ', types: ['barbecue_restaurant'] },
  { slug: 'seafood', label: 'Seafood', types: ['seafood_restaurant'] },
  { slug: 'steak', label: 'Steak', types: ['steak_house'] },
  { slug: 'breakfast', label: 'Breakfast', types: ['breakfast_restaurant', 'brunch_restaurant'] },
  { slug: 'cafe', label: 'Café', types: ['cafe', 'coffee_shop', 'bakery'] },
  { slug: 'dessert', label: 'Dessert', types: ['dessert_shop', 'ice_cream_shop', 'dessert_restaurant'] },
  { slug: 'vegan', label: 'Vegan', types: ['vegan_restaurant', 'vegetarian_restaurant'] },
];

// ---- Do: Places primaryType → curated outing theme --------------------------

export const DO_THEMES: CuisineDef[] = [
  { slug: 'museum', label: 'Museum', types: ['museum', 'history_museum', 'science_museum'] },
  { slug: 'art', label: 'Art', types: ['art_gallery', 'art_studio', 'cultural_center'] },
  { slug: 'amusement-park', label: 'Amusement park', types: ['amusement_park', 'water_park', 'roller_coaster'] },
  { slug: 'zoo', label: 'Zoo', types: ['zoo', 'wildlife_park', 'wildlife_refuge'] },
  { slug: 'aquarium', label: 'Aquarium', types: ['aquarium'] },
  { slug: 'bowling', label: 'Bowling', types: ['bowling_alley'] },
  { slug: 'park', label: 'Park', types: ['park', 'state_park', 'national_park', 'botanical_garden', 'garden'] },
  { slug: 'hiking', label: 'Hiking', types: ['hiking_area'] },
  { slug: 'landmark', label: 'Landmark', types: ['historical_landmark', 'historical_place', 'monument', 'tourist_attraction'] },
  { slug: 'theater', label: 'Theater', types: ['performing_arts_theater', 'concert_hall', 'amphitheatre', 'opera_house'] },
  { slug: 'games', label: 'Games', types: ['video_arcade', 'miniature_golf_course', 'laser_tag_center', 'escape_room_center'] },
  { slug: 'spa', label: 'Spa', types: ['spa', 'sauna', 'wellness_center'] },
];

/** primaryType → one curated tag ({slug,label}), or null if it maps to nothing. */
export function placeTag(
  primaryType: string | undefined,
  kind: 'eat' | 'do',
): { slug: string; label: string } | null {
  if (!primaryType) return null;
  const defs = kind === 'eat' ? CUISINES : DO_THEMES;
  const hit = defs.find((d) => d.types.includes(primaryType));
  return hit ? { slug: hit.slug, label: hit.label } : null;
}

/** Curated chip slug → the Places type to send as includedType (or null). */
export function includedTypeFor(slug: string, kind: 'eat' | 'do'): string | null {
  const defs = kind === 'eat' ? CUISINES : DO_THEMES;
  return defs.find((d) => d.slug === slug)?.types[0] ?? null;
}

// ---- Read: Open Library subjects → curated genre buckets --------------------

export interface BookBucket {
  slug: string;
  label: string;
  /** lowercase substrings matched against OL subject strings */
  match: string[];
}

export const BOOK_BUCKETS: BookBucket[] = [
  { slug: 'fantasy', label: 'Fantasy', match: ['fantasy'] },
  { slug: 'science-fiction', label: 'Sci-Fi', match: ['science fiction', 'sci-fi'] },
  { slug: 'mystery', label: 'Mystery', match: ['mystery', 'detective'] },
  { slug: 'thriller', label: 'Thriller', match: ['thriller', 'suspense'] },
  { slug: 'romance', label: 'Romance', match: ['romance', 'love stories'] },
  { slug: 'horror', label: 'Horror', match: ['horror', 'ghost stories'] },
  { slug: 'historical-fiction', label: 'Historical fiction', match: ['historical fiction'] },
  { slug: 'young-adult', label: 'Young adult', match: ['young adult', 'juvenile fiction'] },
  { slug: 'children', label: "Children's", match: ["children's", 'juvenile literature', 'picture books'] },
  { slug: 'biography', label: 'Biography', match: ['biography', 'autobiograph', 'memoir'] },
  { slug: 'history', label: 'History', match: ['history'] },
  { slug: 'science', label: 'Science', match: ['science', 'physics', 'biology', 'astronomy'] },
  { slug: 'self-help', label: 'Self-help', match: ['self-help', 'self help', 'personal development', 'psychology'] },
  { slug: 'business', label: 'Business', match: ['business', 'economics', 'management'] },
  { slug: 'cooking', label: 'Cooking', match: ['cooking', 'cookbooks', 'cookery'] },
  { slug: 'poetry', label: 'Poetry', match: ['poetry', 'poems'] },
  { slug: 'classics', label: 'Classics', match: ['classic literature', 'classics'] },
  { slug: 'comics', label: 'Comics', match: ['comic', 'graphic novel', 'manga'] },
];

/** OL subject strings → up to 3 curated buckets. */
export function bookTags(subjects: string[] | undefined): { slug: string; label: string }[] {
  if (!subjects?.length) return [];
  const joined = subjects.slice(0, 60).map((s) => s.toLowerCase());
  const out: { slug: string; label: string }[] = [];
  for (const b of BOOK_BUCKETS) {
    if (joined.some((s) => b.match.some((m) => s.includes(m)))) {
      out.push({ slug: b.slug, label: b.label });
      if (out.length >= 3) break;
    }
  }
  return out;
}

// ---- Watch: fixed TMDB genre chips ------------------------------------------
// Slugs match what upsertActivity writes (slugified TMDB genre names), so the
// same chips filter both the local catalog and discover queries.

export interface WatchGenre {
  slug: string;
  label: string;
  movieIds: number[];
  tvIds: number[];
}

export const WATCH_GENRES: WatchGenre[] = [
  { slug: 'action', label: 'Action', movieIds: [28], tvIds: [10759] },
  { slug: 'adventure', label: 'Adventure', movieIds: [12], tvIds: [10759] },
  { slug: 'animation', label: 'Animation', movieIds: [16], tvIds: [16] },
  { slug: 'comedy', label: 'Comedy', movieIds: [35], tvIds: [35] },
  { slug: 'crime', label: 'Crime', movieIds: [80], tvIds: [80] },
  { slug: 'documentary', label: 'Documentary', movieIds: [99], tvIds: [99] },
  { slug: 'drama', label: 'Drama', movieIds: [18], tvIds: [18] },
  { slug: 'family', label: 'Family', movieIds: [10751], tvIds: [10751] },
  { slug: 'fantasy', label: 'Fantasy', movieIds: [14], tvIds: [10765] },
  { slug: 'history', label: 'History', movieIds: [36], tvIds: [] },
  { slug: 'horror', label: 'Horror', movieIds: [27], tvIds: [] },
  { slug: 'music', label: 'Music', movieIds: [10402], tvIds: [] },
  { slug: 'mystery', label: 'Mystery', movieIds: [9648], tvIds: [9648] },
  { slug: 'romance', label: 'Romance', movieIds: [10749], tvIds: [] },
  { slug: 'science-fiction', label: 'Sci-Fi', movieIds: [878], tvIds: [10765] },
  { slug: 'thriller', label: 'Thriller', movieIds: [53], tvIds: [] },
  { slug: 'war', label: 'War', movieIds: [10752], tvIds: [10768] },
  { slug: 'western', label: 'Western', movieIds: [37], tvIds: [37] },
];

export function genreIdsFor(slugs: string[], kind: 'movie' | 'tv'): number[] {
  const ids = new Set<number>();
  for (const slug of slugs) {
    const g = WATCH_GENRES.find((x) => x.slug === slug);
    for (const id of (kind === 'movie' ? g?.movieIds : g?.tvIds) ?? []) ids.add(id);
  }
  return [...ids];
}
