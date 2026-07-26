// books-search — Read domain (Google Books)
//
// POST { query: string } → volume search, each hit upserted into activities
// (type='book') with genre tags from Books categories.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { booksSearch, upsertBook } from '../_shared/books.ts';

serve(async (req) => {
  await requireUser(req);

  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || !query.trim()) {
    throw new HttpError(400, 'Expected body { query: string }');
  }

  let volumes;
  try {
    volumes = await booksSearch(query.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('403')) {
      throw new HttpError(502, 'Google Books is not enabled for the API key yet.');
    }
    throw e;
  }
  const db = serviceClient();
  const results = [];
  for (const vol of volumes) {
    if (!vol.volumeInfo?.title) continue;
    results.push(await upsertBook(db, vol));
  }

  return json({ results });
});
