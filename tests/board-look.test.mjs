// renderBoard's look (look-and-motion spec, "Look"), against the fake DOM
// in tests/fake-dom.mjs, with a fake canvas so heads get silhouette
// images. Checks the structure the animation step relies on: tiles found
// by position, bands by id, tokens by cell index, and no live filter on
// anything that moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBoard } from '../js/ui/board.js';
import { GROUND_KEYS, SURFACE_GROUND, patternId, groundFill, hasTexture, surfaceOf } from '../js/ui/patterns.js';
import { groundGrid, tileBlend, forestTrees, tileMarks } from '../js/ui/look.js';
import { bandLinks } from '../js/ui/links.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { setBoardPieces } from '../js/ui/pieces.js';

installFakeDom({ canvas: true });
// These check the code drawing, which is what any piece whose picture is
// not listed falls back to; tests/board-pieces.test.mjs checks the pictures.
setBoardPieces({});

const NO_VIEW = { selected: null, highlights: [], highlightKind: null, ghost: null };

/** @param {import('../js/engine/types.js').BattleState} state @param {object} [view] */
function draw(state, view = NO_VIEW) {
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), state, /** @type {any} */ (view));
  return svg;
}

/** @param {FakeEl} svg @param {number} x @param {number} y */
function tile(svg, x, y) {
  return svg.children.find((c) => c.attrs['data-tile'] === `${x},${y}`);
}

function sampleBoard() {
  return makeState(['.,T~', 'oS_#', '=..H'], [
    { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [2, 1]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]], plan: { path: [], strike: [3, 2], actionId: 'mow' } },
  ]);
}

test('every tile is a <g data-tile="x,y"> holding its ground and its feature, with no transform', () => {
  const s = sampleBoard();
  const svg = draw(s);
  const grounds = groundGrid(s);
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const g = tile(svg, x, y);
      assert.ok(g !== undefined, `tile ${x},${y}`);
      assert.equal(g.attrs['data-x'], String(x));
      assert.equal(g.attrs['data-y'], String(y));
      const ground = g.children.filter((c) => c.attrs['data-ground'] !== undefined);
      const feature = g.children.filter((c) => c.attrs['data-feature'] !== undefined);
      assert.equal(ground.length, 1, 'one ground');
      assert.equal(feature.length, 1, 'one feature');
      const grassy = surfaceOf(grounds[y][x]) === 'grass';
      assert.equal(ground[0].attrs.fill, grassy ? 'none' : groundFill(grounds[y][x]),
        grassy ? 'grass left open to the field underlay' : 'filled from the ground pattern');
      assert.equal(ground[0].attrs['data-ground'], grounds[y][x]);
      for (const n of [g, ground[0], feature[0]]) assert.equal(n.attrs.transform, undefined);
    }
  }
});

test('the defs hold a pattern for every ground, and no ug-white filter', () => {
  const svg = draw(sampleBoard());
  const defs = svg.children.find((c) => c.tag === 'defs');
  const ids = defs.children.filter((c) => c.tag === 'pattern').map((c) => c.attrs.id);
  for (const key of GROUND_KEYS) assert.ok(ids.includes(patternId(key)), key);
  assert.equal(svg.all().some((n) => n.attrs.id === 'ug-white'), false);
});

