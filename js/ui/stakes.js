// Stakes call-outs (look-and-motion spec, "Motion"). Pure: no DOM.
//
// What a move adds to its animation, on top of what js/ui/motion.js
// makes of its events:
//   - a bot that becomes engaged: its plan line flashes once, right after
//     the swap (found by comparing isEngaged before and after the move;
//     nothing is stored in the engine);
//   - "Last turn!" over the board, when a turn-limited level reaches its
//     last turn.
// The den pulse and "Den damaged!" / "Den lost!" are already drawn by
// js/ui/board.js and js/ui/anim-steps.js.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('./motion.js').Track} Track */
/** @typedef {import('./motion.js').Frame} Frame */

import { isEngaged } from '../engine/bots.js';
import { DURATION } from './anim-steps.js';
import { CALLOUT_MS } from './motion.js';

export const LAST_TURN_TEXT = 'Last turn!';

/** How long an engaged bot's plan line takes to flash, in ms. */
export const FLASH_MS = 420;

/**
 * The bots that are engaged after the move and were not before it, in
 * level order. A bot that is gone after the move never counts.
 * @param {BattleState} before
 * @param {BattleState} after
 * @returns {string[]}
 */
export function newlyEngaged(before, after) {
  /** @type {string[]} */
  const out = [];
  // A finished battle draws no plans, so there is no line to flash.
  if (after.outcome !== null) return out;
  for (const bot of after.bands) {
    if (bot.side !== 'bots' || !isEngaged(after, bot)) continue;
    const was = before.bands.find((band) => band.id === bot.id);
    if (was !== undefined && isEngaged(before, was)) continue;
    out.push(bot.id);
  }
  return out;
}

/**
 * True on the last turn of a turn-limited level, while the battle is on.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function isLastTurn(state) {
  return state.outcome === null && state.turnLimit !== null && state.turn === state.turnLimit;
}

/**
 * Whether to call "Last turn!": the move (the bots' turn) brought the
 * last turn, or the battle starts on it (`before` is null).
 * @param {BattleState|null} before
 * @param {BattleState} after
 * @returns {boolean}
 */
export function lastTurnDue(before, after) {
  if (!isLastTurn(after)) return false;
  return before === null || before.turn !== after.turn;
}

/**
 * The call-out keyframes: a rise and fade, or only a fade under reduced
 * motion. Transform and opacity only.
 * @param {boolean} reduced
 * @returns {Frame[]}
 */
function calloutFrames(reduced) {
  if (reduced) {
    return [{ opacity: 0 }, { offset: 0.1, opacity: 1 }, { offset: 0.8, opacity: 1 }, { offset: 1, opacity: 0 }];
  }
  return [
    { transform: 'translate(0px, 6px) scale(0.85)', opacity: 0 },
    { offset: 0.12, transform: 'translate(0px, 0px) scale(1.08)', opacity: 1 },
    { offset: 0.2, transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    { offset: 0.85, transform: 'translate(0px, -2px) scale(1)', opacity: 1 },
    { offset: 1, transform: 'translate(0px, -8px) scale(1)', opacity: 0 },
  ];
}

/**
 * The extra tracks a move's stakes add to its motion. `end` is when the
 * move's own sequence ends (the swap). `after` tracks play on the new
 * drawing; `detached` ones are call-outs over the board.
 * @param {BattleState|null} before  null at the start of the battle
 * @param {BattleState} after
 * @param {number} end
 * @param {{reducedMotion?: boolean}} [options]
 * @returns {{after: Track[], detached: Track[]}}
 */
export function stakeTracks(before, after, end, options = {}) {
  const reduced = options.reducedMotion === true;
  /** @type {Track[]} */
  const afterTracks = [];
  /** @type {Track[]} */
  const detached = [];
  if (before !== null) {
    for (const band of newlyEngaged(before, after)) {
      afterTracks.push({
        target: { kind: 'plan', band },
        keyframes: [{ opacity: 1 }, { offset: 0.3, opacity: 0.15 }, { offset: 1, opacity: 1 }],
        start: DURATION.plan,
        duration: FLASH_MS,
        easing: 'ease-in-out',
        fill: 'none',
        origin: null,
        step: -1,
      });
    }
  }
  if (lastTurnDue(before, after)) {
    detached.push({
      target: { kind: 'callout', at: [(after.width - 1) / 2, (after.height - 1) / 2], text: LAST_TURN_TEXT },
      keyframes: calloutFrames(reduced),
      start: end,
      duration: CALLOUT_MS,
      easing: 'ease-out',
      fill: 'both',
      origin: null,
      step: -1,
    });
  }
  return { after: afterTracks, detached };
}
