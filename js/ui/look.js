// The pure half of the board's look (look-and-motion spec, "Look"). No
// DOM: board.js draws from these.
//
// - which ground each tile is filled with, and where two grounds meet
//   (those sides get a soft inner shadow instead of a hard grid line);
// - when the faint grid shows (only during move or target selection);
// - the forest variety, picked from the tile position;
// - a band's tokens: one per cell, linked by the link rule in links.js,
//   with a `cells/maxLen` badge on the head;
// - the dens a bot plan strikes, which pulse;
// - the selectors the animation step uses to find what it moves.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('./patterns.js').GroundKey} GroundKey */
/** @typedef {import('./links.js').Link} Link */
/** @typedef {'n'|'e'|'s'|'w'} Side */
/** @typedef {'pine'|'birch'|'bush'|'shrub'} TreeKind */
/**
 * One tree or bush on a forest tile, in tile-local board units: `x` is
 * the centre of its foot and `y` the ground it stands on. `size` scales
 * it and `tone` (0, 1 or 2) picks one of three shades.
 * @typedef {{kind: TreeKind, x: number, y: number, size: number, tone: number}} Tree
 */

import { groundKey } from './patterns.js';
import { bandLinks } from './links.js';
import { inBounds } from '../engine/grid.js';
import { struckHabitats } from './plans.js';

/** A tile is 40 board units wide. */
export const TILE = 40;

/** @type {readonly TreeKind[]} */
export const TREE_KINDS = Object.freeze(['pine', 'birch', 'bush', 'shrub']);

/**
 * Deterministic hash of a tile position and an element index, in [0, 1).
 * @param {number} x
 * @param {number} y
 * @param {number} i
 * @returns {number}
 */
