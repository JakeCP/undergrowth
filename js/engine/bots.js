// How the bots think. Each bot type names a `mind`, the thinking it runs,
// so two types can share one. One paragraph per mind:
//
// - Hunter (the saw-drone's mind): always engaged. It walks toward the nearest
//   band, trapped bands included, and strikes band, then habitat, then a dam.
//   If the ground walls it off from every band (holes, water, stones,
//   forest), it walks up to the wall nearest a band and waits there. It
//   never turns on a den for want of a band: a moat holds it.
//   (It still cuts a dam, and strikes a den, that it ends its walk next to.)
//   The Hunter type runs it too, at speed 4, four long, with a cut of 3
//   where the saw's is 2; its wounds do not grow back.
// - Harvester: engaged, it charges the nearest band; otherwise it takes the
//   shortest route to the nearest habitat, counting trees as if it could
//   walk through them, and mows whatever tree is next on that route. It
//   strikes band, then habitat, then forest.
// - Planter (the den-breaker): it goes for the nearest habitat it can walk
//   to, or, when engaged, for the nearest band if that is strictly closer.
//   It strikes habitat, then a band anywhere but in forest, then paves
//   open ground or stubble.
// - Sentry (the Watchtower and the Beacon): it never walks. It shoots.
// - Stalker (the Crane): it walks or it swings, never both in one turn. If
//   it can hit a band from where it stands, it swings and does not walk.
//   Otherwise it walks one tile toward the nearest firing tile, a tile two
//   off a band cell it sees along a row or column, with no tree, stone, den
//   or body (its own as it stands now included) on the tile between, and
//   does not swing that turn. So beside it is safe, two off in a clear line
//   is deadly, and three off is safe for that turn. Its route never crosses
//   a band it sees or a tile beside one, except a firing tile it ends on;
//   every tile between is beside a band, so its own head or neck never
//   spoils the tile it is walking to. If no firing tile can be reached
//   that way, it stays where it is.
// - Coil: it lies still until a band it sees is in its reach; then it walks
//   as the hunter does toward the nearest band, its body following its head,
//   so whatever it was wrapped round opens. With no band in reach it stays
//   where it is: it does not go home. It strikes a band next to it, by
//   TARGET_PRIORITY, and nothing else.
//
// A bot shoots when its type's first action is a shot (see lanes.js): along
// a row or column (and, if its action says `dirs: 8`, a diagonal), stopped
// by the first tree, stone, den or body. Of the bands it can hit it shoots
// the one highest in TARGET_PRIORITY, then the nearest, then the first in
// shot direction order. A shooter is engaged when it can hit a band from
// where it stands: a sentry never walks, and a stalker that can hit does
// not walk, so that is exactly when it will shoot (unless a bot before it
// in the same bots' turn changes the board first). A shooting mind's walk
// never asks whether it is engaged.
//
// A strike on a band hits the band only; the tile under it is untouched.
// So a band on a den shields it, and a dam under a band holds.
//
// A wounded bot grows back a tile a step as it walks, up to full length,
// unless its type says `regrows: false`: then its wounds stay.
//
// Under the trial rule `snakeBodies` a bot may step onto its own tail but
// not back onto the rest of its body, so every bot's route to its goal
// goes round the cells between its head and its tail.
//
// On its turn a bot walks first, then strikes (a stalker does one or the
// other, never both). Bots go one at a time, in the order the level lists
// them. Plans are made by running that same turn on a copy of the state
// (planBots), so a shown plan and the real turn cannot disagree.

/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').Tile} Tile */
/** @typedef {import('./types.js').Band} Band */
/** @typedef {import('./types.js').Plan} Plan */
/** @typedef {import('./types.js').BattleState} BattleState */
/** @typedef {import('./types.js').Mind} Mind */
/** @typedef {{path: Pos[], dist: number, field: Map<string, number>}} Approach */
/** @typedef {{path: Pos[], route: Map<string, number>|null}} Walk */

