#!/usr/bin/env node
// Check a round for a playable winning line, a consequential tactical choice,
// and shortcuts a simple player can execute. See README.md for the verdict.
//
//   node scripts/bench.mjs                        the campaign, the test levels, then Alt 1-5
//   node scripts/bench.mjs l03 t01 a02            just these
//   node scripts/bench.mjs --lab                  just the test levels
//   node scripts/bench.mjs --alt                  just the alt levels, a01-a05
//   node scripts/bench.mjs --rule woodOnlyGrowth  every level with a trial rule on
//
// Every player is deterministic and never reads a bot's plan. Each turn,
// each of our bands (in deploy order) walks, then acts, and the turn ends.
// To walk, it takes the reachable tile nearest its goals, if that is nearer
// than where its head is. Nearness is a cost over ground an animal can
// walk, with water passable at cost 4, so a band that can build heads
// straight at a brook and dams it. To act, it bites (its first attack with
// a bot in range) or, failing that, builds on the tile nearest its goals,
// if that is nearer than its head. The players differ only in their goals:
//
//   goal   the nearest stake or permit not yet taken (capture), the snared
//          band (rescue), any bot (clear)
//   chase  any bot
//   guard  a den of its own, claimed in deploy order, then sits on it; a
//          band with no den left plays chase (needs a den)
//   camp   the forest tile nearest the bots, then sits in the wood,
//          moving only to mend, from tree to tree (needs a forest)
//   pack   every band at the one bot nearest the first band
//   idle   end every turn immediately
//
// Try the first and last equally good walk in engine order for each active
// policy. With no lab/ (the public build) the bench plays the campaign alone;
// the test levels come from lab/levels/, the alt levels from lab/alt/.

/** @typedef {import('../js/engine/types.js').Pos} Pos */
/** @typedef {import('../js/engine/types.js').Level} Level */
/** @typedef {import('../js/engine/types.js').Band} Band */
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */
/** @typedef {import('../js/engine/types.js').Deployment} Deployment */
/** @typedef {{outcome: 'won'|'lost'|'unfinished', reason: string|null, turn: number, clean: boolean}} Run */
/** @typedef {Run & {deploy: Deployment[], reverseTies: boolean}} RecordedRun */

import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { LEVELS } from '../data/levels/index.js';
import { createBattle, advance, parseGrid, withRules, TRIAL_RULE_IDS } from '../js/engine/battle.js';
import { reachable } from '../js/engine/band.js';
import { canDash, dashTiles } from '../js/engine/dash.js';
import { actionTargets } from '../js/engine/actions.js';
import { actionsFor, BAND_TYPES } from '../js/engine/units.js';
import { canEnter, isHabitat } from '../js/engine/terrain.js';
import { eq, key, neighbours } from '../js/engine/grid.js';
import { orders, progressFor, replay, rosterDeployments, rosterFor, stateKey } from './solve.mjs';
import { consequentialTurns } from './bench-challenge.mjs';

export const PLAYERS = Object.freeze(['goal', 'chase', 'guard', 'camp', 'pack', 'idle']);

const MAX_TURNS = 100;
const WATER_COST = 4;

/**
 * The cost for an animal from every tile to the nearest of `goals`,
 * ignoring other bands: a step costs 1, or 4 off a water tile; holes and
 * stones (and anything else an animal cannot enter) are not passable.
 * @param {BattleState} s
 * @param {Pos[]} goals
 * @returns {Map<string, number>}
 */
