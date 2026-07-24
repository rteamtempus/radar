// Deterministic scoring (handoff §7 step 3). PURE module — no Deno/npm
// imports — so it runs under `npx tsx scoring.test.ts` and stays unit-testable.

export interface CandidateFacts {
  activityId: string;
  type: 'movie' | 'tv_show';
  tagIds: string[];
  genreSlugs: string[];
  tmdbVote: number | null;
}

export interface EngagementFact {
  status: string;
  rating: number | null;
  is_rewatchable: boolean | null;
}

export interface MemberFacts {
  userId: string;
  /** tag_id → weight (-1..1) */
  affinities: Record<string, number>;
  /** activity_id → engagement */
  engagements: Record<string, EngagementFact>;
  /** vibe slugs chosen in the mood check-in */
  vibeSlugs: string[];
}

/**
 * Hardcoded vibe → genre bridge (handoff §7). Genre slugs are slugified TMDB
 * genre names; TV variants ('action-and-adventure', 'sci-fi-and-fantasy')
 * included where they apply.
 */
export const VIBE_GENRE_MAP: Record<string, string[]> = {
  cozy: ['comedy', 'family', 'romance', 'animation'],
  hype: ['action', 'adventure', 'action-and-adventure'],
  'mindless-fun': ['comedy', 'action', 'family', 'action-and-adventure'],
  deep: ['drama', 'documentary', 'history'],
  dark: ['thriller', 'crime', 'horror'],
  funny: ['comedy'],
  'scary-ok': ['horror', 'thriller', 'mystery'],
  romantic: ['romance', 'drama'],
  nostalgic: ['family', 'animation', 'music'],
  'mind-bending': ['science-fiction', 'mystery', 'sci-fi-and-fantasy'],
};

/**
 * member_score = 0.5·tag_affinity + 0.2·mood_match + 0.15·quality + 0.15·novelty
 * - tag_affinity: mean of the member's weights over the candidate's tags (missing = 0)
 * - mood_match: fraction of the member's chosen vibes that map onto the candidate's genres
 * - quality: tmdb_vote / 10 (0 if missing)
 * - novelty: 1 no engagement · 0.5 want_to/other (already interested ≠ novel) ·
 *   1 rewatchable-completed (non-rewatchable completed never reaches scoring)
 */
export function memberScore(candidate: CandidateFacts, member: MemberFacts): number {
  const tagAffinity = candidate.tagIds.length
    ? candidate.tagIds.reduce((sum, t) => sum + (member.affinities[t] ?? 0), 0) /
      candidate.tagIds.length
    : 0;

  const moodMatch = member.vibeSlugs.length
    ? member.vibeSlugs.filter((v) =>
        (VIBE_GENRE_MAP[v] ?? []).some((g) => candidate.genreSlugs.includes(g)),
      ).length / member.vibeSlugs.length
    : 0;

  const quality = candidate.tmdbVote ? candidate.tmdbVote / 10 : 0;

  const engagement = member.engagements[candidate.activityId];
  const novelty = !engagement
    ? 1
    : engagement.status === 'completed' && engagement.is_rewatchable
      ? 1
      : 0.5;

  return 0.5 * tagAffinity + 0.2 * moodMatch + 0.15 * quality + 0.15 * novelty;
}

/** Least-misery weighted aggregate: 0.6·min + 0.4·avg. */
export function aggregateScores(scores: number[]): number {
  if (!scores.length) return 0;
  const min = Math.min(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return 0.6 * min + 0.4 * avg;
}

export interface ScoredCandidate {
  candidate: CandidateFacts;
  finalScore: number;
  /** per-member scores keyed by user id — cached in score_breakdown */
  perMember: Record<string, number>;
}

/** Score every candidate for every member, aggregate, sort best-first. */
export function scoreCandidates(
  candidates: CandidateFacts[],
  members: MemberFacts[],
): ScoredCandidate[] {
  return candidates
    .map((candidate) => {
      const perMember: Record<string, number> = {};
      for (const m of members) perMember[m.userId] = memberScore(candidate, m);
      const scores = Object.values(perMember);
      return { candidate, finalScore: aggregateScores(scores), perMember };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
