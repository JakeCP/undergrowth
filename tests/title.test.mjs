// The title screen (js/ui/title-view.js): the game's name in code, one
// main button ("Begin", or "Continue" with a save), a sound toggle, and
// layered art that degrades to a code-drawn gradient with no assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import {
  GAME_TITLE, startLabel, pickScene, titleLayers, moteSpecs, renderTitle,
} from '../js/ui/title-view.js';

installFakeDom({ canvas: true });

const NONE = { bg: null, bgWide: null, cast: null, foreground: null, theme: null };
const ALL = {
  bg: 'assets/title/title-bg.webp',
  bgWide: 'assets/title/title-bg-wide.webp',
  cast: 'assets/title/title-cast.webp',
  foreground: 'assets/title/title-foreground.webp',
  theme: 'assets/title/title-theme.mp3',
};

/** @param {FakeEl} root @param {string} cls */
const byClass = (root, cls) => root.all().filter(
  (n) => typeof n.className === 'string' && n.className.split(' ').includes(cls),
);

function mount(opts = {}) {
  const root = new FakeEl('div');
  let starts = 0;
  /** @type {boolean[]} */
  const sounds = [];
  renderTitle(/** @type {any} */ (root), {
    hasSave: false,
    soundOn: false,
    assets: NONE,
    wide: false,
    reducedMotion: false,
    onStart: () => { starts += 1; },
    onSound: (next) => { sounds.push(next); },
    ...opts,
  });
  return { root, starts: () => starts, sounds };
}

// --- the name and the main button (pure) ---

test('the game title is one code constant, never baked into an image', () => {
  assert.equal(GAME_TITLE, 'Undergrowth');
});

test('the main button reads "Begin" without a save and "Continue" with one', () => {
  assert.equal(startLabel(false), 'Begin');
  assert.equal(startLabel(true), 'Continue');
  assert.equal(byClass(mount({ hasSave: false }).root, 'title-start')[0].textContent, 'Begin');
  assert.equal(byClass(mount({ hasSave: true }).root, 'title-start')[0].textContent, 'Continue');
});

// --- which scene, which layers (pure) ---

test('pickScene: portrait takes the tall scene, wide takes the 16:9 scene', () => {
  assert.equal(pickScene(ALL, false), ALL.bg);
  assert.equal(pickScene(ALL, true), ALL.bgWide);
});

test('pickScene: a wide screen falls back to the tall scene cropped to cover', () => {
  assert.equal(pickScene({ ...ALL, bgWide: null }, true), ALL.bg);
  assert.equal(pickScene({ ...ALL, bg: null }, false), ALL.bgWide);
  assert.equal(pickScene(NONE, false), null);
  assert.equal(pickScene(NONE, true), null);
});

test('titleLayers: with every asset, scene, cast, foliage, motes, title, controls', () => {
  const layers = titleLayers(ALL, { wide: false, reducedMotion: false });
  assert.deepEqual(layers.map((l) => l.id), ['scene', 'cast', 'foreground', 'motes', 'title', 'controls']);
  assert.equal(layers[0].src, ALL.bg);
  assert.equal(layers[1].src, ALL.cast);
  assert.equal(layers[2].src, ALL.foreground);
  assert.ok(layers.every((l) => l.animated), 'everything drifts or fades');
});

test('titleLayers: missing cut-outs are simply not drawn', () => {
  const ids = (assets) => titleLayers(assets, { wide: false, reducedMotion: false }).map((l) => l.id);
  assert.deepEqual(ids({ ...ALL, cast: null }), ['scene', 'foreground', 'motes', 'title', 'controls']);
  assert.deepEqual(ids({ ...ALL, foreground: null }), ['scene', 'cast', 'motes', 'title', 'controls']);
  assert.deepEqual(ids({ ...ALL, cast: null, foreground: null }), ['scene', 'motes', 'title', 'controls']);
});

test('titleLayers: with no assets at all the scene is the code-drawn gradient', () => {
  const layers = titleLayers(NONE, { wide: true, reducedMotion: false });
  assert.deepEqual(layers.map((l) => l.id), ['scene', 'motes', 'title', 'controls']);
  assert.equal(layers[0].src, null, 'no image: css/title.css paints the palette gradient');
});

test('titleLayers: reduced motion yields no animation on any layer', () => {
  for (const assets of [NONE, ALL]) {
    const layers = titleLayers(assets, { wide: false, reducedMotion: true });
    assert.ok(layers.length > 0);
    assert.ok(layers.every((l) => l.animated === false));
  }
});

test('moteSpecs: a few slow motes, the same every time', () => {
  const motes = moteSpecs();
  assert.ok(motes.length >= 5 && motes.length <= 16, 'a few');
  assert.deepEqual(moteSpecs(), motes, 'deterministic');
  for (const mote of motes) {
    assert.ok(mote.left >= 0 && mote.left <= 100, 'across the screen (%)');
    assert.ok(mote.size >= 2 && mote.size <= 8, 'small (px)');
    assert.ok(mote.duration >= 8, 'slow (s)');
    assert.ok(mote.delay >= 0 && mote.opacity > 0 && mote.opacity <= 1);
  }
});

// --- the mounted screen ---

