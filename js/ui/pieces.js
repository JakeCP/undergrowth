// The painted pieces on the battle board (trees, rocks, dens, holes,
// dams, stumps, small details and the objectives). Pure: no DOM.
// js/ui/board-pieces.js draws from these.
//
// - which piece a tile shows, picked from the tile and its position, so
//   the same tile always looks the same;
// - what kind of den each den is, from the level (`Level.dens`) or else
//   by position;
// - where each piece stands in its tile: on the bottom, centred, a tall
//   one rising at most a fifth of a tile above it (and never above the
//   board's top edge);
// - which pictures exist: the generated list in js/ui/board-assets.js
//   plus the map's stake marker. A thing whose picture is not listed is
//   drawn in code, as before. Tests swap the list with setBoardPieces.
//
// Keep it sparse: a calm, readable board is a design rule of this game.
// Plain grass is mostly bare, and only about a third of stubble shows a
// stump.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').Tile} Tile */
/** @typedef {import('../engine/types.js').Level} Level */
/** @typedef {import('../engine/types.js').DenKind} DenKind */
/** @typedef {import('../engine/types.js').Objective} Objective */
/**
 * What part of the board a piece is: tall things a band can stand in
 * (forest, den), a rock, a flat thing (hole, dam, stump), a small detail
 * on open ground, or an objective.
 * @typedef {'forest'|'den'|'stones'|'flat'|'detail'|'objective'} PieceGroup
 */
/**
 * Where a piece's picture sits in its source square and how big it is
 * drawn. `box` is the part of the source picture that is the object
 * (x0, y0, x1, y1, as fractions of the square): only that part is drawn,
 * so a stray speck outside it never shows. The object is scaled to fit
 * `w` by `h` board units, and stands `foot` units above the tile's
 * bottom edge. A detail is nudged sideways by up to `jitter` units, by
 * position.
 * @typedef {{group: PieceGroup, box: [number, number, number, number], w: number, h: number, foot: number, jitter?: number}} PieceLayout
 */
/**
 * What a tile shows: `piece`, the picture (null for none: bare ground),
 * and `family`, the picture whose presence in the list says the tile is
 * drawn from pictures at all. When the family is not listed, the tile's
 * code drawing is used, exactly as before.
 * @typedef {{piece: string|null, family: string}} TilePiece
 */
/** @typedef {{x: number, y: number, width: number, height: number, viewBox: string}} PieceRect */

import { TILE, hash01, forestTrees } from './look.js';
import { BOARD_ASSETS } from './board-assets.js';
import { MAP_ASSETS } from './map-assets.js';
import { LEVELS } from '../../data/levels/index.js';

/** @type {readonly DenKind[]} */
export const DEN_KINDS = Object.freeze(['burrow', 'anthill', 'nest', 'hive']);

/** @type {readonly string[]} */
export const FOREST_PIECES = Object.freeze(['forest-pines', 'forest-birches', 'forest-bushes', 'forest-mixed']);

/** About one stubble tile in three shows a stump. */
export const STUMP_SHARE = 1 / 3;
/**
 * A fern grows only on one tile in seven, spread out on a lattice (no two
 * in a row are side by side), and on three in five of those: about
 * one plain grass tile in twelve. Rare, by design.
 */
export const FERN_SHARE = 0.6;
/** A tall piece rises at most this far above its tile (a fifth of a tile). */
export const MAX_RISE = TILE / 5;
/** The opacity of a forest or den piece with a band standing on it. */
export const DIM_UNDER_BAND = 0.5;

const DETAIL_BOX = /** @type {[number, number, number, number]} */ ([0.33, 0.33, 0.67, 0.67]);

