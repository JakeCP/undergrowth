// renderBoard against a tiny fake DOM (tests/fake-dom.mjs): the kept plan
// layer, the den tiles and the engaged mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../js/engine/battle.js';
import { renderBoard } from '../js/ui/board.js';
import { DEN_GROUND, DEN_SCORCHED, DEN_GLOW } from '../js/ui/patterns.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { setBoardPieces } from '../js/ui/pieces.js';

installFakeDom();
// These check the code drawing, which is what any piece whose picture is
// not listed falls back to; tests/board-pieces.test.mjs checks the pictures.
setBoardPieces({});

const NO_VIEW = { selected: null, highlights: [], highlightKind: null, ghost: null };

/** @param {FakeEl} svg @param {string} id */
function planNode(svg, id) {
  return svg.all().find((n) => n.attrs['data-plan'] === id);
}

function denBoard() {
  return makeState(['D.........', '..........', '........H.'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'beaver', type: 'beaver', cells: [[0, 2]] },
    { id: 'harvester-0', type: 'harvester', cells: [[9, 2]], plan: { path: [], strike: [8, 2], actionId: 'mow' } },
  ]);
}

test('renderBoard: an unchanged plan keeps its drawing across renders; a changed one is redrawn', () => {
  const svg = new FakeEl('svg');
  const s = denBoard();
  renderBoard(/** @type {any} */ (svg), s, NO_VIEW);
  const first = planNode(svg, 'harvester-0');
  assert.ok(first !== undefined, 'the plan is drawn');
  assert.ok(first.all().some((n) => n.attrs['data-strike'] === '8,2'), 'with a mark on the strike tile');

  // A player move re-plans every bot; the harvester's plan is the same.
  const moved = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0]] });
  renderBoard(/** @type {any} */ (svg), moved, NO_VIEW);
  assert.equal(planNode(svg, 'harvester-0'), first, 'the same drawing, not a new one');

  const changed = structuredClone(moved);
  changed.bands[2].plan = { path: [[9, 1]], strike: [8, 1], actionId: 'mow' };
  renderBoard(/** @type {any} */ (svg), changed, NO_VIEW);
  const redrawn = planNode(svg, 'harvester-0');
  assert.ok(redrawn !== undefined && redrawn !== first, 'a changed plan is drawn anew');
  assert.equal(svg.all().filter((n) => n.attrs['data-plan'] === 'harvester-0').length, 1, 'and the old one is gone');

  const none = structuredClone(changed);
  none.bands[2].plan = null;
  renderBoard(/** @type {any} */ (svg), none, NO_VIEW);
  assert.equal(planNode(svg, 'harvester-0'), undefined, 'a plan that is gone is removed');
});

test('renderBoard: the plan layer sits above the tiles and below the bands', () => {
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), denBoard(), NO_VIEW);
  const order = svg.children.map((c) => c.attrs['data-layer'] ?? c.attrs['data-band'] ?? c.attrs['data-x'] ?? c.tag);
  const layer = order.indexOf('plans');
  assert.ok(layer > order.indexOf('8'), 'after the tiles');
  assert.ok(layer < order.indexOf('harvester-0'), 'before the bands');
});

test('renderBoard: intact and damaged dens are drawn as their own tiles, unlike forest', () => {
  const s = makeState(['HHT'], []);
  s.tiles[0][1] = { kind: 'habitatDamaged', variant: null, under: null };
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, NO_VIEW);
  /** @param {number} x */
  const fills = (x) => svg.children.find((c) => c.tag === 'g' && c.attrs['data-x'] === String(x)).all().map((n) => n.attrs.fill);
  assert.ok(fills(0).includes(DEN_GROUND) && fills(0).includes(DEN_GLOW), 'intact: den ground and glow');
  assert.ok(fills(1).includes(DEN_SCORCHED) && !fills(1).includes(DEN_GLOW), 'damaged: scorched, no glow');
  assert.ok(!fills(2).includes(DEN_GROUND) && !fills(2).includes(DEN_SCORCHED), 'forest has neither');
});

test('renderBoard: the engaged mark is on engaged bots only', () => {
  const s = makeState(['..........'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[9, 0]] },
  ]);
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, NO_VIEW);
  /** @param {string} id */
  const marked = (id) => svg.children.find((c) => c.attrs['data-band'] === id).all().some((n) => n.attrs['data-engaged'] === 'true');
  assert.equal(marked('harvester-0'), true);
  assert.equal(marked('harvester-1'), false);
  assert.equal(marked('ants'), false);
});

test('renderBoard: with no canvas, a head shows its plain glyph, with no filter', () => {
  const s = makeState(['...'], [{ id: 'ants', type: 'ants', cells: [[0, 0]] }]);
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, NO_VIEW);
  const head = svg.children.find((c) => c.attrs['data-band'] === 'ants').find('data-token', '0');
  assert.equal(head.all().some((n) => n.tag === 'image'), false);
  const glyph = head.all().find((n) => n.tag === 'text' && n.textContent === '🐜');
  assert.ok(glyph !== undefined, 'the glyph itself');
  assert.equal(glyph.attrs.filter, undefined);
});
