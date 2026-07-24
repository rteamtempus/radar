// Run with: npx -y tsx src/app/features/party/party-logic.test.ts
import assert from 'node:assert/strict';
import { SwipeFact, computeSurvivors, tallyWinner } from './party-logic.ts';

const cands = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, finalScore: (n - i) / 10 }));

const right = (candidateId: string, memberId: string): SwipeFact => ({
  candidateId,
  memberId,
  direction: 'right',
});
const left = (candidateId: string, memberId: string): SwipeFact => ({
  candidateId,
  memberId,
  direction: 'left',
});

// ≥50% right-swipes survives (2 members: 1 right = exactly 50%).
{
  const s = computeSurvivors(
    cands(4),
    [right('c1', 'm1'), right('c1', 'm2'), right('c2', 'm1'), left('c2', 'm2'), left('c3', 'm1'), left('c3', 'm2'), right('c4', 'm1'), right('c4', 'm2')],
    [],
    2,
  );
  assert.ok(s.includes('c1') && s.includes('c2') && s.includes('c4'), '50%+ survive');
  // c1 (2 rights, score .4) ranks above c4 (2 rights, score .1); c2 (1 right) last.
  assert.deepEqual(s, ['c1', 'c4', 'c2']);
}

// A veto kills an otherwise-unanimous candidate.
{
  const s = computeSurvivors(
    cands(4),
    [right('c1', 'm1'), right('c1', 'm2'), right('c2', 'm1'), right('c2', 'm2'), right('c3', 'm1'), right('c3', 'm2'), right('c4', 'm1'), right('c4', 'm2')],
    ['c1'],
    2,
  );
  assert.ok(!s.includes('c1'), 'vetoed candidate excluded when enough survive');
}

// Fewer than 3 survivors → fill to top 3 by (rights, score), non-vetoed first.
{
  const s = computeSurvivors(cands(5), [right('c5', 'm1'), right('c5', 'm2')], ['c1'], 2);
  assert.equal(s.length, 3);
  assert.equal(s[0], 'c5', 'only real survivor first');
  assert.deepEqual(s.slice(1), ['c2', 'c3'], 'filled by score, vetoed c1 skipped');
}

// Vetoed candidates are last-resort fill when nothing else exists.
{
  const s = computeSurvivors(cands(2), [], ['c1', 'c2'], 2);
  assert.equal(s.length, 2, 'clamped to candidate count');
}

// Zero members → nothing meets 50%, falls back to top-3 by score.
assert.deepEqual(computeSurvivors(cands(4), [], [], 0), ['c1', 'c2', 'c3']);

// Tally: points win; final_score breaks ties; non-survivor votes ignored.
{
  const { winnerId, totals } = tallyWinner(
    ['a', 'b', 'c'],
    [
      { candidateId: 'a', memberId: 'm1', points: 1 },
      { candidateId: 'b', memberId: 'm1', points: 2 },
      { candidateId: 'b', memberId: 'm2', points: 1 },
      { candidateId: 'a', memberId: 'm2', points: 2 },
      { candidateId: 'zz', memberId: 'm2', points: 3 }, // not a survivor
    ],
    { a: 0.9, b: 0.2, c: 0.5 },
  );
  assert.equal(totals['a'], 3);
  assert.equal(totals['b'], 3);
  assert.equal(winnerId, 'a', 'tie on points → higher final_score wins');
}
assert.equal(tallyWinner([], [], {}).winnerId, null);

console.log('party-logic.test.ts: all assertions passed ✓');