/** @type {Readonly<Record<string, PieceLayout>>} */
export const PIECE_LAYOUT = Object.freeze({
  'forest-pines': { group: 'forest', box: [0.08, 0.06, 0.92, 1], w: 38, h: 46, foot: 1 },
  'forest-birches': { group: 'forest', box: [0.1, 0.06, 0.9, 1], w: 36, h: 46, foot: 1 },
  'forest-bushes': { group: 'forest', box: [0.03, 0.13, 0.97, 1], w: 39, h: 46, foot: 1 },
  'forest-mixed': { group: 'forest', box: [0.06, 0.06, 0.94, 1], w: 38, h: 46, foot: 1 },
  'stones-1': { group: 'stones', box: [0.03, 0.34, 0.97, 1], w: 36, h: 32, foot: 2 },
  'stones-2': { group: 'stones', box: [0.05, 0.23, 0.95, 1], w: 34, h: 32, foot: 2 },
  'den-burrow': { group: 'den', box: [0.03, 0.48, 0.97, 1], w: 36, h: 34, foot: 3 },
  'den-burrow-damaged': { group: 'den', box: [0.03, 0.48, 0.97, 1], w: 36, h: 34, foot: 3 },
  'den-anthill': { group: 'den', box: [0.03, 0.18, 0.97, 1], w: 34, h: 32, foot: 3 },
  'den-anthill-damaged': { group: 'den', box: [0.03, 0.18, 0.97, 1], w: 34, h: 32, foot: 3 },
  'den-nest': { group: 'den', box: [0.09, 0.22, 0.91, 1], w: 34, h: 34, foot: 3 },
  'den-nest-damaged': { group: 'den', box: [0.09, 0.22, 0.91, 1], w: 34, h: 34, foot: 3 },
  'den-hive': { group: 'den', box: [0.24, 0.06, 0.76, 1], w: 30, h: 42, foot: 2 },
  'den-hive-damaged': { group: 'den', box: [0.24, 0.06, 0.76, 1], w: 30, h: 42, foot: 2 },
  hole: { group: 'flat', box: [0.04, 0.42, 0.96, 1], w: 36, h: 30, foot: 4 },
  dam: { group: 'flat', box: [0.04, 0.58, 0.96, 1], w: 40, h: 30, foot: 11 },
  stump: { group: 'flat', box: [0.09, 0.47, 0.91, 1], w: 15, h: 14, foot: 5, jitter: 7 },
  'flowers-white': { group: 'detail', box: DETAIL_BOX, w: 13, h: 13, foot: 4, jitter: 8 },
  'flowers-violet': { group: 'detail', box: DETAIL_BOX, w: 13, h: 13, foot: 4, jitter: 8 },
  mushrooms: { group: 'detail', box: DETAIL_BOX, w: 12, h: 12, foot: 4, jitter: 8 },
  fern: { group: 'detail', box: DETAIL_BOX, w: 13, h: 13, foot: 4, jitter: 8 },
  permit: { group: 'objective', box: [0.34, 0.06, 0.66, 1], w: 14, h: 42, foot: 2 },
  stake: { group: 'objective', box: [0.25, 0.11, 0.74, 0.9], w: 26, h: 30, foot: 3 },
});

// --- the list of pictures that exist ---

/**
 * The shipped pictures: every board piece, and the map's stake marker
 * for the survey stake.
 * @returns {Record<string, string>}
 */
export function shippedPieces() {
  /** @type {Record<string, string>} */
  const out = { ...BOARD_ASSETS };
  const stake = /** @type {Record<string, string>} */ (MAP_ASSETS.markers).stake;
  if (stake !== undefined) out.stake = stake;
  return out;
}

/** @type {Record<string, string>} */
let pieces = shippedPieces();

/**
 * The pictures the board draws from now: piece name -> URL.
 * @returns {Readonly<Record<string, string>>}
 */
export function boardPieces() {
  return pieces;
}

/**
 * Swaps the list of pictures (for tests: `{}` draws everything in code).
 * With no argument it goes back to the shipped list.
 * @param {Record<string, string>} [list]
 * @returns {void}
 */
export function setBoardPieces(list) {
  pieces = list === undefined ? shippedPieces() : { ...list };
}

/**
 * @param {string} name
 * @param {Readonly<Record<string, string>>} [list]
 * @returns {boolean}
 */
export function hasPiece(name, list = pieces) {
  return Object.hasOwn(list, name);
}

// --- which piece a tile shows ---

/**
 * A forest tile's clump, by the same rule that grows its drawn trees
 * (forestTrees in js/ui/look.js): the kind most of its three standing
 * trees are, and a mixed clump when no kind has two.
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function forestPiece(x, y) {
  const kinds = forestTrees(x, y).slice(0, 3).map((t) => t.kind);
  const count = (/** @type {(k: string) => boolean} */ test) => kinds.filter(test).length;
  if (count((k) => k === 'pine') >= 2) return 'forest-pines';
  if (count((k) => k === 'birch') >= 2) return 'forest-birches';
  if (count((k) => k === 'bush' || k === 'shrub') >= 2) return 'forest-bushes';
  return 'forest-mixed';
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function stonesPiece(x, y) {
  return hash01(x, y, 91) < 0.5 ? 'stones-1' : 'stones-2';
}

/**
 * Whether a stubble tile shows a stump: about one in three, among the
 * tiles the code drawing gave a stump (the same hash, a lower bar).
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function hasStump(x, y) {
  return hash01(x, y, 30) < STUMP_SHARE;
}

/**
 * The small detail on open ground: one of the two flowers on a flowers
 * tile, the mushrooms on a mushrooms tile, and on plain grass now and
 * then a fern. Null for bare grass.
 * @param {Tile} tile
 * @param {number} x
 * @param {number} y
 * @returns {string|null}
 */
export function openDetail(tile, x, y) {
  if (tile.variant === 'flowers') return hash01(x, y, 6) < 0.5 ? 'flowers-white' : 'flowers-violet';
  if (tile.variant === 'mushrooms') return 'mushrooms';
  const onLattice = (2 * x + 5 * y) % 7 === 3;
  return onLattice && hash01(x, y, 92) < FERN_SHARE ? 'fern' : null;
}