test('each tile is blended into the surfaces round it as tileBlend says, between its ground and its feature', () => {
  const s = sampleBoard();
  const svg = draw(s);
  const grounds = groundGrid(s);
  let drawn = 0;
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const g = tile(svg, x, y);
      const blend = tileBlend(grounds, x, y);
      const attr = (/** @type {string} */ name) => g.findAll(name).map((n) => n.attrs[name]);
      assert.deepEqual(attr('data-edge'), blend.shade, `${x},${y} shade`);
      assert.deepEqual(attr('data-spill'), [...blend.spills.map((p) => p.side), ...blend.fades.map((p) => p.corner)], `${x},${y} spills`);
      // A rounded-off corner is one shape, and a second over it where
      // this tile's own surface is the higher one. A corner rounded into
      // the grass is a notch cut out of the tile instead, so the field
      // underlay shows there; only its second shape is drawn.
      const notched = (/** @type {{fill: string}} */ c) => surfaceOf(grounds[y][x]) !== 'grass' && c.fill === 'grass';
      assert.deepEqual(attr('data-cut'), blend.cuts.flatMap((c) => [
        ...(notched(c) ? [] : [c.corner]), ...(c.beach === null ? [] : [c.corner]),
      ]), `${x},${y} cuts`);
      const notches = blend.cuts.filter(notched).map((c) => c.corner).join(' ');
      const clipPath = g.children.find((c) => c.tag === 'clipPath');
      assert.equal(clipPath?.attrs['data-notches'], notches || undefined, `${x},${y} notches`);
      if (clipPath !== undefined) {
        const clipped = g.children.filter((c) => c.attrs['clip-path'] === `url(#${clipPath.attrs.id})`);
        assert.equal(clipped.length, 1 + blend.shade.length + blend.spills.length + blend.fades.length, 'ground and blend clipped');
      }
      for (const cut of g.findAll('data-cut').filter((n) => n.attrs.opacity === undefined)) {
        const want = blend.cuts.find((c) => c.corner === cut.attrs['data-cut']);
        assert.equal(cut.attrs.fill, groundFill(SURFACE_GROUND[want.fill]), 'filled with the surface beside it');
      }
      const kids = g.children.map((c) => c.attrs['data-ground'] ?? c.attrs['data-feature'] ?? 'blend');
      assert.equal(kids[0], grounds[y][x], 'the ground first');
      assert.equal(g.children[g.children.length - 1].attrs['data-feature'] !== undefined, true, 'the feature last');
      drawn += g.children.length - 2;
    }
  }
  assert.ok(drawn > 0, 'the sample board has water, stubble and paving to blend');
});

test('the grass field fills one shape under the whole board, not one per tile', () => {
  // WebKit draws a bitmap of the whole field for every shape that uses
  // it; one per tile ran an iPhone out of memory opening a battle.
  const s = sampleBoard();
  const svg = draw(s);
  const grassFills = new Set(GROUND_KEYS.filter((k) => surfaceOf(k) === 'grass').map((k) => groundFill(k)));
  const users = svg.all().filter((n) => grassFills.has(n.attrs.fill));
  assert.equal(users.length, 1);
  assert.equal(users[0].attrs['data-layer'], 'grass');
  assert.equal(users[0].attrs.width, String(s.width * 40));
  assert.equal(users[0].attrs.height, String(s.height * 40));
  const firstTile = svg.children.findIndex((c) => c.attrs['data-tile'] !== undefined);
  assert.ok(svg.children.indexOf(users[0]) < firstTile, 'under the tiles');
});

test('the grid is a faint overlay shown only during move or target selection', () => {
  const s = sampleBoard();
  const grid = (svg) => svg.children.filter((c) => c.attrs['data-layer'] === 'grid');
  assert.equal(grid(draw(s)).length, 0, 'not when nothing is selected');
  assert.equal(grid(draw(s, { ...NO_VIEW, highlights: [[0, 0]], highlightKind: 'deploy' })).length, 0, 'not while deploying');
  const shown = grid(draw(s, { ...NO_VIEW, selected: 'ants', highlights: [[0, 0]], highlightKind: 'move' }));
  assert.equal(shown.length, 1);
  assert.ok(Number(shown[0].attrs.opacity) <= 0.3, 'faint');
});

test('forest tiles grow their deterministic mix of trees, each with a shadow', () => {
  const svg = draw(sampleBoard());
  const feature = tile(svg, 2, 0).find('data-feature');
  assert.equal(feature.attrs['data-feature'], 'forest');
  const trees = feature.findAll('data-tree');
  assert.deepEqual(trees.map((t) => t.attrs['data-tree']), forestTrees(2, 0).map((t) => t.kind));
  for (const t of trees) assert.ok(t.find('data-shadow') !== undefined, 'a shadow under each');
});

