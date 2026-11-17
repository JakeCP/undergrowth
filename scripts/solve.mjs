#!/usr/bin/env node
// A small bounded search for winning lines. A dev tool: it is not shipped,
// not in the service worker's precache and not run in CI. The level tests
// replay the recorded solutions; this only helps to find them again after
// a rule or numbers change, and to ask what a level's habitats cost.
//
//   node scripts/solve.mjs l03                       try the roster's deployments, fewest bands first
//   node scripts/solve.mjs l03 --with badger         the same, with a band bought in the shop as well
//   node scripts/solve.mjs l03 --deploy badger@2,3 ants@0,7
//   node scripts/solve.mjs l03 --ignore-habitats     does racing for the goal, dens ignored, still win?
//   node scripts/solve.mjs l03 --replay              replay the recorded solutions, board by board
//   node scripts/solve.mjs l03 --replay --plain      the same, without the boards
//   node scripts/solve.mjs l03 --trim                take out recorded actions the win does not need
//   node scripts/solve.mjs l03 --idle                what the bots do if every turn is just ended
//   node scripts/solve.mjs drafts/new-level.js       a level file that is not in the campaign yet
//
// Options:
//   --deploy <type@x,y ...>   the deployment to search from
//   --assume <type=n ...>     band sizes (default: the level's `assumes`)
//   --with <type ...>         add a band the shop sells to the roster searched from
//   --turns <n>               give up after this many turns (default 12)
//   --beam <n>                positions kept per turn (0 keeps all)
//   --per-node <n>            turn endings tried from each kept position (0 tries all)
//   --cap <n>                 positions kept after each band's part of a turn (0 keeps all)
//                             (defaults by band count, see widthFor: 300/all/all for one
//                             band, 150/600/120 for two, 40/250/60 for three)
//   --all-orders              with three bands, try all six orders, not just two
//   --show                    print the board after every turn of the line found
//   --all                     try every deployment, not just until the first win
//
// The bands searched from are the level's guaranteed roster: the fox and
// the hedgehog, and every band the story has surely given by that level
// (guaranteedRoster in js/story/story.js). A level file that is not in the
// campaign has only the fox and the hedgehog. A recorded or --deploy line
// may also name a shop band; it is then owned at its starting size unless
// --assume or the level's `assumes` says otherwise.
//   --verbose                 say how many positions each turn made and kept
//
// How it searches: turn by turn. From each position kept it tries every
// way to play one turn (each band: stay or walk to any tile it can reach,
// then act or not; bands in every order) and drops repeats. Ending a turn
// runs the bots, which is what costs, so only the best `per-node` of those
// endings are played on. Of all the new positions, positions seen before
// are dropped and the best `beam` kept. "Best" is a rough score (dens
// standing, progress to the goal, bands alive), and a share of every cut
// is spread evenly down the ranking so that slow-burning lines survive.
// The first turn that holds a win gives the shortest line the search can
// see. With --beam 0 --per-node 0 --cap 0 it is exhaustive, which is only
// practical for one band over a few turns. Every line it prints has been
// replayed through the engine's applyMove.
//
// --ignore-habitats asks "does this level still win if the player ignores
// the dens?". It searches the same way with den loss not counted: a lost
// den is no defeat and the bots' turn carries on past it. That finds the
// fastest race to the goal. It then replays each fastest line under the
// real rules: if every one of them loses a den, ignoring the dens loses.

/** @typedef {import('../js/engine/types.js').Pos} Pos */
/** @typedef {import('../js/engine/types.js').Move} Move */
/** @typedef {import('../js/engine/types.js').Level} Level */
/** @typedef {import('../js/engine/types.js').Deployment} Deployment */
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */
/** @typedef {import('../js/engine/types.js').Progress} Progress */
/** @typedef {{state: BattleState, parent: Node|null, moves: Move[]}} Node */
/** @typedef {{turns?: number, beam?: number, cap?: number, perNode?: number, allOrders?: boolean, ignoreHabitats?: boolean, collect?: boolean, log?: (line: string) => void}} SearchOptions */
/** @typedef {{moves: Move[], turns: number}} Line */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBattle, applyMove, advance, parseGrid, countHabitats, countForest } from '../js/engine/battle.js';
import { reachable } from '../js/engine/band.js';
import { actionTargets } from '../js/engine/actions.js';
import { actionsFor, BAND_TYPES, STARTER_TYPES } from '../js/engine/units.js';
import { TERRAIN } from '../js/engine/terrain.js';
import { botOrder, runBot } from '../js/engine/bots.js';
import { newProgress } from '../js/campaign/progress.js';
import { guaranteedRoster } from '../js/story/story.js';
import { SCENES } from '../data/story/index.js';
import { CAMPAIGN_NODES } from '../data/campaign.js';

