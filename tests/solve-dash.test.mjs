// The solver tries the fox's dash (trial rule foxDash) as it tries any walk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../scripts/solve.mjs';

const level = {
  id: 'test-dash', name: 'Test', blurb: '', goal: 'capture', maxBands: 1, turnLimit: null,
  grid: ['D....K..', 'SSSSSS..'],
  bots: [{ type: 'harvester', cells: [[7, 1]] }],
  trapped: [], firstClearSeeds: 0, assumes: {},
  solution: { deploy: [], moves: [] },
};

test('with foxDash the solver takes the stake in one turn, by a dash', () => {
  const deploy = [{ type: 'fox', at: [0, 0] }];
  assert.equal(solve(level, deploy, { turns: 3 })?.turns, 2);
  const line = solve({ ...level, rules: { foxDash: true } }, deploy, { turns: 3 });
  assert.equal(line?.turns, 1);
  assert.ok(line?.moves.some((m) => m.kind === 'move' && m.dash === true));
});

test('a printed line keeps the dash', async () => {
  const { formatSolution } = await import('../scripts/solve.mjs');
  const text = formatSolution([{ type: 'fox', at: [0, 0] }], [{ kind: 'move', band: 'fox', path: [[1, 0]], dash: true }]);
  assert.match(text, /\{ kind: 'move', band: 'fox', path: \[\[1, 0\]\], dash: true \},/);
});
