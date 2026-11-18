#!/usr/bin/env node
// The bench: five boring players, a check on a level, not a solver. A dev
// tool, not shipped and not run in CI (its tests are).
//
//   node scripts/bench.mjs                        the campaign, then the test levels
//   node scripts/bench.mjs l03 t01                just these
//   node scripts/bench.mjs --lab                  just the test levels
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
//
// Each plays the level's recorded deployments, and every pick from its
// `roster` if it has one, and the table shows each player's best result.
// With no `lab/` (the public build) it benches the campaign alone.
//
// The design rule from the 2026-11-16 gameplay review: a level a boring
// player wins with every den whole is not finished, because the lesson
// can be skipped.

/** @typedef {import('../js/engine/types.js').Pos} Pos */
/** @typedef {import('../js/engine/types.js').Level} Level */
/** @typedef {import('../js/engine/types.js').Band} Band */
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */
/** @typedef {import('../js/engine/types.js').Deployment} Deployment */
/** @typedef {{outcome: 'won'|'lost'|'unfinished', reason: string|null, turn: number, clean: boolean}} Run */

import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { LEVELS } from '../data/levels/index.js';
import { createBattle, applyMove, parseGrid, withRules, TRIAL_RULE_IDS } from '../js/engine/battle.js';
import { reachable } from '../js/engine/band.js';
import { actionTargets } from '../js/engine/actions.js';
import { actionsFor } from '../js/engine/units.js';
import { canEnter, isHabitat } from '../js/engine/terrain.js';
import { eq, key, neighbours } from '../js/engine/grid.js';
import { progressFor } from './solve.mjs';

export const PLAYERS = Object.freeze(['goal', 'chase', 'guard', 'camp', 'pack']);

const MAX_TURNS = 20;
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
 * The path the band walks this turn, or null to stay.
 * @param {BattleState} s
 * @param {string} player
 * @param {Band} band
 * @param {Pos[]} goals
 * @param {Map<string, Pos>} claims
 * @returns {Pos[]|null}
 */
function walkFor(s, player, band, goals, claims) {
  const head = band.cells[0];
  const dist = distances(s, goals);
  const far = (/** @type {Pos} */ p) => dist.get(key(p)) ?? Infinity;
  const paths = [...reachable(s, band.id).values()];
  const den = claims.get(band.id);
  if (player === 'guard' && den !== undefined && eq(head, den)) return null;
  if (player === 'camp' && s.tiles[head[1]][head[0]].kind === 'forest') {
    if (band.cells.length >= band.maxLen) return null;
    const steps = paths.filter((p) => p.length === 1 && s.tiles[p[0][1]][p[0][0]].kind === 'forest');
    /** @type {Pos[]|null} */
    let step = null;
    for (const p of steps) if (step === null || far(p[0]) < far(step[0])) step = p;
    return step;
  }
  /** @type {Pos[]|null} */
  let best = null;
  for (const path of paths) {
    if (best === null || far(path[path.length - 1]) < far(best[best.length - 1])) best = path;
  }
  return best !== null && far(best[best.length - 1]) < far(head) ? best : null;
}

/**
 * What the band does after it walks, or null for nothing.
 * @param {BattleState} s
 * @param {Band} band
 * @param {Pos[]} goals
 * @returns {{action: string, target: Pos}|null}
 */