const DEFAULTS = { turns: 12 };

/**
 * How wide to search, by how many bands play: each extra band multiplies
 * the ways to play a turn, so the search narrows to stay at about a minute.
 * @param {number} bands
 * @returns {{beam: number, cap: number, perNode: number}}
 */
function widthFor(bands) {
  if (bands <= 1) return { beam: 300, cap: 0, perNode: 0 };
  if (bands === 2) return { beam: 150, cap: 600, perNode: 120 };
  return { beam: 40, cap: 250, perNode: 60 };
}

// ---------------------------------------------------------------- state

/**
 * A copy the engine's `advance` can change freely. Tiles and positions are
 * never changed in place by the engine (it swaps them for new ones), so
 * they are shared. Plans are dropped: the search never reads them.
 * @param {BattleState} s
 * @returns {BattleState}
 */
function copyState(s) {
  return {
    ...s,
    tiles: s.tiles.map((row) => row.slice()),
    bands: s.bands.map((b) => ({ ...b, cells: b.cells.slice(), plan: null })),
    pickups: s.pickups.slice(),
    objectives: s.objectives.map((o) => ({ ...o })),
    events: [],
  };
}

const KIND_CHAR = {
  open: '.', forest: 'T', stubble: '_', paving: '#', water: '~', hole: 'o', dam: '=', stones: 'S', habitat: 'H', habitatDamaged: 'h',
};

/**
 * Everything that decides how a position plays on, as a string. Two
 * positions with the same key at the start of a turn are the same position.
 * @param {BattleState} s
 * @returns {string}
 */
function stateKey(s) {
  let k = '';
  for (const row of s.tiles) {
    for (const tile of row) k += tile.kind === 'dam' && tile.under === 'hole' ? '+' : KIND_CHAR[tile.kind];
  }
  for (const b of s.bands) {
    k += `|${b.id}${b.trapped ? '!' : ''}`;
    for (const c of b.cells) k += `${c[0]},${c[1]};`;
  }
  k += '|';
  for (const o of s.objectives) k += o.captured ? '1' : '0';
  k += `|${s.pickups.length}`;
  return k;
}

/**
 * The bands the story has surely given by this level, whichever route the
 * player took. A level that is not in the campaign gets the starters.
 * @param {string} levelId
 * @returns {string[]}
 */
export function rosterFor(levelId) {
  if (!CAMPAIGN_NODES.some((n) => n.levelId === levelId)) return [...STARTER_TYPES];
  return guaranteedRoster(levelId, CAMPAIGN_NODES, SCENES, STARTER_TYPES);
}

/**
 * The save a line is played from: the level's roster at its starting
 * sizes, plus `extra` (shop bands a line deploys) at theirs, then the
 * sizes in `assume` (default: the level's `assumes`).
 * @param {Level} level
 * @param {Record<string, number>} [assume]
 * @param {string[]} [extra]
 * @returns {Progress}
 */
export function progressFor(level, assume, extra = []) {
  const p = newProgress();
  for (const type of [...rosterFor(level.id), ...extra]) {
    if (p.bands[type] === undefined) p.bands[type] = { maxLen: BAND_TYPES[type].startLen };
  }
  for (const [type, n] of Object.entries(assume ?? level.assumes)) p.bands[type] = { maxLen: n };
  return p;
}

/**
 * @param {Deployment[]} deploy
 * @returns {string[]}
 */
function typesOf(deploy) {
  return deploy.map((d) => d.type);
}

// ---------------------------------------------------------------- score

/**
 * Walking steps for an animal from every tile to the nearest of `goals`,
 * bands not counted. Water and holes cost 4, as if somebody still had to
 * dam them, so a far bank is far and not unreachable.
 * @param {BattleState} s
 * @param {Pos[]} goals
 * @returns {number[][]}
 */
