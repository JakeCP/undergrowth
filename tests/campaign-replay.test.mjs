// The campaign's bot plans, pinned. tests/fixtures/campaign-replay.txt is
// every board of every recorded line of the seven campaign levels, with
// each bot's plan under it: the output of
//
//   for l in o01 o02 l01 l02 l03 l04 l05; do echo "=== $l"; node scripts/solve.mjs $l --replay; done
//
// first taken at 55e6194, before the five new bots. Regenerate it by
// running that loop from the repo root into the fixture. A difference here
// means a campaign bot now plans differently (or a recorded line now plays
// out differently): that must be a deliberate, recorded decision, not
// something a change to the engine lets slip by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { main } from '../scripts/solve.mjs';

const IDS = ['o01', 'o02', 'l01', 'l02', 'l03', 'l04', 'l05'];
const FIXTURE = new URL('./fixtures/campaign-replay.txt', import.meta.url);

test('every campaign recorded line replays board for board, bot plan for bot plan, as the fixture has it', async () => {
  /** @type {string[]} */
  const lines = [];
  for (const id of IDS) {
    lines.push(`=== ${id}`);
    assert.equal(await main([id, '--replay'], (line) => lines.push(line)), 0, id);
  }
  // As the command line prints it: one line per `out`, each ending in a newline.
  const actual = `${lines.join('\n')}\n`;
  const expected = readFileSync(FIXTURE, 'utf8');
  const a = actual.split('\n');
  const e = expected.split('\n');
  const first = a.findIndex((line, i) => line !== e[i]);
  if (first !== -1) {
    const level = a.slice(0, first + 1).findLast((line) => line.startsWith('=== ')) ?? '(none)';
    assert.fail(`the replay differs from the fixture at line ${first + 1} (${level}):\n  now:     ${a[first]}\n  fixture: ${e[first]}`);
  }
  assert.equal(actual, expected);
});
