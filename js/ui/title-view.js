// The title screen: the game's name drawn in code over a layered
// scene, one main button within thumb reach, and a sound toggle.
//
// Layers, back to front: the scene, the cast cut-out, the foliage
// frame, a few drifting motes drawn in code, the title, the buttons.
// Every image is optional (js/ui/title-assets.js, written by
// scripts/title-assets.mjs): with none of them the scene is a
// code-drawn gradient in the game's palette (css/title.css).
//
// The top half is pure: which scene, which layers, where the motes
// drift. `renderTitle` turns that into DOM. Animation lives in
// css/title.css (transform and opacity only) and is stilled under
// prefers-reduced-motion.

import { TITLE_ASSETS } from './title-assets.js';
import { titleKey, focusKind, keyHint, keyListBox, takeKeys, TITLE_KEY_LIST } from './keys.js';

/** The game's name. A working title: change it here and nowhere else. */
export const GAME_TITLE = 'Undergrowth';

/**
 * The title artwork that exists as shipped files under assets/title/,
 * or null for each piece that does not. Paths are relative to
 * index.html.
 * @typedef {{bg: string|null, bgWide: string|null, cast: string|null,
 *   foreground: string|null, theme: string|null}} TitleAssets
 */

/**
 * One layer of the title screen, back to front. `src` is the image to
 * draw, or null for a code-drawn layer (the gradient scene, the motes,
 * the title, the controls). `animated` is false under reduced motion.
 * @typedef {{id: string, src: string|null, animated: boolean}} TitleLayer
 */

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
 * Which scene image to draw. A wide screen takes the 16:9 scene when
 * it exists and otherwise the tall scene cropped to cover (the CSS
 * `object-fit: cover` does the cropping); a portrait screen takes the
 * tall scene. Null when neither exists: the gradient stands in.
 * @param {TitleAssets} assets
 * @param {boolean} wide
 * @returns {string|null}
 */
export function pickScene(assets, wide) {
  return wide ? (assets.bgWide ?? assets.bg) : (assets.bg ?? assets.bgWide);
}

/**
 * The layers to draw, back to front, for this combination of assets.
 * The scene, the motes, the title and the controls are always drawn;
 * the cast and the foliage frame only when their files exist.
 * @param {TitleAssets} assets
 * @param {{wide: boolean, reducedMotion: boolean}} opts
 * @returns {TitleLayer[]}
 */
export function titleLayers(assets, opts) {
  const animated = !opts.reducedMotion;
  /** @type {TitleLayer[]} */
  const layers = [{ id: 'scene', src: pickScene(assets, opts.wide), animated }];
  if (assets.cast !== null) layers.push({ id: 'cast', src: assets.cast, animated });
  if (assets.foreground !== null) layers.push({ id: 'foreground', src: assets.foreground, animated });
  layers.push(
    { id: 'motes', src: null, animated },
    { id: 'title', src: null, animated },
    { id: 'controls', src: null, animated },
  );
  return layers;
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
 * @returns {boolean} true when the screen is wider than it is tall
 */
function isWideScreen() {
  const match = globalThis.matchMedia;
  return typeof match === 'function' && match('(orientation: landscape)').matches;
}

/**
 * @typedef {object} TitleOptions
 * @property {boolean} hasSave true when the save has anything in it:
 *   the main button then reads "Continue"
 * @property {boolean} soundOn the saved sound setting, shown on the toggle
 * @property {(next: boolean) => void} onSound called from inside the
 *   toggle's tap, so turning sound on may start audio at once
 * @property {() => void} onStart leave the title screen
 * @property {TitleAssets} [assets] the artwork that exists; by default
 *   the generated list in js/ui/title-assets.js
 * @property {boolean} [wide] a wide (landscape) screen; by default read
 *   from the browser
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
  const layers = titleLayers(assets, { wide, reducedMotion });
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
      const name = document.createElement('h1');
      name.className = 'title-name';
      name.textContent = GAME_TITLE;
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
      screen.appendChild(motes);
    } else {
      // scene, cast, foreground: an image layer, or the gradient scene.
      const div = document.createElement('div');
      div.className = layer.id === 'scene' && layer.src === null
        ? 'title-layer title-scene title-scene--gradient'
        : `title-layer title-${layer.id}`;
      div.setAttribute('data-layer', layer.id);
      div.setAttribute('data-animated', String(layer.animated));
      div.setAttribute('aria-hidden', 'true');
      if (layer.src !== null) {
        const img = document.createElement('img');
        img.setAttribute('src', layer.src);
        img.setAttribute('alt', '');
        div.appendChild(img);
      }
      screen.appendChild(div);
    }
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
