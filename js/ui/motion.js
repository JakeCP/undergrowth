// Animation steps -> element animations (look-and-motion spec, "Motion").
//
// This module is pure: no DOM, no clock. js/ui/anim-steps.js turns the
// engine's events into timed steps; this turns those steps into tracks,
// each one Web Animations call on one element of the board drawn from the
// state before the move (Builder's call 3). js/ui/motion-player.js makes
// the calls.
//
// What a track does:
//   - `target` says which element: a band group, one token of a band (by
//     its cell index in the drawing), a band's links, a tile, its feature,
//     a pickup, an objective, a bot's plan, or an effect element the
//     player makes (`fx`: a new token, new ground, a pit, planks, a dirt
//     burst, a blade, a splash ring, a flash) or a call-out over the board.
//   - `keyframes` animate transform and opacity only.
//   - `start` and `duration` are in ms from the start of the sequence.
//   - `fill`: 'forwards' for what must stay changed until the swap (a
//     token that walked, a token that popped off); 'none' for what comes
//     back by itself (a lunge, a shake); 'both' for effect elements,
//     which all start at opacity 0, so they stay hidden until their moment.
//   - `origin` sets transform-box: fill-box and a transform-origin for
//     scales and rotations.
//
// Tracks come in three lists:
//   - during: plays on the before-move drawing; all of it ends by `end`,
//     when the view swaps to the new state.
//   - after: plays on the new drawing right after the swap (things fading
//     back in). Nothing waits for it.
//   - detached: the call-outs, over the board, outliving the swap.
//
// The tokens of a band are tracked through the sequence: every transform
// is absolute (from where the token is drawn), so a bot that walks and
// then lunges lunges from where its walk ended.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').Side} Side */
/** @typedef {import('../engine/types.js').Tile} Tile */
/** @typedef {import('../engine/types.js').TerrainKind} TerrainKind */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('./anim-steps.js').AnimStep} AnimStep */
/** @typedef {import('./anim-steps.js').AnimEvent} AnimEvent */
/** @typedef {import('./patterns.js').GroundKey} GroundKey */
/** @typedef {import('./sound.js').SoundName} SoundName */

/**
 * @typedef {{kind: 'band', band: string}
 *   | {kind: 'token', band: string, index: number}
 *   | {kind: 'links', band: string}
 *   | {kind: 'tile', at: Pos}
 *   | {kind: 'feature', at: Pos}
 *   | {kind: 'pickup', at: Pos}
 *   | {kind: 'objective', at: Pos}
 *   | {kind: 'plan', band: string}
 *   | {kind: 'fx', fx: 'token', id: string, band: string, side: Side, at: Pos}
 *   | {kind: 'fx', fx: 'ground', id: string, at: Pos, ground: GroundKey}
 *   | {kind: 'fx', fx: 'pit'|'planks'|'dirt'|'blade'|'ring'|'flash', id: string, at: Pos}
 *   | {kind: 'fx', fx: 'piece', id: string, at: Pos, piece: string}
 *   | {kind: 'callout', at: Pos, text: string}} MotionTarget
 */
/** @typedef {'center'|'bottom'|'left'|null} Origin */
/** @typedef {{offset?: number, transform?: string, opacity?: number, easing?: string}} Frame */
/**
 * @typedef {{target: MotionTarget, keyframes: Frame[], start: number, duration: number,
 *   easing: string, fill: 'none'|'forwards'|'both', origin: Origin, step: number}} Track
 */
/** @typedef {{during: Track[], after: Track[], detached: Track[], end: number}} Motion */

import { TILE } from './look.js';
import { groundKey } from './patterns.js';
import { glideFrames, sequenceEnd, DURATION } from './anim-steps.js';
import { soundForEvent } from './sound.js';
import { arrivingPiece, leavesPicture, shakeFrames } from './piece-motion.js';