function animalDistance(s, goals) {
  const dist = s.tiles.map((row) => row.map(() => Infinity));
  /** @type {Pos[]} */
  let frontier = [];
  for (const g of goals) {
    dist[g[1]][g[0]] = 0;
    frontier.push(g);
  }
  // The board is tiny, so plain relaxation until nothing changes.
  while (frontier.length > 0) {
    /** @type {Pos[]} */
    const next = [];
    for (const [x, y] of frontier) {
      const here = dist[y][x];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || ny >= s.height || nx >= s.width) continue;
        const tile = s.tiles[ny][nx];
        let cost = 1;
        if (tile.kind === 'water' || tile.kind === 'hole') cost = 4;
        else if (!TERRAIN[tile.kind].animalWalk) continue;
        if (here + cost < dist[ny][nx]) {
          dist[ny][nx] = here + cost;
          next.push([nx, ny]);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * A rough worth for a position at the start of a turn: higher is better.
 * It only orders the beam; it never decides a win. `progress` is how near
 * the goal is and how strong the bands are; `dens` is how whole the dens are.
 * @param {BattleState} s
 * @returns {{progress: number, dens: number}}
 */
function scoreState(s) {
  let progress = 0;
  let dens = 0;
  const free = s.bands.filter((b) => b.side === 'us' && !b.trapped);
  const bots = s.bands.filter((b) => b.side === 'bots');
  const heads = free.map((b) => b.cells[0]);
  /** @param {number[][]} field */
  const nearest = (field) => {
    let best = 40;
    for (const h of heads) best = Math.min(best, field[h[1]][h[0]]);
    return best;
  };

  for (const row of s.tiles) {
    for (const tile of row) {
      if (tile.kind === 'habitat') dens += 100;
      else if (tile.kind === 'habitatDamaged') dens += 40;
    }
  }
  progress += 120 * free.length;
  for (const b of free) progress += 6 * b.cells.length;

  if (s.goal === 'capture') {
    for (const o of s.objectives) {
      if (o.captured) progress += 1000;
      else progress -= 12 * nearest(animalDistance(s, [o.at]));
    }
  } else if (s.goal === 'rescue') {
    /** @type {Pos[]} */
    const cells = [];
    for (const b of s.bands) if (b.trapped) cells.push(...b.cells);
    if (cells.length > 0) progress -= 12 * nearest(animalDistance(s, cells));
  } else {
    progress -= 500 * bots.length;
    /** @type {Pos[]} */
    const cells = [];
    for (const b of bots) {
      progress -= 40 * b.cells.length;
      cells.push(...b.cells);
    }
    if (cells.length > 0) progress -= 8 * nearest(animalDistance(s, cells));
  }
  return { progress: progress + 0.1 * countForest(s), dens };
}

/**
 * The best `n` of `items`. Two fifths go to the best by progress and dens
 * together, and (when dens count) one fifth to the best by progress alone,
 * so neither the careful lines nor the fast ones crowd the others out. The
 * rest are spread evenly over everything left, best first, so that a line
 * whose worth only shows a turn or two later still has a place.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => BattleState} stateOf
 * @param {number} n
 * @param {boolean} ignoreHabitats
 * @returns {T[]}
 */
function best(items, stateOf, n, ignoreHabitats) {
  if (n <= 0 || items.length <= n) return items;
  const scored = items.map((item, i) => {
    const score = scoreState(stateOf(item));
    return { item, i, both: score.progress + (ignoreHabitats ? 0 : score.dens), progress: score.progress };
  });
  // Ties keep the order the items came in, so the search is repeatable.
  const byBoth = [...scored].sort((a, b) => (b.both - a.both) || (a.i - b.i));
  /** @type {Set<typeof scored[number]>} */
  const kept = new Set(byBoth.slice(0, Math.ceil((2 * n) / 5)));
  if (!ignoreHabitats) {
    const byProgress = [...scored].sort((a, b) => (b.progress - a.progress) || (a.i - b.i));
    const want = kept.size + Math.ceil(n / 5);
    for (const x of byProgress) {
      if (kept.size >= want) break;
      kept.add(x);
    }
  }
  const rest = byBoth.filter((x) => !kept.has(x));
  const room = n - kept.size;
  for (let j = 0; j < room && rest.length > 0; j += 1) {
    kept.add(rest[Math.floor((j * rest.length) / room)]);
  }
  return [...kept].sort((a, b) => a.i - b.i).map((x) => x.item);
}

// ---------------------------------------------------------------- search

/**
 * Every way one band can play its part of the turn from `state`: nothing,
 * an action, a walk, or a walk and then an action. Walks use the engine's
 * own shortest path to each tile, so one path per tile is tried.
 * @param {BattleState} state
 * @param {string} bandId
 * @returns {Move[][]}
 */
function bandOptions(state, bandId) {
  const band = state.bands.find((b) => b.id === bandId);
  /** @type {Move[][]} */
  const options = [[]];
  if (band === undefined || band.trapped || band.acted) return options;
  /** @param {BattleState} s @param {Move[]} prefix */
  const acts = (s, prefix) => {
    const b = s.bands.find((x) => x.id === bandId);
    if (b === undefined) return;
    for (const action of actionsFor(b.type, b.maxLen)) {
      for (const target of actionTargets(s, bandId, action.id)) {
        options.push([...prefix, { kind: 'act', band: bandId, action: action.id, target: [target[0], target[1]] }]);
      }
    }
  };
  acts(state, []);
  if (band.moved) return options;
  for (const path of reachable(state, bandId).values()) {
    /** @type {Move} */
    const move = { kind: 'move', band: bandId, path: path.map((p) => /** @type {Pos} */ ([p[0], p[1]])) };
    options.push([move]);
    const after = copyState(state);
    advance(after, move);
    if (after.outcome === null) acts(after, [move]);
  }
  return options;
}

/**
 * @param {string[]} ids
 * @returns {string[][]}
 */
function orders(ids) {
  if (ids.length <= 1) return [ids];
  /** @type {string[][]} */
  const out = [];
  ids.forEach((id, i) => {
    const rest = [...ids.slice(0, i), ...ids.slice(i + 1)];
    for (const tail of orders(rest)) out.push([id, ...tail]);
  });
  return out;
}

/**
 * The moves from the start of the battle to this node.
 * @param {Node} node
 * @returns {Move[]}
 */
function lineOf(node) {
  /** @type {Move[][]} */
  const parts = [];
  for (let n = /** @type {Node|null} */ (node); n !== null; n = n.parent) parts.push(n.moves);
  return parts.reverse().flat();
}

/**
 * The bots' turn, as `advance(state, {kind: 'end'})` plays it, except that
 * with `ignoreHabitats` a den lost is not a defeat and does not stop the
 * bots' turn: every bot walks and strikes as if nothing had happened.
 * @param {BattleState} state
 * @param {boolean} ignoreHabitats
 * @returns {void}
 */
function endTurn(state, ignoreHabitats) {
  if (!ignoreHabitats) {
    advance(state, { kind: 'end' });
    return;
  }
  for (const id of botOrder(state)) runBot(state, id);
  state.turn += 1;
  for (const band of state.bands) {
    if (band.side !== 'us') continue;
    band.moved = false;
    band.acted = false;
  }
  // What battle.js checks after the bots' turn, less the den rule. Nothing
  // the bots do can win the battle, so only the ways to lose are left.
  const hasTrapped = state.bands.some((b) => b.id.startsWith('trapped-'));
  if (!state.bands.some((b) => b.side === 'us' && !b.trapped)) {
    state.outcome = 'lost';
    state.lostReason = 'wiped';
  } else if (state.goal === 'rescue' && !hasTrapped) {
    state.outcome = 'lost';
    state.lostReason = 'rescue';
  } else if (state.turnLimit !== null && state.turn > state.turnLimit) {
    state.outcome = 'lost';
    state.lostReason = 'turns';
  }
}

/**
 * Every position one turn of player moves can reach from `state`, before
 * the turn is ended, keyed by stateKey; and the wins met on the way.
 * Bands play in every order, each band in turn trying every option
 * (bandOptions). After each band the positions are cut to `cap`.
 * @param {BattleState} state
 * @param {number} cap
 * @param {boolean} ignoreHabitats
 * @param {boolean} allOrders
 * @returns {{ends: Map<string, {state: BattleState, moves: Move[]}>, wins: Array<{key: string, moves: Move[]}>}}
 */
function turnEnds(state, cap, ignoreHabitats, allOrders) {
  const ids = state.bands.filter((b) => b.side === 'us' && !b.trapped).map((b) => b.id);
  /** @type {Map<string, {state: BattleState, moves: Move[]}>} */
  const ends = new Map();
  /** @type {Array<{key: string, moves: Move[]}>} */
  const wins = [];
  const winKeys = new Set();
  // Three bands have six orders; unless asked, only the listed order and its reverse are tried.
  const tried = allOrders || ids.length <= 2 ? orders(ids) : [ids, [...ids].reverse()];
  for (const order of tried) {
    /** @type {Array<{state: BattleState, moves: Move[]}>} */
    let partial = [{ state, moves: [] }];
    for (const id of order) {
      /** @type {Map<string, {state: BattleState, moves: Move[]}>} */
      const grown = new Map();
      for (const p of partial) {
        for (const option of bandOptions(p.state, id)) {
          let s = p.state;
          if (option.length > 0) {
            s = copyState(p.state);
            for (const move of option) advance(s, move);
          }
          const moves = [...p.moves, ...option];
          const k = stateKey(s);
          if (s.outcome === 'won') {
            if (!winKeys.has(k)) {
              winKeys.add(k);
              wins.push({ key: k, moves });
            }
            continue;
          }
          if (s.outcome !== null) continue;
          if (!grown.has(k)) grown.set(k, { state: s, moves });
        }
      }
      partial = best([...grown.values()], (p) => p.state, cap, ignoreHabitats);
    }
    for (const p of partial) {
      const k = stateKey(p.state);
      if (!ends.has(k)) ends.set(k, p);
    }
  }
  return { ends, wins };
}

/**
 * Searches for the shortest winning lines from `start`, turn by turn.
 * From each kept position it finds the positions one turn of player moves
 * reaches (turnEnds), keeps the best `perNode` of them, ends the turn on
 * each (the bots' turn is the costly part), and keeps the best `beam` of
 * all the new positions for the next turn.
 * Returns every distinct win found on the first turn that has one (just
 * the first when `collect` is off), or an empty list.
 * @param {BattleState} start
 * @param {SearchOptions} [options]
 * @returns {Line[]}
 */
export function search(start, options = {}) {
  const maxTurns = options.turns ?? DEFAULTS.turns;
  const width = widthFor(start.bands.filter((b) => b.side === 'us' && !b.trapped).length);
  const beam = options.beam ?? width.beam;
  const cap = options.cap ?? width.cap;
  const perNode = options.perNode ?? width.perNode;
  const allOrders = options.allOrders ?? false;
  const ignoreHabitats = options.ignoreHabitats ?? false;
  const log = options.log ?? (() => {});

  const first = copyState(start);
  // With the dens ignored, losing one is never a defeat.
  if (ignoreHabitats) first.habitatStart = 0;
  /** @type {Node[]} */
  let layer = [{ state: first, parent: null, moves: [] }];
  const seen = new Set([stateKey(first)]);

  for (let turn = 1; turn <= maxTurns && layer.length > 0; turn += 1) {
    /** @type {Line[]} */
    const wins = [];
    const winKeys = new Set();
    /** @type {Node[]} */
    const next = [];

    for (const node of layer) {
      const { ends, wins: found } = turnEnds(node.state, cap, ignoreHabitats, allOrders);
      for (const w of found) {
        if (winKeys.has(w.key)) continue;
        winKeys.add(w.key);
        wins.push({ moves: [...lineOf(node), ...w.moves], turns: turn });
      }
      if (wins.length > 0 && !options.collect) break;
      if (wins.length > 0) continue;

      for (const p of best([...ends.values()], (e) => e.state, perNode, ignoreHabitats)) {
        const state = copyState(p.state);
        endTurn(state, ignoreHabitats);
        if (state.outcome !== null) continue;
        const k = stateKey(state);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ state, parent: node, moves: [...p.moves, { kind: 'end' }] });
      }
    }

    if (wins.length > 0) return wins;
    layer = best(next, (n) => n.state, beam, ignoreHabitats);
    log(`turn ${turn}: ${next.length} new positions, kept ${layer.length}`);
  }
  return [];
}

// ---------------------------------------------------------------- replay

/**
 * Plays a line through the engine's applyMove, the way the level tests do.
 * Stops at the first move that is illegal or comes after the battle ended.
 * @param {Level} level
 * @param {Deployment[]} deploy
 * @param {Move[]} moves
 * @param {Record<string, number>} [assume]
 * @param {(state: BattleState, move: Move|null) => void} [each]
 * @returns {{state: BattleState, error: string|null}}
 */
export function replay(level, deploy, moves, assume, each) {
  let state = createBattle(level, deploy, progressFor(level, assume, typesOf(deploy)));
  if (each) each(state, null);
  for (const move of moves) {
    try {
      state = applyMove(state, move);
    } catch (e) {
      return { state, error: `${JSON.stringify(move)}: ${/** @type {Error} */ (e).message}` };
    }
    if (each) each(state, move);
  }
  return { state, error: null };
}

/**
 * Finds a winning line for one deployment, or null.
 * @param {Level} level
 * @param {Deployment[]} deploy
 * @param {SearchOptions & {assume?: Record<string, number>}} [options]
 * @returns {Line|null}
 */
export function solve(level, deploy, options = {}) {
  const start = createBattle(level, deploy, progressFor(level, options.assume, typesOf(deploy)));
  const lines = search(start, { ...options, ignoreHabitats: false, collect: false });
  if (lines.length === 0) return null;
  const { state, error } = replay(level, deploy, lines[0].moves, options.assume);
  if (error !== null || state.outcome !== 'won') {
    throw new Error(`the search and the engine disagree on ${level.id}: ${error ?? state.outcome}`);
  }
  return lines[0];
}

/**
 * What racing for the goal costs: the fastest lines when den loss is not
 * counted, and how each of them ends under the real rules.
 * @param {Level} level
 * @param {Deployment[]} deploy
 * @param {SearchOptions & {assume?: Record<string, number>}} [options]
 * @returns {{turns: number, lines: number, keepDens: number, example: Line, lostOnTurn: number|null, safe: Line|null}|null}
 */
export function race(level, deploy, options = {}) {
  const start = createBattle(level, deploy, progressFor(level, options.assume, typesOf(deploy)));
  const lines = search(start, { ...options, ignoreHabitats: true, collect: true });
  if (lines.length === 0) return null;
  let keepDens = 0;
  /** @type {Line|null} */
  let safe = null;
  /** @type {number|null} */
  let lostOnTurn = null;
  for (const line of lines) {
    const { state, error } = replay(level, deploy, line.moves, options.assume);
    if (error === null && state.outcome === 'won') {
      keepDens += 1;
      if (safe === null) safe = line;
    } else if (lostOnTurn === null) {
      // The bots' turn that took the den ends the turn before the one the state shows.
      lostOnTurn = state.turn - 1;
    }
  }
  return { turns: lines[0].turns, lines: lines.length, keepDens, example: lines[0], lostOnTurn, safe };
}

/**
 * The deployments a level allows from its roster, fewest bands first:
 * every set of the roster's types (plus `extra`) up to `maxBands`, on
 * every choice of deploy tiles.
 * @param {Level} level
 * @param {string[]} [extra]  shop bands to try as well
 * @returns {Deployment[][]}
 */
export function rosterDeployments(level, extra = []) {
  const types = [...new Set([...rosterFor(level.id), ...extra])];
  const { deployTiles } = parseGrid(level.grid);
  /** @type {Deployment[][]} */
  const out = [];
  /**
   * @param {string[]} types
   * @param {Pos[]} tiles
   * @param {Deployment[]} sofar
   */
  const place = (types, tiles, sofar) => {
    if (types.length === 0) {
      out.push(sofar);
      return;
    }
    tiles.forEach((tile, i) => {
      place(types.slice(1), [...tiles.slice(0, i), ...tiles.slice(i + 1)], [...sofar, { type: types[0], at: tile }]);
    });
  };
  const max = Math.min(level.maxBands, types.length, deployTiles.length);
  for (let size = 1; size <= max; size += 1) {
    /**
     * @param {number} from
     * @param {string[]} chosen
     */
    const choose = (from, chosen) => {
      if (chosen.length === size) {
        place(chosen, deployTiles, []);
        return;
      }
      for (let i = from; i < types.length; i += 1) choose(i + 1, [...chosen, types[i]]);
    };
    choose(0, []);
  }
  return out;
}

/**
 * A recorded line with every action the win does not need taken out, one
 * at a time from the end: an action goes if the line still wins without it.
 * Moves stay, since dropping one would shift every later position.
 * @param {Level} level
 * @param {Deployment[]} deploy
 * @param {Move[]} moves
 * @param {Record<string, number>} [assume]
 * @returns {Move[]}
 */
export function trim(level, deploy, moves, assume) {
  let kept = moves;
  for (let i = kept.length - 1; i >= 0; i -= 1) {
    if (kept[i].kind !== 'act') continue;
    const without = [...kept.slice(0, i), ...kept.slice(i + 1)];
    const { state, error } = replay(level, deploy, without, assume);
    if (error === null && state.outcome === 'won') kept = without;
  }
  return kept;
}

// ---------------------------------------------------------------- output

/**
 * @param {Pos} p
 * @returns {string}
 */
function pos(p) {
  return `[${p[0]}, ${p[1]}]`;
}

/**
 * A solution in the level files' own format, ready to paste.
 * @param {Deployment[]} deploy
 * @param {Move[]} moves
 * @returns {string}
 */
export function formatSolution(deploy, moves) {
  const lines = ['  solution: {', '    deploy: ['];
  for (const d of deploy) lines.push(`      { type: '${d.type}', at: ${pos(d.at)} },`);
  lines.push('    ],', '    moves: [');
  for (const m of moves) {
    if (m.kind === 'move') {
      lines.push(`      { kind: 'move', band: '${m.band}', path: [${m.path.map(pos).join(', ')}] },`);
    } else if (m.kind === 'act') {
      lines.push(`      { kind: 'act', band: '${m.band}', action: '${m.action}', target: ${pos(m.target)} },`);
    } else {
      lines.push("      { kind: 'end' },");
    }
  }
  lines.push('    ],', '  },');
  return lines.join('\n');
}

const BAND_CHARS = { fox: 'Ff', hedgehog: 'Nn', ants: 'Aa', badger: 'Gg', beaver: 'Vv', bear: 'Rr', owl: 'Oo', bees: 'Ee', harvester: '?m', saw: '?w', planter: '?p' };

/**
 * The board as text. Terrain uses the level legend ('h' is a damaged den).
 * Animals: F fox, N hedgehog, A ants, G badger, V beaver, R bear, O owl,
 * E bees, body in lower case. Bots:
 * the head is the bot's number in the level's list, the body m (harvester),
 * w (saw) or p (planter). Uncaptured objectives and pickups show when
 * nobody stands on them. Each bot's plan follows.
 * @param {BattleState} s
 * @returns {string}
 */
export function drawBoard(s) {
  const rows = s.tiles.map((row) => row.map((tile) => KIND_CHAR[tile.kind]));
  for (const o of s.objectives) if (!o.captured) rows[o.at[1]][o.at[0]] = o.kind === 'permit' ? 'P' : 'K';
  for (const p of s.pickups) rows[p[1]][p[0]] = '*';
  /** @type {string[]} */
  const notes = [];
  for (const b of s.bands) {
    const chars = BAND_CHARS[/** @type {keyof typeof BAND_CHARS} */ (b.type)] ?? '?x';
    const head = b.side === 'bots' ? b.id.slice(b.id.lastIndexOf('-') + 1) : chars[0];
    b.cells.forEach((c, i) => {
      rows[c[1]][c[0]] = i === 0 ? head : chars[1];
    });
    if (b.side === 'bots' && b.plan) {
      const walk = b.plan.path.length > 0 ? ` walks to ${b.plan.path[b.plan.path.length - 1].join(',')}` : ' stays';
      const strike = b.plan.strike ? `, strikes ${b.plan.strike.join(',')}` : '';
      notes.push(`  ${b.id} (${b.cells.length})${walk}${strike}`);
    } else if (b.side === 'us') {
      notes.push(`  ${b.id} (${b.cells.length}/${b.maxLen})${b.trapped ? ' trapped' : ''}`);
    }
  }
  const header = `   ${rows[0].map((_, x) => x).join('')}`;
  return [header, ...rows.map((r, y) => ` ${y} ${r.join('')}`), ...notes].join('\n');
}

/**
 * @param {Level} level
 * @param {Deployment[]} deploy
 * @param {Move[]} moves
 * @param {Record<string, number>|undefined} assume
 * @param {boolean} boards
 * @param {(line: string) => void} out
 * @returns {BattleState}
 */
function showReplay(level, deploy, moves, assume, boards, out) {
  const { state, error } = replay(level, deploy, moves, assume, (s, move) => {
    if (move !== null && move.kind !== 'end') return;
    if (!boards) return;
    out(move === null ? `turn ${s.turn} (start)` : `turn ${s.turn}`);
    out(drawBoard(s));
  });
  if (boards && state.outcome !== null) {
    out(drawBoard(state));
  }
  if (error !== null) out(`stopped: ${error}`);
  const turns = moves.filter((m) => m.kind === 'end').length + 1;
  const dens = `${countHabitats(state)}/${state.habitatStart} dens`;
  out(`-> ${state.outcome ?? 'unfinished'}${state.lostReason ? ` (${state.lostReason})` : ''} on turn ${state.turn} of ${turns}, ${dens}, ${countForest(state)}/${state.forestStart} forest`);
  return state;
}

// ---------------------------------------------------------------- command line

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{id: string|null, deploy: Deployment[], with: string[], assume: Record<string, number>|undefined, turns: number, beam: number|undefined, cap: number|undefined, perNode: number|undefined, allOrders: boolean, trim: boolean, ignoreHabitats: boolean, replay: boolean, idle: boolean, plain: boolean, show: boolean, all: boolean, verbose: boolean}} */
  const args = {
    id: null, deploy: [], with: [], assume: undefined, turns: DEFAULTS.turns, beam: undefined, cap: undefined, perNode: undefined, allOrders: false, trim: false, ignoreHabitats: false, replay: false, idle: false, plain: false, show: false, all: false, verbose: false,
  };
  let list = '';
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      list = arg;
      if (arg === '--ignore-habitats') args.ignoreHabitats = true;
      else if (arg === '--replay') args.replay = true;
      else if (arg === '--idle') args.idle = true;
      else if (arg === '--plain') args.plain = true;
      else if (arg === '--show') args.show = true;
      else if (arg === '--all') args.all = true;
      else if (arg === '--verbose') args.verbose = true;
      else if (arg === '--all-orders') args.allOrders = true;
      else if (arg === '--trim') args.trim = true;
      else if (!['--deploy', '--with', '--assume', '--turns', '--beam', '--cap', '--per-node'].includes(arg)) throw new Error(`unknown option ${arg}`);
    } else if (list === '--deploy') {
      const m = arg.match(/^(\w+)@(\d+),(\d+)$/);
      if (!m) throw new Error(`--deploy wants type@x,y, got ${arg}`);
      args.deploy.push({ type: m[1], at: [Number(m[2]), Number(m[3])] });
    } else if (list === '--with') {
      const def = BAND_TYPES[arg];
      if (def === undefined || def.side !== 'us' || def.price === null) throw new Error(`--with wants a band the shop sells, got ${arg}`);
      args.with.push(arg);
    } else if (list === '--assume') {
      const m = arg.match(/^(\w+)=(\d+)$/);
      if (!m) throw new Error(`--assume wants type=n, got ${arg}`);
      args.assume = { ...(args.assume ?? {}), [m[1]]: Number(m[2]) };
    } else if (list === '--turns') args.turns = Number(arg);
    else if (list === '--beam') args.beam = Number(arg);
    else if (list === '--cap') args.cap = Number(arg);
    else if (list === '--per-node') args.perNode = Number(arg);
    else if (args.id === null) args.id = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  return args;
}