import { DIR_ORDER, DIRS, add, inBounds, key, manhattan, neighbours } from './grid.js';
import { canEnter, isHabitat, pave } from './terrain.js';
import { BAND_TYPES, TARGET_PRIORITY, actionsFor } from './units.js';
import { bandById, occupantAt, stepBand, reachable, copyPlan, botGrows } from './band.js';
import { resolveAction } from './actions.js';
import { shotTargets, stopsShot } from './lanes.js';

// Offered here as it always was; it lives in band.js, which needs it to
// follow a bot's body along a walk under `snakeBodies`.
export { botGrows };

/**
 * The thinking this bot runs: its type's mind, or null for a band without one.
 * @param {Band} bot
 * @returns {Mind|null}
 */
export function mindOf(bot) {
  return BAND_TYPES[bot.type]?.mind ?? null;
}

/**
 * The bot's shot, when its first action is one; null for a bot that
 * strikes the next tile.
 * @param {Band} bot
 * @returns {import('./types.js').ActionDef|null}
 */
function shotOf(bot) {
  const action = actionsFor(bot.type, bot.maxLen)[0];
  return action !== undefined && action.effect === 'shot' ? action : null;
}

/**
 * Terrain a bot can stand on.
 * @param {Tile} tile
 * @returns {boolean}
 */
function walkable(tile) {
  return canEnter(tile, 'bots', false);
}

/**
 * Terrain a harvester routes over: where it can stand, plus forest it can mow.
 * @param {Tile} tile
 * @returns {boolean}
 */
function mowable(tile) {
  return walkable(tile) || tile.kind === 'forest';
}

/**
 * @param {Pos} p
 * @returns {Pos}
 */
function copyPos(p) {
  return [p[0], p[1]];
}

/**
 * @returns {Plan}
 */
function emptyPlan() {
  return { path: [], strike: null, actionId: null };
}

/**
 * @param {Band} bot
 * @returns {number}
 */
function reachOf(bot) {
  const type = BAND_TYPES[bot.type];
  return type.reach ?? type.speed + 1;
}

/**
 * Whether this bot targets this band cell: walks toward it, is engaged by
 * it and strikes it as a band.
 * - Only always-engaged bots (the hunter mind) see a trapped band.
 * - Only forest shelters a band cell from the planter mind.
 * @param {BattleState} state
 * @param {Band} bot
 * @param {Band} band
 * @param {Pos} cell
 * @returns {boolean}
 */
function sees(state, bot, band, cell) {
  if (band.side !== 'us') return false;
  if (band.trapped && BAND_TYPES[bot.type].alwaysEngaged !== true) return false;
  if (mindOf(bot) === 'planter' && state.tiles[cell[1]][cell[0]].kind === 'forest') return false;
  return true;
}

/**
 * @param {BattleState} state
 * @param {Band} bot
 * @returns {Pos[]}
 */
function seenCells(state, bot) {
  /** @type {Pos[]} */
  const result = [];
  for (const band of state.bands) {
    for (const cell of band.cells) {
      if (sees(state, bot, band, cell)) result.push(cell);
    }
  }
  return result;
}

/**
 * @param {BattleState} state
 * @param {(tile: Tile) => boolean} accept
 * @returns {Pos[]}
 */
function tilesWhere(state, accept) {
  /** @type {Pos[]} */
  const result = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (accept(state.tiles[y][x])) result.push([x, y]);
    }
  }
  return result;
}

/**
 * The tiles next to any of `cells` that pass `passable`: where a bot has to
 * stand to strike one of them.
 * @param {BattleState} state
 * @param {Pos[]} cells
 * @param {(tile: Tile) => boolean} passable
 * @returns {Pos[]}
 */
function tilesNextTo(state, cells, passable) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Pos[]} */
  const result = [];
  for (const cell of cells) {
    for (const pos of neighbours(state, cell)) {
      const k = key(pos);
      if (seen.has(k)) continue;
      seen.add(k);
      if (passable(state.tiles[pos[1]][pos[0]])) result.push(pos);
    }
  }
  return result;
}

