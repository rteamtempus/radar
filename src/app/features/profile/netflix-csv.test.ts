// Run with: npx -y tsx src/app/features/profile/netflix-csv.test.ts
import assert from 'node:assert/strict';
import { parseCsv, parseNetflixHistory } from './netflix-csv.ts';

// --- parseCsv ---------------------------------------------------------------
assert.deepEqual(parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
assert.deepEqual(parseCsv('"hello, world",x'), [['hello, world', 'x']]);
assert.deepEqual(parseCsv('"say ""hi""",y'), [['say "hi"', 'y']]);
assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']]);

// --- parseNetflixHistory ----------------------------------------------------
const csv = [
  '"Title","Date"',
  '"Stranger Things: Season 4: Chapter One: The Hellfire Club","5/27/22"',
  '"Stranger Things: Season 4: Chapter Two: Vecna\'s Curse","5/28/22"',
  '"Stranger Things: Season 3: Chapter One: Suzie, Do You Copy?","7/4/19"',
  '"Mission: Impossible","1/15/23"',
  '"Glass Onion: A Knives Out Mystery","12/23/22"',
  '"Arrival","3/10/21"',
].join('\n');

const items = parseNetflixHistory(csv);

// Episodes collapse into one show, keeping the newest date.
const st = items.find((i) => i.title === 'Stranger Things')!;
assert.ok(st, 'series grouped by base title');
assert.equal(st.rowCount, 3);
assert.equal(st.isSeries, true);
assert.equal(st.lastWatchedAt, new Date('5/28/22').toISOString());

// Two-segment titles stay whole (movies with colons).
assert.ok(items.some((i) => i.title === 'Mission: Impossible' && !i.isSeries));
assert.ok(items.some((i) => i.title === 'Glass Onion: A Knives Out Mystery' && !i.isSeries));
assert.ok(items.some((i) => i.title === 'Arrival'));

// Sorted most-recent-first; 4 unique titles from 6 rows.
assert.equal(items.length, 4);
assert.equal(items[0].title, 'Mission: Impossible');

// Missing Title column → helpful error.
assert.throws(() => parseNetflixHistory('"Name","When"\n"x","1/1/20"'), /Title/);

console.log('netflix-csv.test.ts: all assertions passed ✓');
