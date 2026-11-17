// The painted pieces in motion (js/ui/piece-motion.js through
// js/ui/motion.js and js/ui/motion-player.js): what each terrain change
// does to the pictures, with transform and opacity only, nothing of it
// under reduced motion, and the code drawing's effects when a picture is
// not listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionTracks, tileKindOf } from '../js/ui/motion.js';
import { animSteps } from '../js/ui/anim-steps.js';
import { playMotion } from '../js/ui/motion-player.js';
import { renderBoard } from '../js/ui/board.js';
import { setBoardPieces, hasStump } from '../js/ui/pieces.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';

installFakeDom({ canvas: true });

const action = (actor, actionId, from, target) => ({ kind: 'action', actor, actionId, from, target });
const terrain = (at, from, to, cause) => ({ kind: 'terrain', at, from, to, cause });

/** @param {object} before @param {object[]} events @param {object} [opts] */
function tracksFor(before, events, opts = {}) {
  const steps = animSteps(events, { tileKind: tileKindOf(before), ...opts });
  return motionTracks(steps, before, { reducedMotion: opts.reducedMotion === true });
}

const pieceFx = (motion) => motion.during.filter((t) => t.target.kind === 'fx' && t.target.fx === 'piece');
const fxOf = (motion, fx) => motion.during.filter((t) => t.target.kind === 'fx' && t.target.fx === fx);
const featureAt = (motion, at) => motion.during.find((t) => t.target.kind === 'feature' && t.target.at[0] === at[0] && t.target.at[1] === at[1]);
const first = (track) => track.keyframes[0];
const last = (track) => track.keyframes[track.keyframes.length - 1];

function assertCheap(tracks) {
  for (const track of tracks) {
    for (const frame of track.keyframes) {
      for (const prop of Object.keys(frame)) {
        assert.ok(['transform', 'opacity', 'offset', 'easing'].includes(prop), `${track.target.kind} animates ${prop}`);
      }
    }
  }
}

/** A row of tiles, one with a stump-to-be and one without, for the stubble cases. */
function stumpColumns() {
  let withStump = -1;
  let without = -1;
  for (let x = 0; x < 8; x += 1) {
    if (hasStump(x, 0) && withStump < 0) withStump = x;
    if (!hasStump(x, 0) && without < 0) without = x;
  }
  assert.ok(withStump >= 0 && without >= 0);
  return { withStump, without };
}

test('a dug hole appears by sinking in: the hole picture opens up, with no drawn pit', (t) => {
  t.after(() => setBoardPieces());
  setBoardPieces();
  const before = makeState(['....', '....', '....'], [{ id: 'badger', type: 'badger', cells: [[1, 1]] }]);
  const motion = tracksFor(before, [action('badger', 'dig', [1, 1], [1, 2]), terrain([1, 2], 'open', 'hole', 'dig')]);
  assertCheap(motion.during);
  assert.equal(fxOf(motion, 'pit').length, 0);
  const [hole] = pieceFx(motion);
  assert.equal(hole.target.piece, 'hole');
  assert.deepEqual(hole.target.at, [1, 2]);
  assert.equal(hole.fill, 'both', 'hidden until its moment, shown until the swap');
  assert.equal(first(hole).opacity, 0);
  assert.match(first(hole).transform, /scale\(0\.\d+, 0\.\d+\)/, 'from a small pit');
  assert.equal(last(hole).transform, 'scale(1, 1)');
  assert.equal(last(hole).opacity, 1);
  assert.equal(last(featureAt(motion, [1, 2])).opacity, 0, 'what was there sinks away');
});

test('a dam drops in with its small bounce, with no drawn planks', (t) => {
  t.after(() => setBoardPieces());
  const before = makeState(['.~', '..'], [{ id: 'beaver', type: 'beaver', cells: [[0, 0]] }]);
  const motion = tracksFor(before, [action('beaver', 'build', [0, 0], [1, 0]), terrain([1, 0], 'water', 'dam', 'build')]);
  assertCheap(motion.during);
  assert.equal(fxOf(motion, 'planks').length, 0);
  const [dam] = pieceFx(motion);
  assert.equal(dam.target.piece, 'dam');
  const ys = dam.keyframes.map((k) => Number(/translate\(0px, (-?[\d.]+)px\)/.exec(k.transform)[1]));
  assert.ok(ys[0] < 0, 'from above');
  assert.ok(ys.some((y) => y > 0), 'overshoots');
  assert.equal(ys[ys.length - 1], 0, 'and settles');
});

test('a mown tree tips over and fades; a stump fades in only where the stubble gets one', (t) => {
  t.after(() => setBoardPieces());
  const { withStump, without } = stumpColumns();
  for (const [x, stump] of [[withStump, true], [without, false]]) {
    const grid = ['TTTTTTTT', '........'];
    const before = makeState(grid, [{ id: 'harvester-0', type: 'harvester', cells: [[x, 1]] }]);
    const motion = tracksFor(before, [action('harvester-0', 'mow', [x, 1], [x, 0]), terrain([x, 0], 'forest', 'stubble', 'mow')]);
    assertCheap(motion.during);
    const topple = featureAt(motion, [x, 0]);
    assert.equal(topple.origin, 'bottom');
    assert.match(last(topple).transform, /rotate\(-\d+deg\)/, 'to the left, over the tiles drawn before it');
    assert.equal(last(topple).opacity, 0);
    const pieces = pieceFx(motion);
    if (stump) {
      assert.equal(pieces.length, 1, `a stump at ${x},0`);
      assert.equal(pieces[0].target.piece, 'stump');
      assert.equal(first(pieces[0]).opacity, 0);
      assert.equal(last(pieces[0]).opacity, 1);
    } else {
      assert.equal(pieces.length, 0, `no stump at ${x},0`);
    }
  }
});

