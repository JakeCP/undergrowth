// The end of a battle (look-and-motion spec, "Motion"). Pure: no DOM, no
// clock. The view plays these on the board once the last move has settled.
//
// - Victory: the bands hop, the cleared tiles (stubble) regrow to grass in
//   a wave out from where the battle was won, and the seed reward counts
//   up. The board then shows the regrown picture (`regrown`); the battle
//   state itself is never changed.
// - Defeat: the board dims and shows what was lost: the den, where each
//   band fell, or (out of turns) only the words.
//
// Either way the kit's ribbon unfurls across the board with the word on
// it (green for a win, rust for a loss), and the result screen after it
// unfurls the same ribbon over its painted scene.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').Tile} Tile */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('../engine/types.js').LostReason} LostReason */
/** @typedef {import('./motion.js').Track} Track */
/** @typedef {import('./motion.js').Motion} Motion */

/**
 * @typedef {{band: string, start: number, duration: number}} HopStep
 * @typedef {{at: Pos, start: number, duration: number}} RegrowStep
 * @typedef {{start: number, duration: number}} Span
 * @typedef {{ribbon: Span, hops: HopStep[], regrow: RegrowStep[], count: Span, end: number}} VictorySteps
 * @typedef {{reason: LostReason|null, text: string, lost: Pos[]}} DefeatSummary
 * @typedef {{dim: Span, marks: Array<{at: Pos, start: number}>, banner: Span, words: {start: number}}} DefeatSteps
 * @typedef {{tone: 'green'|'rust', word: string}} Ribbon
 */

import { FADE_MS } from './anim-steps.js';
import { groundGrid } from './look.js';
import { isHabitat } from '../engine/terrain.js';
import { defeatText } from './text.js';

/** One band's hop: two little jumps. */
export const HOP_MS = 520;
/** The gap between one band's hop and the next. */
export const HOP_STAGGER_MS = 90;
/** When the first tile regrows. */
export const REGROW_LEAD_MS = 200;
/** One tile's regrowth. */
export const REGROW_MS = 360;
/** The wave moves one tile further out every this many ms ... */
export const WAVE_STEP_MS = 70;
/** ... but crosses the whole board in at most this long. */
export const WAVE_SPAN_MS = 700;
/** The ribbon unfurling from its middle out to its ends. */
export const RIBBON_MS = 440;
/** The word comes onto the ribbon this far into the unfurl. */
export const RIBBON_WORD_AT = 0.55;
/** When the seed count starts (once the ribbon is open), and how long it takes. */
export const COUNT_LEAD_MS = RIBBON_MS;
export const COUNT_MS = 900;
/** The defeat: how long the dim takes, and when the marks and the ribbon come. */
export const DIM_MS = 500;
export const MARK_LEAD_MS = 300;
export const BANNER_LEAD_MS = 400;

/**
 * Which ribbon ends a battle, and the word on it: green for a win, rust
 * for a loss. `exclaim` is the board's shout ("Victory!"); the result
 * screen names it plainly.
 * @param {'won'|'lost'|null} outcome
 * @param {{exclaim?: boolean}} [options]
 * @returns {Ribbon}
 */
export function ribbonFor(outcome, options = {}) {
  const bang = options.exclaim === true ? '!' : '';
  return outcome === 'won' ? { tone: 'green', word: `Victory${bang}` } : { tone: 'rust', word: 'Defeat' };
}

/**
 * The ribbon's unfurl: it opens sideways from a sliver at its middle,
 * runs a touch past its length and settles. Transform and opacity only.
 * @returns {Keyframe[]}
 */
export function unfurlFrames() {
  return [
    { offset: 0, transform: 'scaleX(0.06)', opacity: 0 },
    { offset: 0.2, opacity: 1 },
    { offset: 0.72, transform: 'scaleX(1.035)' },
    { offset: 1, transform: 'scaleX(1)', opacity: 1 },
  ];
}

/**
 * The word arriving on the opened ribbon: a fade and a small rise.
 * @returns {Keyframe[]}
 */
export function wordFrames() {
  return [
    { transform: 'translate(0px, 5px)', opacity: 0 },
    { transform: 'translate(0px, 0px)', opacity: 1 },
  ];
}

/**
 * @param {Pos} p
 * @returns {Pos}
 */
