// The title screen: a painted scene in layers, the game's name as a
// painted wordmark, one main button within thumb reach, and a sound
// toggle.
//
// Layers, back to front (js/ui/title-scene.js decides them): the
// valley, mist drawn in code, the forest archway with the cast standing
// in it, the nearest ferns, a few motes drawn in code, the name, the
// buttons. Every image is optional (js/ui/title-assets.js, written by
// scripts/title-assets.mjs): with none of them the scene is a
// code-drawn gradient in the game's palette and the name is typed
// (css/title.css).
//
// What the scene shows follows the save (js/ui/title-state.js): who has
// joined the fox and the hedgehog, and how the valley is mending.
//
// `renderTitle` turns the layers into DOM. Animation lives in
// css/title.css (transform and opacity only) and is stilled under
// prefers-reduced-motion. Nothing moves the view itself.

import { TITLE_ASSETS, WORDMARK_NAME } from './title-assets.js';
import { titleLayers } from './title-scene.js';
import { NEW_TITLE_STATE } from './title-state.js';
import { titleKey, focusKind, keyHint, keyListBox, takeKeys, TITLE_KEY_LIST } from './keys.js';

/** @typedef {import('./title-scene.js').TitleAssets} TitleAssets */
/** @typedef {import('./title-state.js').TitleState} TitleState */

/**
 * The game's name. A working title: change it here, and repaint the
 * wordmark (scripts/title-assets.mjs, WORDMARK_NAME); until then the
 * name is typed.
 */
export const GAME_TITLE = 'Undergrowth';

/**
 * One drifting mote: `left` across the screen in %, `size` in px, and
 * its rise `duration`/`delay` in seconds.
 * @typedef {{left: number, size: number, delay: number, duration: number, opacity: number}} Mote
 */

/**
 * The main button's label: "Continue" when there is a save to continue.
 * @param {boolean} hasSave
 * @returns {string}
 */
export function startLabel(hasSave) {
  return hasSave ? 'Continue' : 'Begin';
}

/**
 * Deterministic hash of a small integer, in [0, 1).
 * @param {number} n
 * @returns {number}
 */
