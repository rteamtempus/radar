// Curated filter-chip vocabularies per domain — the client mirror of
// supabase/functions/_shared/vocab.ts (keep slugs in sync; the edge side owns
// the API-type/subject mappings, this side owns what the chips look like).
//
// Chips are FIXED lists now, not whatever tags the last search dragged in —
// that's the fix for the random/inconsistent category chips
// (docs/API-CAPABILITIES.md). Catalog items tagged outside these lists simply
// don't light up a chip.

export interface ChipDef {
  slug: string;
  label: string;
}

export const WATCH_GENRE_CHIPS: ChipDef[] = [
  { slug: 'action', label: 'Action' },
  { slug: 'comedy', label: 'Comedy' },
  { slug: 'drama', label: 'Drama' },
  { slug: 'thriller', label: 'Thriller' },
  { slug: 'horror', label: 'Horror' },
  { slug: 'science-fiction', label: 'Sci-Fi' },
  { slug: 'fantasy', label: 'Fantasy' },
  { slug: 'romance', label: 'Romance' },
  { slug: 'mystery', label: 'Mystery' },
  { slug: 'crime', label: 'Crime' },
  { slug: 'animation', label: 'Animation' },
  { slug: 'documentary', label: 'Documentary' },
  { slug: 'family', label: 'Family' },
  { slug: 'adventure', label: 'Adventure' },
  { slug: 'history', label: 'History' },
  { slug: 'music', label: 'Music' },
  { slug: 'war', label: 'War' },
  { slug: 'western', label: 'Western' },
];

export const CUISINE_CHIPS: ChipDef[] = [
  { slug: 'pizza', label: 'Pizza' },
  { slug: 'burgers', label: 'Burgers' },
  { slug: 'mexican', label: 'Mexican' },
  { slug: 'italian', label: 'Italian' },
  { slug: 'chinese', label: 'Chinese' },
  { slug: 'japanese', label: 'Japanese' },
  { slug: 'sushi', label: 'Sushi' },
  { slug: 'ramen', label: 'Ramen' },
  { slug: 'thai', label: 'Thai' },
  { slug: 'indian', label: 'Indian' },
  { slug: 'korean', label: 'Korean' },
  { slug: 'vietnamese', label: 'Vietnamese' },
  { slug: 'mediterranean', label: 'Mediterranean' },
  { slug: 'american', label: 'American' },
  { slug: 'bbq', label: 'BBQ' },
  { slug: 'seafood', label: 'Seafood' },
  { slug: 'steak', label: 'Steak' },
  { slug: 'breakfast', label: 'Breakfast' },
  { slug: 'cafe', label: 'Café' },
  { slug: 'dessert', label: 'Dessert' },
  { slug: 'vegan', label: 'Vegan' },
];

export const DO_THEME_CHIPS: ChipDef[] = [
  { slug: 'museum', label: 'Museum' },
  { slug: 'art', label: 'Art' },
  { slug: 'amusement-park', label: 'Amusement park' },
  { slug: 'zoo', label: 'Zoo' },
  { slug: 'aquarium', label: 'Aquarium' },
  { slug: 'bowling', label: 'Bowling' },
  { slug: 'park', label: 'Park' },
  { slug: 'hiking', label: 'Hiking' },
  { slug: 'landmark', label: 'Landmark' },
  { slug: 'theater', label: 'Theater' },
  { slug: 'games', label: 'Games' },
  { slug: 'spa', label: 'Spa' },
];

export const BOOK_GENRE_CHIPS: ChipDef[] = [
  { slug: 'fantasy', label: 'Fantasy' },
  { slug: 'science-fiction', label: 'Sci-Fi' },
  { slug: 'mystery', label: 'Mystery' },
  { slug: 'thriller', label: 'Thriller' },
  { slug: 'romance', label: 'Romance' },
  { slug: 'horror', label: 'Horror' },
  { slug: 'historical-fiction', label: 'Historical fiction' },
  { slug: 'young-adult', label: 'Young adult' },
  { slug: 'children', label: "Children's" },
  { slug: 'biography', label: 'Biography' },
  { slug: 'history', label: 'History' },
  { slug: 'science', label: 'Science' },
  { slug: 'self-help', label: 'Self-help' },
  { slug: 'business', label: 'Business' },
  { slug: 'cooking', label: 'Cooking' },
  { slug: 'poetry', label: 'Poetry' },
  { slug: 'classics', label: 'Classics' },
  { slug: 'comics', label: 'Comics' },
];

/** Bucket label sent to Open Library as its subject query. */
export const BOOK_SUBJECT_QUERY: Record<string, string> = {
  'fantasy': 'fantasy',
  'science-fiction': 'science fiction',
  'mystery': 'mystery',
  'thriller': 'thriller',
  'romance': 'romance',
  'horror': 'horror',
  'historical-fiction': 'historical fiction',
  'young-adult': 'young adult fiction',
  'children': "children's literature",
  'biography': 'biography',
  'history': 'history',
  'science': 'science',
  'self-help': 'self-help',
  'business': 'business',
  'cooking': 'cooking',
  'poetry': 'poetry',
  'classics': 'classic literature',
  'comics': 'graphic novels',
};
