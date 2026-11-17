// Draws the painted pieces on the battle board (js/ui/pieces.js says
// which piece and where). js/ui/board.js calls these; anything whose
// picture is not listed is left to board.js's code drawing, as before.
//
// - A piece is a nested <svg data-piece="name"> holding one <image>: the
//   nested viewBox shows only the object's part of the source square.
//   It goes in its tile's <g data-feature>, so the animation step moves
//   it with the feature, and the tiles are drawn row by row from the
//   top, so a nearer row's tall pieces overlap the farther row.
// - An untouched den keeps its warm glow behind the picture. The pulse
//   on a den a bot plan strikes goes on a layer over every tile
//   (`data-layer="den-marks"`), so no piece ever covers it.
// - A forest or den piece with a band standing on it is dimmed, so the
//   band reads clearly.
// - The permit and the survey stake stand in their objective group.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').Tile} Tile */
/** @typedef {import('../engine/types.js').Objective} Objective */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('../engine/types.js').DenKind} DenKind */
/**
 * What drawing a tile's piece needs to know about the whole board: each
 * den's kind (from the battle's level) and the tiles a band stands on.
 * @typedef {{denKind: (x: number, y: number) => DenKind, occupied: Set<string>}} PieceScene
 */

import { el } from './svg.js';
import { TILE, phaseDelay } from './look.js';
import { INK, HAZARD, DEN_GLOW } from './patterns.js';
import {
  boardPieces, tilePiece, tileMode, pieceRect, objectivePiece, hasPiece, denKindAt, levelById,
  PIECE_LAYOUT, DIM_UNDER_BAND,
} from './pieces.js';

/** The pulse's period, in ms, as board.js and css/game.css have it. */
const PULSE_MS = 1100;

/**
 * @param {BattleState} state
 * @returns {PieceScene}
 */
export function pieceScene(state) {
  const level = levelById(state.levelId);
  /** @type {Set<string>} */
  const occupied = new Set();
  for (const band of state.bands) for (const [x, y] of band.cells) occupied.add(`${x},${y}`);
  return { denKind: (x, y) => denKindAt(level, [x, y]), occupied };
}

/**
 * One piece's picture, standing in tile (x, y).
 * @param {Element} parent
 * @param {string} name
 * @param {number} x
 * @param {number} y
 * @param {Record<string, string|number>} [attrs]
 * @returns {SVGElement}
 */
export function drawPiece(parent, name, x, y, attrs = {}) {
  const r = pieceRect(name, x, y);
  const box = el('svg', {
    x: r.x, y: r.y, width: r.width, height: r.height, viewBox: r.viewBox, preserveAspectRatio: 'none',
    'data-piece': name, ...attrs,
  }, parent);
  el('image', { href: boardPieces()[name], x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none' }, box);
  return box;
}

/**
 * The warm glow behind an untouched den, as the code drawing has it.
 * @param {Element} parent
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
function denGlow(parent, x, y) {
  const g = el('g', { 'data-glow': 'true' }, parent);
  for (const [r, o] of [[19, 0.16], [15, 0.2], [11, 0.24]]) {
    el('circle', { cx: x * TILE + 20, cy: y * TILE + 23, r, fill: DEN_GLOW, opacity: o }, g);
  }
}

/**
 * Draws tile (x, y)'s piece into its feature group `f`. False when the
 * tile is left to the code drawing: it has no piece (water, paving) or
 * its picture is not listed.
 * @param {Element} f
 * @param {Tile} tile
 * @param {number} x
 * @param {number} y
 * @param {PieceScene} scene
 * @returns {boolean}
 */
export function drawTilePiece(f, tile, x, y, scene) {
  const want = tilePiece(tile, x, y, scene.denKind(x, y));
  const mode = tileMode(want);
  if (mode === 'code') return false;
  if (want === null || want.piece === null) return true;
  const group = PIECE_LAYOUT[want.piece].group;
  if (tile.kind === 'habitat') denGlow(f, x, y);
  const dim = (group === 'forest' || group === 'den') && scene.occupied.has(`${x},${y}`);
  drawPiece(f, want.piece, x, y, dim ? { opacity: DIM_UNDER_BAND, 'data-dimmed': 'true' } : {});
  return true;
}

/**
 * The pulsing hazard ring on each den drawn as a picture that a bot plan
 * strikes, on a layer above every tile. (A den drawn in code pulses in
 * its own feature, as before.)
 * @param {Element} svg
 * @param {BattleState} state
 * @param {Set<string>} aimed  "x,y" keys
 * @param {PieceScene} scene
 * @param {number} now
 * @returns {void}
 */
export function drawDenMarks(svg, state, aimed, scene, now) {
  /** @type {Element|null} */
  let layer = null;
  for (const key of aimed) {
    const [x, y] = key.split(',').map(Number);
    const tile = state.tiles[y]?.[x];
    if (tile === undefined || (tile.kind !== 'habitat' && tile.kind !== 'habitatDamaged')) continue;
    if (tileMode(tilePiece(tile, x, y, scene.denKind(x, y))) !== 'picture') continue;
    if (layer === null) layer = el('g', { 'data-layer': 'den-marks', 'pointer-events': 'none' }, svg);
    const ring = el('g', {
      class: 'ug-pulse', style: `animation-delay: ${phaseDelay(now, PULSE_MS, 0)}ms`, 'data-pulse': key,
    }, layer);
    const at = { cx: x * TILE + 20, cy: y * TILE + 22, r: 16.5, fill: 'none' };
    el('circle', { ...at, stroke: INK, 'stroke-width': 4.6, opacity: 0.55 }, ring);
    el('circle', { ...at, stroke: HAZARD, 'stroke-width': 2.6 }, ring);
  }
}

/**
 * Draws an objective's picture into its group `g` (the permit, or the
 * map's stake marker), with a soft shadow at its foot. False when its
 * picture is not listed: the code drawing is used.
 * @param {Element} g
 * @param {Objective} objective
 * @returns {boolean}
 */
export function drawObjectivePiece(g, objective) {
  const name = objectivePiece(objective.kind);
  if (!hasPiece(name)) return false;
  const [x, y] = objective.at;
  const r = pieceRect(name, x, y);
  el('ellipse', {
    cx: x * TILE + TILE / 2, cy: r.y + r.height - 1, rx: 7, ry: 2.2, fill: INK, opacity: 0.3,
  }, g);
  drawPiece(g, name, x, y);
  return true;
}

/**
 * A piece as an effect element for the animation step: a group (a CSS
 * transform on it is free) holding the picture, or null when the
 * picture is not listed.
 * @param {string} name
 * @param {Pos} at
 * @returns {SVGElement|null}
 */
export function pieceFx(name, at) {
  if (!hasPiece(name)) return null;
  const g = el('g', { 'data-fx': 'piece', 'data-fx-piece': name });
  drawPiece(g, name, at[0], at[1]);
  return g;
}
