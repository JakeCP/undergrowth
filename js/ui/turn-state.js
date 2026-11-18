// What each of the player's bands has left this turn (play-feel spec,
// "Changed after Jake's playtest"). Pure: no DOM.
//
//   ready   it has neither moved nor acted, and it can do one of them;
//   canAct  it has moved, has not acted, and one of its actions has a
//           target right now;
//   done    it has acted, or it has nothing left it can do: it has moved
//           and has nothing to act on, or it is boxed in with nothing
//           to act on (changed after the full-build playtest).
//
// The board marks each band from this (js/ui/board.js), End turn asks
// for a second tap only while some band is ready, and the End turn
// button takes the primary look whenever one tap ends the turn.

/** @typedef {import('../engine/types.js').Band} Band */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {'ready'|'canAct'|'done'} TurnState */

import { actionsFor } from '../engine/units.js';
import { actionTargets } from '../engine/actions.js';
import { reachable } from '../engine/band.js';
import { dashTiles } from '../engine/dash.js';

/**
 * One band's turn state, or null for a band that takes no turn of the
 * player's: a bot, a trapped band, or a band with no cells.
 * @param {BattleState} state
 * @param {Band} band
 * @returns {TurnState|null}
 */
export function bandTurnState(state, band) {
  if (band.side !== 'us' || band.trapped || band.cells.length === 0) return null;
  if (band.acted) return 'done';
  const hasTarget = actionsFor(band.type, band.maxLen, state.rules)
    .some((action) => actionTargets(state, band.id, action.id).length > 0);
  if (!band.moved) return hasTarget || reachable(state, band.id).size > 0 || dashTiles(state, band.id).size > 0 ? 'ready' : 'done';
  return hasTarget ? 'canAct' : 'done';
}

/**
 * The turn state of every band of the player's that is in play, by band
 * id, in the order the state lists them. Empty once the battle is over.
 * @param {BattleState} state
 * @returns {Map<string, TurnState>}
 */
export function turnStates(state) {
  /** @type {Map<string, TurnState>} */
  const out = new Map();
  if (state.outcome !== null) return out;
  for (const band of state.bands) {
    const turn = bandTurnState(state, band);
    if (turn !== null) out.set(band.id, turn);
  }
  return out;
}

/**
 * What each turn state means, in the words the battle screen's focus card
 * shows under a band's name (js/ui/battle-focus.js).
 * @type {Readonly<Record<TurnState, string>>}
 */
export const TURN_STATE_TEXT = Object.freeze({
  ready: 'Can move and act',
  canAct: 'Has moved; can still act',
  done: 'Done for this turn',
});

/**
 * How many of the player's bands have done nothing at all this turn and
 * still can: the bands with the bright ready ring on the board. End turn
 * carries this count on a small badge while it would ask first, and while
 * it asks, so the reason for the question is on the button.
 * @param {BattleState} state
 * @returns {number}
 */
export function bandsWaiting(state) {
  let n = 0;
  for (const turn of turnStates(state).values()) {
    if (turn === 'ready') n += 1;
  }
  return n;
}

/**
 * Whether End turn asks for a second tap: only when some band has done
 * nothing at all this turn. A band that moved but did not act never asks.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function endTurnAsks(state) {
  return bandsWaiting(state) > 0;
}

/**
 * Whether the End turn button looks ready (green): whenever one tap
 * ends the turn, that is whenever End turn would not ask first.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function endTurnReady(state) {
  return !endTurnAsks(state);
}