/**
 * @param {DenKind} kind
 * @param {boolean} damaged
 * @returns {string}
 */
export function denPiece(kind, damaged) {
  return damaged ? `den-${kind}-damaged` : `den-${kind}`;
}

/**
 * What a tile shows, or null for a tile that has no piece at all (water
 * and paving keep their own drawing).
 * @param {Tile} tile
 * @param {number} x
 * @param {number} y
 * @param {DenKind} [denKind] what kind the den on this tile is
 * @returns {TilePiece|null}
 */
export function tilePiece(tile, x, y, denKind = defaultDenKind(x, y)) {
  switch (tile.kind) {
    case 'open': {
      const piece = openDetail(tile, x, y);
      // Bare grass draws nothing once the fern exists.
      return { piece, family: piece ?? 'fern' };
    }
    case 'forest': {
      const piece = forestPiece(x, y);
      return { piece, family: piece };
    }
    case 'stones': {
      const piece = stonesPiece(x, y);
      return { piece, family: piece };
    }
    case 'habitat':
    case 'habitatDamaged': {
      const piece = denPiece(denKind, tile.kind === 'habitatDamaged');
      return { piece, family: piece };
    }
    case 'hole':
      return { piece: 'hole', family: 'hole' };
    case 'dam':
      return { piece: 'dam', family: 'dam' };
    case 'stubble':
      return { piece: hasStump(x, y) ? 'stump' : null, family: 'stump' };
    default:
      return null;
  }
}

/**
 * The picture an objective shows.
 * @param {Objective['kind']} kind
 * @returns {string}
 */
export function objectivePiece(kind) {
  return kind === 'permit' ? 'permit' : 'stake';
}

/**
 * How a tile is drawn with this list of pictures: 'picture' (its piece),
 * 'bare' (nothing: the family exists but this tile shows no piece), or
 * 'code' (the code drawing, as before).
 * @param {TilePiece|null} want
 * @param {Readonly<Record<string, string>>} [list]
 * @returns {'picture'|'bare'|'code'}
 */
export function tileMode(want, list = pieces) {
  if (want === null) return 'code';
  if (want.piece === null) return hasPiece(want.family, list) ? 'bare' : 'code';
  return hasPiece(want.piece, list) ? 'picture' : 'code';
}

// --- den kinds ---

/**
 * A den's kind when its level says nothing: picked by position.
 * @param {number} x
 * @param {number} y
 * @returns {DenKind}
 */
export function defaultDenKind(x, y) {
  return DEN_KINDS[Math.floor(hash01(x, y, 93) * DEN_KINDS.length)];
}

/**
 * The kind of the den on tile `at` of `level`: the level's override for
 * that tile, else the level's kind, else by position.
 * @param {Pick<Level, 'dens'>|undefined} level
 * @param {Pos} at
 * @returns {DenKind}
 */
export function denKindAt(level, at) {
  const dens = level?.dens;
  if (dens === undefined) return defaultDenKind(at[0], at[1]);
  const one = (dens.at ?? []).find((d) => d.at[0] === at[0] && d.at[1] === at[1]);
  return one !== undefined ? one.kind : dens.kind;
}

/**
 * The level a battle is on, if it is one of the campaign's.
 * @param {string} levelId
 * @returns {Level|undefined}
 */
export function levelById(levelId) {
  return LEVELS.find((level) => level.id === levelId);
}

// --- where a piece stands ---

/**
 * @param {number} v
 * @returns {number}
 */
function r2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Where piece `name` is drawn on tile (x, y), in board units: a box
 * whose viewBox (in fractions of the source square) shows only the
 * object. It stands `foot` above the tile's bottom edge, centred (a
 * detail nudged sideways by position), never wider than its tile, never
 * more than MAX_RISE above it, and in the top row never above the board.
 * @param {string} name
 * @param {number} x
 * @param {number} y
 * @returns {PieceRect}
 */
export function pieceRect(name, x, y) {
  const layout = PIECE_LAYOUT[name];
  const [x0, y0, x1, y1] = layout.box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const bottom = (y + 1) * TILE - layout.foot;
  const top = y === 0 ? 0 : y * TILE - MAX_RISE;
  const scale = Math.min(layout.w / bw, layout.h / bh, TILE / bw, (bottom - top) / bh);
  const width = bw * scale;
  const height = bh * scale;
  const room = (TILE - width) / 2;
  const nudge = layout.jitter === undefined ? 0 : (hash01(x, y, 94) * 2 - 1) * Math.min(layout.jitter, room);
  return {
    x: r2(x * TILE + room + nudge),
    y: r2(bottom - height),
    width: r2(width),
    height: r2(height),
    viewBox: `${x0} ${y0} ${r2(bw)} ${r2(bh)}`,
  };
}
