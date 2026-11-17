// renderBoard with the painted pieces (js/ui/board-pieces.js), against
// the fake DOM: each tile's piece in its feature group, drawn row by row
// from the top and under everything that carries play information, the
// den glow and pulse, the dimming under a band, the objectives, and the
// code drawing for anything whose picture is not listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBoard } from '../js/ui/board.js';
import { setBoardPieces, shippedPieces, tilePiece, pieceRect, DIM_UNDER_BAND } from '../js/ui/pieces.js';
import { pieceScene } from '../js/ui/board-pieces.js';
import { forestTrees } from '../js/ui/look.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';

installFakeDom({ canvas: true });

const NO_VIEW = { selected: null, highlights: [], highlightKind: null, ghost: null };

/** @param {object} state @param {object} [view] */
function draw(state, view = NO_VIEW) {
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), /** @type {any} */ (state), /** @type {any} */ (view));
  return svg;
}

/** @param {FakeEl} svg @param {number} x @param {number} y */
function tile(svg, x, y) {
  return svg.children.find((c) => c.attrs['data-tile'] === `${x},${y}`);
}

function board() {
  return makeState([
    'TTS.',
    ',;H_',
    '~=oT',
    'P.HK',
  ], [
    { id: 'ants', type: 'ants', cells: [[3, 2], [3, 3]], maxLen: 3 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 3]], plan: { path: [], strike: [2, 3], actionId: 'mow' } },
  ]);
}

test('each tile with a picture shows it in its feature group, standing where pieceRect says', (t) => {
  t.after(() => setBoardPieces());
  setBoardPieces();
  const s = board();
  const svg = draw(s);
  const scene = pieceScene(s);
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const feature = tile(svg, x, y).find('data-feature');
      const want = tilePiece(s.tiles[y][x], x, y, scene.denKind(x, y));
      const pieces = feature.findAll('data-piece');
      if (want === null || want.piece === null) {
        assert.equal(pieces.length, 0, `${x},${y} has no piece`);
        continue;
      }
      assert.equal(pieces.length, 1, `${x},${y}`);
      const piece = pieces[0];
      assert.equal(piece.tag, 'svg');
      assert.equal(piece.attrs['data-piece'], want.piece);
      const r = pieceRect(want.piece, x, y);
      assert.deepEqual([piece.attrs.x, piece.attrs.y, piece.attrs.width, piece.attrs.height, piece.attrs.viewBox],
        [String(r.x), String(r.y), String(r.width), String(r.height), r.viewBox]);
      const img = piece.children[0];
      assert.equal(img.tag, 'image');
      assert.equal(img.attrs.href, shippedPieces()[want.piece]);
      assert.equal(feature.find('data-tree'), undefined, 'no drawn trees under a picture');
    }
  }
});

test('pieces are drawn row by row from the top, and under every play mark', (t) => {
  t.after(() => setBoardPieces());
  const s = board();
  const ghost = structuredClone(s);
  ghost.bands[0].cells = [[3, 1], [3, 2], [3, 3]];
  const svg = draw(s, {
    selected: 'ants', highlights: [[0, 3], [1, 2]], highlightKind: 'move', ghost,
    targets: [{ at: [1, 3], badges: ['wipe'] }],
  });
  const nodes = svg.all();
  const pieces = nodes.filter((n) => n.attrs['data-piece'] !== undefined);
  assert.ok(pieces.length >= 8);
  /** The row of the tile a piece is in, or -1 for a piece in no tile. */
  const rowOf = (n) => {
    for (let up = n; up !== null; up = up.parent) if (up.attrs['data-y'] !== undefined) return Number(up.attrs['data-y']);
    return -1;
  };
  const tilePieces = pieces.filter((n) => rowOf(n) >= 0);
  for (let i = 1; i < tilePieces.length; i += 1) {
    assert.ok(rowOf(tilePieces[i]) >= rowOf(tilePieces[i - 1]), 'a nearer row after a farther one');
  }
  const lastPiece = nodes.lastIndexOf(tilePieces[tilePieces.length - 1]);
  const objectives = nodes.filter((n) => n.attrs['data-objective'] !== undefined);
  for (const key of ['data-objective', 'data-plan', 'data-highlight', 'data-target', 'data-band', 'data-ghost-band', 'data-badge', 'data-pulse', 'data-engaged']) {
    const first = nodes.findIndex((n) => n.attrs[key] !== undefined);
    if (key === 'data-engaged' && first < 0) continue;
    assert.ok(first > lastPiece, `${key} is drawn over every tile piece`);
  }
  assert.equal(objectives.length, 2);
});

test('an untouched den glows behind its picture; a struck one shows its damaged picture and no glow', (t) => {
  t.after(() => setBoardPieces());
  const s = board();
  const intact = tile(draw(s), 2, 1).find('data-feature');
  const glow = intact.find('data-glow');
  assert.ok(glow !== undefined, 'a glow');
  assert.ok(intact.all().indexOf(glow) < intact.all().indexOf(intact.find('data-piece')), 'behind the picture');
  s.tiles[1][2] = { kind: 'habitatDamaged', variant: null, under: null };
  const struck = tile(draw(s), 2, 1).find('data-feature');
  assert.match(struck.find('data-piece').attrs['data-piece'], /^den-\w+-damaged$/);
  assert.equal(struck.find('data-glow'), undefined);
  assert.equal(struck.find('data-smoke'), undefined, 'no drawn smoke over a picture');
});

