// Google Books client + upsert. Uses GOOGLE_BOOKS_API_KEY, falls back to
// GOOGLE_PLACES_API_KEY (same GCP project once "Books API" is enabled), and
// finally to keyless access (Books allows anonymous requests at low quota).
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ActivityRow } from './tmdb.ts';

const BOOKS_BASE = 'https://www.googleapis.com/books/v1';

export interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    averageRating?: number;
    ratingsCount?: number;
    language?: string;
    infoLink?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

export async function booksSearch(query: string): Promise<GoogleVolume[]> {
  const key = Deno.env.get('GOOGLE_BOOKS_API_KEY') ?? Deno.env.get('GOOGLE_PLACES_API_KEY');
  const url = (withKey: boolean) =>
    `${BOOKS_BASE}/volumes?q=${encodeURIComponent(query)}&maxResults=12&printType=books` +
    (withKey && key ? `&key=${key}` : '');

  let res = await fetch(url(true));
  if (!res.ok && key) res = await fetch(url(false)); // key not enabled for Books → keyless
  if (!res.ok) throw new Error(`Google Books ${res.status}: ${await res.text()}`);
  return ((await res.json()).items ?? []) as GoogleVolume[];
}

function year(publishedDate: string | undefined): number | null {
  const m = publishedDate?.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Categories arrive like "Fiction / Thrillers / Suspense" — split and dedupe. */
function bookTags(vol: GoogleVolume): { slug: string; label: string }[] {
  const labels = new Set<string>();
  for (const c of vol.volumeInfo?.categories ?? []) {
    for (const part of c.split(' / ')) labels.add(part.trim());
  }
  return [...labels]
    .filter((l) => l && l.toLowerCase() !== 'general')
    .slice(0, 4)
    .map((label) => ({
      slug: label.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      label,
    }));
}

export async function upsertBook(service: SupabaseClient, vol: GoogleVolume): Promise<ActivityRow> {
  const info = vol.volumeInfo ?? {};
  const thumb = (info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail)?.replace(
    /^http:/,
    'https:',
  );

  const { data: activity, error } = await service
    .from('activities')
    .upsert(
      {
        type: 'book',
        title: info.title ?? 'Untitled',
        description: info.description?.slice(0, 2000) ?? null,
        ...(thumb ? { image_url: thumb } : {}),
        external_source: 'google_books',
        external_id: vol.id,
        metadata: {
          authors: info.authors ?? [],
          page_count: info.pageCount ?? null,
          release_year: year(info.publishedDate),
          rating: info.averageRating ?? null,
          rating_count: info.ratingsCount ?? null,
          info_url: info.infoLink ?? null,
          original_language: info.language ?? null,
        },
      },
      { onConflict: 'external_source,external_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`book upsert failed: ${error.message}`);

  const tags = bookTags(vol);
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
