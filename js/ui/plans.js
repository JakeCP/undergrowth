// What the board shows of the bots' plans (living-bots spec): a line
// along each plan's path, a mark on its strike tile, an engaged mark, and
// which dens the plans strike. Pure: no DOM. board.js draws from these.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/**
 * One bot's plan as drawn. `line` is the head, then every tile of the
 * walk (just the head when it does not walk). `strike` is the tile it
 * strikes, or null, and `strikeFrom` is where it strikes from (the end
 * of `line`). `key` is equal for two drawings that look the same.
 * @typedef {{id: string, key: string, line: Pos[], strike: Pos|null, strikeFrom: Pos}} PlanDrawing
 */

import { isEngaged, botOrder, botGrows } from '../engine/bots.js';
import { isHabitat } from '../engine/terrain.js';
import { inBounds } from '../engine/grid.js';
import { bandById, occupantAt, stepBand } from '../engine/band.js';
import { findAction, resolveAction } from '../engine/actions.js';

/**
 * The plans to draw, one per bot that walks or strikes, in level order.
 * A strike off the board is left out.
 * @param {BattleState} state
 * @returns {PlanDrawing[]}
 */
export function planDrawings(state) {
  /** @type {PlanDrawing[]} */
  const out = [];
  for (const band of state.bands) {
    if (band.side !== 'bots' || band.cells.length === 0 || band.plan === null) continue;
    const plan = band.plan;
    const strike = plan.strike !== null && inBounds(state, plan.strike) ? plan.strike : null;
    if (plan.path.length === 0 && strike === null) continue;
    /** @type {Pos[]} */
    const line = [band.cells[0], ...plan.path].map((p) => /** @type {Pos} */ ([p[0], p[1]]));
    const strikeFrom = line[line.length - 1];
    out.push({
      id: band.id,
      key: JSON.stringify([line, strike]),
      line,
      strike: strike === null ? null : [strike[0], strike[1]],
      strikeFrom: [strikeFrom[0], strikeFrom[1]],
    });
  }
  return out;
}

/**
 * Which plans to draw again. The engine emits a plan event for every bot
 * after every re-plan, changed or not, so the board keeps what is drawn
 * (bot id -> key) and redraws only what changed.
 * - keep: drawn already and unchanged.
 * - draw: new or changed; draw these.
 * - drop: drawn but changed or gone; remove these first.
 * @param {Map<string, string>} drawn
 * @param {Array<{id: string, key: string}>} wanted
 * @returns {{keep: string[], draw: string[], drop: string[]}}
 */
export function diffPlans(drawn, wanted) {
  /** @type {string[]} */
  const keep = [];
  /** @type {string[]} */
  const draw = [];
  /** @type {string[]} */
  const drop = [];
  const want = new Map(wanted.map((w) => [w.id, w.key]));
  for (const w of wanted) {
    if (drawn.get(w.id) === w.key) keep.push(w.id);
    else draw.push(w.id);
  }
  for (const [id, k] of drawn) {
    if (want.get(id) !== k) drop.push(id);
  }
  return { keep, draw, drop };
}

/**
 * The bots that carry the engaged mark, in level order; none once the
 * battle is over.
 * @param {BattleState} state
 * @returns {string[]}
 */
export function engagedBotIds(state) {
  // Once the battle is over the bots plan nothing, so none is coming.
  if (state.outcome !== null) return [];
  return state.bands.filter((band) => band.side === 'bots' && isEngaged(state, band)).map((band) => band.id);
}

/**
 * The dens, intact or damaged, that the bots' plans will strike, as
 * "x,y" keys in the order the bots go. The plans are played on a copy,
 * bot by bot, with the engine's own walk and strike: a strike on a band
 * hits the band only, so a den with a band on it is shielded, unless an
 * earlier bot wipes that band out first; and the turn stops once a den
 * is destroyed. Pure: the state passed in is not changed.
 * @param {BattleState} state
 * @returns {string[]}
 */
export function struckHabitats(state) {
  /** @type {string[]} */
  const out = [];
  if (state.outcome !== null) return out;
  const copy = structuredClone({ ...state, events: [] });
  // By id: a band wiped out by a strike leaves copy.bands.
  for (const id of botOrder(copy)) {
    const bot = bandById(copy, id);
    if (bot === undefined || bot.cells.length === 0 || bot.plan === null) continue;
    for (const pos of bot.plan.path) bot.cells = stepBand(bot, pos, botGrows(bot)).cells;
    const at = bot.plan.strike;
    if (at === null || !inBounds(copy, at)) continue;
    const hitsDen = isHabitat(copy.tiles[at[1]][at[0]]) && occupantAt(copy, at) === undefined;
    const k = `${at[0]},${at[1]}`;
    if (hitsDen && !out.includes(k)) out.push(k);
    const action = bot.plan.actionId === null ? undefined : findAction(bot, bot.plan.actionId);
    if (action !== undefined) resolveAction(copy, bot, action, at);
    if (hitsDen && !isHabitat(copy.tiles[at[1]][at[0]])) break;
  }
  return out;
}
