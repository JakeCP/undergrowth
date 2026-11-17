/** @typedef {import('../js/engine/types.js').Pos} Pos */
/** @typedef {import('../js/engine/types.js').Side} Side */
/** @typedef {import('../js/engine/types.js').Plan} Plan */
/** @typedef {import('../js/engine/types.js').Band} Band */
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */
/** @typedef {{id: string, type: string, cells: Pos[], side?: Side, maxLen?: number, moved?: boolean, acted?: boolean, trapped?: boolean, plan?: Plan|null, fresh?: boolean}} BandInput */

import { parseGrid } from '../js/engine/battle.js';
import { BAND_TYPES } from '../js/engine/units.js';
import { newProgress } from '../js/campaign/progress.js';

/**
 * A band's plan from its input, copied so a test can reuse its input.
 * @param {BandInput} b
 * @returns {Plan|null}
 */
function planFrom(b) {
  if (b.plan) {
    return {
      path: b.plan.path.map((c) => /** @type {Pos} */ ([c[0], c[1]])),
      strike: b.plan.strike === null ? null : [b.plan.strike[0], b.plan.strike[1]],
      actionId: b.plan.actionId,
    };
  }
  return null;
}

/**
 * @param {string[]} grid
 * @param {BandInput[]} bands
 * @param {Partial<BattleState>} [extra]
 * @returns {BattleState}
 */
export function makeState(grid, bands, extra = {}) {
  const { width, height, tiles, objectives, pickups } = parseGrid(grid);
  let forestStart = 0;
  let habitatStart = 0;
  for (const row of tiles) {
    for (const tile of row) {
      if (tile.kind === 'forest') forestStart += 1;
      if (tile.kind === 'habitat' || tile.kind === 'habitatDamaged') habitatStart += 1;
    }
  }
  /** @type {Band[]} */
  // An animal band is `fresh` unless the test says otherwise: it grows on
  // any tile until it is whole or hit, as a band out of camp does.
  const stateBands = bands.map((b) => ({
    id: b.id,
    type: b.type,
    side: b.side ?? BAND_TYPES[b.type].side,
    fresh: b.fresh ?? (b.side ?? BAND_TYPES[b.type].side) === 'us',
    cells: b.cells.map((c) => /** @type {Pos} */ ([c[0], c[1]])),
    maxLen: b.maxLen ?? b.cells.length,
    moved: b.moved ?? false,
    acted: b.acted ?? false,
    trapped: b.trapped ?? false,
    plan: planFrom(b),
  }));
  return {
    levelId: 'test',
    width,
    height,
    tiles,
    bands: stateBands,
    pickups: pickups.map((p) => /** @type {Pos} */ ([p[0], p[1]])),
    objectives: objectives.map((o) => ({
      at: /** @type {Pos} */ ([o.at[0], o.at[1]]),
      kind: o.kind,
      captured: o.captured,
    })),
    goal: 'capture',
    turn: 1,
    turnLimit: null,
    forestStart,
    habitatStart,
    pickupsTaken: 0,
    outcome: null,
    lostReason: null,
    events: [],
    ...extra,
  };
}

/**
 * A save that owns the ants, the badger and the beaver at their starting
 * sizes as well as the fox and the hedgehog: what a save from before the
 * opening act loads as, and what the valley levels' recorded lines deploy.
 * A new game has only the fox and the hedgehog.
 * @returns {import('../js/campaign/progress.js').Progress}
 */
export function valleyProgress() {
  const p = newProgress();
  for (const typeId of ['ants', 'badger', 'beaver']) p.bands[typeId] = { maxLen: BAND_TYPES[typeId].startLen };
  return p;
}

/**
 * A clock for js/ui/blink.js and the shop that only moves when told:
 * `advance(ms)` runs every timer that falls due, in order. `random` walks
 * through the given values, round and round.
 * @param {number[]} [randoms]
 */
export function fakeClock(randoms = [0.5]) {
  let now = 0;
  let next = 0;
  let id = 0;
  /** @type {Map<number, {at: number, fn: () => void}>} */
  const timers = new Map();
  return {
    now: () => now,
    random: () => {
      const r = randoms[next % randoms.length];
      next += 1;
      return r;
    },
    setTimer(/** @type {() => void} */ fn, /** @type {number} */ ms) {
      id += 1;
      timers.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimer(/** @type {unknown} */ timer) {
      timers.delete(/** @type {number} */ (timer));
    },
    /** @param {number} ms */
    advance(ms) {
      const until = now + ms;
      for (;;) {
        let due = null;
        for (const [k, t] of timers) if (t.at <= until && (due === null || t.at < due[1].at)) due = [k, t];
        if (due === null) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    pending: () => timers.size,
  };
}
