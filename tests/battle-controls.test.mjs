// The controls added after the l03 playtest: the attack offered after a
// move, Tab through the bands that have something left to do, and the
// tile cursor. Pure functions here; the mounted screen in
// tests/battle-keys.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offeredAction, cycleBand, cursorStart, stepCursor, selectionView } from '../js/ui/battle-view.js';
import { applyMove } from '../js/engine/battle.js';
import { makeState } from './helpers.mjs';

// --- offeredAction ---

test('offeredAction: a badger that moves next to a bot is offered Bite, never Dig', () => {
  const s = makeState(['....', '....'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[3, 0], [3, 1]] },
  ]);
  assert.equal(offeredAction(s, 'badger'), null, 'not before it has moved');
  const moved = applyMove(s, { kind: 'move', band: 'badger', path: [[1, 0], [2, 0]] });
  assert.equal(offeredAction(moved, 'badger'), 'bite');
  const view = selectionView(moved, 'badger', offeredAction(moved, 'badger'));
  assert.ok(view);
  assert.equal(view.actionId, 'bite');
  assert.deepEqual(view.options.map((o) => o.chosen), [false, true], 'shown as chosen, Dig one tap away');
  assert.deepEqual(view.targets.map((t) => t.at), [[3, 0]]);
});

test('offeredAction: nothing when the only targets are ground (dig) or no enemy is near', () => {
  const s = makeState(['.....', '.....'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[4, 1]] },
  ]);
  const moved = applyMove(s, { kind: 'move', band: 'badger', path: [[1, 0]] });
  assert.equal(offeredAction(moved, 'badger'), null);
});

test('offeredAction: the first qualifying action in the band\'s own order', () => {
  const bear = makeState(['....', '....'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[2, 0], [3, 0]] },
  ]);
  assert.equal(offeredAction(applyMove(bear, { kind: 'move', band: 'bear', path: [[1, 0]] }), 'bear'), 'maul');

  const colony = makeState(['....', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 1]], maxLen: 6 },
    { id: 'saw-0', type: 'saw', cells: [[2, 0], [3, 0]] },
  ]);
  assert.equal(offeredAction(applyMove(colony, { kind: 'move', band: 'ants', path: [[1, 1], [1, 0]] }), 'ants'), 'bite');
});

test('offeredAction: a sting only when its line reaches a bot', () => {
  const s = makeState(['.....', '.....', '.....'], [
    { id: 'bees', type: 'bees', cells: [[0, 1]] },
    { id: 'saw-0', type: 'saw', cells: [[4, 1]] },
  ]);
  // From 1,1 the sting east strikes 2,1 3,1 4,1: the saw is on its line.
  assert.equal(offeredAction(applyMove(s, { kind: 'move', band: 'bees', path: [[1, 1]] }), 'bees'), 'sting');
  // From 0,0 no line of three reaches it.
  assert.equal(offeredAction(applyMove(s, { kind: 'move', band: 'bees', path: [[0, 0]] }), 'bees'), null);
});

test('offeredAction: nothing for a band that has acted, a bot, or a finished battle', () => {
  const s = makeState(['...', '...'], [
    { id: 'badger', type: 'badger', cells: [[1, 0]], moved: true, acted: true },
    { id: 'saw-0', type: 'saw', cells: [[2, 0]] },
    { id: 'saw-1', type: 'saw', cells: [[2, 1]] },
  ]);
  assert.equal(offeredAction(s, 'badger'), null);
  assert.equal(offeredAction(s, 'saw-0'), null);
  assert.equal(offeredAction(s, 'nobody'), null);
  const over = { ...s, outcome: /** @type {const} */ ('won'), bands: s.bands.map((b) => ({ ...b, acted: false })) };
  assert.equal(offeredAction(over, 'badger'), null);
});

// --- cycleBand ---

test('cycleBand: Tab goes through the bands with something left to do, wrapping, skipping the done', () => {
  const s = makeState(['.....', '.....', '.....'], [
    { id: 'fox', type: 'fox', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[2, 0]], moved: true, acted: true },
    { id: 'badger', type: 'badger', cells: [[4, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[4, 2]] },
  ]);
  assert.equal(cycleBand(s, null, 1), 'fox');
  assert.equal(cycleBand(s, 'fox', 1), 'badger', 'skips the ants, which are done');
  assert.equal(cycleBand(s, 'badger', 1), 'fox', 'wraps round');
  assert.equal(cycleBand(s, null, -1), 'badger');
  assert.equal(cycleBand(s, 'fox', -1), 'badger');
  assert.equal(cycleBand(s, 'ants', 1), 'badger', 'from a done band, the next live one');
});

test('cycleBand: the only band left stays; none at all gives null', () => {
  const one = makeState(['...', '...'], [
    { id: 'fox', type: 'fox', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[2, 1]] },
  ]);
  assert.equal(cycleBand(one, 'fox', 1), 'fox');
  const none = makeState(['...', '...'], [
    { id: 'fox', type: 'fox', cells: [[0, 0]], moved: true, acted: true },
    { id: 'saw-0', type: 'saw', cells: [[2, 1]] },
  ]);
  assert.equal(cycleBand(none, null, 1), null);
  assert.equal(cycleBand(none, 'fox', -1), null);
});

// --- the cursor ---

test('cursorStart: the selected head, else the first ready band\'s head', () => {
  const s = makeState(['.....', '.....'], [
    { id: 'fox', type: 'fox', cells: [[0, 0]], moved: true, acted: true },
    { id: 'ants', type: 'ants', cells: [[3, 1], [2, 1]] },
    { id: 'saw-0', type: 'saw', cells: [[4, 0]] },
  ]);
  assert.deepEqual(cursorStart(s, 'fox'), [0, 0]);
  assert.deepEqual(cursorStart(s, null), [3, 1]);
});

test('stepCursor: one tile at a time, stopping at the edge', () => {
  const s = makeState(['...', '...'], []);
  assert.deepEqual(stepCursor(s, [1, 1], 'up'), [1, 0]);
  assert.deepEqual(stepCursor(s, [1, 0], 'up'), [1, 0]);
  assert.deepEqual(stepCursor(s, [2, 1], 'right'), [2, 1]);
  assert.deepEqual(stepCursor(s, [0, 0], 'left'), [0, 0]);
  assert.deepEqual(stepCursor(s, [0, 0], 'down'), [0, 1]);
});
