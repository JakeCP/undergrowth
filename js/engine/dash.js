// The fox's Dash, under the trial rule `foxDash` (fox-dash spec). Before it
// has walked or acted, a band whose type has a `dash` may run its speed
// plus its dash in one walk, by its usual walking rules; that ends its
// turn, so it cannot act after. A dash is a move with `dash: true`
// (battle.js, applyBandMove), not an action, so the action lists and the
// bots never see it.

/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').Band} Band */
/** @typedef {import('./types.js').BattleState} BattleState */

import { BAND_TYPES } from './units.js';
import { bandById, reachable } from './band.js';

/**
 * Whether the trial rule `foxDash` is on.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function dashOn(state) {
  return state.rules?.foxDash === true;
}

/**
 * Whether the band may dash now: the rule is on, it is one of the player's
 * bands, in play, untrapped, its type has a dash, and it has neither
 * walked nor acted this turn.
 * @param {BattleState} state
 * @param {Band} band
 * @returns {boolean}
 */
export function canDash(state, band) {
  if (!dashOn(state)) return false;
  if (band.side !== 'us' || band.trapped || band.cells.length === 0) return false;
  if (band.moved || band.acted) return false;
  return (BAND_TYPES[band.type]?.dash ?? 0) > 0;
}

/**
 * How far a band of this type runs when it dashes: its speed and its dash.
 * @param {string} typeId
 * @returns {number}
 */
export function dashRange(typeId) {
  const type = BAND_TYPES[typeId];
  return type.speed + (type.dash ?? 0);
}

/**
 * The tiles the band may dash to now, with the path there: every tile it
 * could reach in a walk of `dashRange` steps that its usual walk cannot
 * reach (a dash to a walk tile would only throw its action away). Empty
 * when it cannot dash.
 * @param {BattleState} state
 * @param {string} bandId
 * @returns {Map<string, Pos[]>}
 */
export function dashTiles(state, bandId) {
  /** @type {Map<string, Pos[]>} */
  const out = new Map();
  const band = bandById(state, bandId);
  if (band === undefined || !canDash(state, band)) return out;
  const walk = reachable(state, bandId);
  for (const [k, path] of reachable(state, bandId, dashRange(band.type))) {
    if (!walk.has(k)) out.set(k, path);
  }
  return out;
}
