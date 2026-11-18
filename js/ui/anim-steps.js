// Engine events -> animation steps (look-and-motion spec, "Motion").
//
// This module is pure: no DOM, no clock. It turns the `events` of one
// engine move into a list of timed steps that say what animates, on which
// band or tile, when it starts and how long it lasts. The view plays the
// steps on top of the drawing from before the move and swaps to the new
// state at `sequenceEnd(steps)`.
//
// Order: steps are listed in the engine's event order (`step.event` is the
// index of the event a step came from) and start times never go backwards
// along the list. Animation never reorders what the engine did.
//
// Layers: `hit` and `pop` are reactions meant to play on top of whatever
// else a band is doing (a shoved band shakes while it slides). The steps
// that move a whole band (glide, lunge, slide, jolt, fall, scatter) never
// overlap on the same band.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').PushOutcome} PushOutcome */
/** @typedef {import('../campaign/progress.js').BotSpeed} BotSpeed */

/** A bot's plan, as in the engine contract (`Band['plan']`). */
/** @typedef {{path: Pos[], strike: Pos|null, actionId: string|null}|null} Plan */

/**
 * The engine events this module reads, in the shapes of the engine
 * contract. Terrain kinds are plain strings here so the habitat kinds
 * need no change to this file.
 * @typedef {{kind: 'move', band: string, path: Pos[], grow?: boolean[]}
 *   | {kind: 'action', actor: string, actionId: string, from: Pos, target: Pos}
 *   | {kind: 'damage', band: string, amount: number, wiped: boolean, cells: Pos[]}
 *   | {kind: 'terrain', at: Pos, from: string, to: string, cause: string}
 *   | {kind: 'push', outcome: PushOutcome}
 *   | {kind: 'capture', at: Pos}
 *   | {kind: 'pickup', at: Pos}
 *   | {kind: 'freed', band: string}
 *   | {kind: 'plan', band: string, plan: Plan}} AnimEvent
 */

/**
 * When a step plays: `start` and `duration` in milliseconds from the start
 * of the sequence, and `event`, the index of the engine event behind it.
 * @typedef {{start: number, duration: number, event: number}} StepTime
 */

/**
 * One animation. Every step names the band it animates (`band`), the tile
 * it animates or aims at (`at`), or both.
 *
 * - glide: the head walks `path` tile by tile and the body tokens follow
 *   (see `glideFrames`).
 * - lunge: `band` darts from `origin` toward the tile `at` and back.
 * - sweep: `band`'s blade sweeps across the tile `at`.
 * - dirt: a dirt burst on the tile `at`, thrown up by `band`.
 * - hit: `band` shakes and flashes.
 * - pop: the token of `band` on the cell `at` pops off and fades.
 * - scatter: all of `band`'s tokens (on `cells`) scatter and fade.
 * - sink / drop / topple / spread / crack / crumble / swap: the tile `at`
 *   changes from terrain `from` to terrain `to`: it sinks into a hole, a
 *   dam drops in with a bounce, a tree tips over, a slab spreads, a
 *   habitat cracks, a habitat or dam crumbles, or (swap) it just changes.
 * - slide: `band` is pushed and its head slides to the tile `at`.
 * - jolt: `band` is pushed in direction `dir` but is blocked (by band
 *   `other`, or by terrain or the edge when null) and bounces back.
 * - fall: `band` drops into the water or hole on the tile `at` and fades.
 * - splash: a splash ring on the tile `at`.
 * - callout: the words `text` appear over the tile `at`.
 * - collect: the pickup or objective on the tile `at` is taken.
 * - freed: the trapped `band` is set free.
 * - plan: `band`'s plan line and strike mark change to `plan`.
 * - fade: under reduced motion or instant bot speed, `band` or the tile
 *   `at` cross-fades to its new state.
 * @typedef {StepTime & (
 *     {kind: 'glide', band: string, at: null, path: Pos[], grow?: boolean[]}
 *   | {kind: 'lunge'|'sweep'|'dirt', band: string, at: Pos, origin: Pos}
 *   | {kind: 'hit', band: string, at: null}
 *   | {kind: 'pop', band: string, at: Pos}
 *   | {kind: 'scatter', band: string, at: null, cells: Pos[]}
 *   | {kind: 'sink'|'drop'|'topple'|'spread'|'crack'|'crumble'|'swap', band: null, at: Pos, from: string, to: string}
 *   | {kind: 'slide', band: string, at: Pos}
 *   | {kind: 'jolt', band: string, at: null, other: string|null, dir: Pos|null}
 *   | {kind: 'fall', band: string, at: Pos, into: 'water'|'hole'}
 *   | {kind: 'splash', band: null, at: Pos}
 *   | {kind: 'callout', band: null, at: Pos, text: string}
 *   | {kind: 'collect', band: null, at: Pos, what: 'pickup'|'capture'}
 *   | {kind: 'freed', band: string, at: null}
 *   | {kind: 'plan', band: string, at: null, plan: Plan}
 *   | {kind: 'fade', band: string|null, at: Pos|null}
 * )} AnimStep
 */

