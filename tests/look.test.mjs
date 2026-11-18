// The pure half of the board's look (look-and-motion spec, "Look"):
// which ground each tile gets, where tiles blend, when the grid shows,
// the forest variety, the band tokens, the aimed dens, and the hooks the
// animation step will use to find what it moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, hash01, groundGrid, softEdges, tileBlend, showGrid, forestTrees, TREE_KINDS,
  bandTokens, aimedHabitats, phaseDelay,
  tileSelector, groundSelector, featureSelector, bandSelector, tokenSelector, headSelector,
} from '../js/ui/look.js';
import { bandLinks } from '../js/ui/links.js';
import { makeState } from './helpers.mjs';

test('hash01 is deterministic and in [0, 1)', () => {
  for (let i = 0; i < 50; i += 1) {
    const h = hash01(i % 8, Math.floor(i / 8), i);
    assert.ok(h >= 0 && h < 1);
    assert.equal(hash01(i % 8, Math.floor(i / 8), i), h);
  }
  assert.notEqual(hash01(1, 2, 0), hash01(2, 1, 0));
});

test('groundGrid: each tile gets its ground, and open ground beside water is bank', () => {
  const s = makeState(['.~T', '..S'], []);
  const g = groundGrid(s);
  assert.equal(g[0][0], 'bank', 'right beside the water');
  assert.equal(g[0][1], 'water');
  assert.equal(g[0][2], 'forest');
  assert.equal(g[1][0], 'open', 'diagonal to water is not bank');
  assert.equal(g[1][1], 'bank', 'right below the water');
  assert.equal(g[1][2], 'stones');
});

test('groundGrid: a dam over water also makes a bank, a dam over a hole does not', () => {
  const s = makeState(['...', '...'], []);
  s.tiles[0][1] = { kind: 'dam', variant: null, under: 'water' };
  s.tiles[1][2] = { kind: 'dam', variant: null, under: 'hole' };
  const g = groundGrid(s);
  assert.equal(g[0][1], 'water');
  assert.equal(g[0][0], 'bank');
  assert.equal(g[1][2], 'hole');
  assert.equal(g[1][1], 'bank', 'still beside the water dam');
});

test('softEdges: only the sides whose neighbour is another surface, never the board edge', () => {
  const g = groundGrid(makeState(['..T', '._.', '...'], []));
  assert.deepEqual(softEdges(g, 0, 0), [], 'open among open, board edge on two sides');
  assert.deepEqual(softEdges(g, 1, 0), ['s'], 'a wood to the east is the same grass; the stubble below is not');
  assert.deepEqual(softEdges(g, 2, 0), [], 'the wood stands on grass, among grass');
  assert.deepEqual(softEdges(g, 1, 1), ['n', 'e', 's', 'w'], 'stubble in grass');
  const river = groundGrid(makeState(['.~'], []));
  assert.deepEqual(softEdges(river, 0, 0), ['e'], 'a bank meets the water');
  assert.deepEqual(softEdges(river, 1, 0), ['w']);
});

test('tileBlend: water is shaded at its banks, and the land beside it takes its wet earth', () => {
  const g = groundGrid(makeState(['.~', '..'], []));
  assert.deepEqual(tileBlend(g, 1, 0), {
    shade: ['s', 'w'], spills: [], fades: [],
    cuts: [{ corner: 'sw', fill: 'grass', beach: 'water' }],
  }, 'the water: its one free corner rounded off, grass under the bank\'s earth');
  assert.deepEqual(tileBlend(g, 0, 0), { shade: [], spills: [{ side: 'e', from: 'water' }], fades: [], cuts: [] });
  assert.deepEqual(tileBlend(g, 1, 1), { shade: [], spills: [{ side: 'n', from: 'water' }], fades: [], cuts: [] });
  assert.deepEqual(
    tileBlend(g, 0, 1), { shade: [], spills: [], fades: [{ corner: 'ne', from: 'water' }], cuts: [] },
    'touching the water only by a corner: the fade goes round it',
  );
});

test('tileBlend: inside a bend the land\'s corner is rounded off with water', () => {
  const g = groundGrid(makeState(['~~', '~.'], []));
  assert.deepEqual(tileBlend(g, 1, 1), {
    shade: [],
    spills: [{ side: 'n', from: 'water' }, { side: 'w', from: 'water' }],
    fades: [],
    cuts: [{ corner: 'nw', fill: 'water', beach: null }],
  });
  assert.deepEqual(tileBlend(g, 0, 0), { shade: [], spills: [], fades: [], cuts: [] }, 'water among water and the board edge');
});

test('tileBlend: nothing between tiles on grass, whatever stands on them, and nothing at the board edge', () => {
  const g = groundGrid(makeState(['.T;', 'oHS', ',..'], []));
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      assert.deepEqual(tileBlend(g, x, y), { shade: [], spills: [], fades: [], cuts: [] }, `${x},${y}`);
    }
  }
  const field = groundGrid(makeState(['__', '__'], []));
  assert.deepEqual(tileBlend(field, 0, 0), { shade: [], spills: [], fades: [], cuts: [] });
});

test('tileBlend: a higher surface spills onto a lower one, never the other way', () => {
  const g = groundGrid(makeState(['_#', '..'], []));
  assert.deepEqual(tileBlend(g, 0, 0).spills, [{ side: 'e', from: 'paving' }], 'grit on the stubble');
  assert.deepEqual(tileBlend(g, 1, 0).spills, [], 'no straw on the paving');
  assert.deepEqual(tileBlend(g, 0, 1).spills, [{ side: 'n', from: 'stubble' }]);
  assert.deepEqual(tileBlend(g, 1, 1).spills, [{ side: 'n', from: 'paving' }]);
});

