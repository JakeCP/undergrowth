/** @typedef {import('./types.js').Tile} Tile */
/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').Objective} Objective */
/** @typedef {import('./types.js').Band} Band */
/** @typedef {import('./types.js').BattleState} BattleState */
/** @typedef {import('./types.js').Level} Level */
/** @typedef {import('./types.js').Progress} Progress */
/** @typedef {import('./types.js').Deployment} Deployment */
/** @typedef {import('./types.js').Move} Move */
/** @typedef {import('./types.js').Reward} Reward */

import { LEGEND, isHabitat } from './terrain.js';
import { eq, key, manhattan } from './grid.js';
import { BAND_TYPES } from './units.js';
import { bandById, canPass, landsClear, stepBand, growthAlong } from './band.js';
import { findAction, actionTargets, resolveAction } from './actions.js';
import { runBotPhase, replan } from './bots.js';

/**
 * @param {string[]} grid
 * @returns {{width: number, height: number, tiles: Tile[][], deployTiles: Pos[], objectives: Objective[], pickups: Pos[]}}
 */
export function parseGrid(grid) {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  for (const row of grid) {
    if (row.length !== width) {
      throw new Error('grid rows must be equal length');
    }
  }

  /** @type {Tile[][]} */
  const tiles = [];
  /** @type {Pos[]} */
  const deployTiles = [];
  /** @type {Objective[]} */
  const objectives = [];
  /** @type {Pos[]} */
  const pickups = [];

  for (let y = 0; y < height; y += 1) {
    const row = grid[y];
    /** @type {Tile[]} */
    const tileRow = [];
    for (let x = 0; x < width; x += 1) {
      const c = row[x];
      const entry = LEGEND[c];
      if (entry === undefined) {
        throw new Error(`unknown grid char "${c}" at ${x},${y}`);
      }
      tileRow.push({ kind: entry.tile.kind, variant: entry.tile.variant, under: entry.tile.under });
      if (entry.mark === 'deploy') {
        deployTiles.push([x, y]);
      } else if (entry.mark === 'permit' || entry.mark === 'stake') {
        objectives.push({ at: [x, y], kind: entry.mark, captured: false });
      } else if (entry.mark === 'pickup') {
        pickups.push([x, y]);
      }
    }
    tiles.push(tileRow);
  }

  return { width, height, tiles, deployTiles, objectives, pickups };
}

/**
 * @param {Pos} p
 * @returns {Pos}
 */
function copyPos(p) {
  return [p[0], p[1]];
}

/**
 * @param {BattleState} state
 * @returns {number}
 */
export function countForest(state) {
  let count = 0;
  for (const row of state.tiles) {
    for (const tile of row) {
      if (tile.kind === 'forest') count += 1;
    }
  }
  return count;
}

/**
 * Habitats still standing, intact or damaged.
 * @param {BattleState} state
 * @returns {number}
 */
export function countHabitats(state) {
  let count = 0;
  for (const row of state.tiles) {
    for (const tile of row) {
      if (isHabitat(tile)) count += 1;
    }
  }
  return count;
}

/**
 * @param {Level} level
 * @param {Deployment[]} deployments
 * @param {Progress} progress
 * @returns {BattleState}
 */
export function createBattle(level, deployments, progress) {
  if (deployments.length === 0) {
    throw new Error('at least one deployment is required');
  }
  if (deployments.length > level.maxBands) {
    throw new Error(`too many bands: ${deployments.length} exceeds maxBands ${level.maxBands}`);
  }
  const { width, height, tiles, deployTiles, objectives, pickups } = parseGrid(level.grid);

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Set<string>} */
  const seenTiles = new Set();
  for (const deployment of deployments) {
    if (seen.has(deployment.type)) {
      throw new Error(`duplicate band type "${deployment.type}"`);
    }
    seen.add(deployment.type);
    const tileKey = key(deployment.at);
    if (seenTiles.has(tileKey)) {
      throw new Error(`duplicate deployment tile ${tileKey}`);
    }
    seenTiles.add(tileKey);
    if (progress.bands[deployment.type] === undefined) {
      throw new Error(`band type "${deployment.type}" is not owned`);
    }
    if (!deployTiles.some((tile) => eq(tile, deployment.at))) {
      throw new Error(`deployment at ${deployment.at[0]},${deployment.at[1]} is not a deploy tile`);
    }
  }

  /** @type {Band[]} */
  const bands = [];
  for (const deployment of deployments) {
    bands.push({
      id: deployment.type,
      type: deployment.type,
      side: 'us',
      cells: [copyPos(deployment.at)],
      maxLen: progress.bands[deployment.type].maxLen,
      moved: false,
      acted: false,
      trapped: false,
      plan: null,
      fresh: progress.bands[deployment.type].maxLen > 1,
    });
  }
  for (const placement of level.trapped) {
    bands.push({
      id: `trapped-${placement.type}`,
      type: placement.type,
      side: 'us',
      cells: placement.cells.map(copyPos),
      maxLen: placement.cells.length,
      moved: false,
      acted: false,
      trapped: true,
      plan: null,
      fresh: false,
    });
  }
  level.bots.forEach((placement, index) => {
    bands.push({
      id: `${placement.type}-${index}`,
      type: placement.type,
      side: 'bots',
      cells: placement.cells.map(copyPos),
      maxLen: placement.cells.length,
      moved: false,
      acted: false,
      trapped: false,
      plan: null,
    });
  });

  /** @type {BattleState} */
  const state = {
    levelId: level.id,
    width,
    height,
    tiles,
    bands,
    pickups: pickups.map(copyPos),
    objectives: objectives.map((o) => ({ at: copyPos(o.at), kind: o.kind, captured: o.captured })),
    goal: level.goal,
    turn: 1,
    turnLimit: level.turnLimit,
    forestStart: 0,
    habitatStart: 0,
    pickupsTaken: 0,
    outcome: null,
    lostReason: null,
    events: [],
  };
  state.forestStart = countForest(state);
  state.habitatStart = countHabitats(state);
  replan(state);
  state.events = [];
  return state;
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @returns {Band}
 */
