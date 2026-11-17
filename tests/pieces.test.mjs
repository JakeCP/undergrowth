// Which painted piece each tile of the battle board shows (js/ui/pieces.js):
// picked from the tile and its position, sparse on open ground, the den
// kinds from each level, where a piece stands in its tile, and when the
// code drawing is used instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEN_KINDS, FOREST_PIECES, PIECE_LAYOUT, MAX_RISE, STUMP_SHARE,
  forestPiece, stonesPiece, hasStump, openDetail, denPiece, tilePiece, objectivePiece, tileMode,
  defaultDenKind, denKindAt, levelById, pieceRect, shippedPieces, boardPieces, setBoardPieces, hasPiece,
} from '../js/ui/pieces.js';
import { TILE, forestTrees, hash01 } from '../js/ui/look.js';
import { PIECES } from '../scripts/board-assets.mjs';
import { LEVELS } from '../data/levels/index.js';
import { parseGrid } from '../js/engine/battle.js';

const grass = { kind: 'open', variant: 'grass', under: null };
const flowers = { kind: 'open', variant: 'flowers', under: null };
const mushrooms = { kind: 'open', variant: 'mushrooms', under: null };
const tileOf = (kind, under = null) => ({ kind, variant: null, under });

/** Every position on a 16 by 16 field: more than any level, for shares. */
const FIELD = [];
for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) FIELD.push([x, y]);

test('every piece the board draws has a layout, and the list names the stake marker', () => {
  for (const name of [...PIECES, 'stake']) assert.ok(PIECE_LAYOUT[name] !== undefined, name);
  assert.deepEqual(Object.keys(PIECE_LAYOUT).sort(), [...PIECES, 'stake'].sort());
  assert.equal(shippedPieces().stake, 'assets/map/markers/stake.webp');
});

test('forest: one of the four clumps, by the rule that grows the drawn trees', () => {
  const seen = new Set();
  for (const [x, y] of FIELD) {
    const piece = forestPiece(x, y);
    assert.ok(FOREST_PIECES.includes(piece), piece);
    assert.equal(forestPiece(x, y), piece, 'the same every time');
    const kinds = forestTrees(x, y).slice(0, 3).map((t) => t.kind);
    const pines = kinds.filter((k) => k === 'pine').length;
    const birches = kinds.filter((k) => k === 'birch').length;
    const bushes = kinds.filter((k) => k === 'bush' || k === 'shrub').length;
    const expected = pines >= 2 ? 'forest-pines' : birches >= 2 ? 'forest-birches' : bushes >= 2 ? 'forest-bushes' : 'forest-mixed';
    assert.equal(piece, expected, `${x},${y}: ${kinds}`);
    seen.add(piece);
  }
  assert.equal(seen.size, 4, 'all four kinds grow');
});

test('stones: one of the two heaps, by position', () => {
  const seen = new Set(FIELD.map(([x, y]) => stonesPiece(x, y)));
  assert.deepEqual([...seen].sort(), ['stones-1', 'stones-2']);
  assert.equal(stonesPiece(3, 4), stonesPiece(3, 4));
});

test('stubble: a stump on about one tile in three, only where the drawn stubble had one', () => {
  const stumps = FIELD.filter(([x, y]) => hasStump(x, y));
  const share = stumps.length / FIELD.length;
  assert.ok(share > 0.25 && share < 0.42, `share ${share}`);
  for (const [x, y] of stumps) assert.ok(hash01(x, y, 30) < 0.45);
  assert.equal(STUMP_SHARE, 1 / 3);
  for (const [x, y] of FIELD) {
    assert.deepEqual(tilePiece(tileOf('stubble'), x, y), { piece: hasStump(x, y) ? 'stump' : null, family: 'stump' });
  }
});

test('open ground: flowers show a flower picture, mushrooms the mushrooms, and a fern is rare on grass', () => {
  const flowerPieces = new Set(FIELD.map(([x, y]) => openDetail(flowers, x, y)));
  assert.deepEqual([...flowerPieces].sort(), ['flowers-violet', 'flowers-white']);
  for (const [x, y] of FIELD) assert.equal(openDetail(mushrooms, x, y), 'mushrooms');
  const ferns = FIELD.filter(([x, y]) => openDetail(grass, x, y) === 'fern');
  const others = FIELD.filter(([x, y]) => ![null, 'fern'].includes(openDetail(grass, x, y)));
  assert.equal(others.length, 0, 'plain grass shows a fern or nothing');
  assert.ok(ferns.length > 0, 'a fern now and then');
  assert.ok(ferns.length / FIELD.length <= 0.1, `no more than one grass tile in ten: ${ferns.length}/${FIELD.length}`);
});

test('on every level, at most one open tile in five shows a detail, so the board stays calm', () => {
  for (const level of LEVELS) {
    const { tiles } = parseGrid(level.grid);
    let open = 0;
    let detailed = 0;
    tiles.forEach((row, y) => row.forEach((tile, x) => {
      if (tile.kind !== 'open') return;
      open += 1;
      if (openDetail(tile, x, y) !== null) detailed += 1;
    }));
    assert.ok(detailed / open <= 0.2, `${level.id}: ${detailed} of ${open} open tiles`);
  }
});

test('dens: the kind\'s picture, and its damaged twin once struck', () => {
  for (const kind of DEN_KINDS) {
    assert.equal(denPiece(kind, false), `den-${kind}`);
    assert.equal(denPiece(kind, true), `den-${kind}-damaged`);
    assert.deepEqual(tilePiece(tileOf('habitat'), 2, 3, kind), { piece: `den-${kind}`, family: `den-${kind}` });
    assert.deepEqual(tilePiece(tileOf('habitatDamaged'), 2, 3, kind).piece, `den-${kind}-damaged`);
  }
});

