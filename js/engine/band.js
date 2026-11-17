/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').Dir} Dir */
/** @typedef {import('./types.js').Band} Band */
/** @typedef {import('./types.js').Plan} Plan */
/** @typedef {import('./types.js').BattleState} BattleState */
/** @typedef {import('./types.js').PushOutcome} PushOutcome */

import { DIR_ORDER, DIRS, add, eq, key, inBounds } from './grid.js';
import { canEnter, isDeadly } from './terrain.js';
import { BAND_TYPES } from './units.js';

/**
 * @param {BattleState} state
 * @param {string} id
 * @returns {Band|undefined}
 */
export function bandById(state, id) {
  return state.bands.find((b) => b.id === id);
}

/**
 * @param {BattleState} state
 * @param {Pos} p
 * @returns {Band|undefined}
 */
export function occupantAt(state, p) {
  return state.bands.find((b) => b.cells.some((c) => eq(c, p)));
}

/**
 * @param {BattleState} state
 * @param {Band} band
 * @param {Pos} p
 * @returns {boolean}
 */
export function canStep(state, band, p) {
  if (!inBounds(state, p)) return false;
  const tile = state.tiles[p[1]][p[0]];
  const flies = BAND_TYPES[band.type].flies;
  if (!canEnter(tile, band.side, flies)) return false;
  const occupant = occupantAt(state, p);
  return occupant === undefined || occupant.id === band.id;
}

/**
 * Whether the band may walk through tiles other bands stand on: an animal
 * band whose type has `passThrough` (the bees). Bots never do.
 * @param {Band} band
 * @returns {boolean}
 */
export function passesThrough(band) {
  return band.side === 'us' && BAND_TYPES[band.type].passThrough === true;
}

/**
 * Whether the band may step onto `p` on the way, not necessarily stopping
 * there: `canStep`, except that a band that passes through ignores who
 * stands on the tile. Terrain blocks it all the same.
 * @param {BattleState} state
 * @param {Band} band
 * @param {Pos} p
 * @returns {boolean}
 */
export function canPass(state, band, p) {
  if (!passesThrough(band)) return canStep(state, band, p);
  if (!inBounds(state, p)) return false;
  return canEnter(state.tiles[p[1]][p[0]], band.side, BAND_TYPES[band.type].flies);
}

/**
 * The band's cells after its leader walks `path`.
 * @param {Band} band
 * @param {Pos[]} path
 * @returns {Pos[]}
 */
export function cellsAfter(band, path) {
  let cells = band.cells;
  for (const p of path) cells = stepBand({ ...band, cells, plan: null }, p).cells;
  return cells;
}

/**
 * Whether every cell the band would have after walking `path` is free of
 * other bands. Always so for a band that cannot pass through, since it
 * only ever steps onto free tiles and its own.
 * @param {BattleState} state
 * @param {Band} band
 * @param {Pos[]} path
 * @returns {boolean}
 */
export function landsClear(state, band, path) {
  return cellsAfter(band, path).every((cell) => {
    const occupant = occupantAt(state, cell);
    return occupant === undefined || occupant.id === band.id;
  });
}

/**
 * Whether the band's leader may walk `path`, by the band's own movement
 * rules: one orthogonal step at a time, each one a tile it may pass, at
 * most `steps` steps (default its type's speed), ending with every cell
 * on free ground. The same rule `reachable` and `applyMove` use.
 * @param {BattleState} state
 * @param {Band} band
 * @param {Pos[]} path
 * @param {number} [steps]
 * @returns {boolean}
 */
export function canWalk(state, band, path, steps) {
  if (band.cells.length === 0 || path.length === 0) return false;
  if (path.length > (steps ?? BAND_TYPES[band.type].speed)) return false;
  let prev = band.cells[0];
  for (const p of path) {
    if (Math.abs(prev[0] - p[0]) + Math.abs(prev[1] - p[1]) !== 1) return false;
    if (!canPass(state, band, p)) return false;
    prev = p;
  }
  return landsClear(state, band, path);
}

/**
 * @param {Plan|null} plan
 * @returns {Plan|null}
 */
export function copyPlan(plan) {
  if (plan === null) return null;
  return {
    path: plan.path.map((c) => /** @type {Pos} */ ([c[0], c[1]])),
    strike: plan.strike === null ? null : [plan.strike[0], plan.strike[1]],
    actionId: plan.actionId,
  };
}

/**
 * @param {Band} band
 * @param {Pos} p
 * @returns {Band}
 */
export function stepBand(band, p) {
  /** @type {Pos} */
  const head = [p[0], p[1]];
  const body = band.cells
    .filter((c) => !eq(c, p))
    .map((c) => /** @type {Pos} */ ([c[0], c[1]]));
  return {
    ...band,
    cells: [head, ...body].slice(0, band.maxLen),
    plan: copyPlan(band.plan),
  };
}

/**
 * Every tile the band's leader can walk to, with the path there. `steps`
 * defaults to the band type's speed. Each path is the shortest the band
 * may walk (see canWalk), the first in N, E, S, W order among equals.
 * @param {BattleState} state
 * @param {string} bandId
 * @param {number} [steps]
 * @returns {Map<string, Pos[]>}
 */