function distances(s, goals) {
  /** @type {Map<string, number>} */
  const dist = new Map();
  /** @type {Map<string, Pos>} */
  const open = new Map();
  for (const g of goals) {
    dist.set(key(g), 0);
    open.set(key(g), g);
  }
  while (open.size > 0) {
    /** @type {string|null} */
    let nearest = null;
    for (const k of open.keys()) {
      if (nearest === null || /** @type {number} */ (dist.get(k)) < /** @type {number} */ (dist.get(nearest))) nearest = k;
    }
    const here = /** @type {Pos} */ (open.get(/** @type {string} */ (nearest)));
    open.delete(/** @type {string} */ (nearest));
    const d = /** @type {number} */ (dist.get(key(here)));
    for (const next of neighbours(s, here)) {
      const tile = s.tiles[next[1]][next[0]];
      const cost = canEnter(tile, 'us', false) ? 1 : tile.kind === 'water' ? WATER_COST : Infinity;
      if (cost === Infinity) continue;
      const k = key(next);
      if (d + cost < (dist.get(k) ?? Infinity)) {
        dist.set(k, d + cost);
        open.set(k, next);
      }
    }
  }
  return dist;
}

/**
 * @param {BattleState} s
 * @returns {Band[]}
 */
function botsOf(s) {
  return s.bands.filter((b) => b.side === 'bots' && b.cells.length > 0);
}

/**
 * @param {BattleState} s
 * @param {Pos[]} cells
 * @returns {Pos[]}
 */
function around(s, cells) {
  return cells.flatMap((c) => neighbours(s, c));
}

/**
 * Every tile of the board in reading order that passes `test`.
 * @param {BattleState} s
 * @param {(tile: import('../js/engine/types.js').Tile) => boolean} test
 * @returns {Pos[]}
 */
function tilesWhere(s, test) {
  /** @type {Pos[]} */
  const out = [];
  s.tiles.forEach((row, y) => row.forEach((tile, x) => {
    if (test(tile)) out.push([x, y]);
  }));
  return out;
}

/**
 * The tile of `tiles` with the lowest cost in `dist`, the first on a tie.
 * @param {Pos[]} tiles
 * @param {Map<string, number>} dist
 * @returns {Pos|null}
 */
function nearestOf(tiles, dist) {
  /** @type {Pos|null} */
  let best = null;
  for (const t of tiles) {
    if (best === null || (dist.get(key(t)) ?? Infinity) < (dist.get(key(best)) ?? Infinity)) best = t;
  }
  return best;
}

/**
 * The goal player's targets, as the old lazy player had them.
 * @param {BattleState} s
 * @returns {Pos[]}
 */
function objectiveGoals(s) {
  if (s.goal === 'clear') return around(s, botsOf(s).flatMap((b) => b.cells));
  if (s.goal === 'rescue') return around(s, s.bands.filter((b) => b.trapped).flatMap((b) => b.cells));
  return s.objectives.filter((o) => !o.captured).map((o) => o.at);
}

/**
 * Where `band` wants to be this step.
 * @param {BattleState} s
 * @param {string} player
 * @param {Band} band
 * @param {Map<string, Pos>} claims  the guard's dens, by band id
 * @param {string[]} order  our band ids in deploy order
 * @returns {Pos[]}
 */
function goalsFor(s, player, band, claims, order) {
  const chase = () => around(s, botsOf(s).flatMap((b) => b.cells));
  if (player === 'goal') return objectiveGoals(s);
  if (player === 'guard') {
    const den = claims.get(band.id);
    return den === undefined ? chase() : [den];
  }
  if (player === 'camp') {
    const fromBots = distances(s, botsOf(s).flatMap((b) => b.cells));
    const wood = nearestOf(tilesWhere(s, (t) => t.kind === 'forest'), fromBots);
    return wood === null ? [] : [wood];
  }
  if (player === 'pack') {
    const lead = order.map((id) => s.bands.find((b) => b.id === id)).find((b) => b !== undefined && b.cells.length > 0);
    if (lead === undefined) return [];
    const fromLead = distances(s, lead.cells);
    /** @type {Band|null} */
    let target = null;
    let best = Infinity;
    for (const bot of botsOf(s)) {
      const cost = Math.min(...bot.cells.map((c) => fromLead.get(key(c)) ?? Infinity));
      if (target === null || cost < best) {
        target = bot;
        best = cost;
      }
    }
    return target === null ? [] : around(s, target.cells);
  }
  return chase();
}