/**
 * Walking steps from every tile to the nearest goal, over `passable`
 * terrain, never through a `blocked` tile.
 * @param {BattleState} state
 * @param {Pos[]} goals
 * @param {(tile: Tile) => boolean} passable
 * @param {Set<string>} blocked
 * @returns {Map<string, number>}
 */
function distanceField(state, goals, passable, blocked) {
  /** @type {Map<string, number>} */
  const dist = new Map();
  /** @type {Pos[]} */
  const queue = [];
  for (const goal of goals) {
    const k = key(goal);
    if (dist.has(k) || blocked.has(k)) continue;
    dist.set(k, 0);
    queue.push(goal);
  }
  let index = 0;
  while (index < queue.length) {
    const current = queue[index];
    index += 1;
    const currentDist = /** @type {number} */ (dist.get(key(current)));
    for (const next of neighbours(state, current)) {
      const k = key(next);
      if (dist.has(k) || blocked.has(k)) continue;
      if (!passable(state.tiles[next[1]][next[0]])) continue;
      dist.set(k, currentDist + 1);
      queue.push(next);
    }
  }
  return dist;
}

/**
 * Where the bot can be after walking at most `steps` tiles by its ordinary
 * movement rules: staying put first, then every reachable tile.
 * @param {BattleState} state
 * @param {Band} bot
 * @param {number} steps
 * @returns {Array<{dest: Pos, path: Pos[]}>}
 */
function walkOptions(state, bot, steps) {
  /** @type {Array<{dest: Pos, path: Pos[]}>} */
  const options = [{ dest: bot.cells[0], path: [] }];
  for (const path of reachable(state, bot.id, steps).values()) {
    options.push({ dest: path[path.length - 1], path });
  }
  return options;
}

/**
 * @param {{dest: Pos, path: Pos[], dist: number, rank: number}} a
 * @param {{dest: Pos, path: Pos[], dist: number, rank: number}} b
 * @returns {boolean}
 */
function closer(a, b) {
  if (a.dist !== b.dist) return a.dist < b.dist;
  if (a.path.length !== b.path.length) return a.path.length < b.path.length;
  if (a.rank !== b.rank) return a.rank < b.rank;
  if (a.dest[1] !== b.dest[1]) return a.dest[1] < b.dest[1];
  return a.dest[0] < b.dest[0];
}

/**
 * A band's place in TARGET_PRIORITY: lower is struck first.
 * @param {Band} band
 * @returns {number}
 */
function priorityOf(band) {
  const index = TARGET_PRIORITY.indexOf(band.type);
  return index === -1 ? TARGET_PRIORITY.length : index;
}

/**
 * The best priority among the bands this bot could strike from `pos`.
 * @param {BattleState} state
 * @param {Band} bot
 * @param {Pos} pos
 * @returns {number}
 */
function bestPriorityFrom(state, bot, pos) {
  let best = TARGET_PRIORITY.length + 1;
  for (const next of neighbours(state, pos)) {
    const occupant = occupantAt(state, next);
    if (occupant === undefined || !sees(state, bot, occupant, next)) continue;
    best = Math.min(best, priorityOf(occupant));
  }
  return best;
}

/**
 * The walk that gets the bot nearest to a goal tile this turn. Ties go to
 * the shorter walk, then the lower `rank` of the tile it ends on (when
 * given), then the smaller y, then the smaller x.
 *
 * Distance is counted along the shortest route that is open right now,
 * around every band the bot cannot strike: other bots, and animals it does
 * not see. A band it can strike is no obstacle. The bot keeps coming, and
 * strikes it once it is in reach, so a band cannot turn a bot away by
 * standing in its lane. Only if the bands it walks around block every
 * route does the bot count them as not there, so it closes in and waits.
 * Tiles in `avoid` are never on a route, in either count, unless they are
 * goals. Under snake bodies the bot's own cells between its head and its
 * tail count as in `avoid`: it cannot step back onto them (its tail moves
 * off as it steps), so a bot whose goal lies behind its neck walks round.
 * Null when no tile the bot can walk to has any route to a goal even then.
 * @param {BattleState} state
 * @param {Band} bot
 * @param {Pos[]} goals
 * @param {(tile: Tile) => boolean} passable
 * @param {(dest: Pos) => number} [rank]
 * @param {Set<string>} [avoid]
 * @returns {Approach|null}
 */
