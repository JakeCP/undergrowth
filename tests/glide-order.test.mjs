// Bees glide through other bands (living-bots spec §8). Bands are drawn in
// the state's order, so a band that walks through one drawn after it must
// be lifted above the other bands for its walk, or it passes underneath.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBoard, raiseBands } from '../js/ui/board.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';

installFakeDom({ canvas: true });

const PLAIN = { selected: null, highlights: [], highlightKind: null, ghost: null };

function board() {
  const s = makeState(['.....', '.....', '.....'], [
    { id: 'bees', type: 'bees', cells: [[0, 1]], maxLen: 2 },
    { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [1, 2]] },
    { id: 'harvester-0', type: 'harvester', cells: [[4, 2]] },
  ]);
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, PLAIN);
  return svg;
}

const order = (svg) => svg.children.map((n) => n.attrs['data-band'] ?? n.attrs['data-layer'] ?? '').filter((k) => k !== '');

test('raiseBands lifts a band above the other bands, and above nothing else', () => {
  const svg = board();
  const before = svg.children.slice();
  const lastBand = before.map((n) => n.attrs['data-band'] !== undefined).lastIndexOf(true);
  assert.deepEqual(order(svg).filter((k) => ['bees', 'ants', 'harvester-0'].includes(k)), ['bees', 'ants', 'harvester-0']);
  raiseBands(/** @type {any} */ (svg), ['bees']);
  const bands = svg.children.filter((n) => n.attrs['data-band'] !== undefined).map((n) => n.attrs['data-band']);
  assert.deepEqual(bands, ['ants', 'harvester-0', 'bees']);
  // It takes the last band's place: whatever was drawn after the bands stays on top.
  assert.equal(svg.children.length, before.length);
  assert.deepEqual(svg.children.slice(lastBand + 1), before.slice(lastBand + 1));
  assert.equal(svg.children[lastBand].attrs['data-band'], 'bees');
});

test('raiseBands ignores a band that is not drawn', () => {
  const svg = board();
  const before = svg.children.slice();
  raiseBands(/** @type {any} */ (svg), ['nobody']);
  assert.deepEqual(svg.children, before);
});

test('mounted: bees walking through the ants are drawn above them while they glide', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mountBattle } = await import('../js/ui/battle-view.js');
  const { LEVELS } = await import('../data/levels/index.js');
  // An 8 by 8 board, the size the tap maths assumes.
  const state = makeState(Array(8).fill('........'), [
    { id: 'bees', type: 'bees', cells: [[0, 1]], maxLen: 2 },
    { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [1, 2]] },
    { id: 'harvester-0', type: 'harvester', cells: [[7, 7]] },
  ]);
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level: LEVELS.find((l) => l.id === 'l01'), state, onFinish() {}, onQuit() {},
  });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  const tap = (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' });
  const bandOrder = () => svg.children.filter((n) => n.attrs['data-band'] !== undefined).map((n) => n.attrs['data-band']);
  assert.deepEqual(bandOrder(), ['bees', 'ants', 'harvester-0']);
  tap(0, 1);
  tap(3, 1);
  const head = svg.querySelector('[data-band="bees"] [data-head]');
  assert.ok(head.animations.length > 0, 'the bees are gliding');
  assert.equal(bandOrder().at(-1), 'bees', 'drawn over the ants for the walk');
  t.mock.timers.tick(5_000);
});