function actFor(s, band, goals) {
  const actions = actionsFor(band.type, band.maxLen);
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
 * @returns {Run|null}
 */
export function playBoring(level, player, deploy) {
  const { tiles } = parseGrid(level.grid);
  if (player === 'guard' && !tiles.flat().some(isHabitat)) return null;
  if (player === 'camp' && !tiles.flat().some((t) => t.kind === 'forest')) return null;
  const order = deploy.map((d) => d.type);
  let s = createBattle(level, deploy, progressFor(level, undefined, order));
  const claims = player === 'guard' ? claimDens(s, order) : new Map();
  while (s.outcome === null && s.turn <= MAX_TURNS) {
    for (const id of order) {
      if (s.outcome !== null) break;
      const band = s.bands.find((b) => b.id === id);
      if (band === undefined || band.cells.length === 0) continue;
      const path = walkFor(s, player, band, goalsFor(s, player, band, claims, order), claims);
      if (path !== null) s = applyMove(s, { kind: 'move', band: id, path });
      if (s.outcome !== null) break;
      const now = s.bands.find((b) => b.id === id);
      if (now === undefined || now.cells.length === 0) continue;
      const act = actFor(s, now, goalsFor(s, player, now, claims, order));
      if (act !== null) s = applyMove(s, { kind: 'act', band: id, ...act });
    }
    if (s.outcome === null) s = applyMove(s, { kind: 'end' });
  }
  const untouched = s.tiles.flat().filter((t) => t.kind === 'habitat').length;
  return { outcome: s.outcome ?? 'unfinished', reason: s.lostReason, turn: s.turn, clean: untouched === s.habitatStart };
}

/**
 * The deployments the bench plays: the recorded ones, then every pick of
 * one to `min(maxBands, camp tiles)` animals from the level's roster, on
 * the camp tiles in order.
 * @param {Level} level
 * @returns {Deployment[][]}
 */
export function deploymentsFor(level) {
  /** @type {Deployment[][]} */
  const out = [level.solution, ...(level.alternatives ?? [])].map((sol) => sol.deploy).filter((d) => d.length > 0);
  const roster = level.roster ?? [];
  const { deployTiles } = parseGrid(level.grid);
  const most = Math.min(level.maxBands, deployTiles.length, roster.length);
  /**
   * @param {number} from
   * @param {string[]} chosen
   * @param {number} size
   */
  const choose = (from, chosen, size) => {
    if (chosen.length === size) {
      out.push(chosen.map((type, i) => ({ type, at: /** @type {Pos} */ ([deployTiles[i][0], deployTiles[i][1]]) })));
      return;
    }
    for (let i = from; i < roster.length; i += 1) choose(i + 1, [...chosen, roster[i]], size);
  };
  for (let size = 1; size <= most; size += 1) choose(0, [], size);
  const seen = new Set();
  return out.filter((d) => {
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
  return run.outcome === 'unfinished' ? 2 : 3;
}

/**
 * Each player's best run over the level's deployments (the first among
 * equals): won clean, then won, unfinished, lost.
 * @param {Level} level
 * @returns {Record<string, Run|null>}
 */
export function benchLevel(level) {
  const deploys = deploymentsFor(level);
  /** @type {Record<string, Run|null>} */
  const out = {};
  for (const player of PLAYERS) {
    /** @type {Run|null} */
    let best = null;
    for (const deploy of deploys) {
      const run = playBoring(level, player, deploy);
      if (run !== null && (best === null || rank(run) < rank(best))) best = run;
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
 * @param {Run|null} run
 * @returns {string}
 */
function cell(run) {
  if (run === null) return '-';
  if (run.outcome === 'won') return run.clean ? 'won clean' : 'won, den hurt';
  return run.outcome === 'lost' ? `lost (${run.reason})` : 'unfinished';
}

/**
 * The test levels: the `LAB_LEVELS` of the module at `url`, or none when
 * that file is not there (the public build has no `lab/`). A file that is
 * there but broken, or has no `LAB_LEVELS` array, is an error, not an
 * empty list, so a broken test level never quietly drops out of the table.
 * @param {URL} [url]
 * @returns {Promise<Level[]>}
 */
export async function loadLabLevels(url = new URL('../lab/levels/index.js', import.meta.url)) {
  if (!existsSync(fileURLToPath(url))) return [];
  const mod = await import(url.href);
  if (!Array.isArray(mod.LAB_LEVELS)) throw new Error(`${fileURLToPath(url)} has no LAB_LEVELS array`);
  return mod.LAB_LEVELS;
}

const USAGE = `usage: node scripts/bench.mjs [level ids] [--lab] [--rule <${TRIAL_RULE_IDS.join('|')}>]`;

/**
 * @param {string[]} argv
 * @param {(line: string) => void} out
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, out) {
  /** @type {string[]} */
  const ids = [];
  let labOnly = false;
  /** @type {string|null} */
  let rule = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--lab') {
      labOnly = true;
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
  // A sandbox has no line to judge, so the bench never plays it.
  const lab = (await loadLabLevels()).filter((l) => l.sandbox !== true);
  const pool = labOnly ? lab : [...LEVELS, ...lab];
  const unknown = ids.filter((id) => !pool.some((l) => l.id === id));
  if (unknown.length > 0) {
    out(`no level ${unknown.join(', ')}`);
    out(USAGE);
    return 2;
  }
  let levels = ids.length === 0 ? pool : pool.filter((l) => ids.includes(l.id));
  if (rule !== null) levels = levels.map((l) => withRules(l, { [rule]: true }));

  const width = 16;
  out(`${'level'.padEnd(6)}${PLAYERS.map((p) => p.padEnd(width)).join('')}`.trimEnd());
  let flagged = 0;
  for (const level of levels) {
    const runs = benchLevel(level);
    const clean = PLAYERS.some((p) => runs[p]?.outcome === 'won' && runs[p]?.clean === true);
    if (clean) flagged += 1;
    const row = `${level.id.padEnd(6)}${PLAYERS.map((p) => cell(runs[p]).padEnd(width)).join('')}`.trimEnd();
    out(clean ? `${row}  <-` : row);
  }
  out('');
  out(`${flagged} of ${levels.length} levels are won by a boring player with every den whole${rule === null ? '' : ` (with ${rule})`}.`);
  return 0;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exitCode = await main(process.argv.slice(2), console.log);