test('water ripples with a cheap animation class; nothing on the ground has a filter', () => {
  const svg = draw(sampleBoard());
  const water = tile(svg, 3, 0).find('data-feature');
  assert.equal(water.attrs['data-feature'], 'water');
  const ripples = water.all().filter((n) => (n.attrs.class ?? '').split(' ').includes('ug-ripple'));
  assert.ok(ripples.length >= 1);
  for (const r of ripples) assert.match(r.attrs.style ?? '', /animation-delay: -?\d+ms/);
});

test('each band is <g data-band> with one [data-token] per cell, linked by bandLinks', () => {
  const s = sampleBoard();
  const svg = draw(s);
  const ants = svg.children.find((c) => c.attrs['data-band'] === 'ants');
  const tokens = ants.findAll('data-token');
  assert.deepEqual(tokens.map((t) => t.attrs['data-token']).sort(), ['0', '1', '2']);
  for (const t of tokens) {
    const i = Number(t.attrs['data-token']);
    assert.equal(t.attrs['data-cell'], `${s.bands[0].cells[i][0]},${s.bands[0].cells[i][1]}`);
    assert.equal(t.attrs.transform, undefined, 'free for a CSS transform');
  }
  const links = ants.findAll('data-link').map((l) => l.attrs['data-link']);
  assert.deepEqual(links, bandLinks(s.bands[0].cells).map((l) => `${l.from}-${l.to}`));
});

test('the head carries a cells/maxLen length badge; the body tokens wobble, the head does not', () => {
  const svg = draw(sampleBoard());
  const ants = svg.children.find((c) => c.attrs['data-band'] === 'ants');
  const head = ants.find('data-token', '0');
  assert.equal(head.attrs['data-head'], 'true');
  const badge = head.find('data-length');
  assert.ok(badge !== undefined);
  assert.equal(badge.attrs['data-length'], '3/4');
  assert.ok(badge.all().some((n) => n.textContent === '3/4'));
  const wobbles = (n) => n.all().filter((c) => (c.attrs.class ?? '').split(' ').includes('ug-wobble'));
  assert.equal(wobbles(head).length, 0);
  for (const i of ['1', '2']) assert.equal(wobbles(ants.find('data-token', i)).length, 1, `token ${i}`);
  const bot = svg.children.find((c) => c.attrs['data-band'] === 'harvester-0');
  assert.equal(bot.find('data-length').attrs['data-length'], '1/1');
});

test('heads show their silhouette as an image, and nothing in a band has a filter', () => {
  const svg = draw(sampleBoard());
  for (const id of ['ants', 'harvester-0']) {
    const band = svg.children.find((c) => c.attrs['data-band'] === id);
    const head = band.find('data-token', '0');
    const img = head.all().find((n) => n.tag === 'image');
    assert.ok(img !== undefined, `${id} has an image`);
    assert.equal(img.attrs.href, 'data:image/png;base64,SILHOUETTE');
    assert.equal(band.all().some((n) => n.attrs.filter !== undefined), false, `${id} has no filter`);
  }
});

test('animal and bot discs differ: green for animals, rust for bots', () => {
  const svg = draw(sampleBoard());
  const disc = (id) => svg.children.find((c) => c.attrs['data-band'] === id).find('data-disc');
  assert.notEqual(disc('ants').attrs.fill, disc('harvester-0').attrs.fill);
  assert.equal(disc('ants').attrs['data-disc'], 'us');
  assert.equal(disc('harvester-0').attrs['data-disc'], 'bots');
});

test('a den a bot plan strikes pulses; one no plan strikes does not', () => {
  const s = sampleBoard();
  assert.ok(tile(draw(s), 3, 2).find('data-pulse') !== undefined, 'aimed');
  s.bands[1].plan = null;
  assert.equal(tile(draw(s), 3, 2).find('data-pulse'), undefined, 'not aimed');
});