test('a den a bot plan strikes pulses on a layer over every tile; one no plan strikes does not', (t) => {
  t.after(() => setBoardPieces());
  const s = board();
  const svg = draw(s);
  const marks = svg.children.find((c) => c.attrs['data-layer'] === 'den-marks');
  assert.ok(marks !== undefined);
  const pulse = marks.find('data-pulse', '2,3');
  assert.ok(pulse !== undefined);
  assert.match(pulse.attrs.class, /\bug-pulse\b/);
  assert.equal(tile(svg, 2, 3).find('data-pulse'), undefined, 'not inside the tile, where the row below could cover it');
  s.bands[1].plan = null;
  assert.equal(draw(s).children.find((c) => c.attrs['data-layer'] === 'den-marks'), undefined);
});

test('a forest or den piece with a band on it is dimmed; others are not', (t) => {
  t.after(() => setBoardPieces());
  const s = board();
  s.bands[0].cells = [[0, 0], [1, 1]];
  s.tiles[1][1] = { kind: 'habitat', variant: null, under: null };
  const svg = draw(s);
  const piece = (x, y) => tile(svg, x, y).find('data-piece');
  assert.equal(piece(0, 0).attrs.opacity, String(DIM_UNDER_BAND), 'forest under a band');
  assert.equal(piece(1, 1).attrs.opacity, String(DIM_UNDER_BAND), 'den under a band');
  assert.equal(piece(1, 0).attrs.opacity, undefined, 'forest with no band');
  assert.equal(piece(2, 1).attrs.opacity, undefined, 'den with no band');
});

test('objectives stand as pictures: the permit, and the map\'s stake marker', (t) => {
  t.after(() => setBoardPieces());
  const s = board();
  s.objectives[0].captured = true;
  const svg = draw(s);
  const permit = svg.find('data-objective', '0,3');
  const stake = svg.find('data-objective', '3,3');
  assert.equal(permit.find('data-piece').attrs['data-piece'], 'permit');
  assert.equal(stake.find('data-piece').attrs['data-piece'], 'stake');
  assert.equal(stake.find('data-piece').children[0].attrs.href, 'assets/map/markers/stake.webp');
  assert.equal(permit.all().some((n) => n.tag === 'text'), false, 'no emoji');
  assert.equal(permit.attrs.opacity, '0.4', 'a captured one is faded, as before');
});

test('the den picture follows the level: o02\'s den is the ant hill, l01\'s the burrow', (t) => {
  t.after(() => setBoardPieces());
  assert.equal(pieceScene({ levelId: 'o02', bands: [] }).denKind(5, 4), 'anthill');
  const s = board();
  s.levelId = 'l01';
  assert.equal(tile(draw(s), 2, 1).find('data-piece').attrs['data-piece'], 'den-burrow');
});

test('with no pictures listed, every tile and objective is drawn in code, exactly as before', (t) => {
  t.after(() => setBoardPieces());
  setBoardPieces({});
  const s = board();
  const svg = draw(s);
  assert.equal(svg.find('data-piece'), undefined);
  assert.equal(svg.children.find((c) => c.attrs['data-layer'] === 'den-marks'), undefined);
  const trees = tile(svg, 0, 0).find('data-feature').findAll('data-tree').map((n) => n.attrs['data-tree']);
  assert.deepEqual(trees, forestTrees(0, 0).map((tr) => tr.kind));
  assert.ok(tile(svg, 2, 3).find('data-pulse') !== undefined, 'the drawn den pulses in its tile');
  const permit = svg.find('data-objective', '0,3');
  // The fallback permit is drawn in code (no emoji, no picture).
  assert.equal(permit.all().find((n) => n.tag === 'text'), undefined);
  assert.ok(permit.all().length > 1, 'the drawn permit has shapes');
  // The same board drawn twice in code is the same drawing.
  assert.deepEqual(JSON.stringify(strip(draw(s))), JSON.stringify(strip(svg)));
});

test('only a missing picture falls back: the rest of the board keeps its pictures', (t) => {
  t.after(() => setBoardPieces());
  const { stump: _stump, hole: _hole, ...rest } = shippedPieces();
  setBoardPieces(rest);
  const s = board();
  const svg = draw(s);
  const hole = tile(svg, 2, 2).find('data-feature');
  assert.equal(hole.find('data-piece'), undefined, 'the hole is drawn in code');
  assert.ok(hole.children.length >= 2);
  assert.ok(tile(svg, 0, 0).find('data-piece') !== undefined, 'the forest keeps its picture');
  const stubble = tile(svg, 3, 1).find('data-feature');
  assert.ok(stubble.children.length >= 1, 'stubble is drawn in code without the stump picture');
});

/** The drawing as plain data, without the clock-driven animation delays. */
function strip(node) {
  const { style: _s, ...attrs } = node.attrs;
  return { tag: node.tag, attrs, children: node.children.map(strip) };
}