function approach(state, bot, goals, passable, rank, avoid = new Set()) {
  if (goals.length === 0) return null;
  const options = walkOptions(state, bot, BAND_TYPES[bot.type].speed);
  const goalKeys = new Set(goals.map(key));
  const shunned = state.rules?.snakeBodies === true
    ? new Set([...avoid, ...bot.cells.slice(1, -1).map(key)])
    : avoid;
  /** @type {Set<string>} */
  const kept = new Set([...shunned].filter((k) => !goalKeys.has(k)));
  /** @type {Set<string>} */
  const others = new Set(kept);
  for (const band of state.bands) {
    if (band.id === bot.id) continue;
    for (const cell of band.cells) {
      if (!sees(state, bot, band, cell)) others.add(key(cell));
    }
  }
  for (const blocked of [others, kept]) {
    const field = distanceField(state, goals, passable, blocked);
    /** @type {{dest: Pos, path: Pos[], dist: number, rank: number}|null} */
    let best = null;
    for (const option of options) {
      const dist = field.get(key(option.dest));
      if (dist === undefined) continue;
      const candidate = {
        dest: option.dest,
        path: option.path,
        dist,
        rank: rank === undefined ? 0 : rank(option.dest),
      };
      if (best === null || closer(candidate, best)) best = candidate;
    }
    if (best !== null) return { path: best.path, dist: best.dist, field };
  }
  return null;
}

/**
 * Could the bot walk up to a band it sees and strike it this turn? True
 * when some tile next to such a band cell is within `reach - 1` walking
 * steps of the bot's head, by the bot's ordinary movement rules.
 *
 * A shooter instead: true when it can hit a band from where it stands.
 * A shooter that can hit never walks first (a sentry never walks; a stalker
 * that can hit swings instead of walking), so this is the turn it shoots.
 * @param {BattleState} state
 * @param {Band} bot
 * @returns {boolean}
 */
export function bandInReach(state, bot) {
  if (bot.side !== 'bots' || bot.cells.length === 0) return false;
  const shot = shotOf(bot);
  if (shot !== null) return shotTargets(state, bot, shot).length > 0;
  const goals = new Set(tilesNextTo(state, seenCells(state, bot), walkable).map(key));
  if (goals.size === 0) return false;
  return walkOptions(state, bot, reachOf(bot) - 1).some((option) => goals.has(key(option.dest)));
}

/**
 * A bot is engaged when it could walk up to a band and strike it this
 * turn (a shooter: shoot it from where it stands). A type marked
 * `alwaysEngaged` (the saw-drone, the Hunter) always is. Derived from the
 * state, not stored.
 * @param {BattleState} state
 * @param {Band} bot
 * @returns {boolean}
 */
export function isEngaged(state, bot) {
  if (bot.side !== 'bots' || bot.cells.length === 0) return false;
  if (BAND_TYPES[bot.type].alwaysEngaged === true) return true;
  return bandInReach(state, bot);
}

/**
 * The tiles a stalker could fire from: for every band cell it sees and each
 * of the four directions, the tile two steps back along that direction,
 * when it is on the board and walkable and the tile between neither stops
 * a shot nor has a band on it. The bot's own body as it stands now counts,
 * so it does not step straight back from a band beside it only to find its
 * neck in its own lane.
 * @param {BattleState} state
 * @param {Band} bot
 * @returns {Pos[]}
 */