/**
 * @typedef {object} AnimOptions
 * @property {'player'|'bots'} [turn] whose events these are. The bots'
 *   turn (the events of an end-turn move) is fitted into the time budget
 *   and follows the bot speed setting. Default 'player'.
 * @property {BotSpeed} [speed] the saved bot speed. Only the bots' turn
 *   uses it. Default 'normal'.
 * @property {boolean} [reducedMotion] true under prefers-reduced-motion:
 *   every animation becomes a quick fade and nothing is played in sequence.
 * @property {(at: Pos) => string|undefined} [tileKind] the terrain kind of
 *   a tile on the board before the move. It tells a fall into water from a
 *   fall into a hole. Without it a fall drops and fades with no splash.
 * @property {boolean} [banner] the bots' turn opens with the turn banner
 *   (js/ui/turn-banner.js): every step starts `BANNER_LEAD_MS` later, and
 *   the time budget covers the banner too. Only the bots' turn uses it,
 *   and not at 'instant' or under reduced motion, where the banner is a
 *   plain line that takes no time. See `bannerSpan`.
 */

/** Step lengths in milliseconds at normal speed. */
export const DURATION = Object.freeze({
  lunge: 280,
  sweep: 280,
  dirt: 240,
  hit: 220,
  pop: 260,
  scatter: 380,
  sink: 260,
  drop: 300,
  topple: 340,
  spread: 300,
  crack: 240,
  crumble: 400,
  swap: 160,
  slide: 170,
  jolt: 190,
  fall: 300,
  splash: 340,
  callout: 400,
  collect: 220,
  freed: 300,
  plan: 150,
});

/** How far through an action's own step its effects land (0 to 1). */
export const IMPACT = Object.freeze({ lunge: 0.4, sweep: 0.5, dirt: 0.3 });

/** The gap between one lost tail token popping off and the next. */
export const POP_STAGGER_MS = 50;

/**
 * The gap between one item of the field sweep and the next: when the last
 * bot falls, the engine takes every pickup, objective and trapped band left
 * on the field, and they go one after another once the bot is gone.
 */
export const SWEEP_STAGGER_MS = 90;

/** The quick fade that replaces every animation under reduced motion. */
export const FADE_MS = 120;

/** The whole bots' turn takes at most this long at normal speed. */
export const BOT_TURN_BUDGET_MS = 1500;

/** The turn banner's share of the bots' turn, at normal speed, before it is fitted. */
export const BANNER_LEAD_MS = 400;

/**
 * What each bot speed does to step times and to the budget. 'instant' has
 * no factor: it plays nothing and shows the result at once.
 */
export const SPEED_FACTOR = Object.freeze({ normal: 1, fast: 0.5 });

export const DEN_DAMAGED_TEXT = 'Den damaged!';
export const DEN_LOST_TEXT = 'Den lost!';

/**
 * How the acting band itself moves for each action id. An action that is
 * not listed lunges; null means the band makes no move of its own.
 * @type {Readonly<Record<string, 'lunge'|'sweep'|'dirt'|null>>}
 */