/**
 * Dens claimed in deploy order: each band takes the den nearest it that no
 * earlier band took.
 * @param {BattleState} s
 * @param {string[]} order
 * @returns {Map<string, Pos>}
 */
function claimDens(s, order) {
  /** @type {Map<string, Pos>} */
  const claims = new Map();
  const free = tilesWhere(s, isHabitat);
  for (const id of order) {
    const band = s.bands.find((b) => b.id === id);
    if (band === undefined || free.length === 0) continue;
    let pick = 0;
    let best = Infinity;
    free.forEach((den, i) => {
      const cost = distances(s, [den]).get(key(band.cells[0])) ?? Infinity;
      if (cost < best) {
        pick = i;
        best = cost;
      }
    });
    claims.set(id, free[pick]);
    free.splice(pick, 1);
  }
  return claims;
}

/**
 * The path the band walks this turn, and whether it dashes there (trial
 * rule foxDash), or null to stay.
 * @param {BattleState} s
 * @param {string} player
 * @param {Band} band
 * @param {Pos[]} goals
 * @param {Map<string, Pos>} claims
 * @param {boolean} reverseTies
 * @returns {{path: Pos[], dash: boolean}|null}
 */
function walkFor(s, player, band, goals, claims, reverseTies) {
  const head = band.cells[0];
  const dist = distances(s, goals);
  const far = (/** @type {Pos} */ p) => dist.get(key(p)) ?? Infinity;
  const paths = [...reachable(s, band.id).values()];
  if (reverseTies) paths.reverse();
  const den = claims.get(band.id);
  if (player === 'guard' && den !== undefined && eq(head, den)) return null;
  if (player === 'camp' && s.tiles[head[1]][head[0]].kind === 'forest') {
    if (band.cells.length >= band.maxLen) return null;
    const steps = paths.filter((p) => p.length === 1 && s.tiles[p[0][1]][p[0][0]].kind === 'forest');
    /** @type {Pos[]|null} */
    let step = null;
    for (const p of steps) if (step === null || far(p[0]) < far(step[0])) step = p;
    return step === null ? null : { path: step, dash: false };
  }
  /** @type {Pos[]|null} */
  let best = null;
  for (const path of paths) {
    if (best === null || far(path[path.length - 1]) < far(best[best.length - 1])) best = path;
  }
  const walk = best !== null && far(best[best.length - 1]) < far(head) ? best : null;
  const run = dashFor(s, band, paths, far, walk === null ? head : walk[walk.length - 1]);
  if (run !== null) return { path: run, dash: true };
  return walk === null ? null : { path: walk, dash: false };
}

/**
 * Whether the band dashes instead (trial rule foxDash): only when it can,
 * when no tile it could walk to (or stay on) is next to a bot, so it has
 * nothing to bite, and when a dash tile is strictly nearer its goals than
 * `end`, where its walk would leave it. The nearest such tile's path, or
 * null.
 * @param {BattleState} s
 * @param {Band} band
 * @param {Pos[][]} paths  Its walks.
 * @param {(p: Pos) => number} far
 * @param {Pos} end
 * @returns {Pos[]|null}
 */
function dashFor(s, band, paths, far, end) {
  if (!canDash(s, band)) return null;
  const bots = botsOf(s).flatMap((b) => b.cells);
  const stands = [band.cells[0], ...paths.map((p) => p[p.length - 1])];
  if (stands.some((t) => bots.some((c) => Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) === 1))) return null;
  /** @type {Pos[]|null} */
  let best = null;
  for (const path of dashTiles(s, band.id).values()) {
    if (best === null || far(path[path.length - 1]) < far(best[best.length - 1])) best = path;
  }
  return best !== null && far(best[best.length - 1]) < far(end) ? best : null;
}