function firingTiles(state, bot) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Pos[]} */
  const result = [];
  for (const cell of seenCells(state, bot)) {
    for (const dir of DIR_ORDER) {
      /** @type {Pos} */
      const back = [-DIRS[dir][0], -DIRS[dir][1]];
      const between = add(cell, back);
      const from = add(between, back);
      if (!inBounds(state, from) || seen.has(key(from))) continue;
      if (!walkable(state.tiles[from[1]][from[0]])) continue;
      if (stopsShot(state.tiles[between[1]][between[0]])) continue;
      if (occupantAt(state, between) !== undefined) continue;
      seen.add(key(from));
      result.push(from);
    }
  }
  return result;
}

/**
 * First-playable planter movement, kept as its fallback: open ground
 * within two steps of an uncaptured objective, or next to a free band
 * when no objective is left.
 * @param {BattleState} state
 * @returns {Pos[]}
 */
function planterZone(state) {
  const uncaptured = state.objectives.filter((o) => !o.captured);
  if (uncaptured.length === 0) {
    /** @type {Pos[]} */
    const cells = [];
    for (const band of state.bands) {
      if (band.side === 'us' && !band.trapped) cells.push(...band.cells);
    }
    return tilesNextTo(state, cells, walkable);
  }
  /** @type {Pos[]} */
  const result = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      /** @type {Pos} */
      const pos = [x, y];
      if (!walkable(state.tiles[y][x])) continue;
      if (uncaptured.some((o) => manhattan(pos, o.at) <= 2)) result.push(pos);
    }
  }
  return result;
}

/**
 * Where the bot walks this turn. `route` is set only when a harvester is
 * following its through-the-forest route to a habitat; its strike then
 * prefers the next tree on that route.
 * @param {BattleState} state
 * @param {Band} bot
 * @returns {Walk}
 */
function chooseWalk(state, bot) {
  const habitats = tilesWhere(state, isHabitat);
  // Between equally near bands, the one highest in TARGET_PRIORITY.
  const toBand = () => approach(
    state,
    bot,
    tilesNextTo(state, seenCells(state, bot), walkable),
    walkable,
    (dest) => bestPriorityFrom(state, bot, dest),
  );
  const toHabitat = () => approach(state, bot, tilesNextTo(state, habitats, walkable), walkable);
  /** @type {Approach|null} */
  let chosen = null;
  /** @type {Map<string, number>|null} */
  let route = null;

  const mind = mindOf(bot);
  if (mind === 'hunter') {
    // Walled off: as near a band as it can get, counting every tile as open
    // ground, so it closes up to the wall and waits.
    const toWall = () => approach(
      state,
      bot,
      tilesNextTo(state, seenCells(state, bot), () => true),
      () => true,
    );
    chosen = toBand() ?? toWall() ?? toHabitat();
  } else if (mind === 'harvester') {
    if (isEngaged(state, bot)) chosen = toBand();
    if (chosen === null) {
      chosen = approach(state, bot, tilesNextTo(state, habitats, mowable), mowable);
      if (chosen !== null) route = chosen.field;
    }
    if (chosen === null) {
      const forest = tilesWhere(state, (tile) => tile.kind === 'forest');
      chosen = approach(state, bot, tilesNextTo(state, forest, walkable), walkable);
    }
  } else if (mind === 'planter') {
    const habitat = toHabitat();
    const band = isEngaged(state, bot) ? toBand() : null;
    if (band !== null) {
      // The band, unless the bot can stand next to a habitat in as few steps.
      const habitatFirst = habitat !== null && habitat.dist === 0 && habitat.path.length <= band.path.length;
      chosen = habitatFirst ? habitat : band;
    } else {
      chosen = habitat ?? approach(state, bot, planterZone(state), walkable);
    }
  } else if (mind === 'stalker') {
    // It walks or it swings: with a band it can hit from here, it stays.
    // Never through a tile beside a band it sees: every firing tile's
    // tile between is one, and a body there spoils that firing tile.
    // (Under snake bodies `approach` routes it round its own neck too.)
    if (!bandInReach(state, bot)) {
      const beside = new Set(seenCells(state, bot).map(key));
      for (const pos of tilesNextTo(state, seenCells(state, bot), () => true)) beside.add(key(pos));
      chosen = approach(state, bot, firingTiles(state, bot), walkable, undefined, beside);
    }
  } else if (mind === 'coil') {
    // Still until a band is in reach; then the hunter's walk toward it.
    if (bandInReach(state, bot)) chosen = toBand();
  } else if (mind === 'sentry') {
    // It never walks.
    chosen = null;
  }

  return { path: chosen === null ? [] : chosen.path, route };
}