test('showGrid: the grid shows only during move or target selection', () => {
  const base = { selected: null, highlights: [], highlightKind: null, ghost: null };
  assert.equal(showGrid(base), false, 'nothing selected');
  assert.equal(showGrid({ ...base, highlights: [[1, 1]], highlightKind: 'move' }), true);
  assert.equal(showGrid({ ...base, highlights: [[1, 1]], highlightKind: 'target' }), true);
  assert.equal(showGrid({ ...base, highlightKind: 'move', targets: [{ at: [1, 1], badges: [] }] }), true, 'targets only');
  assert.equal(showGrid({ ...base, highlightKind: 'move' }), false, 'a selected band with nowhere to go');
  assert.equal(showGrid({ ...base, highlights: [[1, 1]], highlightKind: 'deploy' }), false, 'deploying is not move selection');
});

test('forestTrees: the same tile always grows the same trees, inside the tile, back to front', () => {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const trees = forestTrees(x, y);
      assert.deepEqual(forestTrees(x, y), trees);
      assert.ok(trees.length >= 2 && trees.length <= 4, `${x},${y} has a few trees`);
      assert.ok(trees[0].kind === 'pine' || trees[0].kind === 'birch', 'the back one is a tree, so forest reads as forest');
      for (const t of trees) {
        assert.ok(TREE_KINDS.includes(t.kind));
        assert.ok(t.x >= 6 && t.x <= TILE - 6, `x ${t.x} inside the tile`);
        assert.ok(t.y >= 10 && t.y <= TILE - 4, `y ${t.y} inside the tile`);
        assert.ok(t.size >= 0.8 && t.size <= 1.2);
        assert.ok(Number.isInteger(t.tone) && t.tone >= 0 && t.tone < 3);
      }
      for (let i = 1; i < trees.length; i += 1) assert.ok(trees[i].y >= trees[i - 1].y, 'sorted by depth');
    }
  }
});

test('forestTrees: a board of forest has pines, birches, bushes and flowering shrubs, and neighbours differ', () => {
  const kinds = new Set();
  let same = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      for (const t of forestTrees(x, y)) kinds.add(t.kind);
      if (x > 0 && JSON.stringify(forestTrees(x, y)) === JSON.stringify(forestTrees(x - 1, y))) same += 1;
    }
  }
  assert.deepEqual([...kinds].sort(), ['birch', 'bush', 'pine', 'shrub']);
  assert.equal(same, 0);
});

test('bandTokens: one token per cell, the links from bandLinks, and a cells/maxLen badge', () => {
  const band = { cells: [[2, 2], [2, 3], [1, 3], [1, 2]], maxLen: 6 };
  const t = bandTokens(band);
  assert.deepEqual(t.head, [2, 2]);
  assert.deepEqual(t.body.map((b) => b.index), [1, 2, 3]);
  assert.deepEqual(t.body.map((b) => b.at), [[2, 3], [1, 3], [1, 2]]);
  assert.deepEqual(t.links, bandLinks(band.cells));
  assert.equal(t.badge, '4/6');
});

test('bandTokens: a lone head has no body and no links; an empty band has no head', () => {
  assert.deepEqual(bandTokens({ cells: [[0, 0]], maxLen: 3 }), { head: [0, 0], body: [], links: [], badge: '1/3' });
  assert.equal(bandTokens({ cells: [], maxLen: 3 }).head, null);
});

test('aimedHabitats: the dens, intact or damaged, that some bot plan strikes', () => {
  const s = makeState(['H.H.......', '..........'], [
    { id: 'ants', type: 'ants', cells: [[9, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1]], plan: { path: [], strike: [2, 0], actionId: 'mow' } },
    { id: 'harvester-1', type: 'harvester', cells: [[5, 1]], plan: { path: [], strike: [5, 0], actionId: 'mow' } },
  ]);
  assert.deepEqual(aimedHabitats(s), ['2,0']);
  s.tiles[0][2] = { kind: 'habitatDamaged', variant: null, under: null };
  assert.deepEqual(aimedHabitats(s), ['2,0'], 'a damaged den still pulses');
  s.bands[1].plan = null;
  assert.deepEqual(aimedHabitats(s), []);
});

test('aimedHabitats: a den with a band on it does not pulse, as the strike hits the band', () => {
  const s = makeState(['H.........', '..........'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]], maxLen: 3 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]], plan: { path: [], strike: [0, 0], actionId: 'mow' } },
  ]);
  assert.deepEqual(aimedHabitats(s), []);
});

test('phaseDelay: a negative delay that keeps an endless animation in phase across redraws', () => {
  assert.equal(phaseDelay(0, 1000, 0), 0);
  assert.equal(phaseDelay(250, 1000, 0), -250);
  assert.equal(phaseDelay(1250, 1000, 100), -350);
  assert.equal(phaseDelay(990, 1000, 20), -10);
  for (const now of [0, 17.5, 999, 123456.7]) {
    const d = phaseDelay(now, 1600, 300);
    assert.ok(d <= 0 && d > -1600 && Number.isInteger(d));
  }
});

test('selectors: how the animation step finds tiles, bands, heads and tokens', () => {
  assert.equal(tileSelector([3, 2]), '[data-tile="3,2"]');
  assert.equal(groundSelector([3, 2]), '[data-tile="3,2"] > [data-ground]');
  assert.equal(featureSelector([3, 2]), '[data-tile="3,2"] > [data-feature]');
  assert.equal(bandSelector('ants'), '[data-band="ants"]');
  assert.equal(tokenSelector('ants', 2), '[data-band="ants"] [data-token="2"]');
  assert.equal(headSelector('ants'), '[data-band="ants"] [data-token="0"]');
});