/**
 * What the band does after it walks, or null for nothing.
 * @param {BattleState} s
 * @param {Band} band
 * @param {Pos[]} goals
 * @returns {{action: string, target: Pos}|null}
 */
function actFor(s, band, goals) {
  const actions = actionsFor(band.type, band.maxLen, s.rules);
  const bots = botsOf(s).flatMap((b) => b.cells);
  for (const attack of actions.filter((a) => a.effect === 'attack')) {
    const target = actionTargets(s, band.id, attack.id).find((t) => bots.some((c) => eq(c, t)));
    if (target !== undefined) return { action: attack.id, target };
  }
  const build = actions.find((a) => a.effect === 'build');
  if (build === undefined) return null;
  const dist = distances(s, goals);
  const far = (/** @type {Pos} */ p) => dist.get(key(p)) ?? Infinity;
  const nearer = actionTargets(s, band.id, build.id).filter((t) => far(t) < far(band.cells[0]));
  const target = nearestOf(nearer, dist);
  return target === null ? null : { action: build.id, target };
}

/**
 * One boring player's game of the level from `deploy`. Null when the
 * player does not apply: `guard` with no den, `camp` with no forest.
 * @param {Level} level
 * @param {string} player
 * @param {Deployment[]} deploy
 * @param {boolean} [reverseTies]
 * @returns {Run|null}
 */
export function playBoring(level, player, deploy, reverseTies = false) {
  const { tiles } = parseGrid(level.grid);
  if (player === 'guard' && !tiles.flat().some(isHabitat)) return null;
  if (player === 'camp' && !tiles.flat().some((t) => t.kind === 'forest')) return null;
  const order = deploy.map((d) => d.type);
  const s = createBattle(level, deploy, progressFor(level, undefined, order));
  const claims = player === 'guard' ? claimDens(s, order) : new Map();
  const seen = new Set();
  let reason = 'turn cap';
  let turn = s.turn;
  while (s.outcome === null && s.turn <= MAX_TURNS) {
    // These policies depend only on the position. A repeated turn start
    // repeats forever, or until the level clock expires.
    turn = s.turn;
    const position = stateKey(s);
    if (seen.has(position)) {
      reason = 'cycle';
      break;
    }
    seen.add(position);
    s.events = [];
    for (const id of order) {
      if (player === 'idle' || s.outcome !== null) break;
      const band = s.bands.find((b) => b.id === id);
      if (band === undefined || band.cells.length === 0) continue;
      const walk = walkFor(s, player, band, goalsFor(s, player, band, claims, order), claims, reverseTies);
      if (walk !== null) advance(s, walk.dash ? { kind: 'move', band: id, path: walk.path, dash: true } : { kind: 'move', band: id, path: walk.path });
      if (s.outcome !== null) break;
      // A dash has taken the band's action too.
      if (walk !== null && walk.dash) continue;
      const now = s.bands.find((b) => b.id === id);
      if (now === undefined || now.cells.length === 0) continue;
      const act = actFor(s, now, goalsFor(s, player, now, claims, order));
      if (act !== null) advance(s, { kind: 'act', band: id, ...act });
    }
    if (s.outcome === null) advance(s, { kind: 'end' });
  }
  const untouched = s.tiles.flat().filter((t) => t.kind === 'habitat').length;
  return { outcome: s.outcome ?? 'unfinished', reason: s.outcome === null ? reason : s.lostReason, turn, clean: untouched === s.habitatStart };
}

/** Recordings may include bought bands in the campaign. A lab roster is fixed.
 * @param {Level} level
 * @param {Deployment[]} deploy
 * @param {string[]} roster
 * @param {boolean} allowShop
 */