const ACTION_STEP = Object.freeze({
  dig: 'dirt',
  // The badger's Fill (trial rule badgerEarthworks) throws earth in as a dig throws it out.
  fill: 'dirt',
  build: null,
  mow: 'sweep',
  saw: 'sweep',
  // The new bots' strikes: the lunge reaches a set length toward a target
  // however far off it is (js/ui/motion.js), so a shot reads as one too.
  shoot: 'lunge',
  swing: 'lunge',
  squeeze: 'lunge',
});

/** Step kinds that leave a band changed (for the reduced-motion fade). */
const BAND_CHANGES = new Set(['glide', 'hit', 'scatter', 'slide', 'fall', 'freed']);

/** Step kinds that leave a tile changed (for the reduced-motion fade). */
const TILE_CHANGES = new Set(['sink', 'drop', 'topple', 'spread', 'crack', 'crumble', 'swap', 'collect']);

/**
 * @param {Pos} p
 * @returns {Pos}
 */
function copy(p) {
  return [p[0], p[1]];
}

/**
 * @param {Pos} p
 * @returns {string}
 */
function tileKey(p) {
  return `${p[0]},${p[1]}`;
}

/**
 * How long a walk of `tiles` tiles takes: 150 ms for one tile, 80 ms more
 * for each further tile, and never more than 400 ms.
 * @param {number} tiles
 * @returns {number}
 */
export function glideDuration(tiles) {
  if (tiles <= 0) return 0;
  return Math.min(400, 150 + 80 * (tiles - 1));
}

/**
 * When the whole sequence is over: the latest end of any step. The view
 * swaps to the new state and (after the bots' turn) unlocks input then.
 * @param {AnimStep[]} steps
 * @returns {number}
 */
export function sequenceEnd(steps) {
  let end = 0;
  for (const step of steps) end = Math.max(end, step.start + step.duration);
  return end;
}

/**
 * Where a band's tokens are before a glide and after each tile of it:
 * `frames[0]` is the band as it stands and `frames[i]` is the band after
 * the head has entered `path[i - 1]`. The body follows the engine's rule:
 * the head takes the new tile, the rest fall in behind it, and the band
 * grows by one token a step up to `maxLen`, except on a step whose `grow`
 * entry is false (wounds mend only in the wood: the move event says where
 * it grew). Token `k` glides from `frames[i][k]` to `frames[i + 1][k]`; a
 * token in the longer frame only is a new one that appears.
 * @param {Pos[]} cells head first
 * @param {number} maxLen
 * @param {Pos[]} path
 * @param {boolean[]} [grow] one entry per step of `path`; missing means it grows
 * @returns {Pos[][]}
 */
export function glideFrames(cells, maxLen, path, grow) {
  let current = cells.map(copy);
  /** @type {Pos[][]} */
  const frames = [current];
  for (let i = 0; i < path.length; i += 1) {
    const step = path[i];
    const body = current.filter((c) => c[0] !== step[0] || c[1] !== step[1]);
    const cap = grow !== undefined && grow[i] === false ? current.length : maxLen;
    current = [step, ...body].slice(0, cap).map(copy);
    frames.push(current);
  }
  return frames;
}

/**
 * The steps at their natural length, laid end to end in event order.
 * @param {AnimEvent[]} events
 * @param {((at: Pos) => string|undefined)|undefined} tileKind
 * @returns {AnimStep[]}
 */