export function hash01(x, y, i) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(i + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {number} v
 * @returns {number}
 */
function round1(v) {
  return Math.round(v * 10) / 10;
}

/** @type {ReadonlyArray<[Side, number, number]>} */
const SIDES = Object.freeze([['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]]);

/**
 * @param {{kind: string, under?: string|null}} tile
 * @returns {boolean}
 */
function isWet(tile) {
  return tile.kind === 'water' || (tile.kind === 'dam' && tile.under === 'water');
}

/**
 * The ground of every tile, row by row. Open ground right beside water
 * (or a dam over water) is riverbank.
 * @param {BattleState} state
 * @returns {GroundKey[][]}
 */
export function groundGrid(state) {
  return state.tiles.map((row, y) => row.map((tile, x) => {
    const nearWater = tile.kind === 'open' && SIDES.some(([, dx, dy]) => {
      const p = /** @type {Pos} */ ([x + dx, y + dy]);
      return inBounds(state, p) && isWet(state.tiles[p[1]][p[0]]);
    });
    return groundKey(tile, nearWater);
  }));
}

/**
 * The sides of a tile, in n, e, s, w order, whose neighbour is on another
 * ground. Those sides get a soft inner shadow, so grounds blend instead
 * of meeting at a hard line. Same-ground tiles join without a seam, and
 * the board edge gets nothing.
 * @param {GroundKey[][]} grounds
 * @param {number} x
 * @param {number} y
 * @returns {Side[]}
 */
export function softEdges(grounds, x, y) {
  const mine = grounds[y][x];
  /** @type {Side[]} */
  const out = [];
  for (const [side, dx, dy] of SIDES) {
    const row = grounds[y + dy];
    const other = row === undefined ? undefined : row[x + dx];
    if (other !== undefined && other !== mine) out.push(side);
  }
  return out;
}

/**
 * Whether to show the faint grid: only while the player is choosing a
 * tile to move to or a target to act on.
 * @param {{highlights: Pos[], highlightKind: 'move'|'target'|'deploy'|null, targets?: unknown[]}} view
 * @returns {boolean}
 */
export function showGrid(view) {
  if (view.highlightKind === 'deploy') return false;
  const targets = view.targets !== undefined ? view.targets.length : 0;
  return view.highlights.length > 0 || targets > 0;
}

/** Where a forest tile's trees stand before jitter: back, right, front. */
/** @type {ReadonlyArray<[number, number]>} */
const TREE_SLOTS = Object.freeze([[13, 19], [28, 22], [19, 33]]);

/**
 * The trees on a forest tile, back to front. The back one is always a
 * pine or a birch, so forest reads as forest; the others may be bushes or
 * flowering shrubs. Some tiles grow a fourth, small bush. Picked from the
 * tile position, so the same tile always looks the same.
 * @param {number} x
 * @param {number} y
 * @returns {Tree[]}
 */
export function forestTrees(x, y) {
  /** @type {Tree[]} */
  const trees = [];
  const count = hash01(x, y, 40) < 0.35 ? 4 : 3;
  for (let i = 0; i < count; i += 1) {
    const [sx, sy] = i < TREE_SLOTS.length ? TREE_SLOTS[i] : [31, 35];
    const pick = hash01(x, y, 41 + i);
    /** @type {TreeKind} */
    let kind;
    if (i === 0) kind = pick < 0.6 ? 'pine' : 'birch';
    else if (i === 3) kind = pick < 0.5 ? 'bush' : 'shrub';
    else kind = TREE_KINDS[Math.floor(pick * TREE_KINDS.length)];
    trees.push({
      kind,
      x: round1(sx + (hash01(x, y, 50 + i) - 0.5) * 6),
      y: round1(Math.min(sy + (hash01(x, y, 60 + i) - 0.5) * 4, 36)),
      size: round1(0.85 + hash01(x, y, 70 + i) * 0.3),
      tone: Math.floor(hash01(x, y, 80 + i) * 3),
    });
  }
  return trees.sort((a, b) => a.y - b.y);
}

/**
 * Which of a tile's code-drawn marks the board draws over its ground. A
 * mark that only repeats what the painted texture already shows is left
 * out when the texture is there (Jake: the slab lines over the painted
 * paving doubled up), and drawn only over the plain code-made fallback:
 *   grass   the grass tufts on open ground (grass, meadow and bank paint
 *           their own blades);
 *   pebbles the pebbles on the riverbank (bank paints its own);
 *   slabs   the slab joints on paving;
 *   stalks  the cut stalks on stubble.
 * Everything that says something about play or the tile's own kind
 * stays: flowers and mushrooms, the hay bale, the water's ripples, the
 * pit of a hole, the stones, the dam's planks, the trees and the dens.
 * @param {GroundKey} ground
 * @param {boolean} textured  the ground is filled with its painted texture
 * @returns {{grass: boolean, pebbles: boolean, slabs: boolean, stalks: boolean}}
 */
export function tileMarks(ground, textured) {
  const plain = !textured;
  return {
    grass: plain && (ground === 'open' || ground === 'meadow' || ground === 'bank'),
    pebbles: plain && ground === 'bank',
    slabs: plain && ground === 'paving',
    stalks: plain && ground === 'stubble',
  };
}

/**
 * A band as tokens: the head, one body token per further cell (with its
 * cell index), the links between them, and the length badge text.
 * @param {{cells: Pos[], maxLen: number}} band
 * @returns {{head: Pos|null, body: Array<{index: number, at: Pos}>, links: Link[], badge: string}}
 */
export function bandTokens(band) {
  const cells = band.cells;
  return {
    head: cells.length > 0 ? cells[0] : null,
    body: cells.slice(1).map((at, i) => ({ index: i + 1, at })),
    links: bandLinks(cells),
    badge: `${cells.length}/${band.maxLen}`,
  };
}

/**
 * The dens, intact or damaged, that some bot's plan will strike, as "x,y"
 * keys in level order of the bots. These pulse. A den with a band on it
 * is shielded and does not pulse (struckHabitats in plans.js).
 * @param {BattleState} state
 * @returns {string[]}
 */
export function aimedHabitats(state) {
  return struckHabitats(state);
}

/**
 * The animation-delay (in ms, zero or negative) that starts an endless
 * animation of `period` ms part-way through, so it stays in step with the
 * clock (`now`, in ms) and does not jump back to its start each time the
 * board is redrawn. `offset` staggers elements against each other.
 * @param {number} now
 * @param {number} period
 * @param {number} offset
 * @returns {number}
 */
export function phaseDelay(now, period, offset) {
  const phase = (((now + offset) % period) + period) % period;
  const d = -Math.round(phase);
  return d === 0 ? 0 : d <= -period ? 0 : d;
}

// --- hooks for the animation step ---
//
// Every tile is a <g data-tile="x,y"> holding its ground ([data-ground])
// and its feature ([data-feature]). Every band is a <g data-band="id">
// holding one [data-token="i"] per cell, the head being token 0. None of
// these carry a transform attribute, so a CSS transform on them is free
// for animation and moves them from where they are drawn.

/**
 * @param {Pos} at
 * @returns {string}
 */
export function tileSelector(at) {
  return `[data-tile="${at[0]},${at[1]}"]`;
}

/**
 * @param {Pos} at
 * @returns {string}
 */
export function groundSelector(at) {
  return `${tileSelector(at)} > [data-ground]`;
}

/**
 * @param {Pos} at
 * @returns {string}
 */
export function featureSelector(at) {
  return `${tileSelector(at)} > [data-feature]`;
}

/**
 * @param {string} bandId
 * @returns {string}
 */
export function bandSelector(bandId) {
  return `[data-band="${bandId}"]`;
}

/**
 * @param {string} bandId
 * @param {number} index  the cell index, 0 for the head
 * @returns {string}
 */
export function tokenSelector(bandId, index) {
  return `${bandSelector(bandId)} [data-token="${index}"]`;
}

/**
 * @param {string} bandId
 * @returns {string}
 */
export function headSelector(bandId) {
  return tokenSelector(bandId, 0);
}
