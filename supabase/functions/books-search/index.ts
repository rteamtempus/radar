// books-search — Read domain, now backed by Open Library (v0.13).
//
// POST { query?, subject?, page?, sort? }
// → work-level search sorted by popularity (want_to_read), each hit upserted
//   into activities (type='book', external_source='open_library') with curated
//   genre-bucket tags. Returns REAL pagination info: { results, total, page,
//   has_more } — Google Books' totalItems was a constant-300 lie, Open
//   Library's numFound is an actual count.
//
// A plain `query` matches titles AND authors (OL's q searches both), so
// "brandon sanderson" just works. `subject` narrows to a curated bucket.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { OL_PAGE_SIZE, OlSort, olSearch, upsertOlBook } from '../_shared/openlibrary.ts';

const SORTS: OlSort[] = ['want_to_read', 'rating', 'new'];

serve(async (req) => {
  await requireUser(req);

  const { query, subject, page, sort } = await req.json().catch(() => ({}));
  const q = typeof query === 'string' ? query.trim() : '';
  const subj = typeof subject === 'string' ? subject.trim() : '';
  if (!q && !subj) throw new HttpError(400, 'Send query and/or subject');

  const pageNum = Math.max(1, Math.min(50, Number(page) || 1));
  // Popularity sort ONLY when a query narrows the pool. On a bare subject
  // browse, want_to_read surfaces mega-popular books whose sprawling subject
  // lists sneak the phrase in (Harry Potter "matched" sci-fi — verified);
  // OL's default relevance ranks pure subject browses genre-true.
  let effectiveSort: OlSort | undefined = SORTS.includes(sort) ? sort : 'want_to_read';
  if (!q && effectiveSort === 'want_to_read') effectiveSort = undefined;
  const { docs, total } = await olSearch({
    query: q || undefined,
    subject: subj || undefined,
    page: pageNum,
    sort: effectiveSort,
  });

  const db = serviceClient();
  const results = [];
  for (const doc of docs) {
    if (!doc.title) continue;
    results.push(await upsertOlBook(db, doc));
  }

  return json({
    results,
    total,
    page: pageNum,
    has_more: pageNum * OL_PAGE_SIZE < total,
  });
});
