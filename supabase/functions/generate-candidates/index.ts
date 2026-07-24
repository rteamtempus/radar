// generate-candidates — milestone 6 (the pipeline, handoff §7)
//
// POST { party_id: string }   (auth: must be the party host)
//
// Step 0  gather party, members, subscriptions, engagements, affinities,
//         dealbreakers, mood check-ins
// Step 1  candidate pool (~150–300): members' want_to lists ∪ TMDB /discover
//         (shared providers, ≤5 pages) ∪ local activities on shared services
// Step 2  hard filters: type, runtime, streamable-by-all, seen/not_interested,
//         dealbreakers, already-presented (regeneration)
// Step 3  deterministic scoring per member (0.5 tag affinity + 0.2 mood +
//         0.15 quality + 0.15 novelty), aggregate least-misery
//         (0.6*min + 0.4*avg), keep top 30
// Step 4  ONE Gemini call reranks to 12 + writes per-candidate blurbs;
//         falls back to top-12-by-score with templated blurbs on ANY AI
//         failure — the pipeline must never hard-fail on the AI step.
//         Log to ai_invocations either way.
//
// Writes party_candidates (presented_order=rank), flips party → 'swiping',
// returns the candidate list. Pure scoring helpers get extracted to a
// testable module (handoff §11).
import { HttpError, json, serve } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

serve(async (req) => {
  const user = await requireUser(req);

  const { party_id } = await req.json().catch(() => ({}));
  if (typeof party_id !== 'string') {
    throw new HttpError(400, 'Expected body { party_id: string }');
  }

  const service = serviceClient();
  const { data: party } = await service
    .from('parties')
    .select('id, host_id, status')
    .eq('id', party_id)
    .single();
  if (!party) throw new HttpError(404, 'Party not found');
  if (party.host_id !== user.id) throw new HttpError(403, 'Only the host can generate candidates');

  // TODO(milestone 6): steps 0–4 above.
  return json({ error: 'Not implemented yet (milestone 6)' }, 501);
});
