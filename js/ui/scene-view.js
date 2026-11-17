// The scene overlay (opening-act spec, "The scene system"; plan Task 5).
//
// One modal layer on document.body plays any scene over whatever screen
// is underneath, laid out like a visual novel: the screen stays visible
// through a light dimming, up to two cut-out portraits stand at the
// bottom left and right (the speaker bright and a little forward, the
// other dimmed), and a text box runs across the bottom in front of them.
// A line that points at something rings it, hides the cut-outs behind a
// small head in the box, and moves the box to the other half. A cut-out
// in its plain portrait blinks now and then, the two never in step
// (js/ui/blink.js); not under prefers-reduced-motion.
//
// Tap anywhere, Enter or Space goes on; Skip or Escape ends the scene.
// Only one scene is open at a time: a second playScene waits its turn.
//
// `boxSide` and `stageFor` are pure; `playScene` draws. Colours and sizes
// are in css/scene.css.

import { speakerSpec, portraitSvg, blinkFor } from './portraits.js';
import { createBlinker, whenDecoded, prefersReducedMotion } from './blink.js';
import { keyHint } from './keys.js';

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../story/types.js').Pointer} Pointer */
/** @typedef {import('../story/types.js').Mood} Mood */
/** @typedef {import('../story/types.js').Line} Line */
/** @typedef {import('../story/types.js').Scene} Scene */

/** @typedef {{x: number, y: number, width: number, height: number}} Rect */
/** @typedef {'left'|'right'} Side */
/** @typedef {{who: string, mood: Mood|undefined}} Standing */
/** @typedef {{left: Standing|null, right: Standing|null, speaking: Side|null, compact: boolean}} Stage */
/** @typedef {import('./blink.js').Clock} Clock */
/**
 * @typedef {{resolve?: (p: Pointer) => Rect|null, reducedMotion?: boolean, clock?: Clock,
 *   portraits?: readonly string[]}} PlayOptions
 *   clock: what the blinking runs on (the page's by default); portraits:
 *   the portrait ids that exist (js/ui/portrait-list.js by default)
 */

/** Where each speaker stands when free to: the fox on the left, everyone else on the right. */
/** @type {Readonly<Record<string, Side>>} */
export const HOME_SIDE = Object.freeze({ fox: 'left' });

/** How far the ring stands off the rectangle it rings, in px. */
const RING_PAD = 6;

/**
 * Which half of the screen the text box goes in: the one away from what
 * is pointed at. Nothing pointed at: the bottom.
 * @param {number} viewportH
 * @param {Rect|null} pointRect
 * @returns {'bottom'|'top'}
 */
export function boxSide(viewportH, pointRect) {
  if (pointRect === null) return 'bottom';
  return pointRect.y + pointRect.height / 2 > viewportH / 2 ? 'top' : 'bottom';
}

/**
 * Who stands where while line `index` shows. Walks lines 0..index: a
 * speaker already on stage stays put; a new one takes their home side if
 * it is free, else the other side if that is, else replaces whoever spoke
 * longest ago. Each shows the mood of their own latest line. The narrator
 * changes nothing and speaks from neither side.
 * @param {readonly Line[]} lines
 * @param {number} index
 * @returns {Stage}
 */