test('holes and dams show their pictures; water and paving have no piece', () => {
  assert.equal(tilePiece(tileOf('hole'), 1, 1).piece, 'hole');
  assert.equal(tilePiece(tileOf('dam', 'water'), 1, 1).piece, 'dam');
  assert.equal(tilePiece(tileOf('dam', 'hole'), 1, 1).piece, 'dam');
  assert.equal(tilePiece(tileOf('water'), 1, 1), null);
  assert.equal(tilePiece(tileOf('paving'), 1, 1), null);
});

test('objectives: the permit picture for a permit, the stake marker for a survey stake', () => {
  assert.equal(objectivePiece('permit'), 'permit');
  assert.equal(objectivePiece('stake'), 'stake');
});

test('a level\'s den kind comes from its data, with per-den overrides, else by position', () => {
  const level = { dens: { kind: 'nest', at: [{ at: [0, 1], kind: 'burrow' }] } };
  assert.equal(denKindAt(level, [7, 0]), 'nest');
  assert.equal(denKindAt(level, [0, 1]), 'burrow');
  assert.equal(denKindAt({}, [3, 4]), defaultDenKind(3, 4));
  assert.equal(denKindAt(undefined, [3, 4]), defaultDenKind(3, 4));
  const kinds = new Set(FIELD.map(([x, y]) => defaultDenKind(x, y)));
  assert.deepEqual([...kinds].sort(), [...DEN_KINDS].sort());
});

test('every level\'s den kinds are valid, overrides sit on its dens, and the story\'s dens are right', () => {
  const used = new Set();
  for (const level of LEVELS) {
    const { tiles } = parseGrid(level.grid);
    const dens = [];
    tiles.forEach((row, y) => row.forEach((tile, x) => {
      if (tile.kind === 'habitat' || tile.kind === 'habitatDamaged') dens.push([x, y]);
    }));
    if (dens.length === 0) {
      assert.equal(level.dens, undefined, `${level.id} has no den to name`);
      continue;
    }
    assert.ok(level.dens !== undefined, `${level.id} names its dens' kind`);
    assert.ok(DEN_KINDS.includes(level.dens.kind), `${level.id}: ${level.dens.kind}`);
    for (const one of level.dens.at ?? []) {
      assert.ok(DEN_KINDS.includes(one.kind), `${level.id}: ${one.kind}`);
      assert.ok(dens.some((d) => d[0] === one.at[0] && d[1] === one.at[1]), `${level.id}: no den at ${one.at}`);
    }
    for (const at of dens) used.add(denKindAt(level, at));
  }
  assert.equal(denKindAt(levelById('o02'), [5, 4]), 'anthill', "o02's den is the ants' hill");
  assert.equal(denKindAt(levelById('l01'), [6, 7]), 'burrow', "l01's den is the badgers' burrow");
  assert.deepEqual([...used].sort(), [...DEN_KINDS].sort(), 'all four kinds appear somewhere');
});

test('a piece stands on the bottom of its tile, centred, inside it, rising at most a fifth of a tile', () => {
  for (const name of Object.keys(PIECE_LAYOUT)) {
    for (const [x, y] of [[0, 0], [3, 1], [7, 7], [5, 4]]) {
      const r = pieceRect(name, x, y);
      const layout = PIECE_LAYOUT[name];
      assert.ok(Math.abs(r.y + r.height - ((y + 1) * TILE - layout.foot)) < 0.02, `${name} stands on its foot`);
      assert.ok(r.x >= x * TILE - 0.01 && r.x + r.width <= (x + 1) * TILE + 0.01, `${name} at ${x},${y} is inside its tile`);
      assert.ok(r.y >= y * TILE - MAX_RISE - 0.01, `${name} at ${x},${y} rises at most ${MAX_RISE}`);
      if (y === 0) assert.ok(r.y >= -0.01, `${name} in the top row stays on the board`);
      if (layout.jitter === undefined) {
        assert.ok(Math.abs(r.x + r.width / 2 - (x + 0.5) * TILE) < 0.02, `${name} is centred`);
      }
      const [bx0, by0, bx1, by1] = layout.box;
      assert.ok(Math.abs(r.width / r.height - (bx1 - bx0) / (by1 - by0)) < 0.02, `${name} keeps its shape`);
    }
  }
  assert.equal(MAX_RISE, TILE / 5);
  const tree = pieceRect('forest-pines', 3, 3);
  assert.ok(tree.y < 3 * TILE, 'a tree rises above its tile');
});

test('the code drawing is used for anything whose picture is not listed', () => {
  const full = { ...shippedPieces() };
  const none = {};
  const forest = tilePiece(tileOf('forest'), 2, 2);
  assert.equal(tileMode(forest, full), 'picture');
  assert.equal(tileMode(forest, none), 'code');
  const { [forest.piece]: _gone, ...withoutThisClump } = full;
  assert.equal(tileMode(forest, withoutThisClump), 'code', 'only the missing piece falls back');
  const bare = FIELD.find(([x, y]) => openDetail(grass, x, y) === null);
  assert.equal(tileMode(tilePiece(grass, bare[0], bare[1]), full), 'bare', 'bare grass draws nothing once the fern exists');
  assert.equal(tileMode(tilePiece(grass, bare[0], bare[1]), none), 'code', 'and its tufts without it');
  assert.equal(tileMode(tilePiece(tileOf('water'), 0, 0), full), 'code');
});

test('the list of pictures can be swapped for tests and put back', (t) => {
  t.after(() => setBoardPieces());
  assert.equal(hasPiece('hole'), true);
  setBoardPieces({});
  assert.deepEqual(boardPieces(), {});
  assert.equal(hasPiece('hole'), false);
  setBoardPieces();
  assert.deepEqual(boardPieces(), shippedPieces());
});