/** How long a call-out stays over the board, in ms. */
export const CALLOUT_MS = 1600;

/** How far a head darts toward its target, in tiles. */
const LUNGE = 0.4;
const NUDGE = 0.15;
/** How far a jolted band moves before it bounces back, in tiles. */
const JOLT = 0.18;
/** How far scattered tokens fly, in tiles. */
const SCATTER = 0.55;
/** The opacity a band or tile fades to under reduced motion. */
const DIM = 0.3;
/** How long the links take to hide when a band starts to move. */
const LINKS_MS = 80;

/**
 * @param {number} v
 * @returns {number}
 */
function r(v) {
  const n = Math.round(v * 10) / 10;
  return n === 0 ? 0 : n;
}

/**
 * @param {number} dx
 * @param {number} dy
 * @param {string} [more]  further transform functions, after the move
 * @returns {string}
 */
function tr(dx, dy, more = '') {
  return `translate(${r(dx)}px, ${r(dy)}px)${more === '' ? '' : ` ${more}`}`;
}

/**
 * @param {Pos} a
 * @param {Pos} b
 * @returns {boolean}
 */
function same(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * @param {Pos} p
 * @returns {Pos}
 */
function copy(p) {
  return [p[0], p[1]];
}

/**
 * The terrain kind of each tile on a board, by position, for the
 * animation steps and sounds: they need the board from before the move.
 * Off the board it is undefined.
 * @param {BattleState} state
 * @returns {(at: Pos) => string|undefined}
 */
export function tileKindOf(state) {
  return (at) => {
    const row = state.tiles[at[1]];
    const tile = row === undefined ? undefined : row[at[0]];
    return tile === undefined ? undefined : tile.kind;
  };
}

/**
 * One token of a band during the sequence: the element, where it is
 * drawn, and where it is now.
 * @typedef {{target: MotionTarget, drawn: Pos, at: Pos}} SimToken
 */

/**
 * @param {SimToken} t
 * @param {Pos} [at]
 * @returns {[number, number]}  the shift from where it is drawn to `at` (default: where it is), in board units
 */
function offset(t, at = t.at) {
  return [(at[0] - t.drawn[0]) * TILE, (at[1] - t.drawn[1]) * TILE];
}

/**
 * The tracks that play a list of animation steps on the board drawn from
 * `before`. Steps about a band or tile the drawing does not have animate
 * nothing.
 * @param {AnimStep[]} steps
 * @param {BattleState} before
 * @param {{reducedMotion?: boolean}} [options]
 * @returns {Motion}
 */
export function motionTracks(steps, before, options = {}) {
  const reduced = options.reducedMotion === true;
  /** @type {Track[]} */
  const during = [];
  /** @type {Track[]} */
  const after = [];
  /** @type {Track[]} */
  const detached = [];

  /** @type {Map<string, {side: Side, maxLen: number, tokens: SimToken[], moved: boolean}>} */
  const bands = new Map();
  for (const band of before.bands) {
    bands.set(band.id, {
      side: band.side,
      maxLen: band.maxLen,
      moved: false,
      tokens: band.cells.map((cell, index) => ({
        target: { kind: 'token', band: band.id, index }, drawn: copy(cell), at: copy(cell),
      })),
    });
  }
  /** Tile key -> its terrain kind so far in the sequence. */
  /** @type {Map<string, TerrainKind>} */
  const kinds = new Map();
  /** @type {Set<string>} */
  const linksHidden = new Set();
  /** @type {Set<string>} */
  const planFaded = new Set();
  let fxCount = 0;
  /** @param {string} what */
  const fxId = (what) => {
    fxCount += 1;
    return `${what}-${fxCount}`;
  };

  /**
   * @param {number} stepIndex
   * @param {AnimStep} step
   * @param {MotionTarget} target
   * @param {Frame[]} keyframes
   * @param {{fill?: 'none'|'forwards'|'both', origin?: Origin, easing?: string, start?: number, duration?: number}} [more]
   */
  const add = (stepIndex, step, target, keyframes, more = {}) => {
    const duration = more.duration ?? step.duration;
    if (duration <= 0) return;
    during.push({
      target,
      keyframes,
      start: more.start ?? step.start,
      duration,
      easing: more.easing ?? 'ease-out',
      fill: more.fill ?? (target.kind === 'fx' ? 'both' : 'none'),
      origin: more.origin ?? null,
      step: stepIndex,
    });
  };

  /**
   * @param {number} i
   * @param {AnimStep} step
   * @param {string} band
   */
  const hideLinks = (i, step, band) => {
    if (linksHidden.has(band)) return;
    linksHidden.add(band);
    add(i, step, { kind: 'links', band }, [{ opacity: 1 }, { opacity: 0 }], {
      fill: 'forwards', duration: Math.min(LINKS_MS, step.duration),
    });
  };

  /**
   * The tile as it is now in the sequence, as a Tile for groundKey.
   * @param {Pos} at
   * @param {TerrainKind} kind
   * @param {TerrainKind} [from]
   * @returns {Tile}
   */
  const tileAs = (at, kind, from) => {
    const row = before.tiles[at[1]];
    const was = row === undefined ? undefined : row[at[0]];
    /** @type {'water'|'hole'|null} */
    let under = null;
    if (kind === 'dam' || kind === 'ford') {
      if (from === 'hole' || from === 'water') under = from;
      else under = was !== undefined && was.kind === kind ? was.under : 'water';
    }
    const variant = kind === 'open' && was !== undefined && was.kind === 'open' ? was.variant : null;
    return { kind, variant: kind === 'open' ? variant ?? 'grass' : null, under };
  };

  /**
   * @param {Pos} at
   * @returns {boolean}
   */
  const nearWater = (at) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
    const p = /** @type {Pos} */ ([at[0] + dx, at[1] + dy]);
    const k = kinds.get(`${p[0]},${p[1]}`) ?? /** @type {TerrainKind|undefined} */ (tileKindOf(before)(p));
    if (k === 'water') return true;
    if (k !== 'dam' && k !== 'ford') return false;
    const t = tileAs(p, k);
    return t.under === 'water';
  });

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const sim = step.band !== null ? bands.get(step.band) : undefined;

    switch (step.kind) {
      case 'glide': {
        if (sim === undefined || sim.tokens.length === 0) break;
        const frames = glideFrames(sim.tokens.map((t) => t.at), sim.maxLen, step.path, step.grow);
        const n = step.path.length;
        const end = frames[n];
        /** @type {SimToken[]} */
        const next = [];
        for (let k = 0; k < end.length; k += 1) {
          let tok = sim.tokens[k];
          let from = 0;
          if (tok === undefined) {
            from = frames.findIndex((f) => f.length > k);
            const at = copy(frames[from][k]);
            tok = {
              target: { kind: 'fx', fx: 'token', id: fxId('token'), band: step.band, side: sim.side, at },
              drawn: at, at,
            };
          }
          const t = tok;
          /** @type {Frame[]} */
          const keyframes = [];
          if (from > 0) {
            const [dx, dy] = offset(t, frames[from][k]);
            if (from > 1) keyframes.push({ offset: 0, transform: tr(dx, dy), opacity: 0 });
            keyframes.push({ offset: (from - 1) / n, transform: tr(dx, dy), opacity: 0 });
          }
          for (let f = from; f <= n; f += 1) {
            const [dx, dy] = offset(t, frames[f][k]);
            keyframes.push(from > 0 ? { offset: f / n, transform: tr(dx, dy), opacity: 1 } : { offset: f / n, transform: tr(dx, dy) });
          }
          const moves = from > 0 || keyframes.some((frame) => frame.transform !== keyframes[0].transform);
          if (moves) {
            add(i, step, t.target, keyframes, { fill: from > 0 ? 'both' : 'forwards', easing: 'ease-in-out' });
          }
          next.push({ target: t.target, drawn: t.drawn, at: copy(end[k]) });
        }
        sim.tokens = next;
        sim.moved = true;
        hideLinks(i, step, step.band);
        break;
      }

      case 'lunge':
      case 'sweep':
      case 'dirt': {
        const head = sim !== undefined ? sim.tokens[0] : undefined;
        if (head !== undefined && head.target.kind === 'token' && head.target.index === 0) {
          const dx = step.at[0] - step.origin[0];
          const dy = step.at[1] - step.origin[1];
          const len = Math.hypot(dx, dy) || 1;
          const amp = (step.kind === 'lunge' ? LUNGE : NUDGE) * TILE;
          const [bx, by] = offset(head);
          add(i, step, head.target, [
            { offset: 0, transform: tr(bx, by), easing: 'ease-in' },
            { offset: 0.4, transform: tr(bx + (dx / len) * amp, by + (dy / len) * amp), easing: 'ease-out' },
            { offset: 1, transform: tr(bx, by) },
          ], { fill: 'none', easing: 'linear' });
        }
        if (step.kind === 'sweep') {
          add(i, step, { kind: 'fx', fx: 'blade', id: fxId('blade'), at: copy(step.at) }, [
            { transform: 'rotate(-55deg)', opacity: 0 },
            { offset: 0.35, transform: 'rotate(-10deg)', opacity: 1 },
            { offset: 1, transform: 'rotate(55deg)', opacity: 0 },
          ], { origin: 'center', easing: 'ease-in-out' });
        } else if (step.kind === 'dirt') {
          add(i, step, { kind: 'fx', fx: 'dirt', id: fxId('dirt'), at: copy(step.at) }, [
            { transform: 'scale(0.3)', opacity: 0 },
            { offset: 0.08, transform: 'scale(0.4)', opacity: 1 },
            { offset: 1, transform: 'scale(1.6)', opacity: 0 },
          ], { origin: 'center' });
        }
        break;
      }

      case 'hit': {
        if (sim === undefined) break;
        add(i, step, { kind: 'band', band: step.band }, [
          { transform: tr(0, 0), opacity: 1 },
          { offset: 0.2, transform: tr(-3, 0), opacity: 0.4 },
          { offset: 0.45, transform: tr(3, 0), opacity: 1 },
          { offset: 0.7, transform: tr(-2, 0), opacity: 0.6 },
          { offset: 1, transform: tr(0, 0), opacity: 1 },
        ], { easing: 'linear' });
        break;
      }

      case 'pop': {
        if (sim === undefined) break;
        const j = sim.tokens.findIndex((t) => same(t.at, step.at));
        if (j < 0) break;
        const tok = sim.tokens[j];
        const [bx, by] = offset(tok);
        add(i, step, tok.target, [
          { transform: tr(bx, by, 'scale(1)'), opacity: 1 },
          { offset: 0.35, transform: tr(bx, by - 5, 'scale(1.25)'), opacity: 1 },
          { offset: 1, transform: tr(bx, by - 9, 'scale(0.2)'), opacity: 0 },
        ], { fill: 'forwards', origin: 'center' });
        sim.tokens.splice(j, 1);
        // The links to a token that is gone would hang in the air.
        hideLinks(i, step, step.band);
        break;
      }

      case 'scatter':
      case 'fall': {
        if (sim === undefined) break;
        const n = sim.tokens.length;
        const mid = sim.tokens.reduce((m, t) => [m[0] + t.at[0] / n, m[1] + t.at[1] / n], [0, 0]);
        sim.tokens.forEach((tok, j) => {
          const [bx, by] = offset(tok);
          /** @type {[number, number]} */
          let to;
          let shrink;
          if (step.kind === 'scatter') {
            let ax = tok.at[0] - mid[0];
            let ay = tok.at[1] - mid[1];
            if (Math.hypot(ax, ay) < 1e-6) {
              const angle = -Math.PI / 2 + j * 2.4;
              ax = Math.cos(angle);
              ay = Math.sin(angle);
            }
            const len = Math.hypot(ax, ay);
            to = [bx + (ax / len) * SCATTER * TILE, by + (ay / len) * SCATTER * TILE];
            shrink = 'scale(0.4)';
          } else {
            to = [bx, by + 4];
            shrink = 'scale(0.25)';
          }
          add(i, step, tok.target, [
            { transform: tr(bx, by, 'scale(1)'), opacity: 1 },
            { offset: 1, transform: tr(to[0], to[1], shrink), opacity: 0 },
          ], { fill: 'forwards', origin: 'center', easing: step.kind === 'fall' ? 'ease-in' : 'ease-out' });
        });
        sim.tokens = [];
        hideLinks(i, step, step.band);
        break;
      }

      case 'slide': {
        if (sim === undefined || sim.tokens.length === 0) break;
        const frames = glideFrames(sim.tokens.map((t) => t.at), sim.tokens.length, [step.at]);
        sim.tokens = sim.tokens.map((tok, k) => {
          const [ax, ay] = offset(tok);
          const [bx, by] = offset(tok, frames[1][k]);
          add(i, step, tok.target, [{ transform: tr(ax, ay) }, { transform: tr(bx, by) }], {
            fill: 'forwards', easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
          });
          return { target: tok.target, drawn: tok.drawn, at: copy(frames[1][k]) };
        });
        sim.moved = true;
        hideLinks(i, step, step.band);
        break;
      }

      case 'jolt': {
        if (sim === undefined) break;
        if (step.dir === null) {
          add(i, step, { kind: 'band', band: step.band }, [
            { transform: tr(0, 0) }, { offset: 0.3, transform: tr(2, 0) }, { offset: 0.6, transform: tr(-2, 0) }, { transform: tr(0, 0) },
          ], { easing: 'linear' });
        } else {
          const len = Math.hypot(step.dir[0], step.dir[1]) || 1;
          const amp = JOLT * TILE;
          add(i, step, { kind: 'band', band: step.band }, [
            { transform: tr(0, 0), easing: 'ease-in' },
            { offset: 0.35, transform: tr((step.dir[0] / len) * amp, (step.dir[1] / len) * amp), easing: 'ease-out' },
            { offset: 1, transform: tr(0, 0) },
          ], { easing: 'linear' });
        }
        break;
      }

      case 'splash': {
        add(i, step, { kind: 'fx', fx: 'ring', id: fxId('ring'), at: copy(step.at) }, [
          { transform: 'scale(0.3)', opacity: 0 },
          { offset: 0.08, transform: 'scale(0.4)', opacity: 0.9 },
          { offset: 1, transform: 'scale(1.6)', opacity: 0 },
        ], { origin: 'center' });
        break;
      }

      case 'sink':
      case 'drop':
      case 'topple':
      case 'spread':
      case 'crack':
      case 'crumble':
      case 'swap': {
        const key = `${step.at[0]},${step.at[1]}`;
        const was = /** @type {TerrainKind} */ (kinds.get(key) ?? tileKindOf(before)(step.at) ?? step.from);
        const to = /** @type {TerrainKind} */ (step.to);
        const wet = nearWater(step.at);
        const oldGround = groundKey(tileAs(step.at, was), wet);
        const newGround = groundKey(tileAs(step.at, to, /** @type {TerrainKind} */ (step.from)), wet);
        kinds.set(key, to);
        const feature = /** @type {MotionTarget} */ ({ kind: 'feature', at: copy(step.at) });
        // The painted piece the tile gains, if any (js/ui/piece-motion.js):
        // it stands in for the pit and the planks, and comes in under the
        // old feature as that goes.
        const arriving = arrivingPiece(step, tileAs(step.at, was), tileAs(step.at, to, /** @type {TerrainKind} */ (step.from)), before);

        if (newGround !== oldGround) {
          const spread = step.kind === 'spread';
          add(i, step, { kind: 'fx', fx: 'ground', id: fxId('ground'), at: copy(step.at), ground: newGround },
            spread
              ? [{ transform: 'scale(0, 1)', opacity: 0.7 }, { offset: 1, transform: 'scale(1, 1)', opacity: 1 }]
              : [{ opacity: 0 }, { offset: 1, opacity: 1 }],
            { origin: spread ? 'left' : null, easing: spread ? 'ease-out' : 'ease-in-out' });
        }

        if (step.kind === 'sink') {
          add(i, step, feature, [
            { transform: tr(0, 0, 'scale(1)'), opacity: 1 },
            { offset: 1, transform: tr(0, 3, 'scale(0.55)'), opacity: 0 },
          ], { fill: 'forwards', origin: 'center', easing: 'ease-in' });
          if (arriving === null) {
            add(i, step, { kind: 'fx', fx: 'pit', id: fxId('pit'), at: copy(step.at) }, [
              { transform: 'scale(0)', opacity: 0 },
              { offset: 1, transform: 'scale(1)', opacity: 0.9 },
            ], { origin: 'center' });
          }
        } else if (step.kind === 'drop') {
          add(i, step, feature, [{ opacity: 1 }, { offset: 1, opacity: 0 }], { fill: 'forwards' });
          if (arriving === null) add(i, step, { kind: 'fx', fx: 'planks', id: fxId('planks'), at: copy(step.at) }, [
            { transform: tr(0, -14), opacity: 0, easing: 'ease-in' },
            { offset: 0.6, transform: tr(0, 2), opacity: 1, easing: 'ease-out' },
            { offset: 0.8, transform: tr(0, -2), opacity: 1, easing: 'ease-in' },
            { offset: 1, transform: tr(0, 0), opacity: 1 },
          ], { easing: 'linear' });
        } else if (step.kind === 'topple') {
          // A painted tree falls to the left, over the tiles drawn before it.
          const side = leavesPicture(step, tileAs(step.at, was), before) ? -1 : 1;
          add(i, step, feature, [
            { transform: 'rotate(0deg)', opacity: 1 },
            { offset: 0.7, transform: `rotate(${70 * side}deg)`, opacity: 1 },
            { offset: 1, transform: `rotate(${85 * side}deg)`, opacity: 0 },
          ], { fill: 'forwards', origin: 'bottom', easing: 'ease-in' });
        } else if (step.kind === 'crack') {
          if (arriving !== null) {
            add(i, step, feature, shakeFrames(), { fill: 'forwards', easing: 'linear' });
          } else {
            add(i, step, feature, [
              { opacity: 1 }, { offset: 0.25, opacity: 0.3 }, { offset: 0.5, opacity: 1 }, { offset: 0.75, opacity: 0.3 }, { offset: 1, opacity: 1 },
            ], { easing: 'linear' });
          }
          add(i, step, { kind: 'fx', fx: 'flash', id: fxId('flash'), at: copy(step.at) }, [
            { transform: 'scale(0.5)', opacity: 0 },
            { offset: 0.3, transform: 'scale(1)', opacity: 0.8 },
            { offset: 1, transform: 'scale(1.3)', opacity: 0 },
          ], { origin: 'center' });
        } else if (step.kind === 'crumble') {
          add(i, step, feature, [
            { transform: tr(0, 0, 'scale(1)'), opacity: 1 },
            { offset: 1, transform: tr(0, 5, 'scale(0.5)'), opacity: 0 },
          ], { fill: 'forwards', origin: 'bottom', easing: 'ease-in' });
        } else {
          // spread and swap: the old feature gives way to the new ground.
          add(i, step, feature, [{ opacity: 1 }, { offset: 1, opacity: 0 }], { fill: 'forwards' });
        }
        if (arriving !== null) {
          add(i, step, { kind: 'fx', fx: 'piece', id: fxId('piece'), at: copy(step.at), piece: arriving.piece },
            arriving.frames, { origin: arriving.origin, easing: arriving.easing });
        }
        break;
      }

      case 'callout': {
        detached.push({
          target: { kind: 'callout', at: copy(step.at), text: step.text },
          keyframes: reduced
            ? [{ opacity: 0 }, { offset: 0.1, opacity: 1 }, { offset: 0.8, opacity: 1 }, { offset: 1, opacity: 0 }]
            : [
              { transform: tr(0, 6, 'scale(0.9)'), opacity: 0 },
              { offset: 0.12, transform: tr(0, 0, 'scale(1)'), opacity: 1 },
              { offset: 0.8, transform: tr(0, -2, 'scale(1)'), opacity: 1 },
              { offset: 1, transform: tr(0, -8, 'scale(1)'), opacity: 0 },
            ],
          start: step.start,
          duration: CALLOUT_MS,
          easing: 'ease-out',
          fill: 'both',
          origin: null,
          step: i,
        });
        break;
      }

      case 'collect': {
        if (step.what === 'pickup') {
          add(i, step, { kind: 'pickup', at: copy(step.at) }, [
            { transform: tr(0, 0, 'scale(1)'), opacity: 1 },
            { offset: 1, transform: tr(0, -10, 'scale(1.4)'), opacity: 0 },
          ], { fill: 'forwards', origin: 'center' });
        } else {
          add(i, step, { kind: 'objective', at: copy(step.at) }, [
            { transform: 'scale(1)', opacity: 1 },
            { offset: 0.4, transform: 'scale(1.35)', opacity: 1 },
            { offset: 1, transform: 'scale(1)', opacity: 0.4 },
          ], { fill: 'forwards', origin: 'center' });
        }
        break;
      }

      case 'freed': {
        const head = sim !== undefined ? sim.tokens[0] : undefined;
        if (head === undefined) break;
        const [bx, by] = offset(head);
        add(i, step, head.target, [
          { transform: tr(bx, by, 'scale(1)') },
          { offset: 0.4, transform: tr(bx, by - 4, 'scale(1.3)') },
          { offset: 1, transform: tr(bx, by, 'scale(1)') },
        ], { origin: 'center' });
        break;
      }

      case 'plan': {
        const was = before.bands.find((b) => b.id === step.band);
        if (was === undefined || planFaded.has(step.band)) break;
        const gone = sim === undefined || sim.tokens.length === 0;
        const changed = gone || (sim !== undefined && sim.moved) || JSON.stringify(was.plan) !== JSON.stringify(step.plan);
        if (!changed) break;
        planFaded.add(step.band);
        add(i, step, { kind: 'plan', band: step.band }, [{ opacity: 1 }, { offset: 1, opacity: 0 }], { fill: 'forwards' });
        if (!gone) {
          after.push({
            target: { kind: 'plan', band: step.band }, keyframes: [{ opacity: 0 }, { offset: 1, opacity: 1 }],
            start: 0, duration: DURATION.plan, easing: 'ease-out', fill: 'none', origin: null, step: i,
          });
        }
        break;
      }

      case 'fade': {
        if (step.duration <= 0) break;
        if (step.band !== null) {
          if (sim === undefined) break;
          add(i, step, { kind: 'band', band: step.band }, [{ opacity: 1 }, { offset: 1, opacity: DIM }], { fill: 'forwards' });
          after.push({
            target: { kind: 'band', band: step.band }, keyframes: [{ opacity: DIM }, { offset: 1, opacity: 1 }],
            start: 0, duration: step.duration, easing: 'ease-out', fill: 'none', origin: null, step: i,
          });
        } else if (step.at !== null) {
          add(i, step, { kind: 'feature', at: copy(step.at) }, [{ opacity: 1 }, { offset: 1, opacity: DIM }], { fill: 'forwards' });
          after.push({
            target: { kind: 'tile', at: copy(step.at) }, keyframes: [{ opacity: DIM }, { offset: 1, opacity: 1 }],
            start: 0, duration: step.duration, easing: 'ease-out', fill: 'none', origin: null, step: i,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  return { during, after, detached, end: sequenceEnd(steps) };
}

/**
 * When each sound plays: at the start of the first step of the event that
 * makes it (the first step after it when the event has none of its own,
 * as under reduced motion). The same sound at the same moment plays once.
 * @param {AnimEvent[]} events
 * @param {AnimStep[]} steps
 * @param {(at: Pos) => string|undefined} [tileKind]  the board before the move
 * @returns {Array<{at: number, name: SoundName}>}
 */
export function soundCues(events, steps, tileKind) {
  /** @type {Array<{at: number, name: SoundName}>} */
  const cues = [];
  const end = sequenceEnd(steps);
  for (let i = 0; i < events.length; i += 1) {
    const name = soundForEvent(events[i], tileKind);
    if (name === null) continue;
    let at = end;
    const own = steps.filter((s) => s.event === i);
    // A splash goes with the splash ring, not with the slide before it.
    const ring = own.find((s) => s.kind === 'splash');
    if (ring !== undefined) at = ring.start;
    else if (own.length > 0) at = Math.min(...own.map((s) => s.start));
    else {
      const later = steps.find((s) => s.event > i);
      if (later !== undefined) at = later.start;
    }
    if (cues.some((c) => c.at === at && c.name === name)) continue;
    cues.push({ at, name });
  }
  return cues.sort((a, b) => a.at - b.at);
}

/**
 * Something playing, as the player hands it back: `finish` ends it at
 * once (it should call the `done` it was given).
 * @typedef {{finish: () => void}} Playing
 */

/**
 * Keeps track of the animation on screen, and decides what a tap does
 * while it runs (look-and-motion spec):
 *
 * - a player animation never locks input: a tap finishes it at once and
 *   then counts as the tap (`tap()` is true);
 * - a tap during the bots' turn jumps to the end of that turn and does
 *   nothing else (`tap()` is false);
 * - starting a new sequence, or Undo (`finish()`), never waits: the
 *   running one settles first.
 *
 * `run` hands `start` a `done` callback and calls `onSettle` exactly once,
 * when `done` is called or the sequence is finished early. A `start` that
 * returns null has nothing to play and settles at once.
 * @returns {{
 *   run: (kind: 'player'|'bots', start: (done: () => void) => Playing|null, onSettle: () => void) => void,
 *   finish: () => void,
 *   tap: () => boolean,
 *   kind: () => 'player'|'bots'|null,
 * }}
 */
export function createSequencer() {
  /** @type {{kind: 'player'|'bots', playing: Playing|null, done: () => void}|null} */
  let current = null;

  const finish = () => {
    const running = current;
    if (running === null) return;
    running.playing?.finish();
    running.done();
  };

  return {
    run(kind, start, onSettle) {
      finish();
      let settled = false;
      /** @type {{kind: 'player'|'bots', playing: Playing|null, done: () => void}} */
      const entry = {
        kind,
        playing: null,
        done: () => {
          if (settled) return;
          settled = true;
          if (current === entry) current = null;
          onSettle();
        },
      };
      current = entry;
      const playing = start(entry.done);
      if (settled) return;
      if (playing === null) {
        entry.done();
        return;
      }
      entry.playing = playing;
    },
    finish,
    tap() {
      if (current === null) return true;
      const kind = current.kind;
      finish();
      return kind === 'player';
    },
    kind() {
      return current === null ? null : current.kind;
    },
  };
}
