// The painted pieces in motion (look-and-motion spec, "Motion"). Pure:
// no DOM, no clock. js/ui/motion.js asks this, for each terrain change,
// which picture the tile gains and how it arrives; the old picture goes
// with the tile's feature group, as the code drawing always did:
//
//   - a mown or sawn tree tips over and fades (the feature), and a stump
//     fades in where the tile gets one;
//   - a dug hole appears by sinking in: it opens from a small dark pit;
//   - a dam drops in with its small bounce;
//   - a struck den shakes and fades as its damaged picture comes in;
//   - a destroyed den crumbles away (the feature), leaving stubble;
//   - anything else fades in as the old feature fades out.
//
// Transform and opacity only. Under reduced motion none of this plays:
// js/ui/anim-steps.js turns every change into one quick fade. When the new
// picture is not listed, nothing here applies and the code drawing's
// effects (the pit, the planks, the crack flicker) play as before.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').Tile} Tile */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('./motion.js').Frame} Frame */
/** @typedef {import('./motion.js').Origin} Origin */
/**
 * A picture arriving on a tile: which piece, and how.
 * @typedef {{piece: string, frames: Frame[], origin: Origin, easing: string}} Arrival
 */

import { tilePiece, tileMode, denKindAt, levelById } from './pieces.js';

/** A dug hole opens from a small dark pit to its full size. */
export const SINK_FRAMES = Object.freeze([
  { transform: 'scale(0.35, 0.2)', opacity: 0 },
  { offset: 0.35, transform: 'scale(0.6, 0.45)', opacity: 1 },
  { offset: 1, transform: 'scale(1, 1)', opacity: 1 },
]);

/** A dam drops in from above, overshoots and settles (as the planks did). */
export const DROP_FRAMES = Object.freeze([
  { transform: 'translate(0px, -14px)', opacity: 0, easing: 'ease-in' },
  { offset: 0.6, transform: 'translate(0px, 2px)', opacity: 1, easing: 'ease-out' },
  { offset: 0.8, transform: 'translate(0px, -2px)', opacity: 1, easing: 'ease-in' },
  { offset: 1, transform: 'translate(0px, 0px)', opacity: 1 },
]);

/** What comes in under a feature that goes: it fades in over the second half. */
export const FADE_IN_FRAMES = Object.freeze([
  { opacity: 0 },
  { offset: 0.5, opacity: 0 },
  { offset: 1, opacity: 1 },
]);

/** A struck den's picture shakes, then fades as its damaged twin comes in. */
export const SHAKE_FRAMES = Object.freeze([
  { transform: 'translate(0px, 0px)', opacity: 1 },
  { offset: 0.12, transform: 'translate(-2.5px, 0px)', opacity: 1 },
  { offset: 0.26, transform: 'translate(2.5px, 0px)', opacity: 1 },
  { offset: 0.4, transform: 'translate(-2px, 0px)', opacity: 1 },
  { offset: 0.54, transform: 'translate(1.5px, 0px)', opacity: 1 },
  { offset: 0.66, transform: 'translate(0px, 0px)', opacity: 1 },
  { offset: 1, transform: 'translate(0px, 0px)', opacity: 0 },
]);

/**
 * @param {readonly Frame[]} frames
 * @returns {Frame[]}
 */
function copyFrames(frames) {
  return frames.map((f) => ({ ...f }));
}

/**
 * The picture a tile shows, or null when it shows none or would be drawn
 * in code.
 * @param {Tile} tile
 * @param {Pos} at
 * @param {BattleState} before  for the level's den kinds
 * @returns {string|null}
 */
function pictureOf(tile, at, before) {
  const want = tilePiece(tile, at[0], at[1], denKindAt(levelById(before.levelId), at));
  return want !== null && tileMode(want) === 'picture' ? want.piece : null;
}

/**
 * The picture a terrain step brings to its tile, and how it arrives; null
 * when the new tile shows no picture (or the same one as before).
 * @param {{kind: string, at: Pos}} step  a sink, drop, topple, spread, crack, crumble or swap step
 * @param {Tile} was  the tile before the step
 * @param {Tile} now  the tile after it
 * @param {BattleState} before  the board the motion plays on
 * @returns {Arrival|null}
 */
export function arrivingPiece(step, was, now, before) {
  const piece = pictureOf(now, step.at, before);
  if (piece === null || piece === pictureOf(was, step.at, before)) return null;
  if (step.kind === 'sink') return { piece, frames: copyFrames(SINK_FRAMES), origin: 'center', easing: 'ease-out' };
  if (step.kind === 'drop') return { piece, frames: copyFrames(DROP_FRAMES), origin: null, easing: 'linear' };
  return { piece, frames: copyFrames(FADE_IN_FRAMES), origin: null, easing: 'ease-in-out' };
}

/**
 * Whether the tile's old look is a painted piece (so it leaves the way a
 * picture does: a tree tips over to the left, where the tiles drawn
 * before it lie under it, rather than under the tile to its right).
 * @param {{at: Pos}} step
 * @param {Tile} was  the tile before the step
 * @param {BattleState} before
 * @returns {boolean}
 */
export function leavesPicture(step, was, before) {
  return pictureOf(was, step.at, before) !== null;
}

/**
 * The keyframes of a struck den's own picture: a shake that ends in a
 * fade, so its damaged picture shows through.
 * @returns {Frame[]}
 */
export function shakeFrames() {
  return copyFrames(SHAKE_FRAMES);
}