function copy(p) {
  return [p[0], p[1]];
}

/**
 * Where the victory wave starts: the objective captured last, or the
 * head of the first band of ours, or the middle of the board.
 * @param {BattleState} state
 * @returns {Pos}
 */
export function waveOrigin(state) {
  for (let i = state.events.length - 1; i >= 0; i -= 1) {
    const event = state.events[i];
    if (event.kind === 'capture') return copy(event.at);
  }
  const band = state.bands.find((b) => b.side === 'us' && b.cells.length > 0);
  if (band !== undefined) return copy(band.cells[0]);
  return [(state.width - 1) / 2, (state.height - 1) / 2];
}

/**
 * The victory, step by step.
 * @param {BattleState} state  the won battle
 * @param {{reducedMotion?: boolean}} [options]
 * @returns {VictorySteps}
 */
export function victorySteps(state, options = {}) {
  const reduced = options.reducedMotion === true;
  const origin = waveOrigin(state);
  /** @type {Array<{at: Pos, dist: number}>} */
  const tiles = [];
  state.tiles.forEach((row, y) => row.forEach((tile, x) => {
    if (tile.kind !== 'stubble') return;
    tiles.push({ at: [x, y], dist: Math.abs(x - origin[0]) + Math.abs(y - origin[1]) });
  }));
  tiles.sort((a, b) => a.dist - b.dist || a.at[1] - b.at[1] || a.at[0] - b.at[0]);

  if (reduced) {
    const regrow = tiles.map((t) => ({ at: t.at, start: 0, duration: FADE_MS }));
    return {
      ribbon: { start: 0, duration: 0 }, hops: [], regrow, count: { start: 0, duration: 0 }, end: regrow.length > 0 ? FADE_MS : 0,
    };
  }

  const hops = state.bands
    .filter((b) => b.side === 'us' && !b.trapped && b.cells.length > 0)
    .map((b, i) => ({ band: b.id, start: i * HOP_STAGGER_MS, duration: HOP_MS }));
  const near = tiles.length > 0 ? tiles[0].dist : 0;
  const far = tiles.length > 0 ? tiles[tiles.length - 1].dist : 0;
  const step = far > near ? Math.min(WAVE_STEP_MS, WAVE_SPAN_MS / (far - near)) : 0;
  const regrow = tiles.map((t) => ({
    at: t.at, start: Math.round(REGROW_LEAD_MS + (t.dist - near) * step), duration: REGROW_MS,
  }));
  const ribbon = { start: 0, duration: RIBBON_MS };
  const count = { start: COUNT_LEAD_MS, duration: COUNT_MS };
  let end = Math.max(ribbon.start + ribbon.duration, count.start + count.duration);
  for (const h of hops) end = Math.max(end, h.start + h.duration);
  for (const r of regrow) end = Math.max(end, r.start + r.duration);
  return { ribbon, hops, regrow, count, end };
}

/**
 * The board as it is drawn after a victory: every cleared tile (stubble)
 * grown back to grass. A new state for the picture only.
 * @param {BattleState} state
 * @returns {BattleState}
 */
export function regrown(state) {
  return {
    ...state,
    tiles: state.tiles.map((row) => row.map((tile) => (
      tile.kind === 'stubble' ? /** @type {Tile} */ ({ kind: 'open', variant: 'grass', under: null }) : tile
    ))),
  };
}

/**
 * The tracks of a victory, played on the board drawn from the won state.
 * At their end the view draws `regrown(state)`.
 * @param {VictorySteps} steps
 * @param {BattleState} state
 * @param {{reducedMotion?: boolean}} [options]  only fades when true
 * @returns {Motion}
 */
