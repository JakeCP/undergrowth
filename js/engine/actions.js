/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').Tile} Tile */
/** @typedef {import('./types.js').Band} Band */
/** @typedef {import('./types.js').BattleState} BattleState */
/** @typedef {import('./types.js').ActionDef} ActionDef */
/** @typedef {import('./types.js').Effect} Effect */

import { DIR_ORDER, DIRS, SHOT_DIR_ORDER, add, eq, inBounds, dirBetween, shotDirBetween } from './grid.js';
import { dig, build, mow, pave, cut, isDeadly, isHabitat, strikeHabitat } from './terrain.js';
import { bandById, occupantAt, damageBand, pushBand } from './band.js';
import { actionsFor, BAND_TYPES } from './units.js';
import { shotLane } from './lanes.js';

/**
 * Whether a bristly band hurts the bot whose strike of this kind hits it:
 * the bots' contact strikes only. A shot is never answered, even one fired
 * from the next tile, and an animal's bite never sets it off.
 * @param {Effect} effect
 * @returns {boolean}
 */
export function answeredByBristle(effect) {
  return effect === 'mow' || effect === 'saw' || effect === 'pave' || effect === 'crush';
}

/**
 * @param {Band} band
 * @param {string} actionId
 * @returns {ActionDef|undefined}
 */
export function findAction(band, actionId) {
  return actionsFor(band.type, band.maxLen).find((a) => a.id === actionId);
}

/**
 * The cells an action may be made from: the head, and for a `fromTail`
 * action the band's last cell too.
 * @param {Band} band
 * @param {ActionDef} action
 * @returns {Pos[]}
 */
export function actionOrigins(band, action) {
  const head = band.cells[0];
  const tail = band.cells[band.cells.length - 1];
  if (action.fromTail === true && band.cells.length > 1) return [head, tail];
  return [head];
}

/**
 * The cell of the band an action on `target` is made from: the head if it
 * can reach `target` from there, otherwise the tail.
 * @param {Band} band
 * @param {ActionDef} action
 * @param {Pos} target
 * @returns {Pos}
 */