function layOut(events, tileKind) {
  /** @type {AnimStep[]} */
  const steps = [];
  /** When everything laid out so far is over. */
  let end = 0;
  /** When the effects of the current move or action land. */
  let anchor = 0;
  /** The latest start so far: nothing later in the list starts before it. */
  let floor = 0;
  /** Band id -> when its last whole-band movement is over. */
  /** @type {Map<string, number>} */
  const bandBusy = new Map();
  /** Tile key -> when its last change is over. */
  /** @type {Map<string, number>} */
  const tileBusy = new Map();
  /** Tile key -> terrain kind after the terrain events so far. */
  /** @type {Map<string, string>} */
  const changed = new Map();
  /** The last walk, to time what the head passes over. */
  /** @type {{start: number, duration: number, path: Pos[]}|null} */
  let walk = null;
  /** The direction of the last action, for a push that is blocked. */
  /** @type {Pos|null} */
  let actionDir = null;
  /** When the current run of plan events starts, so they play together. */
  /** @type {number|null} */
  let planStart = null;
  /**
   * The field sweep after the last bot falls: when it starts and how many
   * items it has had. Pickups and captures only ever come from a walk, so
   * one with no walk behind it, or a band freed with no walk behind it, is
   * part of the sweep.
   * @type {{start: number, count: number}|null}
   */
  let sweep = null;
  /** @returns {number} when the next item of the field sweep starts */
  const sweepSlot = () => {
    if (sweep === null) sweep = { start: afterAll(), count: 0 };
    const start = sweep.start + sweep.count * SWEEP_STAGGER_MS;
    sweep.count += 1;
    return start;
  };

  /**
   * @param {AnimStep} step
   * @returns {number} when the step ends
   */
  const add = (step) => {
    steps.push(step);
    floor = Math.max(floor, step.start);
    end = Math.max(end, step.start + step.duration);
    return step.start + step.duration;
  };
  /** @returns {number} when a new walk or action may start */
  const afterAll = () => Math.max(end, floor);
  /**
   * @param {string} band
   * @returns {number} when an effect that moves the whole band may start
   */
  const whenBand = (band) => Math.max(anchor, floor, bandBusy.get(band) ?? 0);

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.kind !== 'plan') planStart = null;

    if (event.kind === 'move') {
      if (event.path.length === 0) continue;
      const start = afterAll();
      const duration = glideDuration(event.path.length);
      /** @type {AnimStep} */
      const glide = { kind: 'glide', band: event.band, at: null, path: event.path.map(copy), start, duration, event: i };
      if (event.grow !== undefined) glide.grow = event.grow.slice();
      add(glide);
      bandBusy.set(event.band, start + duration);
      anchor = start + duration;
      walk = { start, duration, path: event.path };
      actionDir = null;
    } else if (event.kind === 'action') {
      const start = afterAll();
      const listed = Object.hasOwn(ACTION_STEP, event.actionId);
      const kind = listed ? ACTION_STEP[event.actionId] : 'lunge';
      anchor = start;
      if (kind !== null) {
        const duration = DURATION[kind];
        add({
          kind, band: event.actor, at: copy(event.target), origin: copy(event.from),
          start, duration, event: i,
        });
        anchor = start + duration * IMPACT[kind];
        if (kind === 'lunge') bandBusy.set(event.actor, start + duration);
      }
      walk = null;
      actionDir = [
        Math.sign(event.target[0] - event.from[0]),
        Math.sign(event.target[1] - event.from[1]),
      ];
    } else if (event.kind === 'damage') {
      const cells = event.cells ?? [];
      if (event.wiped) {
        // A band that falls is wiped just before its fall is reported: the
        // fall shows it going, so it must not scatter first.
        const next = events[i + 1];
        const falls = next !== undefined && next.kind === 'push'
          && next.outcome.kind === 'falls' && next.outcome.band === event.band;
        if (falls) continue;
        const start = whenBand(event.band);
        bandBusy.set(event.band, add({
          kind: 'scatter', band: event.band, at: null, cells: cells.map(copy),
          start, duration: DURATION.scatter, event: i,
        }));
      } else {
        const start = Math.max(anchor, floor);
        add({ kind: 'hit', band: event.band, at: null, start, duration: DURATION.hit, event: i });
        for (let k = 0; k < cells.length; k += 1) {
          add({
            kind: 'pop', band: event.band, at: copy(cells[k]),
            start: start + k * POP_STAGGER_MS, duration: DURATION.pop, event: i,
          });
        }
      }
    } else if (event.kind === 'terrain') {
      const key = tileKey(event.at);
      const { from, to } = event;
      changed.set(key, to);
      const start = Math.max(anchor, floor, tileBusy.get(key) ?? 0);
      const wasHabitat = from === 'habitat' || from === 'habitatDamaged';
      /** @type {'sink'|'drop'|'topple'|'spread'|'crack'|'crumble'|'swap'} */
      let kind = 'swap';
      if (to === 'habitatDamaged') kind = 'crack';
      else if (wasHabitat || from === 'dam' || from === 'earthbank') kind = 'crumble';
      else if (to === 'hole') kind = 'sink';
      else if (to === 'dam') kind = 'drop';
      else if (to === 'paving') kind = 'spread';
      else if (from === 'forest' && to === 'stubble') kind = 'topple';
      const done = add({
        kind, band: null, at: copy(event.at), from, to, start, duration: DURATION[kind], event: i,
      });
      tileBusy.set(key, done);
      if (to === 'habitatDamaged' || wasHabitat) {
        add({
          kind: 'callout', band: null, at: copy(event.at),
          text: to === 'habitatDamaged' ? DEN_DAMAGED_TEXT : DEN_LOST_TEXT,
          start, duration: DURATION.callout, event: i,
        });
      } else if (from === 'dam' && to === 'water') {
        add({ kind: 'splash', band: null, at: copy(event.at), start, duration: DURATION.splash, event: i });
      } else if (from === 'water' && to === 'ford') {
        // A shoved stone drops into the water (trial rule bearShovesStones).
        add({ kind: 'splash', band: null, at: copy(event.at), start, duration: DURATION.splash, event: i });
      }
    } else if (event.kind === 'push') {
      const outcome = event.outcome;
      const band = outcome.band;
      const start = whenBand(band);
      if (outcome.kind === 'moved') {
        bandBusy.set(band, add({
          kind: 'slide', band, at: copy(outcome.to), start, duration: DURATION.slide, event: i,
        }));
      } else if (outcome.kind === 'bumped') {
        bandBusy.set(band, add({
          kind: 'jolt', band, at: null, other: outcome.other,
          dir: actionDir === null ? null : copy(actionDir),
          start, duration: DURATION.jolt, event: i,
        }));
      } else {
        const at = outcome.at;
        const gaveWay = outcome.cause === 'terrain';
        const terrain = changed.get(tileKey(at)) ?? (tileKind !== undefined ? tileKind(at) : undefined);
        /** @type {'water'|'hole'} */
        const into = terrain === 'water' ? 'water' : 'hole';
        let drop = start;
        if (!gaveWay) {
          drop = add({ kind: 'slide', band, at: copy(at), start, duration: DURATION.slide, event: i });
          if (into === 'water') {
            add({ kind: 'splash', band: null, at: copy(at), start: drop, duration: DURATION.splash, event: i });
          }
        }
        bandBusy.set(band, add({
          kind: 'fall', band, at: copy(at), into, start: drop, duration: DURATION.fall, event: i,
        }));
      }
    } else if (event.kind === 'pickup' || event.kind === 'capture') {
      let start = walk === null ? sweepSlot() : Math.max(anchor, floor);
      if (walk !== null) {
        const index = walk.path.findIndex((p) => p[0] === event.at[0] && p[1] === event.at[1]);
        if (index >= 0) {
          start = Math.max(floor, walk.start + (walk.duration * (index + 1)) / walk.path.length);
        }
      }
      add({
        kind: 'collect', band: null, at: copy(event.at), what: event.kind,
        start, duration: DURATION.collect, event: i,
      });
    } else if (event.kind === 'freed') {
      const start = walk === null ? Math.max(sweepSlot(), whenBand(event.band)) : whenBand(event.band);
      bandBusy.set(event.band, add({
        kind: 'freed', band: event.band, at: null, start, duration: DURATION.freed, event: i,
      }));
    } else if (event.kind === 'plan') {
      if (planStart === null) planStart = afterAll();
      add({
        kind: 'plan', band: event.band, at: null,
        plan: event.plan === null ? null : {
          path: event.plan.path.map(copy),
          strike: event.plan.strike === null ? null : copy(event.plan.strike),
          actionId: event.plan.actionId,
        },
        start: planStart, duration: DURATION.plan, event: i,
      });
    }
    // Any other event kind animates nothing.
  }
  return steps;
}