export function victoryMotion(steps, state, options = {}) {
  /** @type {Track[]} */
  const during = [];
  for (const hop of steps.hops) {
    during.push({
      target: { kind: 'band', band: hop.band },
      keyframes: [
        { offset: 0, transform: 'translate(0px, 0px)', easing: 'ease-out' },
        { offset: 0.22, transform: 'translate(0px, -9px)', easing: 'ease-in' },
        { offset: 0.45, transform: 'translate(0px, 0px)', easing: 'ease-out' },
        { offset: 0.65, transform: 'translate(0px, -5px)', easing: 'ease-in' },
        { offset: 0.85, transform: 'translate(0px, 0px)' },
        { offset: 1, transform: 'translate(0px, 0px)' },
      ],
      start: hop.start,
      duration: hop.duration,
      easing: 'linear',
      fill: 'none',
      origin: null,
      step: -1,
    });
  }
  const grounds = groundGrid(regrown(state));
  const reduced = options.reducedMotion === true;
  let id = 0;
  for (const tile of steps.regrow) {
    const [x, y] = tile.at;
    id += 1;
    during.push({
      target: { kind: 'fx', fx: 'ground', id: `regrow-${id}`, at: copy(tile.at), ground: grounds[y][x] },
      keyframes: reduced
        ? [{ opacity: 0 }, { offset: 1, opacity: 1 }]
        : [{ transform: 'scale(0.3)', opacity: 0 }, { offset: 0.7, transform: 'scale(1.04)', opacity: 1 }, { offset: 1, transform: 'scale(1)', opacity: 1 }],
      start: tile.start,
      duration: tile.duration,
      easing: 'ease-out',
      fill: 'both',
      origin: reduced ? null : 'center',
      step: -1,
    });
    during.push({
      target: { kind: 'feature', at: copy(tile.at) },
      keyframes: [{ opacity: 1 }, { offset: 1, opacity: 0 }],
      start: tile.start,
      duration: tile.duration,
      easing: 'ease-in',
      fill: 'forwards',
      origin: null,
      step: -1,
    });
  }
  return { during, after: [], detached: [], end: steps.end };
}

/**
 * What a defeat lost, in words and on the board: the den (where it stood),
 * the bands (where each one fell), or nothing to mark (out of turns).
 * @param {BattleState} before  the state before the losing move
 * @param {BattleState} after  the lost battle
 * @returns {DefeatSummary}
 */
export function defeatSummary(before, after) {
  /** @type {Pos[]} */
  const lost = [];
  if (after.lostReason === 'habitat') {
    before.tiles.forEach((row, y) => row.forEach((tile, x) => {
      const now = after.tiles[y] !== undefined ? after.tiles[y][x] : undefined;
      if (isHabitat(tile) && (now === undefined || !isHabitat(now))) lost.push([x, y]);
    }));
  } else if (after.lostReason === 'wiped' || after.lostReason === 'rescue') {
    for (const band of before.bands) {
      if (band.side !== 'us' || band.cells.length === 0) continue;
      if (after.lostReason === 'wiped' && band.trapped) continue;
      if (after.lostReason === 'rescue' && !band.trapped) continue;
      const now = after.bands.find((b) => b.id === band.id);
      if (now === undefined || now.cells.length === 0) lost.push(copy(band.cells[0]));
    }
  }
  return { reason: after.lostReason, text: defeatText(after), lost };
}

/**
 * The defeat, step by step: the board dims, then what was lost is
 * marked, then the rust ribbon unfurls and the words come under it.
 * Under reduced motion the dim is a quick fade and the ribbon and the
 * words are simply there.
 * @param {DefeatSummary} summary
 * @param {{reducedMotion?: boolean}} [options]
 * @returns {DefeatSteps}
 */
export function defeatSteps(summary, options = {}) {
  const reduced = options.reducedMotion === true;
  const banner = reduced ? { start: 0, duration: 0 } : { start: BANNER_LEAD_MS, duration: RIBBON_MS };
  return {
    dim: { start: 0, duration: reduced ? FADE_MS : DIM_MS },
    marks: summary.lost.map((at) => ({ at: copy(at), start: reduced ? 0 : MARK_LEAD_MS })),
    banner,
    words: { start: reduced ? 0 : Math.round(banner.start + banner.duration * RIBBON_WORD_AT) },
  };
}

/**
 * The seed count at `elapsed` ms into a count of `duration` ms: a whole
 * number from 0 up to `total`, slowing as it nears it.
 * @param {number} total
 * @param {number} elapsed
 * @param {number} duration
 * @returns {number}
 */
export function countUp(total, elapsed, duration) {
  if (duration <= 0 || elapsed >= duration) return total;
  if (elapsed <= 0) return 0;
  const t = elapsed / duration;
  return Math.min(total, Math.round(total * (1 - (1 - t) ** 3)));
}
