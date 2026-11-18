// Probe an authored win using legal alternatives from exactly the same board.
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */
/** @typedef {import('../js/engine/types.js').Move} Move */

import { applyMove } from '../js/engine/battle.js';
import { actionTargets } from '../js/engine/actions.js';
import { eq } from '../js/engine/grid.js';
import { bandById, occupantAt, passesThrough, reachable } from '../js/engine/band.js';

/** @param {BattleState} state @param {Move} order @returns {Generator<Move|null>} */
function* alternatives(state, order) {
  yield null; // Leave this order out.
  if (order.kind === 'move') {
    for (const path of reachable(state, order.band).values()) {
      if (path.length !== order.path.length || path.some((p, i) => !eq(p, order.path[i]))) yield { ...order, path };
    }
  } else if (order.kind === 'act') {
    for (const target of actionTargets(state, order.band, order.action)) {
      if (!eq(target, order.target)) yield { ...order, target };
    }
  }
}

/** @param {BattleState} state */
function wholeDens(state) {
  return state.tiles.flat().filter((tile) => tile.kind === 'habitat').length;
}

/**
 * Did a teammate's decision leave a bot in the path of a proven winning
 * walk next turn? Keep the runner in exactly the same place for this test.
 * @param {BattleState} actual
 * @param {BattleState} other
 * @param {Move|undefined} winner
 * @param {Move} changed
 */
function blockedWin(actual, other, winner, changed) {
  if (winner?.kind !== 'move' || changed.kind === 'end' || changed.band === winner.band) return null;
  const runner = bandById(actual, winner.band);
  const alternate = bandById(other, winner.band);
  if (!runner || !alternate || passesThrough(runner) || runner.cells.length !== alternate.cells.length ||
      !runner.cells.every((p, i) => eq(p, alternate.cells[i]))) return null;
  for (const step of winner.path) {
    const bot = occupantAt(other, step);
    if (bot?.side === 'bots') return `${bot.type} blocks ${runner.type}'s winning walk at ${step}`;
  }
  return null;
}

/** @param {BattleState} actual @param {BattleState} other */
function setback(actual, other) {
  if (other.lostReason === 'wiped' || other.lostReason === 'habitat') return other.lostReason;
  const lost = actual.bands.find((band) => band.side === 'us' && !band.trapped &&
    !other.bands.some((b) => b.id === band.id));
  if (lost) return `lost ${lost.type}`;
  return wholeDens(other) < wholeDens(actual) ? 'den damaged' : null;
}

/**
 * Change one order and finish this turn with the other orders intact.
 * If a later command is now illegal, the comparison gives no evidence.
 * @param {BattleState} before
 * @param {Move|null} replacement
 * @param {Move[]} rest
 */
function changedTurn(before, replacement, rest) {
  let state = before;
  try {
    if (replacement) state = applyMove(state, replacement);
    for (const order of rest) {
      if (state.outcome !== null) break;
      state = applyMove(state, order);
    }
    if (state.outcome === null) state = applyMove(state, { kind: 'end' });
  } catch {
    return null;
  }
  return state;
}

/**
 * One reproducible tactical consequence per distinct turn on a winning line.
 * `states[i]` is the position just before `moves[i]`.
 * @param {BattleState[]} states
 * @param {Move[]} moves
 */
export function consequentialTurns(states, moves) {
  const choices = [];
  let start = 0;
  while (start < moves.length) {
    let end = start;
    while (end < moves.length && moves[end].kind !== 'end') end++;
    const actual = states[end < moves.length ? end + 1 : end];
    const winner = states[end + 2]?.outcome === 'won' ? moves[end + 1] : undefined;
    let evidence = null;
    for (let i = start; i < end && !evidence; i++) {
      // Forgoing a win already in hand says little about reaching it.
      if (states[i + 1].outcome === 'won') continue;
      const order = moves[i];
      for (const replacement of alternatives(states[i], order)) {
        const other = changedTurn(states[i], replacement, moves.slice(i + 1, end));
        if (!other || other.outcome === 'won') continue;
        const cost = setback(actual, other) ?? (other.outcome === null && blockedWin(actual, other, winner, order));
        if (cost) {
          evidence = { turn: states[i].turn, order, replacement, cost };
          break;
        }
      }
    }
    if (evidence) choices.push(evidence);
    start = end + 1;
  }
  return choices;
}