export function reachable(state, bandId, steps) {
  /** @type {Map<string, Pos[]>} */
  const result = new Map();
  const band = bandById(state, bandId);
  if (band === undefined || band.cells.length === 0) return result;
  const speed = steps ?? BAND_TYPES[band.type].speed;
  if (passesThrough(band)) return reachableThrough(state, band, speed);
  const start = band.cells[0];
  const visited = new Set([key(start)]);
  /** @type {Array<{pos: Pos, path: Pos[]}>} */
  const queue = [{ pos: start, path: [] }];
  let index = 0;
  while (index < queue.length) {
    const current = queue[index];
    index += 1;
    if (current.path.length >= speed) continue;
    for (const dir of DIR_ORDER) {
      const next = add(current.pos, DIRS[dir]);
      const k = key(next);
      if (visited.has(k)) continue;
      if (!canStep(state, band, next)) continue;
      visited.add(k);
      const path = [...current.path, next];
      result.set(k, path);
      queue.push({ pos: next, path });
    }
  }
  return result;
}

/**
 * `reachable` for a band that passes through other bands. Whether a walk
 * may end on a tile depends on the route (the body is left on the tile
 * before last), so every route that visits no tile twice is tried,
 * shorter first and in N, E, S, W order, and the first that lands clear
 * gives each tile its path. Speeds are small, so the routes are few.
 * @param {BattleState} state
 * @param {Band} band
 * @param {number} speed
 * @returns {Map<string, Pos[]>}
 */
function reachableThrough(state, band, speed) {
  /** @type {Map<string, Pos[]>} */
  const result = new Map();
  const start = band.cells[0];
  /** @type {Pos[][]} */
  let layer = [[]];
  for (let length = 1; length <= speed && layer.length > 0; length += 1) {
    /** @type {Pos[][]} */
    const next = [];
    for (const path of layer) {
      const here = path.length === 0 ? start : path[path.length - 1];
      for (const dir of DIR_ORDER) {
        const p = add(here, DIRS[dir]);
        if (eq(p, start) || path.some((c) => eq(c, p))) continue;
        if (!canPass(state, band, p)) continue;
        const longer = [...path, p];
        next.push(longer);
        const k = key(p);
        if (!result.has(k) && landsClear(state, band, longer)) result.set(k, longer);
      }
    }
    layer = next;
  }
  return result;
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @param {number} amount
 * @returns {void}
 */
export function damageBand(state, bandId, amount) {
  if (amount <= 0) return;
  const band = bandById(state, bandId);
  if (band === undefined) return;
  const wiped = amount >= band.cells.length;
  // The tail cells this hit removes, tail end first.
  const cells = band.cells
    .slice(wiped ? 0 : band.cells.length - amount)
    .reverse()
    .map((c) => /** @type {Pos} */ ([c[0], c[1]]));
  if (wiped) {
    const idx = state.bands.indexOf(band);
    if (idx >= 0) state.bands.splice(idx, 1);
  } else {
    band.cells = band.cells.slice(0, band.cells.length - amount);
  }
  state.events.push({ kind: 'damage', band: bandId, amount, wiped, cells });
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @param {Dir} dir
 * @returns {PushOutcome}
 */
export function pushBand(state, bandId, dir) {
  const band = bandById(state, bandId);
  if (band === undefined || band.cells.length === 0) {
    throw new Error(`pushBand: no such band "${bandId}"`);
  }
  const head = band.cells[0];
  const dest = add(head, DIRS[dir]);
  const flies = BAND_TYPES[band.type].flies;
  const destInBounds = inBounds(state, dest);

  if (destInBounds) {
    const tile = state.tiles[dest[1]][dest[0]];
    if (isDeadly(tile, flies)) {
      /** @type {PushOutcome} */
      const outcome = { kind: 'falls', band: bandId, at: [dest[0], dest[1]] };
      damageBand(state, bandId, band.cells.length);
      state.events.push({ kind: 'push', outcome });
      return outcome;
    }
  }

  /** @type {Band|undefined} */
  let other;
  if (destInBounds) {
    const occupant = occupantAt(state, dest);
    if (occupant !== undefined && occupant.id !== bandId) other = occupant;
  }

  let blocked;
  if (!destInBounds) {
    blocked = true;
  } else if (other !== undefined) {
    blocked = true;
  } else {
    const tile = state.tiles[dest[1]][dest[0]];
    blocked = !canEnter(tile, band.side, flies);
  }

  if (blocked) {
    /** @type {PushOutcome} */
    const outcome = {
      kind: 'bumped',
      band: bandId,
      other: other !== undefined ? other.id : null,
    };
    const otherId = other !== undefined ? other.id : null;
    damageBand(state, bandId, 1);
    if (otherId !== null) damageBand(state, otherId, 1);
    state.events.push({ kind: 'push', outcome });
    return outcome;
  }

  const lengthBefore = band.cells.length;
  /** @type {Pos} */
  const destCopy = [dest[0], dest[1]];
  const body = band.cells
    .filter((c) => !eq(c, dest))
    .map((c) => /** @type {Pos} */ ([c[0], c[1]]));
  band.cells = [destCopy, ...body].slice(0, lengthBefore);
  /** @type {PushOutcome} */
  const outcome = { kind: 'moved', band: bandId, to: destCopy };
  state.events.push({ kind: 'push', outcome });
  return outcome;
}