test('a damaged den shows cracks and a wisp of smoke; an intact one shows neither', () => {
  const s = sampleBoard();
  const intact = tile(draw(s), 3, 2);
  assert.equal(intact.find('data-cracks'), undefined);
  assert.equal(intact.find('data-smoke'), undefined);
  s.tiles[2][3] = { kind: 'habitatDamaged', variant: null, under: null };
  const damaged = tile(draw(s), 3, 2);
  assert.ok(damaged.find('data-cracks') !== undefined);
  assert.ok(damaged.find('data-smoke') !== undefined);
});

test('ghost bands are drawn apart, so a band id finds only the real band', () => {
  const s = sampleBoard();
  const ghost = structuredClone(s);
  ghost.bands[0].cells = [[0, 0], [1, 0], [1, 1]];
  const svg = draw(s, { ...NO_VIEW, ghost });
  assert.equal(svg.findAll('data-band', 'ants').length, 1);
  assert.equal(svg.findAll('data-ghost-band', 'ants').length, 1);
});

// --- the painted textures, not code-drawn marks over them (Jake: "some
// extra criss-cross added on the paving via svg? I kinda think we don't
// need that") ---

test('tileMarks: a mark that only repeats the painted texture is drawn over the plain fallback only', () => {
  assert.deepEqual(tileMarks('paving', true), { grass: false, pebbles: false, slabs: false, stalks: false });
  assert.equal(tileMarks('paving', false).slabs, true);
  assert.equal(tileMarks('stubble', true).stalks, false);
  assert.equal(tileMarks('stubble', false).stalks, true);
  for (const g of /** @type {const} */ (['open', 'meadow', 'bank'])) {
    assert.equal(tileMarks(g, true).grass, false, g);
    assert.equal(tileMarks(g, false).grass, true, g);
  }
  assert.equal(tileMarks('bank', true).pebbles, false);
  assert.equal(tileMarks('bank', false).pebbles, true);
  for (const g of /** @type {const} */ (['forest', 'water', 'hole', 'stones', 'habitat'])) {
    assert.deepEqual(tileMarks(g, false), { grass: false, pebbles: false, slabs: false, stalks: false }, g);
  }
});

test('with the painted textures in, paving has no slab lines and stubble no stalks; what tells play stays', () => {
  for (const g of ['paving', 'stubble', 'grass', 'meadow', 'bank', 'stone', 'soil', 'water']) {
    assert.ok(hasTexture(/** @type {any} */ (g === 'grass' ? 'open' : g === 'stone' ? 'stones' : g === 'soil' ? 'hole' : g)), `${g} is painted`);
  }
  const s = makeState(['#_.,', ';oS~', '=T.H'], []);
  const svg = draw(s);
  const feature = (x, y) => tile(svg, x, y).find('data-feature');
  assert.equal(feature(0, 0).children.length, 0, 'paving: no slab lines');
  assert.equal(svg.find('data-slabs'), undefined);
  assert.equal(svg.find('data-stalks'), undefined, 'stubble: no stalks');
  assert.equal(feature(2, 0).children.length, 0, 'grass: no tufts');
  assert.ok(feature(3, 0).children.length >= 2, 'flowers stay');
  assert.ok(feature(0, 1).children.length >= 2, 'mushrooms stay');
  assert.ok(feature(1, 1).children.length > 0, 'the pit of a hole stays');
  assert.ok(feature(2, 1).children.length > 0, 'the stones stay');
  assert.ok(feature(3, 1).children.length > 0, 'the water ripples stay');
  assert.ok(feature(0, 2).children.length > 0, 'the dam planks stay');
  assert.ok(feature(1, 2).find('data-tree'), 'the trees stay');
  assert.ok(feature(3, 2).children.length > 0, 'the den stays');
});