/**
 * The tile the bot strikes from where it stands: the first adjacent
 * target in its type's order. Directions are tried N, E, S, W.
 * A shooter shoots the band it can hit that is highest in
 * TARGET_PRIORITY, then the nearest (a diagonal step counts as one),
 * then the first in shot direction order: N, E, S, W, NE, SE, SW, NW.
 * @param {BattleState} state
 * @param {Band} bot
 * @param {Map<string, number>|null} route
 * @returns {Pos|null}
 */
function chooseStrike(state, bot, route) {
  const shot = shotOf(bot);
  if (shot !== null) {
    /** @type {{at: Pos, rank: number, dist: number}|null} */
    let best = null;
    for (const target of shotTargets(state, bot, shot)) {
      const occupant = /** @type {Band} */ (occupantAt(state, target.at));
      const candidate = { at: target.at, rank: priorityOf(occupant), dist: target.dist };
      const better = best === null || candidate.rank < best.rank ||
        (candidate.rank === best.rank && candidate.dist < best.dist);
      if (better) best = candidate;
    }
    return best === null ? null : best.at;
  }

  const head = bot.cells[0];
  const adjacent = neighbours(state, head).map((pos) => ({
    pos,
    tile: state.tiles[pos[1]][pos[0]],
    occupant: occupantAt(state, pos),
  }));

  /** @returns {Pos|null} */
  const band = () => {
    /** @type {Pos|null} */
    let best = null;
    let bestRank = Infinity;
    for (const entry of adjacent) {
      if (entry.occupant === undefined || !sees(state, bot, entry.occupant, entry.pos)) continue;
      const rank = priorityOf(entry.occupant);
      if (rank < bestRank) {
        bestRank = rank;
        best = entry.pos;
      }
    }
    return best;
  };

  /**
   * Terrain is only struck when nobody stands on it. A strike on a band
   * hits the band only, so a band on a den or a dam shields it; and a bot
   * never hits itself, another bot or a band it does not see by aiming at
   * the ground under it.
   * @param {(tile: Tile) => boolean} accept
   * @returns {Pos[]}
   */
  const empty = (accept) => adjacent
    .filter((e) => e.occupant === undefined && accept(e.tile))
    .map((e) => e.pos);

  /** @returns {Pos|null} */
  const habitat = () => empty(isHabitat)[0] ?? null;

  const mind = mindOf(bot);
  if (mind === 'hunter') {
    return band() ?? habitat() ?? empty((tile) => tile.kind === 'dam')[0] ?? null;
  }

  if (mind === 'harvester') {
    const target = band() ?? habitat();
    if (target !== null) return target;
    const trees = empty((tile) => tile.kind === 'forest');
    if (route !== null) {
      // The next tree on the route: the one nearer the habitat than the bot is.
      const here = route.get(key(head)) ?? Infinity;
      /** @type {Pos|null} */
      let next = null;
      let nextDist = here;
      for (const pos of trees) {
        const d = route.get(key(pos));
        if (d !== undefined && d < nextDist) {
          nextDist = d;
          next = pos;
        }
      }
      if (next !== null) return next;
    }
    return trees[0] ?? null;
  }

  if (mind === 'planter') {
    return habitat() ?? band() ?? empty((tile) => pave(tile) !== null)[0] ?? null;
  }

  if (mind === 'coil') return band();

  return null;
}