test('a struck den shakes and becomes its damaged picture, of its level\'s kind', (t) => {
  t.after(() => setBoardPieces());
  const before = makeState(['....', '....', '...H', '....'], [{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }]);
  before.levelId = 'o02';
  const motion = tracksFor(before, [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'habitat', 'habitatDamaged', 'mow')]);
  assertCheap(motion.during);
  const shake = featureAt(motion, [3, 2]);
  const xs = shake.keyframes.map((k) => Number(/translate\((-?[\d.]+)px/.exec(k.transform)[1]));
  assert.ok(xs.some((x) => x < 0) && xs.some((x) => x > 0), 'shakes side to side');
  assert.equal(last(shake).opacity, 0, 'and gives way');
  assert.equal(shake.fill, 'forwards');
  const [damaged] = pieceFx(motion);
  assert.equal(damaged.target.piece, 'den-anthill-damaged', "o02's den is the ant hill");
  assert.equal(first(damaged).opacity, 0);
  assert.equal(last(damaged).opacity, 1);
  assert.equal(fxOf(motion, 'flash').length, 1, 'the strike still flashes');
  assert.equal(motion.detached[0].target.text, 'Den damaged!');
});

test('a destroyed den crumbles away into stubble', (t) => {
  t.after(() => setBoardPieces());
  const before = makeState(['....', '....', '...H', '....'], [{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }]);
  before.tiles[2][3] = { kind: 'habitatDamaged', variant: null, under: null };
  const motion = tracksFor(before, [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'habitatDamaged', 'stubble', 'mow')]);
  assertCheap(motion.during);
  const crumble = featureAt(motion, [3, 2]);
  assert.equal(crumble.origin, 'bottom');
  assert.match(last(crumble).transform, /scale\(0\.5\)/);
  assert.equal(last(crumble).opacity, 0);
  assert.deepEqual(pieceFx(motion).map((p) => p.target.piece), hasStump(3, 2) ? ['stump'] : []);
});

test('under reduced motion the pictures only cross-fade: no piece moves', (t) => {
  t.after(() => setBoardPieces());
  const before = makeState(['....', '....', '...H', '....'], [{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }]);
  const events = [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'habitat', 'habitatDamaged', 'mow')];
  const motion = tracksFor(before, events, { reducedMotion: true });
  assert.equal(pieceFx(motion).length, 0);
  for (const track of motion.during) {
    for (const frame of track.keyframes) assert.equal(frame.transform, undefined, 'nothing moves');
  }
});

test('with no pictures listed, the drawn pit, planks and crack flicker play as before', (t) => {
  t.after(() => setBoardPieces());
  setBoardPieces({});
  const dug = tracksFor(makeState(['....', '....'], [{ id: 'badger', type: 'badger', cells: [[1, 0]] }]),
    [action('badger', 'dig', [1, 0], [1, 1]), terrain([1, 1], 'open', 'hole', 'dig')]);
  assert.equal(fxOf(dug, 'pit').length, 1);
  assert.equal(pieceFx(dug).length, 0);
  const struck = tracksFor(makeState(['...H', '....'], [{ id: 'harvester-0', type: 'harvester', cells: [[3, 1]] }]),
    [action('harvester-0', 'mow', [3, 1], [3, 0]), terrain([3, 0], 'habitat', 'habitatDamaged', 'mow')]);
  assert.equal(pieceFx(struck).length, 0);
  assert.equal(last(featureAt(struck, [3, 0])).opacity, 1, 'the drawn den flickers and stays');
});

test('the player puts a piece effect in its tile, under the feature it replaces', (t) => {
  t.after(() => setBoardPieces());
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = makeState(['....', '....', '....'], [{ id: 'badger', type: 'badger', cells: [[1, 1]] }]);
  const events = [action('badger', 'dig', [1, 1], [1, 2]), terrain([1, 2], 'open', 'hole', 'dig')];
  const motion = tracksFor(state, events);
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), state, { selected: null, highlights: [], highlightKind: null, ghost: null });
  playMotion(/** @type {any} */ (svg), null, motion, { onEnd: () => {} });
  const tile = svg.querySelector('[data-tile="1,2"]');
  const piece = tile.children.find((c) => c.attrs['data-fx'] === 'piece');
  assert.ok(piece !== undefined, 'in the tile');
  assert.equal(piece.attrs['data-fx-piece'], 'hole');
  assert.equal(piece.find('data-piece').children[0].attrs.href, 'assets/board/hole.webp');
  const feature = tile.children.find((c) => c.attrs['data-feature'] !== undefined);
  assert.ok(tile.children.indexOf(piece) < tile.children.indexOf(feature), 'under the old feature');
  assert.equal(piece.animations.length, 1);
  assert.equal(piece.attrs.transform, undefined, 'free for a CSS transform');
});
