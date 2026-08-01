// Survivor + tally rules. PURE module — no Angular imports — so it runs under
// `npx tsx src/app/features/party/party-logic.test.ts`.
//
// v0.11: candidates no longer carry an AI/heuristic score (the deck is just
// the union of the picked slots), so ties are common and are broken by:
//   * survivors — right-swipe count, then candidate id (stable ordering)
//   * the winner — points, then a RANDOM draw among whatever tied at the top

export interface CandidateFact {
  id: string;
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
 * If fewer than 3 survive, fill to 3 by right-swipe count — preferring
 * non-vetoed candidates; vetoed ones only as a last resort.
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
    (rights[b.id] ?? 0) - (rights[a.id] ?? 0) || a.id.localeCompare(b.id);

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
 * Tally: sum of points per survivor. The winner is drawn AT RANDOM from
 * everything tied for the most points — a coin flip is fairer (and more fun)
 * than an arbitrary tiebreak when the room genuinely can't decide.
 *
 * `pick` is injectable so tests can be deterministic.
 */
export function tallyWinner(
  survivorIds: string[],
  votes: VoteFact[],
  pick: (n: number) => number = (n) => Math.floor(Math.random() * n),
): { winnerId: string | null; totals: Record<string, number>; tiedIds: string[] } {
  const totals: Record<string, number> = {};
  for (const id of survivorIds) totals[id] = 0;
  for (const v of votes) if (v.candidateId in totals) totals[v.candidateId] += v.points;

  if (!survivorIds.length) return { winnerId: null, totals, tiedIds: [] };

  const best = Math.max(...survivorIds.map((id) => totals[id]));
  const tiedIds = survivorIds.filter((id) => totals[id] === best);
  const winnerId = tiedIds[Math.min(Math.max(pick(tiedIds.length), 0), tiedIds.length - 1)] ?? null;
  return { winnerId, totals, tiedIds };
}