function requirePlayerBand(state, bandId) {
  const band = bandById(state, bandId);
  if (band === undefined) throw new Error(`no such band "${bandId}"`);
  if (band.side !== 'us') throw new Error(`band "${bandId}" is not on side us`);
  if (band.trapped) throw new Error(`band "${bandId}" is trapped`);
  return band;
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @param {Pos[]} path
 * @returns {void}
 */
function applyBandMove(state, bandId, path) {
  const band = requirePlayerBand(state, bandId);
  if (band.moved) throw new Error(`band "${bandId}" has already moved`);
  if (band.acted) throw new Error(`band "${bandId}" has already acted`);
  if (band.cells.length === 0) throw new Error(`band "${bandId}" has no cells`);

  const type = BAND_TYPES[band.type];
  if (type === undefined) throw new Error(`unknown band type "${band.type}"`);
  if (path.length === 0) throw new Error('move path must have at least one step');
  if (path.length > type.speed) {
    throw new Error(`move path of ${path.length} steps exceeds speed ${type.speed}`);
  }

  // The same rule as canWalk, checked step by step for a clear message.
  /** @type {Pos} */
  let prev = band.cells[0];
  for (const step of path) {
    if (manhattan(prev, step) !== 1) {
      throw new Error(`move step to ${step[0]},${step[1]} is not adjacent to ${prev[0]},${prev[1]}`);
    }
    if (!canPass(state, band, step)) {
      throw new Error(`band "${bandId}" cannot step to ${step[0]},${step[1]}`);
    }
    prev = step;
  }
  // A band that passes through others must still end the move on free ground.
  if (!landsClear(state, band, path)) {
    const end = path[path.length - 1];
    throw new Error(`band "${bandId}" cannot stop at ${end[0]},${end[1]}: another band is in the way`);
  }

  // Where it may grow, on the event only when some step holds it back.
  const grow = growthAlong(state, band, path);
  state.events.push(grow.every(Boolean)
    ? { kind: 'move', band: bandId, path: path.map(copyPos) }
    : { kind: 'move', band: bandId, path: path.map(copyPos), grow });

  for (let i = 0; i < path.length; i += 1) {
    const step = path[i];
    band.cells = stepBand(band, step, grow[i]).cells;

    for (const objective of state.objectives) {
      if (!objective.captured && eq(objective.at, step)) {
        objective.captured = true;
        state.events.push({ kind: 'capture', at: copyPos(step) });
      }
    }
    const pickupIndex = state.pickups.findIndex((pickup) => eq(pickup, step));
    if (pickupIndex >= 0) {
      state.pickups.splice(pickupIndex, 1);
      state.pickupsTaken += 1;
      state.events.push({ kind: 'pickup', at: copyPos(step) });
    }
  }

  band.moved = true;
  // Whole once: the first march is over, and from now on it mends only in the wood.
  if (band.cells.length >= band.maxLen) band.fresh = false;

  const head = band.cells[0];
  for (const other of state.bands) {
    if (!other.trapped) continue;
    if (!other.cells.some((cell) => manhattan(cell, head) === 1)) continue;
    other.trapped = false;
    other.moved = true;
    other.acted = true;
    state.events.push({ kind: 'freed', band: other.id });
  }
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @param {string} actionId
 * @param {Pos} target
 * @returns {void}
 */
function applyBandAction(state, bandId, actionId, target) {
  const band = requirePlayerBand(state, bandId);
  if (band.acted) throw new Error(`band "${bandId}" has already acted`);

  const action = findAction(band, actionId);
  if (action === undefined) {
    throw new Error(`band "${bandId}" cannot use action "${actionId}"`);
  }
  const targets = actionTargets(state, band.id, actionId);
  if (!targets.some((pos) => eq(pos, target))) {
    throw new Error(`target ${target[0]},${target[1]} is not valid for action "${actionId}"`);
  }

  resolveAction(state, band, action, target);
  band.acted = true;
  band.moved = true;
}

/**
 * With no bot left the field is the animals': every seed pickup still on
 * it is collected, every objective not yet captured counts as captured and
 * every trapped band is freed, each with its usual event.
 * @param {BattleState} state
 * @returns {void}
 */
function clearField(state) {
  for (const pickup of state.pickups) {
    state.pickupsTaken += 1;
    state.events.push({ kind: 'pickup', at: copyPos(pickup) });
  }
  state.pickups = [];
  for (const objective of state.objectives) {
    if (objective.captured) continue;
    objective.captured = true;
    state.events.push({ kind: 'capture', at: copyPos(objective.at) });
  }
  for (const band of state.bands) {
    if (!band.trapped) continue;
    band.trapped = false;
    band.moved = true;
    band.acted = true;
    state.events.push({ kind: 'freed', band: band.id });
  }
}

/**
 * Settles the outcome after a move. In order: a destroyed habitat loses,
 * whatever else happened; no bot left wins, whatever the goal (clearField
 * takes what is left on the field); then the level's own goal; then the
 * other ways to lose.
 * @param {BattleState} state
 * @param {boolean} afterEnd
 * @returns {void}
 */
function checkOutcome(state, afterEnd) {
  // A destroyed habitat is a defeat, even if the same resolution reached the goal.
  if (countHabitats(state) < state.habitatStart) {
    state.outcome = 'lost';
    state.lostReason = 'habitat';
    return;
  }

  const hasTrappedBand = state.bands.some((band) => band.id.startsWith('trapped-'));

  if (!state.bands.some((band) => band.side === 'bots')) {
    clearField(state);
    state.outcome = 'won';
    return;
  }

  if (state.goal === 'capture') {
    if (state.objectives.length > 0 && state.objectives.every((o) => o.captured)) {
      state.outcome = 'won';
      return;
    }
  } else if (state.goal === 'rescue') {
    if (hasTrappedBand && !state.bands.some((band) => band.trapped)) {
      state.outcome = 'won';
      return;
    }
  }

  if (!state.bands.some((band) => band.side === 'us' && !band.trapped)) {
    state.outcome = 'lost';
    state.lostReason = 'wiped';
    return;
  }
  if (state.goal === 'rescue' && !hasTrappedBand) {
    state.outcome = 'lost';
    state.lostReason = 'rescue';
    return;
  }
  if (afterEnd && state.turnLimit !== null && state.turn > state.turnLimit) {
    state.outcome = 'lost';
    state.lostReason = 'turns';
  }
}

/**
 * Applies one move to the state in place and settles the outcome. It makes
 * no copy and does not re-make the bots' plans, so the plans it leaves are
 * stale. The game always goes through `applyMove`; this is for search
 * tools (scripts/solve.mjs) that try many thousands of moves on their own
 * copies and never read a plan. If it throws, the state is half changed.
 * @param {BattleState} state
 * @param {Move} move
 * @returns {void}
 */
export function advance(state, move) {
  if (state.outcome !== null) throw new Error('battle is over');

  if (move.kind === 'move') {
    applyBandMove(state, move.band, move.path);
  } else if (move.kind === 'act') {
    applyBandAction(state, move.band, move.action, move.target);
  } else if (move.kind === 'end') {
    runBotPhase(state);
    state.turn += 1;
    for (const band of state.bands) {
      if (band.side !== 'us') continue;
      band.moved = false;
      band.acted = false;
    }
  } else {
    throw new Error('unknown move kind');
  }

  checkOutcome(state, move.kind === 'end');
}

/**
 * Applies one move to a copy of the state. After every successful move,
 * and after the bots' turn, every bot's plan is made afresh, so the plans
 * in a state are always what the bots would do if the turn ended now.
 * @param {BattleState} state
 * @param {Move} move
 * @returns {BattleState}
 */
export function applyMove(state, move) {
  if (state.outcome !== null) throw new Error('battle is over');

  /** @type {BattleState} */
  const next = structuredClone(state);
  next.events = [];
  advance(next, move);
  replan(next);
  return next;
}

/**
 * @param {BattleState} state
 * @param {Level} level
 * @param {Progress} progress
 * @returns {Reward}
 */
export function rewardFor(state, level, progress) {
  const pickups = state.pickupsTaken * 5;
  const objectives = state.objectives.filter((o) => o.captured).length * 5;
  const forest = countForest(state);
  const firstClear = progress.cleared[level.id] ? 0 : level.firstClearSeeds;
  const total = pickups + objectives + forest + firstClear;
  return { pickups, objectives, forest, firstClear, total };
}