function allowedDeployment(level, deploy, roster, allowShop) {
  for (const { type } of deploy) {
    const def = BAND_TYPES[type];
    if (def?.side !== 'us') return false;
    if (!roster.includes(type) && !(allowShop && !level.roster && def.price !== null)) return false;
  }
  const { deployTiles } = parseGrid(level.grid);
  return deploy.length > 0 && deploy.length <= level.maxBands &&
    new Set(deploy.map((d) => d.type)).size === deploy.length &&
    new Set(deploy.map((d) => key(d.at))).size === deploy.length &&
    deploy.every((d) => deployTiles.some((pos) => eq(pos, d.at)));
}

/**
 * Every guaranteed roster pick, camp tile assignment and band order, plus
 * recorded deployments (which can also demonstrate a shop approach).
 * @param {Level} level
 * @returns {Deployment[][]}
 */
export function deploymentsFor(level) {
  const roster = level.roster ?? rosterFor(level.id);
  const out = rosterDeployments(level, [], roster);
  for (const sol of [level.solution, ...(level.alternatives ?? [])]) {
    if (allowedDeployment(level, sol.deploy, roster, true)) out.push(sol.deploy);
  }
  const seen = new Set();
  return out.flatMap(orders).filter((d) => {
    const k = JSON.stringify(d);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * @param {Run} run
 * @returns {number} lower is better
 */
function rank(run) {
  if (run.outcome === 'won') return run.clean ? 0 : 1;
  if (run.outcome === 'unfinished') return run.reason === 'turn cap' ? 2 : 3;
  return 4;
}

/**
 * Keep a reproducer for each policy. A win takes priority, then a cutoff
 * requiring more work, a repeated position, and a defeat.
 * @param {Level} level
 * @param {Deployment[][]} [deploys]
 * @returns {Record<string, RecordedRun|null>}
 */
export function benchLevel(level, deploys = deploymentsFor(level)) {
  /** @type {Record<string, RecordedRun|null>} */
  const out = {};
  for (const player of PLAYERS) {
    /** @type {RecordedRun|null} */
    let best = null;
    for (const deploy of deploys) {
      for (const reverseTies of player === 'idle' ? [false] : [false, true]) {
        const run = playBoring(level, player, deploy, reverseTies);
        if (run !== null && (best === null || rank(run) < rank(best) ||
          (rank(run) === rank(best) && run.outcome === 'won' && run.turn < best.turn))) {
          best = { ...run, deploy, reverseTies };
        }
      }
    }
    out[player] = best;
  }
  return out;
}

/**
 * Every `'<levelId>:<player>'` won with every den untouched.
 * @param {Level[]} levels
 * @returns {string[]}
 */
export function cleanWins(levels) {
  return levels.flatMap((level) => {
    const runs = benchLevel(level);
    return PLAYERS.filter((p) => runs[p]?.outcome === 'won' && runs[p]?.clean === true).map((p) => `${level.id}:${p}`);
  });
}

/**
 * The players that win the level at all.
 * @param {Level} level
 * @returns {string[]}
 */
export function anyWins(level) {
  const runs = benchLevel(level);
  return PLAYERS.filter((p) => runs[p]?.outcome === 'won');
}

/**
 * Replay a win available to the intended roster under this exact ruleset.
 * Prefer a line with a demonstrated tactical choice. An illegal move or
 * an unfinished recording cannot certify a round.
 * @param {Level} level
 */
function witnessFor(level) {
  const roster = level.roster ?? rosterFor(level.id);
  let failure = 'no recorded win';
  let witness = null;
  const lines = [level.solution, ...(level.alternatives ?? [])];
  for (const [i, line] of lines.entries()) {
    if (!allowedDeployment(level, line.deploy, roster, false)) {
      if (i === 0) failure = 'invalid deployment for the starting roster';
      continue;
    }
    const invalidSize = line.deploy.find(({type}) => {
      const size = level.assumes[type] ?? BAND_TYPES[type].startLen;
      return !Number.isInteger(size) || size < BAND_TYPES[type].startLen || size > BAND_TYPES[type].maxLenCap;
    });
    if (invalidSize) {
      if (i === 0) failure = `invalid size for ${invalidSize.type}`;
      continue;
    }
    /** @type {BattleState[]} */
    const states = [];
    const { state, error } = replay(level, line.deploy, line.moves, undefined, (s) => states.push(s));
    if (error || state.outcome !== 'won') {
      if (i === 0) failure = error ?? state.lostReason ?? 'unfinished replay';
      continue;
    }
    const choices = consequentialTurns(states, line.moves);
    const result = { line: i + 1, turn: states[line.moves.length - 1].turn, choices };
    witness ??= result;
    if (choices.length) return { witness: result, failure: null };
  }
  return { witness, failure: witness ? null : failure };
}

/** @param {Level} level */
export function assessLevel(level) {
  const { witness, failure } = witnessFor(level);
  const deploys = deploymentsFor(level);
  const runs = benchLevel(level, deploys);
  return { ...verdictOf(witness, runs), witness, failure, runs, starts: deploys.length };
}

/**
 * The verdict on a round, by the rule from the 2026-11-16 review: a round
 * a simple player wins with every den whole is not finished (a shortcut,
 * and the round fails). A simple win with a den damaged is a warning to
 * look at; the round still passes. It also needs a verified win, and no
 * run left unresolved at the turn cap. The count of consequential turns
 * on the winning line is shown to the designer but never decides: it sees
 * only what a changed order costs within that same turn.
 * @param {{choices: unknown[]}|null} witness
 * @param {Record<string, Run|null>} runs
 * @returns {{pass: boolean, shortcuts: string[], warnings: string[], capped: string[]}}
 */
export function verdictOf(witness, runs) {
  const players = Object.keys(runs);
  const won = players.filter((p) => runs[p]?.outcome === 'won');
  const shortcuts = won.filter((p) => runs[p]?.clean === true);
  const warnings = won.filter((p) => runs[p]?.clean !== true);
  const capped = players.filter((p) => runs[p]?.reason === 'turn cap');
  const pass = witness !== null && shortcuts.length === 0 && capped.length === 0;
  return { pass, shortcuts, warnings, capped };
}

/** @param {import('../js/engine/types.js').Move|null} order */
function describeOrder(order) {
  if (!order) return 'skip';
  if (order.kind === 'move') return `${order.band} via ${order.path.map((p) => p.join(',')).join(' / ')}`;
  if (order.kind === 'act') return `${order.band} ${order.action} at ${order.target}`;
  return 'end turn';
}

/**
 * The levels a module under lab/ exports as `name`, or none when that file
 * is not there (the public build has no `lab/`). A file that is there but
 * broken, or has no such array, is an error, not an empty list, so a
 * broken level never quietly drops out of the table.
 * @param {URL} url
 * @param {string} name
 * @returns {Promise<Level[]>}
 */
async function loadLevels(url, name) {
  if (!existsSync(fileURLToPath(url))) return [];
  const mod = await import(url.href);
  if (!Array.isArray(mod[name])) throw new Error(`${fileURLToPath(url)} has no ${name} array`);
  return mod[name];
}

/**
 * The test levels: the `LAB_LEVELS` of the module at `url` (see loadLevels).
 * @param {URL} [url]
 * @returns {Promise<Level[]>}
 */
export function loadLabLevels(url = new URL('../lab/levels/index.js', import.meta.url)) {
  return loadLevels(url, 'LAB_LEVELS');
}

/**
 * The alt levels, a01-a05: the `ALT_LEVELS` of the module at `url` (see
 * loadLevels).
 * @param {URL} [url]
 * @returns {Promise<Level[]>}
 */
export function loadAltLevels(url = new URL('../lab/alt/index.js', import.meta.url)) {
  return loadLevels(url, 'ALT_LEVELS');
}

/**
 * The rounds a run can pick from, in the order they are played: the
 * campaign, the test levels, then the alt levels; with --lab or --alt only
 * those (both flags: both sets). A sandbox has no line to judge, so the
 * bench never plays it.
 * @param {{campaign: Level[], lab: Level[], alt: Level[]}} sets
 * @param {{labOnly?: boolean, altOnly?: boolean}} [flags]
 * @returns {Level[]}
 */
export function benchPool(sets, flags = {}) {
  const lab = sets.lab.filter((l) => l.sandbox !== true);
  const alt = sets.alt.filter((l) => l.sandbox !== true);
  if (flags.labOnly === true || flags.altOnly === true) {
    return [...(flags.labOnly === true ? lab : []), ...(flags.altOnly === true ? alt : [])];
  }
  return [...sets.campaign, ...lab, ...alt];
}

const USAGE = `usage: node scripts/bench.mjs [level ids] [--lab] [--alt] [--rule <${TRIAL_RULE_IDS.join('|')}>]`;

/**
 * @param {string[]} argv
 * @param {(line: string) => void} out
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, out) {
  /** @type {string[]} */
  const ids = [];
  let labOnly = false;
  let altOnly = false;
  /** @type {string|null} */
  let rule = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--lab') {
      labOnly = true;
    } else if (arg === '--alt') {
      altOnly = true;
    } else if (arg === '--rule') {
      rule = argv[i + 1] ?? '';
      i += 1;
      if (!TRIAL_RULE_IDS.includes(rule)) {
        out(USAGE);
        return 2;
      }
    } else if (arg.startsWith('--')) {
      out(USAGE);
      return 2;
    } else {
      ids.push(arg);
    }
  }
  const pool = benchPool({ campaign: LEVELS, lab: await loadLabLevels(), alt: await loadAltLevels() }, { labOnly, altOnly });
  const unknown = ids.filter((id) => !pool.some((l) => l.id === id));
  if (unknown.length > 0) {
    out(`no level ${unknown.join(', ')}`);
    out(USAGE);
    return 2;
  }
  let levels = ids.length === 0 ? pool : pool.filter((l) => ids.includes(l.id));
  if (rule !== null) levels = levels.map((l) => withRules(l, { [rule]: true }));

  let passed = 0;
  for (const level of levels) {
    const { pass, witness, failure, shortcuts, warnings, capped, runs, starts } = assessLevel(level);
    if (pass) passed++;
    out(`${level.id}  ${pass ? 'PASS' : 'FAIL'}  ${level.name} (${starts} starts)`);
    if (witness) {
      out(`  Recording ${witness.line} wins on turn ${witness.turn}. Turns with a tactical consequence: ${witness.choices.length}.`);
      const choice = witness.choices[0];
      if (choice) out(`  Turn ${choice.turn}: change "${describeOrder(choice.order)}" to "${describeOrder(choice.replacement)}" -> ${choice.cost}.`);
    } else {
      out(`  No verified win: ${failure}.`);
    }
    for (const [label, players] of /** @type {Array<[string, string[]]>} */ ([['Shortcut', shortcuts], ['Warning', warnings]])) {
      for (const player of players) {
        const run = /** @type {RecordedRun} */ (runs[player]);
        const start = run.deploy.map((d) => `${d.type}@${d.at}`).join(' ');
        out(`  ${label}: ${player}, ${start}, ${run.reverseTies ? 'last' : 'first'} tied walk -> won on turn ${run.turn}${run.clean ? '' : ', den damaged'}.`);
      }
    }
    if (capped.length) out(`  Inconclusive after ${MAX_TURNS} turns: ${capped.join(', ')}.`);
  }
  out(`${passed}/${levels.length} rounds passed${rule === null ? '' : ` with ${rule}`}.`);
  return passed === levels.length && levels.length > 0 ? 0 : 1;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exitCode = await main(process.argv.slice(2), console.log);
