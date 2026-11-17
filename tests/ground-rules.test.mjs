// The ground rules from the 2026-11-16 gameplay review:
// - wounds mend only in the wood (a band regrows only on forest, except on
//   its first march out of camp);
// - the badger may dig next to its tail end as well as its head;
// - a saw walled off from every band waits at the wall (tests/bots.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBattle, applyMove } from '../js/engine/battle.js';
import { bandById, damageBand, mendsOn, reachable, stepBand } from '../js/engine/band.js';
import { actionTargets } from '../js/engine/actions.js';
import { glideFrames } from '../js/ui/anim-steps.js';
import { makeState } from './helpers.mjs';

/** @typedef {import('../js/engine/types.js').Level} Level */

/**
 * @param {Partial<Level>} over
 * @returns {Level}
 */
function makeLevel(over) {
  return {
    id: 'test', name: 'Test', blurb: '', goal: 'clear', maxBands: 3, turnLimit: null,
    grid: ['D.......', '........'],
    bots: [{ type: 'harvester', cells: [[7, 1]] }],
    trapped: [], firstClearSeeds: 0, assumes: {},
    solution: { deploy: [], moves: [] },
    ...over,
  };
}

/** @param {Record<string, number>} bands */
function progressWith(bands) {
  return {
    version: /** @type {const} */ (1), seeds: 0, cleared: {}, story: { seen: {} },
    bands: Object.fromEntries(Object.entries(bands).map(([type, maxLen]) => [type, { maxLen }])),
  };
}

test('a band out of camp is fresh and fills up on any ground, then mends only in the wood', () => {
  const level = makeLevel({ grid: ['D...TT..', '........'] });
  const s0 = createBattle(level, [{ type: 'ants', at: [0, 0] }], progressWith({ ants: 4 }));
  assert.equal(bandById(s0, 'ants').fresh, true);

  // The first march: it grows on open ground and is whole.
  const s1 = applyMove(s0, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0], [3, 0]] });
  assert.equal(bandById(s1, 'ants').cells.length, 4);
  assert.equal(bandById(s1, 'ants').fresh, false, 'whole once, the first march is over');
  assert.deepEqual(s1.events[0], { kind: 'move', band: 'ants', path: [[1, 0], [2, 0], [3, 0]] });
});

test('a hit ends the first march: a short band out of camp no longer grows in the open', () => {
  const s = makeState(['......'], [{ id: 'fox', type: 'fox', cells: [[0, 0]], maxLen: 4 }]);
  assert.equal(bandById(s, 'fox').fresh, true);
  // Two segments, then a hit.
  const s1 = applyMove(s, { kind: 'move', band: 'fox', path: [[1, 0]] });
  const fox = bandById(s1, 'fox');
  assert.equal(fox.cells.length, 2);
  damageBand(s1, 'fox', 1);
  assert.equal(bandById(s1, 'fox').fresh, false);
});

test('a wounded band does not regrow on open ground', () => {
  const s = makeState(['......'], [{ id: 'ants', type: 'ants', cells: [[1, 0], [0, 0]], maxLen: 4, fresh: false }]);
  const s1 = applyMove(s, { kind: 'move', band: 'ants', path: [[2, 0], [3, 0], [4, 0]] });
  assert.deepEqual(bandById(s1, 'ants').cells, [[4, 0], [3, 0]]);
  assert.deepEqual(s1.events[0], {
    kind: 'move', band: 'ants', path: [[2, 0], [3, 0], [4, 0]], grow: [false, false, false],
  });
});

test('a wounded band regrows one segment for each forest tile its leader steps onto', () => {
  const s = makeState(['..TT..'], [{ id: 'ants', type: 'ants', cells: [[1, 0]], maxLen: 4, fresh: false }]);
  const s1 = applyMove(s, { kind: 'move', band: 'ants', path: [[2, 0], [3, 0], [4, 0]] });
  // Grows on the two trees, not on the open tile after them.
  assert.deepEqual(bandById(s1, 'ants').cells, [[4, 0], [3, 0], [2, 0]]);
  assert.deepEqual(s1.events[0], {
    kind: 'move', band: 'ants', path: [[2, 0], [3, 0], [4, 0]], grow: [true, true, false],
  });
});