export function stageFor(lines, index) {
  /** @type {Record<Side, {who: string, mood: Mood|undefined, last: number}|null>} */
  const slots = { left: null, right: null };
  /** @type {Side|null} */
  let speaking = null;
  for (let i = 0; i <= index && i < lines.length; i += 1) {
    const { who, mood } = lines[i];
    if (who === 'narrator') {
      speaking = null;
      continue;
    }
    /** @type {Side} */
    let side;
    if (slots.left?.who === who) side = 'left';
    else if (slots.right?.who === who) side = 'right';
    else {
      const home = HOME_SIDE[who] ?? 'right';
      const other = home === 'left' ? 'right' : 'left';
      if (slots[home] === null) side = home;
      else if (slots[other] === null) side = other;
      else side = /** @type {{last: number}} */ (slots.left).last <= /** @type {{last: number}} */ (slots.right).last ? 'left' : 'right';
    }
    slots[side] = { who, mood, last: i };
    speaking = side;
  }
  /** @param {{who: string, mood: Mood|undefined}|null} slot @returns {Standing|null} */
  const standing = (slot) => (slot === null ? null : { who: slot.who, mood: slot.mood });
  return {
    left: standing(slots.left),
    right: standing(slots.right),
    speaking,
    compact: lines[index]?.point !== undefined,
  };
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function html(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Scenes waiting for the one on screen to close. @type {Array<() => void>} */
const waiting = [];
let open = false;

function startNext() {
  const start = waiting.shift();
  if (start === undefined) {
    open = false;
    return;
  }
  open = true;
  start();
}

/**
 * Plays a scene over the screen. A second call while one is open waits
 * for the first to finish.
 * @param {Scene} scene
 * @param {PlayOptions} [opts]
 * @returns {Promise<'done'|'skipped'>}
 */
export function playScene(scene, opts = {}) {
  return new Promise((resolve, reject) => {
    waiting.push(() => {
      try {
        show(scene, opts, (result) => {
          resolve(result);
          startNext();
        });
      } catch (err) {
        reject(err);
        startNext();
      }
    });
    if (!open) startNext();
  });
}

/**
 * Draws the layer and runs the scene until it is finished or skipped.
 * @param {Scene} scene
 * @param {PlayOptions} opts
 * @param {(result: 'done'|'skipped') => void} finish  called once, after the layer is gone
 * @returns {void}
 */
function show(scene, opts, finish) {
  const lines = scene.lines;
  if (lines.length === 0) {
    finish('done');
    return;
  }
  const doc = document;
  const body = doc.body;

  const layer = html('div', 'scene');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'Story');
  layer.tabIndex = -1;
  layer.dataset.scene = scene.id;
  const reduced = opts.reducedMotion ?? prefersReducedMotion();
  layer.dataset.motion = reduced ? 'reduced' : 'full';
  const blinker = reduced ? null : createBlinker(opts.clock);

  const ring = html('div', 'scene__ring');
  ring.hidden = true;

  const stage = html('div', 'scene__stage');
  /** @type {Record<Side, HTMLElement>} */
  const cutouts = {
    left: html('figure', 'scene__cutout scene__cutout--left'),
    right: html('figure', 'scene__cutout scene__cutout--right'),
  };
  for (const side of /** @type {Side[]} */ (['left', 'right'])) {
    cutouts[side].dataset.side = side;
    cutouts[side].dataset.who = '';
    cutouts[side].dataset.mood = '';
    cutouts[side].hidden = true;
    stage.appendChild(cutouts[side]);
  }

  const box = html('div', 'scene__box ui-panel--wood');
  const top = html('div', 'scene__top');
  const head = html('div', 'scene__head-wrap');
  head.hidden = true;
  const name = html('p', 'scene__name');
  top.append(head, name);
  const text = html('p', 'scene__text');
  text.setAttribute('aria-live', 'polite');
  const foot = html('div', 'scene__foot');
  const more = html('span', 'scene__more', 'tap ▸');
  more.appendChild(keyHint('Enter'));
  const skip = html('button', 'scene__skip ui-btn ui-btn--secondary ui-btn--small', 'Skip');
  skip.type = 'button';
  skip.appendChild(keyHint('Esc'));
  foot.append(more, skip);
  box.append(top, text, foot);
  layer.append(ring, stage, box);

  let index = 0;
  let closed = false;

  /**
   * Fills a cut-out with whoever stands there, redrawing only when the
   * character or their mood changes.
   * @param {Side} side
   * @param {Standing|null} who
   * @param {boolean} speaking
   */
  function placeCutout(side, who, speaking) {
    const fig = cutouts[side];
    if (who === null) {
      blinker?.remove(side);
      fig.hidden = true;
      fig.dataset.who = '';
      fig.dataset.mood = '';
      fig.replaceChildren();
      return;
    }
    const mood = who.mood ?? '';
    if (fig.dataset.who !== who.who || fig.dataset.mood !== mood) {
      blinker?.remove(side);
      fig.dataset.who = who.who;
      fig.dataset.mood = mood;
      fig.replaceChildren();
      const spec = speakerSpec(who.who, who.mood, opts.portraits).portrait;
      const here = () => !closed && fig.dataset.who === who.who && fig.dataset.mood === mood;
      if (spec !== null && spec.kind === 'image') {
        const img = html('img', 'scene__art');
        img.alt = spec.alt;
        // An image that fails to load (a file gone missing, the network
        // down before the offline copy is in) gives way to the stamp.
        img.addEventListener('error', () => {
          const stamp = speakerSpec(who.who, who.mood, []).portrait;
          // Only while this character, in this mood, still stands here.
          if (!here()) return;
          blinker?.remove(side);
          if (stamp === null) img.remove();
          else fig.replaceChildren(portraitSvg(stamp, 'scene__stamp'));
        });
        img.src = spec.href;
        fig.appendChild(img);
        // The closed eyes, stacked over the plain portrait and shown only
        // for a blink. They start once both images are decoded.
        const blinkHref = blinker === null ? null : blinkFor(spec, opts.portraits);
        if (blinker !== null && blinkHref !== null) {
          const eyes = html('img', 'scene__art scene__blink');
          eyes.alt = '';
          eyes.setAttribute('aria-hidden', 'true');
          eyes.style.opacity = '0';
          eyes.addEventListener('error', () => {
            if (eyes.parentElement === fig) blinker.remove(side);
            eyes.remove();
          });
          eyes.src = blinkHref;
          fig.appendChild(eyes);
          whenDecoded([img, eyes]).then(() => {
            if (!here() || eyes.parentElement !== fig) return;
            blinker.add(side, (shut) => { eyes.style.opacity = shut ? '1' : '0'; });
          }, () => eyes.remove());
        }
      } else if (spec !== null) {
        fig.appendChild(portraitSvg(spec, 'scene__stamp'));
      }
    }
    fig.hidden = false;
    fig.dataset.speaking = String(speaking);
  }

  function render() {
    const line = lines[index];
    const now = stageFor(lines, index);
    const speaker = speakerSpec(line.who, line.mood);

    placeCutout('left', now.left, now.speaking === 'left');
    placeCutout('right', now.right, now.speaking === 'right');
    stage.hidden = now.compact || (now.left === null && now.right === null);
    layer.dataset.compact = String(now.compact);

    head.replaceChildren();
    head.hidden = !now.compact || speaker.portrait === null;
    if (now.compact && speaker.portrait !== null) head.appendChild(portraitSvg(speaker.portrait, 'scene__head'));

    name.textContent = speaker.name;
    name.hidden = speaker.name === '';
    box.dataset.speaker = now.speaking ?? 'none';
    text.textContent = line.text;
    text.scrollTop = 0;

    const rect = line.point !== undefined && opts.resolve !== undefined ? opts.resolve(line.point) : null;
    ring.hidden = rect === null;
    if (rect !== null) {
      ring.style.left = `${rect.x - RING_PAD}px`;
      ring.style.top = `${rect.y - RING_PAD}px`;
      ring.style.width = `${rect.width + RING_PAD * 2}px`;
      ring.style.height = `${rect.height + RING_PAD * 2}px`;
    }
    const viewportH = typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 0;
    layer.dataset.side = boxSide(viewportH, rect);
  }

  /** @param {'done'|'skipped'} result */
  function close(result) {
    if (closed) return;
    closed = true;
    blinker?.stop();
    if (typeof doc.removeEventListener === 'function') doc.removeEventListener('keydown', onKey, true);
    layer.remove();
    for (const node of madeInert) node.inert = false;
    const back = /** @type {{focus?: () => void}|null} */ (before);
    if (back !== null && typeof back.focus === 'function') back.focus();
    finish(result);
  }

  function next() {
    if (closed) return;
    if (index >= lines.length - 1) close('done');
    else {
      index += 1;
      render();
    }
  }

  /** @param {KeyboardEvent} evt */
  function onKey(evt) {
    // The overlay owns the keys while it is open: nothing reaches the
    // battle's own listeners.
    evt.stopPropagation();
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
    if (evt.key === 'Escape') {
      evt.preventDefault();
      close('skipped');
      return;
    }
    if (evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return;
    // On a focused Skip button, Enter and Space press Skip.
    if (evt.target === skip) return;
    evt.preventDefault();
    if (evt.repeat) return;
    next();
  }

  layer.addEventListener('click', (evt) => {
    evt.stopPropagation();
    next();
  });
  skip.addEventListener('click', (evt) => {
    evt.stopPropagation();
    close('skipped');
  });

  // Nothing underneath can be tapped or focused while the scene is open.
  /** @type {HTMLElement[]} */
  const madeInert = [];
  for (const node of /** @type {HTMLElement[]} */ (Array.from(body.children))) {
    if (node.inert === true) continue;
    node.inert = true;
    madeInert.push(node);
  }
  const before = doc.activeElement;
  render();
  body.appendChild(layer);
  if (typeof doc.addEventListener === 'function') doc.addEventListener('keydown', onKey, true);
  const focusable = /** @type {{focus?: (o?: object) => void}} */ (/** @type {unknown} */ (layer));
  if (typeof focusable.focus === 'function') focusable.focus({ preventScroll: true });
}