function originFor(band, action, target) {
  const origins = actionOrigins(band, action);
  const inLine = (/** @type {Pos} */ o) => {
    const dx = Math.abs(target[0] - o[0]);
    const dy = Math.abs(target[1] - o[1]);
    const dist = dx + dy;
    return (dx === 0 || dy === 0) && dist >= action.minRange && dist <= action.maxRange;
  };
  return origins.find(inLine) ?? origins[0];
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @param {string} actionId
 * @returns {Pos[]}
 */
export function actionTargets(state, bandId, actionId) {
  /** @type {Pos[]} */
  const result = [];
  const band = bandById(state, bandId);
  if (band === undefined || band.cells.length === 0) return result;
  const action = findAction(band, actionId);
  if (action === undefined) return result;
  for (const origin of actionOrigins(band, action)) {
    for (const pos of targetsFrom(state, band, action, origin)) {
      if (!result.some((p) => eq(p, pos))) result.push(pos);
    }
  }
  return result;
}

/**
 * The targets of `action` made from the band cell `head`.
 * @param {BattleState} state
 * @param {Band} band
 * @param {ActionDef} action
 * @param {Pos} head
 * @returns {Pos[]}
 */
function targetsFrom(state, band, action, head) {
  /** @type {Pos[]} */
  const result = [];
  for (const dir of DIR_ORDER) {
    const d = DIRS[dir];
    for (let dist = action.minRange; dist <= action.maxRange; dist += 1) {
      /** @type {Pos} */
      const offset = [d[0] * dist, d[1] * dist];
      const pos = add(head, offset);
      if (!inBounds(state, pos)) continue;
      const tile = state.tiles[pos[1]][pos[0]];
      if (action.effect === 'dig') {
        if (dig(tile) === null) continue;
        if (occupantAt(state, pos) !== undefined) continue;
        if (state.objectives.some((o) => eq(o.at, pos))) continue;
        if (state.pickups.some((p) => eq(p, pos))) continue;
      } else if (action.effect === 'build') {
        if (build(tile) === null) continue;
        if (occupantAt(state, pos) !== undefined) continue;
      } else if (action.effect === 'attack' && action.pattern === 'single') {
        const occupant = occupantAt(state, pos);
        if (occupant === undefined) continue;
        if (occupant.side === band.side) continue;
      }
      result.push(pos);
    }
  }
  return result;
}

/**
 * @param {BattleState} state
 * @param {Pos} at
 * @param {(tile: Tile) => Tile|null} transform
 * @param {string} cause
 * @returns {void}
 */
function applyTransform(state, at, transform, cause) {
  if (!inBounds(state, at)) return;
  const tile = state.tiles[at[1]][at[0]];
  const next = transform(tile);
  if (next === null) return;
  state.tiles[at[1]][at[0]] = next;
  /** @type {Pos} */
  const atCopy = [at[0], at[1]];
  state.events.push({ kind: 'terrain', at: atCopy, from: tile.kind, to: next.kind, cause });
  const occupant = occupantAt(state, at);
  if (occupant !== undefined) {
    const flies = BAND_TYPES[occupant.type].flies;
    if (isDeadly(next, flies)) {
      const occupantId = occupant.id;
      const remaining = occupant.cells.length;
      damageBand(state, occupantId, remaining);
      state.events.push({
        kind: 'push',
        outcome: { kind: 'falls', band: occupantId, at: [atCopy[0], atCopy[1]], cause: 'terrain' },
      });
    }
  }
}

/**
 * Emits an 'action' event, then the action's effects.
 * @param {BattleState} state
 * @param {Band} band
 * @param {ActionDef} action
 * @param {Pos} target
 * @returns {void}
 */
export function resolveAction(state, band, action, target) {
  if (band.cells.length === 0) return;
  const from = originFor(band, action, target);
  state.events.push({
    kind: 'action',
    actor: band.id,
    actionId: action.id,
    from: [from[0], from[1]],
    target: [target[0], target[1]],
  });

  if (action.effect === 'dig') {
    applyTransform(state, target, dig, action.id);
    return;
  }
  if (action.effect === 'build') {
    applyTransform(state, target, build, action.id);
    return;
  }
  if (action.effect === 'shot') {
    // A shot hits the band at `target` only if that is where its lane
    // stops (see lanes.js), along one of the shooter's own directions.
    // It never changes terrain.
    const dir = shotDirBetween(band.cells[0], target);
    if (dir === null || !SHOT_DIR_ORDER.slice(0, action.dirs ?? 4).includes(dir)) return;
    const { hit } = shotLane(state, band, action, dir);
    const occupant = hit !== null && eq(hit, target) ? occupantAt(state, target) : undefined;
    if (occupant !== undefined) damageBand(state, occupant.id, action.damage);
    return;
  }
  if (action.effect === 'mow' || action.effect === 'saw' || action.effect === 'pave' || action.effect === 'crush') {
    // A strike on a band hits the band only. The tile under it is
    // untouched, so a band on a den shields it and a dam under a band
    // holds. Terrain is struck only when nobody stands on it, and a
    // crush never strikes terrain.
    const occupant = occupantAt(state, target);
    if (occupant !== undefined) {
      // Bristle: a bot that strikes a bristly band is hurt by it, even
      // when the strike wipes the band out.
      const bristle = BAND_TYPES[occupant.type].bristle ?? 0;
      damageBand(state, occupant.id, action.damage);
      if (answeredByBristle(action.effect) && bristle > 0 && bandById(state, band.id) !== undefined) {
        damageBand(state, band.id, bristle);
      }
      return;
    }
    if (action.effect === 'crush') return;
    applyTransform(state, target, (tile) => {
      if (isHabitat(tile)) return strikeHabitat(tile);
      if (tile.kind === 'dam') return cut(tile);
      if (action.effect === 'mow') return mow(tile);
      if (action.effect === 'pave') return pave(tile);
      return null;
    }, action.id);
    return;
  }

  // attack
  const head = band.cells[0];

  if (action.pattern === 'line3') {
    const dir = dirBetween(head, target);
    if (dir === null) return;
    /** @type {string[]} */
    const ids = [];
    /** @type {Pos} */
    let pos = [target[0], target[1]];
    for (let i = 0; i < 3; i += 1) {
      if (inBounds(state, pos)) {
        const occupant = occupantAt(state, pos);
        if (occupant !== undefined && !ids.includes(occupant.id)) {
          ids.push(occupant.id);
        }
      }
      pos = add(pos, DIRS[dir]);
    }
    for (const id of ids) {
      damageBand(state, id, action.damage);
    }
    return;
  }

  const occupant = occupantAt(state, target);
  if (occupant === undefined) return;
  const occupantId = occupant.id;
  damageBand(state, occupantId, action.damage);
  if (action.push > 0 && bandById(state, occupantId) !== undefined) {
    const dir = dirBetween(head, target);
    if (dir !== null) pushBand(state, occupantId, dir);
  }
}
