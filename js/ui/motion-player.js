// The animation player's thin half: it makes the Web Animations calls
// that js/ui/motion.js worked out, on the board js/ui/board.js drew.
//
// - Each track finds its element by the selectors in js/ui/look.js, or
//   makes its effect element (a new token, new ground, a painted piece, a
//   pit, planks, a dirt burst, a blade, a splash ring, a flash), and calls
//   animate().
//   Only transform and opacity move, and nothing gets a filter.
// - Sounds play on their cues through js/ui/sound.js (silent unless on).
// - The sequence ends after `motion.end` ms, or at once on finish(): every
//   animation on the old drawing is cancelled and `onEnd` is called once,
//   so the caller can swap to the new state.
// - Call-outs go on an HTML overlay over the board and outlive the swap.
//
// Without the Web Animations API nothing plays: the caller swaps at once.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('./motion.js').Motion} Motion */
/** @typedef {import('./motion.js').Track} Track */
/** @typedef {import('./motion.js').MotionTarget} MotionTarget */
/** @typedef {import('./motion.js').Playing} Playing */
/** @typedef {import('./sound.js').SoundName} SoundName */
/** @typedef {{play: (name: SoundName) => void}} SoundLike */

import { el } from './svg.js';
import {
  TILE, bandSelector, tokenSelector, tileSelector, featureSelector, groundSelector,
} from './look.js';
import {
  groundFill, ANIMAL, ANIMAL_DARK, RUST, STEEL, CREAM, INK, SOIL, SOIL_LIGHT, SOIL_DARK,
  WATER_LIGHT, STUBBLE_LIGHT,
} from './patterns.js';
import { pieceFx } from './board-pieces.js';

/** The dam's planks, as board.js draws them. */
const PLANK = '#a8743f';
const BARK = '#5a3b1e';

/** @type {Record<'center'|'bottom'|'left', string>} */
const ORIGIN = { center: '50% 50%', bottom: '50% 100%', left: '0% 50%' };

/**
 * @param {Element} node
 * @returns {node is Element & {animate: Element['animate']}}
 */
function animatable(node) {
  return typeof (/** @type {{animate?: unknown}} */ (node)).animate === 'function';
}

/**
 * @param {Pos} at
 * @returns {string}
 */
function key(at) {
  return `${at[0]},${at[1]}`;
}

/**
 * The element a track animates on the board, or null when the drawing
 * has none (a band already gone, a plan not drawn).
 * @param {Element} svg
 * @param {MotionTarget} target
 * @returns {Element|null}
 */
function findTarget(svg, target) {
  switch (target.kind) {
    case 'band': return svg.querySelector(bandSelector(target.band));
    case 'token': return svg.querySelector(tokenSelector(target.band, target.index));
    case 'links': return svg.querySelector(`${bandSelector(target.band)} > [data-links]`);
    case 'tile': return svg.querySelector(tileSelector(target.at));
    case 'feature': return svg.querySelector(featureSelector(target.at));
    case 'pickup': return svg.querySelector(`[data-pickup="${key(target.at)}"]`);
    case 'objective': return svg.querySelector(`[data-objective="${key(target.at)}"]`);
    case 'plan': return svg.querySelector(`[data-plan="${target.band}"]`);
    default: return null;
  }
}

/**
 * Makes an effect element where it belongs: a new token inside its band,
 * under the head; new ground inside its tile, just above the old ground;
 * everything else on the effect layer, on top of the board.
 * @param {Element} svg
 * @param {() => Element} layer
 * @param {Extract<MotionTarget, {kind: 'fx'}>} target
 * @returns {Element}
 */