/**
 * Bot ids in the order they take their turns: the order the level lists them.
 * @param {BattleState} state
 * @returns {string[]}
 */
export function botOrder(state) {
  return state.bands.filter((b) => b.side === 'bots').map((b) => b.id);
}

/**
 * One bot's turn: walk, then strike; a stalker that walked does not
 * strike. Mutates the state and returns what the bot did, in the shape
 * of a plan.
 * @param {BattleState} state
 * @param {string} botId
 * @returns {Plan}
 */
export function runBot(state, botId) {
  const plan = emptyPlan();
  const bot = bandById(state, botId);
  if (bot === undefined || bot.side !== 'bots' || bot.cells.length === 0) return plan;

  const walk = chooseWalk(state, bot);
  if (walk.path.length > 0) {
    const grows = botGrows(bot);
    plan.path = walk.path.map(copyPos);
    // A bot whose wounds stay says so, step by step, so the board's glide does not grow it.
    state.events.push(grows
      ? { kind: 'move', band: bot.id, path: walk.path.map(copyPos) }
      : { kind: 'move', band: bot.id, path: walk.path.map(copyPos), grow: walk.path.map(() => false) });
    for (const pos of walk.path) {
      bot.cells = stepBand(bot, pos, grows).cells;
    }
  }

  // A stalker walks or swings, never both.
  const holds = walk.path.length > 0 && mindOf(bot) === 'stalker';
  const strike = holds ? null : chooseStrike(state, bot, walk.route);
  if (strike !== null) {
    const action = actionsFor(bot.type, bot.maxLen)[0];
    plan.strike = copyPos(strike);
    plan.actionId = action.id;
    resolveAction(state, bot, action, strike);
  }
  return plan;
}

/**
 * Habitats still standing, intact or damaged.
 * @param {BattleState} state
 * @returns {number}
 */
function habitatsStanding(state) {
  let count = 0;
  for (const row of state.tiles) {
    for (const tile of row) {
      if (isHabitat(tile)) count += 1;
    }
  }
  return count;
}

/**
 * The bots' turn: each bot in level order walks, then strikes. Mutates the
 * state and returns what every bot did, keyed by bot id. A bot destroyed
 * earlier in the turn does nothing.
 *
 * The turn stops the moment a habitat is destroyed, because the battle is
 * lost: later bots neither walk nor strike, and the habitat's terrain
 * event is the last one. A bot's strike changes only the tile it hits, so
 * that event is the last of the bot's own. Once the battle is over the
 * bots do nothing at all. Planning runs this same function, so it stops at
 * the same point.
 * @param {BattleState} state
 * @returns {Record<string, Plan>}
 */
export function runBotPhase(state) {
  /** @type {Record<string, Plan>} */
  const plans = {};
  const order = botOrder(state);
  for (const id of order) plans[id] = emptyPlan();
  if (state.outcome !== null) return plans;
  const standing = habitatsStanding(state);
  for (const id of order) {
    plans[id] = runBot(state, id);
    if (habitatsStanding(state) < standing) break;
  }
  return plans;
}

/**
 * What every bot will do on the bots' turn, found by running that turn on
 * a copy of the state. Pure: the given state is not changed.
 * @param {BattleState} state
 * @returns {Record<string, Plan>}
 */
export function planBots(state) {
  return runBotPhase(structuredClone({ ...state, events: [] }));
}

/**
 * Stores a fresh plan on every bot (animals have none) and emits one
 * 'plan' event per bot, in level order. On a finished battle every bot's
 * plan is empty and no plan events are emitted, so nothing follows the
 * events that ended it.
 * @param {BattleState} state
 * @returns {void}
 */
export function replan(state) {
  const plans = planBots(state);
  for (const band of state.bands) {
    if (band.side !== 'bots') {
      band.plan = null;
      continue;
    }
    band.plan = plans[band.id] ?? emptyPlan();
    if (state.outcome === null) {
      state.events.push({ kind: 'plan', band: band.id, plan: copyPlan(band.plan) });
    }
  }
}