/**
 * @param {Deployment[]} deploy
 * @returns {string}
 */
function deployText(deploy) {
  return deploy.map((d) => `${d.type}@${d.at.join(',')}`).join(' ');
}

/**
 * @param {string[]} argv
 * @param {(line: string) => void} out
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, out) {
  const args = parseArgs(argv);
  const { LEVELS } = await import('../data/levels/index.js');
  /** @type {Level|undefined} */
  let level = LEVELS.find((l) => l.id === args.id);
  if (level === undefined && args.id !== null && /\.m?js$/.test(args.id)) {
    level = (await import(pathToFileURL(path.resolve(args.id)).href)).default;
  }
  if (level === undefined) {
    out(`usage: node scripts/solve.mjs <${LEVELS.map((l) => l.id).join('|')}|level-file.js> [options]   (see the top of this file)`);
    return 2;
  }
  const assume = args.assume === undefined ? undefined : { ...level.assumes, ...args.assume };
  const options = { turns: args.turns, beam: args.beam, cap: args.cap, perNode: args.perNode, allOrders: args.allOrders, assume, log: args.verbose ? out : undefined };

  if (args.trim) {
    const recorded = [level.solution, ...(level.alternatives ?? [])];
    recorded.forEach((solution, i) => {
      const moves = trim(level, solution.deploy, solution.moves, assume);
      out(`${level.id} solution ${i + 1} of ${recorded.length}: ${solution.moves.length - moves.length} actions not needed`);
      out(formatSolution(solution.deploy, moves));
    });
    return 0;
  }

  if (args.replay) {
    const recorded = [level.solution, ...(level.alternatives ?? [])];
    let ok = true;
    recorded.forEach((solution, i) => {
      out(`${level.id} solution ${i + 1} of ${recorded.length}: ${deployText(solution.deploy)}`);
      const state = showReplay(level, solution.deploy, solution.moves, assume, !args.plain, out);
      if (state.outcome !== 'won') ok = false;
    });
    return ok ? 0 : 1;
  }

  const deployments = args.deploy.length > 0 ? [args.deploy] : rosterDeployments(level, args.with);

  if (args.idle) {
    /** @type {Move[]} */
    const moves = [];
    let state = createBattle(level, deployments[0], progressFor(level, assume, typesOf(deployments[0])));
    while (state.outcome === null && moves.length < args.turns) {
      moves.push({ kind: 'end' });
      state = applyMove(state, { kind: 'end' });
    }
    out(`${level.id} left alone: ${deployText(deployments[0])}`);
    showReplay(level, deployments[0], moves, assume, !args.plain, out);
    return 0;
  }

  let found = 0;
  for (const deploy of deployments) {
    const started = Date.now();
    if (args.ignoreHabitats) {
      const result = race(level, deploy, options);
      const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
      if (result === null) {
        out(`${deployText(deploy)}: no line reaches the goal in ${args.turns} turns even with the dens ignored (${took})`);
        continue;
      }
      found += 1;
      out(`${deployText(deploy)}: with the dens ignored the goal falls on turn ${result.turns} (${result.lines} fastest lines, ${took})`);
      if (result.keepDens === 0) {
        out(`  ignoring the habitats LOSES: every one of them loses a den (first on turn ${result.lostOnTurn})`);
      } else {
        out(`  ignoring the habitats can WIN: ${result.keepDens} of ${result.lines} keep every den`);
      }
      const line = result.safe ?? result.example;
      out(formatSolution(deploy, line.moves));
      if (args.show) showReplay(level, deploy, line.moves, assume, true, out);
    } else {
      const line = solve(level, deploy, options);
      const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
      if (line === null) {
        out(`${deployText(deploy)}: no win found in ${args.turns} turns (${took})`);
        continue;
      }
      found += 1;
      out(`${deployText(deploy)}: wins on turn ${line.turns} (${took})`);
      out(formatSolution(deploy, line.moves));
      if (args.show) showReplay(level, deploy, line.moves, assume, true, out);
    }
    if (!args.all && !args.ignoreHabitats) break;
    if (!args.all && args.ignoreHabitats && args.deploy.length === 0 && found > 0) break;
  }
  return found > 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), (line) => console.log(line)).then((code) => {
    process.exitCode = code;
  });
}
