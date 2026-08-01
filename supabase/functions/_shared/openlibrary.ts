// Open Library client + upsert. Replaces Google Books for Read search
// (docs/API-CAPABILITIES.md): work-level results (one row per book, not one
// per edition), REAL totals (numFound), and honest popularity ordering
// (want_to_read counts). No key, no quota drama — but it's a nonprofit API,
// so requests carry a UA and stay modest.
//
// Existing google_books rows are untouched: external_source distinguishes the
// two, and detail hydration dispatches on it.
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ActivityRow } from './tmdb.ts';
import { bookTags } from './vocab.ts';

const OL_BASE = 'https://openlibrary.org';
const UA = 'Radar-POC/0.13 (personal project)';
export const OL_PAGE_SIZE = 20;

const SEARCH_FIELDS = [
  'key',
  'title',
  'author_name',
  'first_publish_year',
  'cover_i',
  'ratings_average',
  'ratings_count',
  'want_to_read_count',
  'edition_count',
  'number_of_pages_median',
  'language',
  'subject',
].join(',');

export interface OlDoc {
  key: string; // '/works/OL82563W'
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  ratings_average?: number;
  ratings_count?: number;
  want_to_read_count?: number;
  edition_count?: number;
  number_of_pages_median?: number;
  language?: string[];
  subject?: string[];
}

export type OlSort = 'want_to_read' | 'rating' | 'new';

/**
 * Work search. `sort=want_to_read` is the default everywhere — among books
 * matching the query, the ones people actually read float up, which is what
 * "relevant" means for a browse list (verified against the live API: the
 * harry potter query returns the seven books in series order, no junk).
 */
export async function olSearch(opts: {
  query?: string;
  author?: string;
  subject?: string;
  page?: number;
  /** undefined = OL relevance (best for bare subject browses) */
  sort?: OlSort;
}): Promise<{ docs: OlDoc[]; total: number }> {
  const url = new URL(`${OL_BASE}/search.json`);
  if (opts.query) url.searchParams.set('q', opts.query);
  if (opts.author) url.searchParams.set('author', opts.author);
  if (opts.subject) url.searchParams.set('subject', `"${opts.subject}"`);
  if (opts.sort) url.searchParams.set('sort', opts.sort);
  url.searchParams.set('page', String(opts.page ?? 1));
  url.searchParams.set('limit', String(OL_PAGE_SIZE));
  url.searchParams.set('fields', SEARCH_FIELDS);
  url.searchParams.set('lang', 'en');

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Open Library ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { docs?: OlDoc[]; numFound?: number };
  return { docs: data.docs ?? [], total: data.numFound ?? 0 };
}

export function olCover(coverId: number | undefined): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null;
}

/** '/works/OL82563W' → 'OL82563W' */
function workId(key: string): string {
  return key.replace(/^\/works\//, '');
}

/** Upsert one Open Library work into activities (+ curated genre tags). */
export async function upsertOlBook(service: SupabaseClient, doc: OlDoc): Promise<ActivityRow> {
  const { data: activity, error } = await service
    .from('activities')
    .upsert(
      {
        type: 'book',
        title: doc.title ?? 'Untitled',
        ...(olCover(doc.cover_i) ? { image_url: olCover(doc.cover_i) } : {}),
        external_source: 'open_library',
        external_id: workId(doc.key),
        metadata: {
          authors: doc.author_name?.slice(0, 3) ?? [],
          page_count: doc.number_of_pages_median ?? null,
          release_year: doc.first_publish_year ?? null,
          rating: doc.ratings_average ? Math.round(doc.ratings_average * 10) / 10 : null,
          rating_count: doc.ratings_count ?? null,
          want_count: doc.want_to_read_count ?? null,
          edition_count: doc.edition_count ?? null,
          info_url: `${OL_BASE}${doc.key}`,
        },
      },
      { onConflict: 'external_source,external_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`book upsert failed: ${error.message}`);

  const tags = bookTags(doc.subject);
  if (tags.length) {
    const rows = tags.map((t) => ({ kind: 'genre', slug: t.slug, label: t.label }));
    await service.from('tags').upsert(rows, { onConflict: 'kind,slug', ignoreDuplicates: true });
    const { data: tagRows } = await service
      .from('tags')
      .select('id')
      .eq('kind', 'genre')
      .in('slug', tags.map((t) => t.slug));
    if (tagRows?.length) {
      await service.from('activity_tags').upsert(
        tagRows.map((t) => ({ activity_id: activity.id, tag_id: t.id })),
        { ignoreDuplicates: true },
      );
    }
  }

  return activity as ActivityRow;
}

/** Work detail — search results carry no description; this fills it in. */
export async function olWorkDescription(workIdOrKey: string): Promise<string | null> {
  const id = workId(workIdOrKey);
  const res = await fetch(`${OL_BASE}/works/${id}.json`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as { description?: string | { value?: string } };
  const desc =
    typeof data.description === 'string' ? data.description : (data.description?.value ?? null);
  return desc?.slice(0, 2000) ?? null;
}
