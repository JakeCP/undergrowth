// The story moments one move or one bots' turn reached in a battle
// (opening-act spec, "The scene system"). Pure: no DOM, no randomness, no
// clock. It reads the states only and never changes them.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('./types.js').Moment} Moment */

// The same reading of the plans that draws the den mark on the board, so
// "a den is marked" here is what the player sees. plans.js is pure.
import { struckHabitats } from '../ui/plans.js';

/**
 * @param {Pos} p
 * @returns {Pos}
 */
function copy(p) {
  return [p[0], p[1]];
}

/**
 * The moments between two states: `before`, and `after` with the events
 * that took it there (`after.events`, as `applyMove` leaves them). At most
 * one moment of each kind, at the first time it happened, in the order
 * things happened; then a new turn, then a den newly marked, then the
 * result.
 * - `denDamaged`: a bot struck a den, damaging or destroying it (`at`).
 * - `bandWiped`: one of our bands was wiped out (`at` its head).
 * - `bandFreed`: a trapped band was freed (`at` its head).
 * - `botDestroyed`: a bot was destroyed (`at` its head), and straight after
 *   it `lastBotDestroyed` if no bot is left (`at` the last one's head).
 * - `turn`: the turn number went up (`turn` the new one).
 * - `denMarked`: no bot's plan struck a den before and one does now (`at`
 *   the first such den). It is not reported again while a den stays marked.
 * - `won` and `lost`: the battle ended this way.
 * Nothing here knows the level; the battle view adds it.
 * @param {BattleState} before
 * @param {BattleState} after
 * @returns {Moment[]}
 */
export function battleMoments(before, after) {
  /** @type {Moment[]} */
  const out = [];
  /** @type {Set<string>} */
  const done = new Set();
  /**
   * @param {Moment} m
   */
  const add = (m) => {
    if (done.has(m.when)) return;
    done.add(m.when);
    out.push(m);
  };
  const sideOf = new Map(before.bands.map((b) => [b.id, b.side]));
  const botsLeft = after.bands.some((b) => b.side === 'bots');
  const botsBefore = before.bands.some((b) => b.side === 'bots');
  /** @type {Pos|null} */
  let lastBot = null;
  for (const e of after.events) {
    if (e.kind === 'terrain' && (e.from === 'habitat' || e.from === 'habitatDamaged')) {
      add({ when: 'denDamaged', at: copy(e.at) });
    } else if (e.kind === 'damage' && e.wiped && e.cells.length > 0) {
      // A wipe lists the band's cells tail end first: its head is last.
      const head = copy(e.cells[e.cells.length - 1]);
      const side = sideOf.get(e.band);
      if (side === 'us') add({ when: 'bandWiped', at: head });
      if (side === 'bots') {
        add({ when: 'botDestroyed', at: head });
        lastBot = head;
      }
    } else if (e.kind === 'freed') {
      const band = after.bands.find((b) => b.id === e.band);
      if (band !== undefined && band.cells.length > 0) add({ when: 'bandFreed', at: copy(band.cells[0]) });
    }
  }
  if (botsBefore && !botsLeft && lastBot !== null) {
    const at = out.findIndex((m) => m.when === 'botDestroyed');
    out.splice(at + 1, 0, { when: 'lastBotDestroyed', at: lastBot });
  }
  if (after.turn > before.turn) out.push({ when: 'turn', turn: after.turn });
  const markedBefore = struckHabitats(before);
  const markedAfter = struckHabitats(after);
  if (markedBefore.length === 0 && markedAfter.length > 0) {
    const [x, y] = markedAfter[0].split(',').map(Number);
    out.push({ when: 'denMarked', at: [x, y] });
  }
  if (before.outcome === null && after.outcome !== null) out.push({ when: after.outcome });
  return out;
}