function makeFx(svg, layer, target) {
  const [x, y] = target.at;
  const ox = x * TILE;
  const oy = y * TILE;
  const cx = ox + TILE / 2;
  const cy = oy + TILE / 2;

  if (target.fx === 'token') {
    const us = target.side === 'us';
    const g = el('g', { 'data-fx': 'token' });
    el('circle', { cx, cy, r: 8, fill: us ? ANIMAL : RUST, stroke: us ? ANIMAL_DARK : STEEL, 'stroke-width': 1.8 }, g);
    el('circle', { cx: cx - 2.4, cy: cy - 2.4, r: 2.4, fill: CREAM, opacity: 0.35 }, g);
    const band = svg.querySelector(bandSelector(target.band));
    const head = band !== null ? band.querySelector('[data-head]') : null;
    if (band !== null && head !== null) band.insertBefore(g, head);
    else layer().appendChild(g);
    return g;
  }
  if (target.fx === 'ground') {
    const rect = el('rect', {
      x: ox, y: oy, width: TILE + 0.5, height: TILE + 0.5, fill: groundFill(target.ground), 'data-fx': 'ground',
    });
    const tile = svg.querySelector(tileSelector(target.at));
    const ground = svg.querySelector(groundSelector(target.at));
    if (tile !== null && ground !== null) tile.insertBefore(rect, ground.nextSibling);
    else layer().appendChild(rect);
    return rect;
  }
  if (target.fx === 'piece') {
    // A painted piece goes in its tile, under the feature it replaces, so
    // the row below still overlaps it and the bands stay on top.
    const piece = pieceFx(target.piece, target.at) ?? el('g', { 'data-fx': 'piece' });
    const tile = svg.querySelector(tileSelector(target.at));
    const feature = svg.querySelector(featureSelector(target.at));
    if (tile !== null && feature !== null) tile.insertBefore(piece, feature);
    else layer().appendChild(piece);
    return piece;
  }

  const parent = layer();
  switch (target.fx) {
    case 'pit': {
      const g = el('g', { 'data-fx': 'pit' }, parent);
      el('ellipse', { cx, cy: cy + 1, rx: 14, ry: 12, fill: SOIL_DARK }, g);
      el('ellipse', { cx, cy: cy + 2, rx: 10, ry: 8, fill: INK, opacity: 0.6 }, g);
      return g;
    }
    case 'planks': {
      const g = el('g', { 'data-fx': 'planks' }, parent);
      for (let i = 0; i < 4; i += 1) {
        const py = oy + 7 + i * 7;
        el('rect', { x: ox + 2, y: py, width: TILE - 4, height: 5.6, rx: 2.8, fill: PLANK, stroke: BARK, 'stroke-width': 0.9 }, g);
        el('circle', { cx: ox + 4.8, cy: py + 2.8, r: 1.6, fill: STUBBLE_LIGHT, stroke: BARK, 'stroke-width': 0.6 }, g);
      }
      return g;
    }
    case 'dirt': {
      const g = el('g', { 'data-fx': 'dirt' }, parent);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const d = i % 2 === 0 ? 9 : 6;
        el('circle', {
          cx: Math.round((cx + Math.cos(a) * d) * 10) / 10,
          cy: Math.round((cy + Math.sin(a) * d) * 10) / 10,
          r: i % 3 === 0 ? 2.6 : 1.8,
          fill: i % 2 === 0 ? SOIL : SOIL_LIGHT,
        }, g);
      }
      return g;
    }
    case 'blade': {
      const g = el('g', { 'data-fx': 'blade' }, parent);
      const d = `M${cx - 15} ${cy + 7} Q${cx} ${cy - 17} ${cx + 15} ${cy + 7}`;
      el('path', { d, stroke: INK, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', opacity: 0.5 }, g);
      el('path', { d, stroke: CREAM, 'stroke-width': 2.6, fill: 'none', 'stroke-linecap': 'round' }, g);
      return g;
    }
    case 'ring':
      return el('circle', { cx, cy, r: 15, fill: 'none', stroke: WATER_LIGHT, 'stroke-width': 2.6, 'data-fx': 'ring' }, parent);
    case 'flash':
    default:
      return el('circle', { cx, cy, r: 17, fill: CREAM, 'data-fx': target.fx }, parent);
  }
}

/**
 * @param {Element} node
 * @param {Track} track
 * @returns {Animation|null}
 */
function animateTrack(node, track) {
  if (!animatable(node)) return null;
  if (track.origin !== null) {
    const style = /** @type {CSSStyleDeclaration} */ ((/** @type {SVGElement} */ (node)).style);
    style.transformBox = 'fill-box';
    style.transformOrigin = ORIGIN[track.origin];
  }
  return node.animate(/** @type {Keyframe[]} */ (track.keyframes), {
    delay: track.start, duration: track.duration, easing: track.easing, fill: track.fill,
  });
}

/**
 * The board's size in board units, from its viewBox (320 by default).
 * @param {Element} svg
 * @returns {number}
 */
function boardSize(svg) {
  const box = svg.getAttribute('viewBox');
  const size = box === null ? NaN : Number(box.trim().split(/\s+/)[2]);
  return Number.isFinite(size) && size > 0 ? size : 320;
}

/**
 * One call-out over the board: a positioned box (centred over the tile by
 * CSS) holding the text, which is what animates.
 * @param {Element} svg
 * @param {HTMLElement} overlay
 * @param {Track} track
 * @returns {Animation|null}
 */
function showCallout(svg, overlay, track) {
  const target = track.target;
  if (target.kind !== 'callout') return null;
  const size = boardSize(svg);
  const box = document.createElement('div');
  box.className = 'board-callout';
  box.style.left = `${((target.at[0] + 0.5) * TILE * 100) / size}%`;
  box.style.top = `${(target.at[1] * TILE * 100) / size}%`;
  const text = document.createElement('span');
  text.className = 'board-callout__text';
  text.textContent = target.text;
  box.appendChild(text);
  overlay.appendChild(box);
  const anim = animateTrack(text, track);
  if (anim === null) {
    box.remove();
    return null;
  }
  const drop = () => box.remove();
  anim.onfinish = drop;
  anim.oncancel = drop;
  return anim;
}

/**
 * Plays a motion on the board as drawn from the state before the move.
 * Returns null, after showing the call-outs and playing the sounds due at
 * once, when there is nothing to play (`motion.end` is 0) or no Web
 * Animations API: the caller then swaps to the new state itself.
 * Otherwise `onEnd` is called once, when the sequence ends or on
 * `finish()`, after every animation on the old drawing is cancelled.
 * @param {SVGSVGElement} svg
 * @param {HTMLElement|null} overlay  where call-outs go (over the board)
 * @param {Motion} motion
 * @param {{onEnd: () => void, sound?: SoundLike|null, cues?: Array<{at: number, name: SoundName}>}} opts
 * @returns {Playing|null}
 */
export function playMotion(svg, overlay, motion, opts) {
  const sound = opts.sound ?? null;
  const cues = opts.cues ?? [];
  const live = animatable(svg);

  /** @type {Array<{anim: Animation, start: number}>} */
  const callouts = [];
  if (live && overlay !== null) {
    for (const track of motion.detached) {
      const anim = showCallout(svg, overlay, track);
      if (anim !== null) callouts.push({ anim, start: track.start });
    }
  }

  /** @type {ReturnType<typeof setTimeout>[]} */
  const timers = [];
  for (const cue of cues) {
    if (sound === null) break;
    if (cue.at <= 0 || !live || motion.end <= 0) sound.play(cue.name);
    else timers.push(setTimeout(() => sound.play(cue.name), cue.at));
  }

  if (!live || motion.end <= 0) return null;

  /** @type {Element|null} */
  let fxLayer = null;
  const layer = () => {
    if (fxLayer === null) fxLayer = el('g', { 'data-layer': 'fx', 'pointer-events': 'none' }, svg);
    return fxLayer;
  };
  /** @type {Map<string, Element>} */
  const made = new Map();
  /** @type {Animation[]} */
  const anims = [];
  for (const track of motion.during) {
    const target = track.target;
    let node = null;
    if (target.kind === 'fx') {
      node = made.get(target.id) ?? null;
      if (node === null) {
        node = makeFx(svg, layer, target);
        made.set(target.id, node);
      }
    } else {
      node = findTarget(svg, target);
    }
    if (node === null) continue;
    const anim = animateTrack(node, track);
    if (anim !== null) anims.push(anim);
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    for (const timer of timers) clearTimeout(timer);
    for (const anim of anims) anim.cancel();
    if (fxLayer !== null) fxLayer.remove();
    // A call-out still waiting for its moment shows now.
    for (const { anim, start } of callouts) {
      const now = typeof anim.currentTime === 'number' ? anim.currentTime : 0;
      if (now < start) anim.currentTime = start;
    }
    opts.onEnd();
  };
  timers.push(setTimeout(finish, motion.end));
  return { finish };
}

/**
 * Plays the tracks that follow the swap (what fades back in) on the new
 * drawing. Nothing waits for them, and a later redraw just drops them.
 * @param {SVGSVGElement} svg
 * @param {Track[]} tracks
 * @returns {void}
 */
export function playAfter(svg, tracks) {
  if (!animatable(svg)) return;
  for (const track of tracks) {
    const node = findTarget(svg, track.target);
    if (node !== null) animateTrack(node, track);
  }
}
