// The earthworks trial rules: the animals that reshape the ground get more
// of it to work with. Each is off unless a level (or the lab) turns it on.
//
// - beaverGnaw: the beaver's Gnaw, aimed at a dam next to its head, brings
//   down the whole bridge: that dam and every dam joined to it along a row
//   or column fall back into the water or hole under each. A band on foot
//   whose head was on a fallen tile drowns; one whose body was on it keeps
//   its cells from the head up to the first fallen one and loses the rest,
//   cut off. Bots and animals alike, the beaver's own body too, but a
//   beaver is never offered the bridge its own head stands on.
// - bearShovesStones: the bear's Shove may aim at stones next to it. The
//   stone moves one tile straight on, onto open ground, stubble or paving
//   with no band, objective or seed on it; or into water or a hole with no
//   band over it, which it fills as a ford (walkable for everyone). The
//   tile it left is open ground. Anywhere else it does not move, and the
//   stone is not offered as a target.
// - badgerEarthworks: the badger may Fill a hole next to its head, with no
//   band over it, into open ground; and its Dig levels an earth bank to
//   open ground (without the rule an earth bank is never dug).

/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').Tile} Tile */
/** @typedef {import('./types.js').Band} Band */
/** @typedef {import('./types.js').BattleState} BattleState */

import { DIR_ORDER, DIRS, add, eq, inBounds, key } from './grid.js';
import { stoneLands } from './terrain.js';
import { occupantAt, damageBand } from './band.js';
import { BAND_TYPES } from './units.js';

/**
 * Whether the trial rule `beaverGnaw` is on.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function gnawOn(state) {
  return state.rules?.beaverGnaw === true;
}

/**
 * Whether the trial rule `bearShovesStones` is on.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function stoneShoveOn(state) {
  return state.rules?.bearShovesStones === true;
}

/**
 * Whether the trial rule `badgerEarthworks` is on.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function earthworksOn(state) {
  return state.rules?.badgerEarthworks === true;
}

/**
 * The bridge the dam at `at` is part of: it and every dam joined to it
 * along rows and columns, `at` first, then outward in N, E, S, W order.
 * Empty when `at` is no dam.
 * @param {BattleState} state
 * @param {Pos} at
 * @returns {Pos[]}
 */
export function bridgeAt(state, at) {
  if (!inBounds(state, at) || state.tiles[at[1]][at[0]].kind !== 'dam') return [];
  /** @type {Pos[]} */
  const out = [[at[0], at[1]]];
  const seen = new Set([key(at)]);
  for (let i = 0; i < out.length; i += 1) {
    for (const dir of DIR_ORDER) {
      const p = add(out[i], DIRS[dir]);
      if (seen.has(key(p)) || !inBounds(state, p)) continue;
      if (state.tiles[p[1]][p[0]].kind !== 'dam') continue;
      seen.add(key(p));
      out.push(p);
    }
  }
  return out;
}

/**
 * Whether the gnawing band may aim at the dam at `at`: it is a dam, and
 * its bridge is not the one the band's own head stands on.
 * @param {BattleState} state
 * @param {Band} band
 * @param {Pos} at
 * @returns {boolean}
 */
export function canGnaw(state, band, at) {
  const bridge = bridgeAt(state, at);
  if (bridge.length === 0) return false;
  return !bridge.some((p) => eq(p, band.cells[0]));
}

/**
 * Gnaw: the bridge at `at` falls. Every tile goes back to what was under
 * it, one terrain event each, in `bridgeAt` order; then every band on
 * foot with a cell on it, in band order, drowns (its head was there: a
 * `damage` that wipes it and a `falls` push) or is cut off (it loses
 * every cell from the first fallen one to its tail: a `damage` with
 * cause 'bridge'). Fliers are not touched.
 * @param {BattleState} state
 * @param {Pos} at
 * @param {string} cause  the action id, for the terrain events
 * @returns {void}
 */
export function gnawBridge(state, at, cause) {
  const bridge = bridgeAt(state, at);
  if (bridge.length === 0) return;
  const fallen = new Set(bridge.map(key));
  for (const p of bridge) {
    const tile = state.tiles[p[1]][p[0]];
    const under = tile.under ?? 'water';
    state.tiles[p[1]][p[0]] = { kind: under, variant: null, under: null };
    state.events.push({ kind: 'terrain', at: [p[0], p[1]], from: 'dam', to: under, cause });
  }
  const struck = state.bands.filter((b) => !BAND_TYPES[b.type].flies && b.cells.some((c) => fallen.has(key(c))));
  for (const band of struck) {
    const first = band.cells.findIndex((c) => fallen.has(key(c)));
    if (first < 0) continue;
    if (first === 0) {
      /** @type {Pos} */
      const head = [band.cells[0][0], band.cells[0][1]];
      damageBand(state, band.id, band.cells.length);
      state.events.push({ kind: 'push', outcome: { kind: 'falls', band: band.id, at: head, cause: 'terrain' } });
      continue;
    }
    damageBand(state, band.id, band.cells.length - first);
    const last = state.events[state.events.length - 1];
    if (last !== undefined && last.kind === 'damage' && last.band === band.id) last.cause = 'bridge';
  }
}

/**
 * Where the stone at `at` goes when shoved from `from`, and how: the tile
 * one beyond it, straight on, and whether it 'rolls' there or 'fills' it.
 * Null when the shove would not move it: `at` is no stone, `from` is not
 * next to it, or the tile beyond is off the board, terrain it cannot take
 * (stoneLands), under a band, or holds an objective or a seed pickup.
 * @param {BattleState} state
 * @param {Pos} from
 * @param {Pos} at
 * @returns {{to: Pos, how: 'rolls'|'fills'}|null}
 */
export function stoneShove(state, from, at) {
  if (!inBounds(state, at) || state.tiles[at[1]][at[0]].kind !== 'stones') return null;
  const dx = at[0] - from[0];
  const dy = at[1] - from[1];
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  /** @type {Pos} */
  const to = [at[0] + dx, at[1] + dy];
  if (!inBounds(state, to)) return null;
  const how = stoneLands(state.tiles[to[1]][to[0]]);
  if (how === null) return null;
  if (occupantAt(state, to) !== undefined) return null;
  if (state.objectives.some((o) => eq(o.at, to))) return null;
  if (state.pickups.some((p) => eq(p, to))) return null;
  return { to, how };
}

/**
 * The bear's shove on a stone: the stone's tile becomes open ground and
 * the tile beyond takes the stone, or becomes a ford over what it was.
 * One terrain event each, the stone's tile first. Nothing happens when
 * the stone cannot move (stoneShove).
 * @param {BattleState} state
 * @param {Pos} from
 * @param {Pos} at
 * @param {string} cause  the action id, for the terrain events
 * @returns {void}
 */
export function shoveStone(state, from, at, cause) {
  const shove = stoneShove(state, from, at);
  if (shove === null) return;
  const { to, how } = shove;
  state.tiles[at[1]][at[0]] = { kind: 'open', variant: 'grass', under: null };
  state.events.push({ kind: 'terrain', at: [at[0], at[1]], from: 'stones', to: 'open', cause });
  const was = state.tiles[to[1]][to[0]];
  /** @type {Tile} */
  const next = how === 'fills'
    ? { kind: 'ford', variant: null, under: was.kind === 'hole' ? 'hole' : 'water' }
    : { kind: 'stones', variant: null, under: null };
  state.tiles[to[1]][to[0]] = next;
  state.events.push({ kind: 'terrain', at: [to[0], to[1]], from: was.kind, to: next.kind, cause });
}