/**
 * Shrinks every time by `factor`, keeping whole milliseconds. Starts and
 * ends are rounded the same way, so steps that met still meet.
 * @param {AnimStep[]} steps
 * @param {number} factor
 * @returns {AnimStep[]}
 */
function scale(steps, factor) {
  return steps.map((step) => {
    const start = Math.round(step.start * factor);
    const end = Math.round((step.start + step.duration) * factor);
    return { ...step, start, duration: end - start };
  });
}

/**
 * The reduced-motion form: one fade for each band or tile that changed,
 * all at once, plus the call-outs. Nothing moves and nothing is in sequence.
 * @param {AnimStep[]} steps
 * @param {number} duration
 * @returns {AnimStep[]}
 */
function collapse(steps, duration) {
  /** @type {AnimStep[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const step of steps) {
    if (step.kind === 'callout') {
      out.push({ ...step, start: 0, duration });
      continue;
    }
    /** @type {string|null} */
    let band = null;
    /** @type {Pos|null} */
    let at = null;
    if (step.band !== null && BAND_CHANGES.has(step.kind)) band = step.band;
    else if (step.at !== null && TILE_CHANGES.has(step.kind)) at = step.at;
    else continue;
    const key = band !== null ? `band ${band}` : `tile ${tileKey(/** @type {Pos} */ (at))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'fade', band, at: at === null ? null : copy(at), start: 0, duration, event: step.event });
  }
  return out;
}

/**
 * Turns the events of one engine move into timed animation steps.
 *
 * - The player's moves and actions play at their natural length.
 * - The bots' turn (`turn: 'bots'`) plays bot by bot in the engine's
 *   order: each bot's walk, then its strike and what the strike does, then
 *   the next bot. A bot with nothing to do emits no move or action, so it
 *   takes no time. If the whole turn would run past the budget
 *   (`BOT_TURN_BUDGET_MS`, halved at 'fast'), every time shrinks by the
 *   same factor so that it fits; a short turn is never stretched.
 * - At 'instant' bot speed, and under reduced motion, nothing moves: the
 *   result is one `fade` step for each band or tile that changed, all
 *   starting at 0 (lasting 0 at 'instant', `FADE_MS` under reduced
 *   motion), plus the call-outs.
 * @param {AnimEvent[]} events
 * @param {AnimOptions} [options]
 * @returns {AnimStep[]}
 */
export function animSteps(events, options = {}) {
  const bots = options.turn === 'bots';
  const speed = bots ? (options.speed ?? 'normal') : 'normal';
  const steps = layOut(events, options.tileKind);
  if (speed === 'instant') return collapse(steps, 0);
  if (options.reducedMotion === true) return collapse(steps, FADE_MS);
  if (!bots) return steps;
  const lead = options.banner === true ? BANNER_LEAD_MS : 0;
  const shifted = lead === 0 ? steps : steps.map((step) => ({ ...step, start: step.start + lead }));
  const factor = botFactor(lead + sequenceEnd(steps), speed);
  return factor === 1 ? shifted : scale(shifted, factor);
}

/**
 * What every time of the bots' turn is multiplied by: the speed, and the
 * shrink that fits a turn of `total` ms into the budget.
 * @param {number} total
 * @param {'normal'|'fast'} speed
 * @returns {number}
 */
function botFactor(total, speed) {
  const fit = total > BOT_TURN_BUDGET_MS ? BOT_TURN_BUDGET_MS / total : 1;
  return SPEED_FACTOR[speed] * fit;
}

/**
 * When the turn banner shows on the bots' turn, fitted and sped up with
 * the rest of the turn exactly as `animSteps` fits it: it starts at 0 and
 * the first bot moves once it is over. Null when the banner takes no time
 * of the turn (the player's turn, 'instant', reduced motion, or no
 * `banner` option). A turn with nothing to animate still lasts this long.
 * @param {AnimEvent[]} events
 * @param {AnimOptions} [options]
 * @returns {{start: number, duration: number}|null}
 */
export function bannerSpan(events, options = {}) {
  if (options.turn !== 'bots' || options.banner !== true || options.reducedMotion === true) return null;
  const speed = options.speed ?? 'normal';
  if (speed === 'instant') return null;
  const factor = botFactor(BANNER_LEAD_MS + sequenceEnd(layOut(events, options.tileKind)), speed);
  return { start: 0, duration: Math.round(BANNER_LEAD_MS * factor) };
}
