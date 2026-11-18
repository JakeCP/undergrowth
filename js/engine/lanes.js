// Shots, and the cover rule. A shot travels from the shooter's head along
// a row, a column or (for a shooter whose action has `dirs: 8`) a diagonal,
// and stops at the first solid thing on that lane: a tree, a stone, a
// den, or any body (the shooter's own included). If that body is one of
// the player's bands, free and far enough off, the band is hit; otherwise
// nothing is. Water, holes, dams, paving, stubble and open ground do not
// stop a shot. A diagonal shot looks only at the tiles on its lane, so two
// stones touching corner to corner beside it do not close it. Choosing a
// shot (bots.js) and resolving it (actions.js) both walk the lane here, so
// a shown plan and the real turn cannot disagree.

/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').ShotDir} ShotDir */
/** @typedef {import('./types.js').Tile} Tile */
/** @typedef {import('./types.js').Band} Band */
/** @typedef {import('./types.js').ActionDef} ActionDef */
/** @typedef {import('./types.js').BattleState} BattleState */
// `stop`: the tile the shot stops on, or null when it leaves the board or runs out of range.
// `hit`: that tile when the shot hurts the band on it, else null.
/** @typedef {{stop: Pos|null, hit: Pos|null}} Lane */

import { SHOT_DIR_ORDER, SHOT_DIRS, add, inBounds } from './grid.js';
import { occupantAt } from './band.js';

/**
 * Terrain a shot cannot pass: trees, stones and dens, whoever stands there.
 * @param {Tile} tile
 * @returns {boolean}
 */
export function stopsShot(tile) {
  return tile.kind === 'forest' || tile.kind === 'stones' || tile.kind === 'habitat' || tile.kind === 'habitatDamaged';
}

/**
 * Where a shot from the shooter's head in `dir` stops, and what it hits.
 * @param {BattleState} state
 * @param {Band} shooter
 * @param {ActionDef} action
 * @param {ShotDir} dir
 * @returns {Lane}
 */
export function shotLane(state, shooter, action, dir) {
  let pos = shooter.cells[0];
  for (let dist = 1; dist <= action.maxRange; dist += 1) {
    pos = add(pos, SHOT_DIRS[dir]);
    if (!inBounds(state, pos)) return { stop: null, hit: null };
    /** @type {Pos} */
    const at = [pos[0], pos[1]];
    if (stopsShot(state.tiles[pos[1]][pos[0]])) return { stop: at, hit: null };
    const occupant = occupantAt(state, pos);
    if (occupant !== undefined) {
      const hits = occupant.side === 'us' && !occupant.trapped && dist >= action.minRange;
      return { stop: at, hit: hits ? [pos[0], pos[1]] : null };
    }
  }
  return { stop: null, hit: null };
}

/**
 * Every band cell a shot can hit from the shooter's head: one entry per
 * direction whose lane hits, in SHOT_DIR_ORDER, trying the first
 * `action.dirs` of them (4 unless it says 8). `dist` counts the lane's
 * steps, so a diagonal step is one.
 * @param {BattleState} state
 * @param {Band} shooter
 * @param {ActionDef} action
 * @returns {Array<{at: Pos, dir: ShotDir, dist: number}>}
 */
export function shotTargets(state, shooter, action) {
  /** @type {Array<{at: Pos, dir: ShotDir, dist: number}>} */
  const result = [];
  if (shooter.cells.length === 0) return result;
  const head = shooter.cells[0];
  for (const dir of SHOT_DIR_ORDER.slice(0, action.dirs ?? 4)) {
    const { hit } = shotLane(state, shooter, action, dir);
    if (hit === null) continue;
    const dist = Math.max(Math.abs(hit[0] - head[0]), Math.abs(hit[1] - head[1]));
    result.push({ at: hit, dir, dist });
  }
  return result;
}
