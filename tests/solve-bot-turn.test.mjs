// A battle can be won in the bots' own turn: a bot that strikes the
// hedgehog takes bristle damage and may die of it. The solver must count
// that as a win on the turn it happens, not search on for a later one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../scripts/solve.mjs';

// The hedgehog steps up and bites the harvester down to one long; in the
// bots' turn the harvester strikes the hedgehog and dies on its bristle.
const level = {
  id: 'test-bristle', name: 'Test', blurb: '', goal: 'clear', maxBands: 1, turnLimit: null,
  grid: ['D.......', '........'],
  bots: [{ type: 'harvester', cells: [[2, 0], [3, 0]] }],
  trapped: [], firstClearSeeds: 0, assumes: {},
  solution: { deploy: [], moves: [] },
};

test('the solver finds a win that the bots hand over in their own turn', () => {
  const line = solve(level, [{ type: 'hedgehog', at: [0, 0] }], { turns: 3 });
  assert.notEqual(line, null);
  assert.equal(line.turns, 1);
  assert.deepEqual(line.moves.at(-1), { kind: 'end' });
});