test('renderTitle: title text, layers back to front, buttons last', () => {
  const { root } = mount({ assets: ALL });
  const screen = byClass(root, 'title-screen')[0];
  assert.ok(screen, 'a title screen');
  const layers = screen.all().filter((n) => n.getAttribute('data-layer') !== null);
  assert.deepEqual(
    layers.map((n) => n.getAttribute('data-layer')),
    ['scene', 'cast', 'foreground', 'motes', 'title', 'controls'],
  );
  assert.equal(byClass(root, 'title-name')[0].text, GAME_TITLE);
  const imgs = screen.all().filter((n) => n.tag === 'img');
  assert.deepEqual(imgs.map((n) => n.getAttribute('src')), [ALL.bg, ALL.cast, ALL.foreground]);
  assert.ok(byClass(root, 'title-mote').length >= 5, 'motes drawn in code');
});

test('renderTitle: with no assets there are no images, but title and buttons remain', () => {
  const { root } = mount({ assets: NONE });
  assert.equal(root.all().filter((n) => n.tag === 'img').length, 0);
  assert.ok(byClass(root, 'title-scene--gradient').length === 1, 'the gradient stands in');
  assert.equal(byClass(root, 'title-name')[0].text, GAME_TITLE);
  assert.equal(byClass(root, 'title-start')[0].textContent, 'Begin');
  assert.ok(byClass(root, 'title-sound')[0], 'the sound toggle');
});

/**
 * The page's keydown listeners while a test runs, and a way to press a key.
 * @param {import('node:test').TestContext} t
 */
function keyboard(t) {
  /** @type {Array<{type: string, fn: Function}>} */
  const listeners = [];
  const doc = /** @type {any} */ (globalThis.document);
  doc.activeElement = null;
  doc.addEventListener = (type, fn) => listeners.push({ type, fn });
  doc.removeEventListener = (type, fn) => {
    const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) listeners.splice(i, 1);
  };
  t.after(() => {
    delete doc.addEventListener;
    delete doc.removeEventListener;
    delete doc.activeElement;
  });
  /** @param {string} key @param {Record<string, unknown>} [extra] */
  return (key, extra = {}) => {
    for (const l of [...listeners]) if (l.type === 'keydown') l.fn({ key, ...extra, preventDefault() {} });
  };
}

test('renderTitle: a tap on the main button, or Enter, calls onStart', (t) => {
  const press = keyboard(t);
  const tapped = mount();
  byClass(tapped.root, 'title-start')[0].dispatch('click');
  assert.equal(tapped.starts(), 1);
  const keyed = mount();
  press('a');
  assert.equal(keyed.starts(), 0, 'other keys do nothing');
  press('Enter', { repeat: true });
  assert.equal(keyed.starts(), 0, 'nor a held Enter');
  press('Enter');
  assert.equal(keyed.starts(), 1);
});

test('renderTitle: the title is left once, however the start arrives', (t) => {
  // Enter on the focused button reaches the key listener and then
  // presses the button; a double tap presses it twice.
  const press = keyboard(t);
  const ui = mount();
  press('Enter');
  byClass(ui.root, 'title-start')[0].dispatch('click');
  byClass(ui.root, 'title-start')[0].dispatch('click');
  assert.equal(ui.starts(), 1);
});

test('renderTitle: S turns the sound on and off; ? shows the keys and Escape closes them', (t) => {
  const press = keyboard(t);
  const ui = mount({ soundOn: false });
  press('s');
  press('S');
  assert.deepEqual(ui.sounds, [true, false]);
  assert.equal(byClass(ui.root, 'title-sound')[0].getAttribute('aria-pressed'), 'false');
  press('?');
  const list = () => byClass(ui.root, 'battle-keys')[0];
  assert.ok(list(), 'the keys are listed');
  assert.match(list().text, /Sound on or off/);
  press('Escape');
  assert.equal(list(), undefined);
  assert.equal(ui.starts(), 0);
});

test('renderTitle: the buttons carry their key hints', () => {
  const ui = mount();
  const hint = (/** @type {FakeEl} */ btn) => btn.children.find((n) => n.tag === 'kbd')?.textContent;
  assert.equal(hint(byClass(ui.root, 'title-start')[0]), 'Enter');
  assert.equal(hint(byClass(ui.root, 'title-sound')[0]), 'S');
});

test('renderTitle: the sound toggle shows the state and calls onSound(next)', () => {
  const off = mount({ soundOn: false });
  const offBtn = byClass(off.root, 'title-sound')[0];
  assert.equal(offBtn.getAttribute('aria-pressed'), 'false');
  offBtn.dispatch('click');
  assert.deepEqual(off.sounds, [true]);

  const on = mount({ soundOn: true });
  const onBtn = byClass(on.root, 'title-sound')[0];
  assert.equal(onBtn.getAttribute('aria-pressed'), 'true');
  onBtn.dispatch('click');
  assert.deepEqual(on.sounds, [false]);
});

test('renderTitle: reduced motion marks the screen still', () => {
  const { root } = mount({ assets: ALL, reducedMotion: true });
  const screen = byClass(root, 'title-screen')[0];
  assert.equal(screen.getAttribute('data-reduced-motion'), 'true');
  assert.ok(screen.classList.contains('is-still'), 'css/title.css stills every animation');
  const animated = screen.all().filter((n) => n.getAttribute('data-animated') === 'true');
  assert.deepEqual(animated, [], 'no layer is animated');
});
