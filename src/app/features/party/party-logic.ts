// Survivor + tally rules (handoff §6.3 steps 5–6). PURE module — no Angular
// imports — so it runs under `npx tsx src/app/features/party/party-logic.test.ts`.

export interface CandidateFact {
  id: string;
  finalScore: number;
}

export interface SwipeFact {
  candidateId: string;
  memberId: string;
  direction: 'left' | 'right' | 'super';
}

export interface VoteFact {
  candidateId: string;
  memberId: string;
  points: number;
}

export function rightSwipeCounts(swipes: SwipeFact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of swipes) {
    if (s.direction !== 'left') counts[s.candidateId] = (counts[s.candidateId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Survivors = candidates with ≥50% right-swipes and zero vetoes.
 * If fewer than 3 survive, fill to 3 by (right-swipe count, final_score) —
 * preferring non-vetoed candidates; vetoed ones only as a last resort.
 * Returns candidate ids ordered strongest-first.
 */
export function computeSurvivors(
  candidates: CandidateFact[],
  swipes: SwipeFact[],
  vetoedIds: Iterable<string>,
  memberCount: number,
): string[] {
  const rights = rightSwipeCounts(swipes);
  const vetoed = new Set(vetoedIds);
  const byStrength = (a: CandidateFact, b: CandidateFact) =>
    (rights[b.id] ?? 0) - (rights[a.id] ?? 0) || b.finalScore - a.finalScore;

  const survivors = candidates
    .filter((c) => !vetoed.has(c.id) && memberCount > 0 && (rights[c.id] ?? 0) * 2 >= memberCount)
    .sort(byStrength);

  if (survivors.length < 3) {
    const chosen = new Set(survivors.map((c) => c.id));
    const rest = candidates
      .filter((c) => !chosen.has(c.id))
      .sort((a, b) => (vetoed.has(a.id) ? 1 : 0) - (vetoed.has(b.id) ? 1 : 0) || byStrength(a, b));
    survivors.push(...rest.slice(0, Math.min(3, candidates.length) - survivors.length));
  }
  return survivors.map((c) => c.id);
}

/**
 * Tally: sum of points per survivor, winner by (points, final_score).
 */
export function tallyWinner(
  survivorIds: string[],
  votes: VoteFact[],
  scoreById: Record<string, number>,
): { winnerId: string | null; totals: Record<string, number> } {
  const totals: Record<string, number> = {};
  for (const id of survivorIds) totals[id] = 0;
  for (const v of votes) if (v.candidateId in totals) totals[v.candidateId] += v.points;

  const winnerId =
    [...survivorIds].sort(
      (a, b) => totals[b] - totals[a] || (scoreById[b] ?? 0) - (scoreById[a] ?? 0),
    )[0] ?? null;
  return { winnerId, totals };
}
