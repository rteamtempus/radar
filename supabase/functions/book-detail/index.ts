// book-detail — fills in what Open Library search results don't carry.
//
// POST { activity_id } → for an open_library book with no description yet,
// fetch the work record and stamp the description onto the activity. Cheap,
// idempotent, safe to fire-and-forget from the detail page.
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { olWorkDescription } from '../_shared/openlibrary.ts';

serve(async (req) => {
  await requireUser(req);

  const { activity_id } = await req.json().catch(() => ({}));
  if (typeof activity_id !== 'string' || !activity_id) {
    throw new HttpError(400, 'Expected body { activity_id: string }');
  }

  const db = serviceClient();
  const { data: activity } = await db
    .from('activities')
    .select('id, description, external_source, external_id')
    .eq('id', activity_id)
    .maybeSingle();
  if (!activity) throw new HttpError(404, 'No such activity');
  if (activity.external_source !== 'open_library') {
    throw new HttpError(400, 'Not an Open Library book');
  }
  if (activity.description) return json({ result: activity }); // already hydrated

  const description = await olWorkDescription(activity.external_id as string);
  if (description) {
    await db.from('activities').update({ description }).eq('id', activity.id);
  }

  return json({ result: { ...activity, description: description ?? null } });
});