function hash01(n) {
  let h = Math.imul(n + 1, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {number} v
 * @param {number} places
 * @returns {number}
 */
function round(v, places) {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/** How many motes drift over the scene. */
export const MOTE_COUNT = 10;

/**
 * The motes: a few small, slow specks of light, the same every time.
 * @param {number} [count]
 * @returns {Mote[]}
 */
export function moteSpecs(count = MOTE_COUNT) {
  /** @type {Mote[]} */
  const motes = [];
  for (let i = 0; i < count; i += 1) {
    motes.push({
      left: round(4 + hash01(i * 5) * 92, 1),
      size: round(2 + hash01(i * 5 + 1) * 5, 1),
      delay: round(hash01(i * 5 + 2) * 14, 1),
      duration: round(12 + hash01(i * 5 + 3) * 14, 1),
      opacity: round(0.25 + hash01(i * 5 + 4) * 0.5, 2),
    });
  }
  return motes;
}

/**
 * @returns {boolean} true under prefers-reduced-motion, when the
 *   browser can say; false where it cannot (the CSS media query in
 *   css/title.css stills the screen either way)
 */
function prefersReducedMotion() {
  const match = globalThis.matchMedia;
  return typeof match === 'function' && match('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @returns {boolean} true when the player has a mouse or the like: a
 *   pointer that hovers
 */
function hasFinePointer() {
  const match = globalThis.matchMedia;
  return typeof match === 'function' && match('(hover: hover) and (pointer: fine)').matches;
}

/**
 * @returns {boolean} true when the screen is at least as wide as it is
 *   tall: it takes the wide paintings
 */
function isWideScreen() {
  const match = globalThis.matchMedia;
  return typeof match === 'function' && match('(min-aspect-ratio: 1/1)').matches;
}

/**
 * @typedef {object} TitleOptions
 * @property {boolean} hasSave true when the save has anything in it:
 *   the main button then reads "Continue"
 * @property {boolean} soundOn the saved sound setting, shown on the toggle
 * @property {(next: boolean) => void} onSound called from inside the
 *   toggle's tap, so turning sound on may start audio at once
 * @property {() => void} onStart leave the title screen
 * @property {TitleState} [state] what the save says the scene shows; by
 *   default a game not yet begun
 * @property {Readonly<Record<string, string|null>>} [assets] the artwork
 *   that exists; by default the generated list in js/ui/title-assets.js
 * @property {string} [wordmarkName] the name lettered in the wordmark
 *   image: it is drawn only while that is the game's name
 * @property {boolean} [wide] a screen at least as wide as tall; by
 *   default read from the browser
 * @property {boolean} [reducedMotion] by default read from the browser
 */

/**
 * Draws the title screen into `root`, replacing what was there. The
 * main button (or Enter) calls `onStart`; the sound toggle calls
 * `onSound` with the next value and shows it at once.
 * @param {HTMLElement} root
 * @param {TitleOptions} opts
 * @returns {void}
 */
export function renderTitle(root, opts) {
  const assets = opts.assets ?? TITLE_ASSETS;
  const wide = opts.wide ?? isWideScreen();
  const reducedMotion = opts.reducedMotion ?? prefersReducedMotion();
  const layers = titleLayers(assets, opts.state ?? NEW_TITLE_STATE, { wide, reducedMotion });
  const wordmark = (opts.wordmarkName ?? WORDMARK_NAME) === GAME_TITLE ? (assets.wordmark ?? null) : null;
  let soundOn = opts.soundOn;
  // The title is left once: Enter on the focused button reaches the key
  // listener below and then presses the button, and a double tap presses
  // it twice.
  let left = false;
  const start = () => {
    if (left) return;
    left = true;
    opts.onStart();
  };

  root.replaceChildren();

  const screen = document.createElement('section');
  screen.className = 'title-screen';
  screen.setAttribute('aria-label', GAME_TITLE);
  screen.setAttribute('data-reduced-motion', String(reducedMotion));
  if (reducedMotion) screen.classList.add('is-still');
  root.appendChild(screen);

  /**
   * A decorative image: the paintings say nothing a screen reader needs.
   * @param {string} src
   * @param {string} className
   * @returns {HTMLImageElement}
   */
  function image(src, className) {
    const img = document.createElement('img');
    img.className = className;
    img.setAttribute('src', src);
    img.setAttribute('alt', '');
    return img;
  }

  /**
   * @param {import('./title-scene.js').TitleLayer} layer
   * @param {string} className
   * @returns {HTMLDivElement}
   */
  function layerBox(layer, className) {
    const div = document.createElement('div');
    div.className = className;
    div.setAttribute('data-layer', layer.id);
    div.setAttribute('data-animated', String(layer.animated));
    div.setAttribute('aria-hidden', 'true');
    if (layer.shape !== undefined) div.setAttribute('data-shape', layer.shape);
    return div;
  }

  /** @type {HTMLButtonElement|null} */
  let startBtn = null;
  /** @type {HTMLButtonElement|null} */
  let soundBtn = null;

  for (const layer of layers) {
    if (layer.id === 'title') {
      const wrap = document.createElement('div');
      wrap.className = 'title-heading';
      wrap.setAttribute('data-layer', 'title');
      wrap.setAttribute('data-animated', String(layer.animated));
      // The name is always text, for screen readers and as the fallback.
      // The painted wordmark is drawn over it when it exists (the text is
      // then clipped away by css/title.css) and gives way if it fails to
      // load.
      const name = document.createElement('h1');
      name.className = 'title-name';
      const text = document.createElement('span');
      text.className = 'title-name-text';
      text.textContent = GAME_TITLE;
      name.appendChild(text);
      if (wordmark !== null) {
        const mark = image(wordmark, 'title-wordmark');
        name.classList.add('has-wordmark');
        mark.addEventListener('error', () => {
          name.classList.remove('has-wordmark');
          mark.remove();
        });
        name.appendChild(mark);
      }
      wrap.appendChild(name);
      screen.appendChild(wrap);
    } else if (layer.id === 'controls') {
      const controls = document.createElement('div');
      controls.className = 'title-controls';
      controls.setAttribute('data-layer', 'controls');
      controls.setAttribute('data-animated', String(layer.animated));
      screen.appendChild(controls);

      startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'title-start ui-btn ui-btn--primary ui-btn--large';
      startBtn.textContent = startLabel(opts.hasSave);
      startBtn.appendChild(keyHint('Enter'));
      startBtn.addEventListener('click', start);
      controls.appendChild(startBtn);

      soundBtn = document.createElement('button');
      soundBtn.type = 'button';
      soundBtn.className = 'title-sound ui-btn ui-btn--secondary ui-btn--small';
      soundBtn.addEventListener('click', () => toggleSound());
      paintSound();
      controls.appendChild(soundBtn);
    } else if (layer.id === 'motes') {
      const motes = document.createElement('div');
      motes.className = 'title-motes';
      motes.setAttribute('data-layer', 'motes');
      motes.setAttribute('data-animated', String(layer.animated));
      motes.setAttribute('aria-hidden', 'true');
      for (const mote of moteSpecs()) {
        const dot = document.createElement('span');
        dot.className = 'title-mote';
        dot.style.left = `${mote.left}%`;
        dot.style.width = `${mote.size}px`;
        dot.style.height = `${mote.size}px`;
        dot.style.opacity = String(mote.opacity);
        dot.style.animationDelay = `${mote.delay}s`;
        dot.style.animationDuration = `${mote.duration}s`;
        motes.appendChild(dot);
      }
      const leaf = document.createElement('span');
      leaf.className = 'title-leaf';
      motes.appendChild(leaf);
      screen.appendChild(motes);
    } else if (layer.id === 'valley') {
      // The valley's box is the painting's own shape, covering the
      // screen (css/title.css), so the lamps stay on the machines.
      const div = layerBox(layer, layer.src === null ? 'title-layer title-valley title-valley--gradient' : 'title-layer title-valley');
      if (layer.src !== null) div.appendChild(image(layer.src, 'title-valley-img'));
      for (const lamp of layer.lamps ?? []) {
        const dot = document.createElement('span');
        dot.className = 'title-lamp';
        dot.style.left = `${lamp.left}%`;
        dot.style.top = `${lamp.top}%`;
        div.appendChild(dot);
      }
      screen.appendChild(div);
    } else if (layer.id === 'mist') {
      const div = layerBox(layer, 'title-mist');
      for (const n of [1, 2]) {
        const band = document.createElement('span');
        band.className = `title-mist-band title-mist-band--${n}`;
        div.appendChild(band);
      }
      screen.appendChild(div);
    } else if (layer.id === 'arch' && layer.src !== null) {
      // The archway's box, too, is its painting's shape; the cast are
      // placed in percentages of it, so they stand on the painted root.
      const div = layerBox(layer, 'title-layer title-arch');
      div.appendChild(image(layer.src, 'title-arch-img'));
      const shafts = document.createElement('div');
      shafts.className = 'title-shafts';
      for (const n of [1, 2, 3]) {
        const shaft = document.createElement('span');
        shaft.className = `title-shaft title-shaft--${n}`;
        shafts.appendChild(shaft);
      }
      div.appendChild(shafts);
      for (const member of layer.cast ?? []) {
        const img = image(member.src, 'title-cast');
        img.setAttribute('data-cast', member.id);
        img.style.left = `${member.spot.left}%`;
        img.style.bottom = `${member.spot.bottom}%`;
        img.style.width = `${member.spot.width}%`;
        div.appendChild(img);
      }
      screen.appendChild(div);
    } else if (layer.id === 'ferns') {
      const div = layerBox(layer, 'title-ferns');
      if (layer.ferns?.left != null) div.appendChild(image(layer.ferns.left, 'title-fern title-fern--left'));
      if (layer.ferns?.right != null) div.appendChild(image(layer.ferns.right, 'title-fern title-fern--right'));
      screen.appendChild(div);
    }
  }

  // Depth: under a mouse the layers shift a few pixels against each
  // other, the nearest most (css/title.css reads --px and --py, each -1
  // to 1 from the screen's centre). It follows the hand and stops when
  // the hand stops; a touch screen has no hover to follow, and reduced
  // motion wants nothing to move.
  if (!reducedMotion && hasFinePointer()) {
    screen.addEventListener('pointermove', (evt) => {
      const box = screen.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const unit = (/** @type {number} */ v) => String(Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100);
      screen.style.setProperty('--px', unit(((evt.clientX - box.left) / box.width) * 2 - 1));
      screen.style.setProperty('--py', unit(((evt.clientY - box.top) / box.height) * 2 - 1));
    });
  }

  // The keys (js/ui/keys.js, titleKey): Enter starts, from anywhere on
  // the screen but a sound toggle the keyboard reached (where Enter is
  // its own tap); S turns the sound on or off; ? shows the keys. A held
  // key does not start twice.
  /** @type {HTMLElement|null} */
  let keysBox = null;
  const toggleKeys = () => {
    if (keysBox !== null) {
      keysBox.remove();
      keysBox = null;
      return;
    }
    // Enter is "Continue" when there is a save, as the button says.
    const list = TITLE_KEY_LIST.map((e) => (e.keys === 'Enter' ? { ...e, does: startLabel(opts.hasSave) } : e));
    keysBox = keyListBox(list, { screen: true, onClose: toggleKeys });
    screen.appendChild(keysBox);
  };
  function toggleSound() {
    soundOn = !soundOn;
    paintSound();
    opts.onSound(soundOn);
  }
  /** The toggle shows the setting, with its key. */
  function paintSound() {
    if (soundBtn === null) return;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Sound on' : 'Sound off');
    soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
    soundBtn.appendChild(keyHint('S'));
  }
  const doc = /** @type {Document|undefined} */ (globalThis.document);
  const stopKeys = takeKeys((evt) => {
    if (left) return;
    const command = titleKey(evt, { focus: focusKind(doc?.activeElement) });
    if (command === null) return;
    // A button the keyboard reached takes Enter itself; anywhere else,
    // Enter is the main button. (The start button has the focus, but only
    // a keyboard's focus is left to the button.)
    evt.preventDefault();
    if (command === 'main') {
      stopKeys();
      start();
    } else if (command === 'sound') toggleSound();
    else if (command === 'help') toggleKeys();
    else if (command === 'back' && keysBox !== null) toggleKeys();
  });

  try {
    startBtn?.focus();
  } catch {
    // No focus to give (a test double, an odd browser): the tap still works.
  }
}