test('stepping in and out of the wood heals: the edge of the wood is a fortress', () => {
  let s = makeState(['.T.', '...'], [
    { id: 'fox', type: 'fox', cells: [[0, 0]], maxLen: 3, fresh: false },
  ]);
  s = applyMove(s, { kind: 'move', band: 'fox', path: [[1, 0], [2, 0], [2, 1]] });
  assert.equal(bandById(s, 'fox').cells.length, 2, 'one forest step, one segment');
});

test('bots are not held by the wood rule, and the rule reads the tile under the leader', () => {
  const s = makeState(['.T', '..'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 1]], maxLen: 2 },
    { id: 'fox', type: 'fox', cells: [[0, 0]], maxLen: 2, fresh: false },
  ]);
  assert.equal(mendsOn(s, bandById(s, 'saw-0'), [1, 1]), true);
  assert.equal(mendsOn(s, bandById(s, 'fox'), [1, 1]), false);
  assert.equal(mendsOn(s, bandById(s, 'fox'), [1, 0]), true);
});

test('trapped bands are not fresh: once freed they mend only in the wood', () => {
  const level = makeLevel({
    goal: 'rescue',
    grid: ['D.......', '........'],
    trapped: [{ type: 'beaver', cells: [[5, 0], [6, 0]] }],
  });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], progressWith({ ants: 4 }));
  assert.equal(bandById(s, 'trapped-beaver').fresh, false);
});

test('glideFrames holds the band at its length on a step where it may not grow', () => {
  const frames = glideFrames([[1, 0]], 4, [[2, 0], [3, 0], [4, 0]], [false, true, false]);
  assert.deepEqual(frames, [
    [[1, 0]],
    [[2, 0]],
    [[3, 0], [2, 0]],
    [[4, 0], [3, 0]],
  ]);
});

test('stepBand without growth keeps the length', () => {
  const s = makeState(['....'], [{ id: 'ants', type: 'ants', cells: [[1, 0], [0, 0]], maxLen: 4 }]);
  assert.deepEqual(stepBand(bandById(s, 'ants'), [2, 0], false).cells, [[2, 0], [1, 0]]);
  assert.deepEqual(stepBand(bandById(s, 'ants'), [2, 0]).cells, [[2, 0], [1, 0], [0, 0]]);
});

test('a bee band that may not grow can stop where a growing one could not', () => {
  // Two long and wounded: one segment. Through the ants to the free tile.
  const s = makeState(['....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 2, fresh: false },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
  ]);
  assert.equal(reachable(s, 'bees').has('2,0'), true);
});

test('the badger digs next to its tail end as well as next to its head', () => {
  const s = makeState(['.....', '.....', '.....'], [
    { id: 'badger', type: 'badger', cells: [[3, 1], [2, 1], [1, 1]] },
    { id: 'saw-0', type: 'saw', cells: [[4, 2]] },
  ]);
  const targets = actionTargets(s, 'badger', 'dig').map((p) => p.join(','));
  // Head: N, E, S. Tail: N, S, W.
  assert.deepEqual(targets, ['3,0', '4,1', '3,2', '1,0', '1,2', '0,1']);

  const after = applyMove(s, { kind: 'act', band: 'badger', action: 'dig', target: [0, 1] });
  assert.equal(after.tiles[1][0].kind, 'hole');
  assert.deepEqual(after.events[0], { kind: 'action', actor: 'badger', actionId: 'dig', from: [1, 1], target: [0, 1] });
});

test('a one-long badger digs only from its head, and biting stays at the head', () => {
  const s = makeState(['...'], [
    { id: 'badger', type: 'badger', cells: [[1, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[2, 0]] },
  ]);
  assert.deepEqual(actionTargets(s, 'badger', 'dig').map((p) => p.join(',')), ['0,0']);
  const long = makeState(['....', '....'], [
    { id: 'badger', type: 'badger', cells: [[1, 0], [1, 1], [2, 1]] },
    { id: 'saw-0', type: 'saw', cells: [[3, 1]] },
  ]);
  assert.deepEqual(actionTargets(long, 'badger', 'bite'), [], 'the saw is next to the tail, not the head');
});
