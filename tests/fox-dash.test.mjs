// The fox's Dash, under the trial rule foxDash (fox-dash spec): before it
// has walked or acted, the fox may run up to 5 tiles in place of its walk
// and its bite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, TRIAL_RULE_IDS } from '../js/engine/battle.js';
import { reachable, bandById } from '../js/engine/band.js';
import { canDash, dashRange, dashTiles } from '../js/engine/dash.js';
import { bandTurnState } from '../js/ui/turn-state.js';
import { makeState } from './helpers.mjs';
import { manhattan } from '../js/engine/grid.js';

const OPEN = ['........', '........', '........', '........', '........', '........', '........', '........'];
const ON = { rules: { foxDash: true } };

/**
 * @param {string[]} grid
 * @param {object[]} bands
 * @param {object} [extra]
 */
function state(grid, bands, extra = ON) {
  return makeState(grid, /** @type {any} */ (bands), /** @type {any} */ (extra));
}

const fox = (cells = [[0, 0]], more = {}) => ({ id: 'fox', type: 'fox', cells, maxLen: 2, ...more });
const farBot = { id: 'saw-0', type: 'saw', cells: [[7, 7], [7, 6]] };

test('foxDash is a trial rule', () => {
  assert.ok(TRIAL_RULE_IDS.includes('foxDash'));
});

test('the fox dashes 5: its speed and its dash of 2', () => {
  assert.equal(dashRange('fox'), 5);
});

test('the dash tiles are the tiles 4 or 5 away that a walk cannot reach', () => {
  const s = state(OPEN, [fox(), farBot]);
  const tiles = dashTiles(s, 'fox');
  const walk = reachable(s, 'fox');
  assert.ok(tiles.size > 0);
  assert.equal(tiles.size, reachable(s, 'fox', 5).size - walk.size);
  for (const [k, path] of tiles) {
    assert.ok(!walk.has(k), `${k} is a walk tile`);
    const d = manhattan([0, 0], path[path.length - 1]);
    assert.ok(d === 4 || d === 5, `${k} is ${d} away`);
  }
});

test('no dash with the rule off, for the hedgehog, or once the fox has walked', () => {
  const off = state(OPEN, [fox(), farBot], {});
  assert.equal(dashTiles(off, 'fox').size, 0);
  assert.equal(canDash(off, /** @type {any} */ (bandById(off, 'fox'))), false);
  const path = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];
  assert.throws(() => applyMove(off, { kind: 'move', band: 'fox', path, dash: true }));

  const hog = state(OPEN, [{ id: 'hedgehog', type: 'hedgehog', cells: [[0, 0]], maxLen: 2 }, farBot]);
  assert.equal(dashTiles(hog, 'hedgehog').size, 0);
  assert.throws(() => applyMove(hog, { kind: 'move', band: 'hedgehog', path: path.slice(0, 4), dash: true }));

  const walked = applyMove(state(OPEN, [fox(), farBot]), { kind: 'move', band: 'fox', path: [[0, 1]] });
  assert.equal(dashTiles(walked, 'fox').size, 0);
  assert.throws(() => applyMove(walked, { kind: 'move', band: 'fox', path: [[0, 2], [0, 3]], dash: true }));
});

test('a dash runs the path and ends the fox\'s turn: no bite after it', () => {
  const s = state(OPEN, [fox(), { id: 'saw-0', type: 'saw', cells: [[6, 0], [7, 0]] }]);
  const path = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];
  const n = applyMove(s, { kind: 'move', band: 'fox', path, dash: true });
  const f = /** @type {any} */ (bandById(n, 'fox'));
  assert.deepEqual(f.cells[0], [5, 0]);
  assert.equal(f.moved, true);
  assert.equal(f.acted, true);
  const ev = n.events.find((e) => e.kind === 'move' && e.band === 'fox');
  assert.equal(/** @type {any} */ (ev).dash, true);
  assert.throws(() => applyMove(n, { kind: 'act', band: 'fox', action: 'bite', target: [6, 0] }));
});

test('a dash longer than 5 is refused', () => {
  const s = state(OPEN, [fox(), farBot]);
  const path = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]];
  assert.throws(() => applyMove(s, { kind: 'move', band: 'fox', path, dash: true }), /exceeds/);
});

test('a dash captures, collects and frees along the way, as a walk does', () => {
  const grid = ['.P*.....', '........', '........', '........', '........', '........', '........', '........'];
  const s = state(grid, [
    fox(),
    { id: 'trapped-ants', type: 'ants', cells: [[5, 1]], trapped: true },
    farBot,
  ]);
  const n = applyMove(s, { kind: 'move', band: 'fox', path: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], dash: true });
  assert.equal(n.objectives[0].captured, true);
  assert.equal(n.pickupsTaken, 1);
  assert.equal(/** @type {any} */ (bandById(n, 'trapped-ants')).trapped, false);
});

test('water and stones are not crossed: a tile behind them is no dash tile', () => {
  // The fox at (0,3) behind a wall of water and stones down column 1.
  const grid = ['.~......', '.S......', '.~......', '.S......', '.~......', '.S......', '.~......', '.S......'];
  const s = state(grid, [fox([[0, 3]]), farBot]);
  const ends = [...dashTiles(s, 'fox').values()].map((p) => p[p.length - 1]);
  assert.deepEqual(ends, [[0, 7]], 'only down its own column, never across the wall');
});

test('with snakeBodies on too, every dash path is one the engine accepts', () => {
  const extra = { rules: { foxDash: true, snakeBodies: true } };
  const s = state(OPEN, [fox([[2, 2], [2, 3], [2, 4]], { maxLen: 3 }), farBot], extra);
  const tiles = dashTiles(s, 'fox');
  assert.ok(tiles.size > 0);
  for (const path of tiles.values()) {
    applyMove(s, { kind: 'move', band: 'fox', path, dash: true });
  }
});

test('turn state: a fox that can dash is ready; one that has dashed is done', () => {
  const s = state(OPEN, [fox(), farBot]);
  assert.equal(bandTurnState(s, /** @type {any} */ (bandById(s, 'fox'))), 'ready');
  const n = applyMove(s, { kind: 'move', band: 'fox', path: [[1, 0], [2, 0], [3, 0], [4, 0]], dash: true });
  assert.equal(bandTurnState(n, /** @type {any} */ (bandById(n, 'fox'))), 'done');
});
