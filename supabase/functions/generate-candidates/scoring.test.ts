// Run with: npx -y tsx supabase/functions/generate-candidates/scoring.test.ts
import assert from 'node:assert/strict';
import {
  CandidateFacts,
  MemberFacts,
  aggregateScores,
  memberScore,
  scoreCandidates,
} from './scoring.ts';

function candidate(over: Partial<CandidateFacts> = {}): CandidateFacts {
  return {
    activityId: 'a1',
    type: 'movie',
    tagIds: ['t-action', 't-scifi'],
    genreSlugs: ['action', 'science-fiction'],
    tmdbVote: 8,
    ...over,
  };
}

function member(over: Partial<MemberFacts> = {}): MemberFacts {
  return { userId: 'u1', affinities: {}, engagements: {}, vibeSlugs: [], ...over };
}

// --- memberScore components -------------------------------------------------

// Neutral member: no affinities (0), no vibes (0), quality 0.8, novelty 1.
assert.equal(
  memberScore(candidate(), member()).toFixed(3),
  (0.15 * 0.8 + 0.15 * 1).toFixed(3),
  'neutral member = quality + novelty only',
);

// Tag affinity is the mean over candidate tags, missing weights count as 0.
{
  const m = member({ affinities: { 't-action': 1 } }); // mean over 2 tags = 0.5
  const base = memberScore(candidate(), member());
  assert.equal((memberScore(candidate(), m) - base).toFixed(3), (0.5 * 0.5).toFixed(3));
}

// Mood match: fraction of chosen vibes that hit the candidate's genres.
{
  const hit = member({ vibeSlugs: ['hype'] }); // action matches
  const half = member({ vibeSlugs: ['hype', 'cozy'] }); // 1 of 2 matches
  const base = memberScore(candidate(), member());
  assert.equal((memberScore(candidate(), hit) - base).toFixed(3), (0.2).toFixed(3));
  assert.equal((memberScore(candidate(), half) - base).toFixed(3), (0.2 * 0.5).toFixed(3));
}

// Novelty tiers: none=1, want_to=0.5, rewatchable-completed=1.
{
  const wantTo = member({
    engagements: { a1: { status: 'want_to', rating: null, is_rewatchable: null } },
  });
  const rewatch = member({
    engagements: { a1: { status: 'completed', rating: 9, is_rewatchable: true } },
  });
  assert.equal(
    (memberScore(candidate(), member()) - memberScore(candidate(), wantTo)).toFixed(3),
    (0.15 * 0.5).toFixed(3),
  );
  assert.equal(memberScore(candidate(), rewatch), memberScore(candidate(), member()));
}

// Missing vote → quality 0.
assert.equal(
  memberScore(candidate({ tmdbVote: null }), member()).toFixed(3),
  (0.15 * 1).toFixed(3),
);

// --- aggregate: least-misery ------------------------------------------------

// One miserable member drags the aggregate below the plain mean.
{
  const split = aggregateScores([0.9, 0.1]); // 0.6*0.1 + 0.4*0.5 = 0.26
  assert.equal(split.toFixed(3), (0.26).toFixed(3));
  assert.ok(split < (0.9 + 0.1) / 2, 'least-misery < mean');
  // A balanced pair with the same mean beats the split pair.
  assert.ok(aggregateScores([0.5, 0.5]) > split);
}
assert.equal(aggregateScores([]), 0);

// --- scoreCandidates: ordering + per-member cache ---------------------------
{
  const loved = candidate({ activityId: 'loved', tagIds: ['t1'], genreSlugs: ['comedy'] });
  const hated = candidate({ activityId: 'hated', tagIds: ['t2'], genreSlugs: ['horror'] });
  const m1 = member({ userId: 'u1', affinities: { t1: 1, t2: -1 } });
  const m2 = member({ userId: 'u2', affinities: { t1: 0.5, t2: -0.5 } });
  const ranked = scoreCandidates([hated, loved], [m1, m2]);
  assert.equal(ranked[0].candidate.activityId, 'loved');
  assert.equal(Object.keys(ranked[0].perMember).sort().join(','), 'u1,u2');
  assert.ok(ranked[0].finalScore > ranked[1].finalScore);
}

console.log('scoring.test.ts: all assertions passed ✓');
