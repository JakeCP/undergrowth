// The title screen (js/ui/title-view.js): the game's name in code, one
// main button ("Begin", or "Continue" with a save), a sound toggle, and
// layered art that degrades to a code-drawn gradient with no assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { GAME_TITLE, startLabel, moteSpecs, renderTitle } from '../js/ui/title-view.js';
import { ASSET_KEYS, CAST_SPOTS, LAMP_SPOTS } from '../js/ui/title-scene.js';

installFakeDom({ canvas: true });

/** @type {Record<string, string|null>} */
const NONE = Object.fromEntries(ASSET_KEYS.map((k) => [k, null]));
/** @type {Record<string, string|null>} */
const ALL = Object.fromEntries(ASSET_KEYS.map((k) => [k, `assets/title/${k}.webp`]));

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

// --- the motes (pure; the layers are in tests/title-scene.test.mjs) ---

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
    ['valley', 'mist', 'arch', 'ferns', 'motes', 'title', 'controls'],
  );
  assert.equal(byClass(root, 'title-name')[0].text, GAME_TITLE);
  const imgs = screen.all().filter((n) => n.tag === 'img');
  assert.deepEqual(
    imgs.map((n) => n.getAttribute('src')),
    [ALL.valleyCutTall, ALL.archTall, ALL.heroes, ALL.fernLeft, ALL.fernRight, ALL.wordmark],
  );
  assert.ok(imgs.every((n) => n.getAttribute('alt') === ''), 'the paintings are decoration');
  assert.ok(byClass(root, 'title-mote').length >= 5, 'motes drawn in code');
});

test('renderTitle: the valley and the archway say which shape of painting they hold', () => {
  const tall = mount({ assets: ALL, wide: false });
  assert.equal(byClass(tall.root, 'title-valley')[0].getAttribute('data-shape'), 'tall');
  assert.equal(byClass(tall.root, 'title-arch')[0].getAttribute('data-shape'), 'tall');
  const wide = mount({ assets: { ...ALL, valleyCutWide: null }, wide: true });
  assert.equal(byClass(wide.root, 'title-valley')[0].getAttribute('data-shape'), 'tall', 'the fallback painting');
  assert.equal(byClass(wide.root, 'title-arch')[0].getAttribute('data-shape'), 'wide');
});

test('renderTitle: the mist lies in the box of the valley drawn', () => {
  const { root } = mount({ assets: { ...ALL, valleyCutWide: null }, wide: true });
  assert.equal(byClass(root, 'title-mist')[0].getAttribute('data-shape'), 'tall');
});

test('renderTitle: one leaf falls through the motes', () => {
  const { root } = mount({ assets: ALL });
  const motes = root.all().find((n) => n.getAttribute('data-layer') === 'motes');
  assert.equal(motes.all().filter((n) => n.className === 'title-leaf').length, 1);
});

test('renderTitle: the cast stand inside the archway, at their spots in its box', () => {
  const { root } = mount({ assets: ALL, wide: true, state: { valley: 'cut', company: ['ants'] } });
  const arch = byClass(root, 'title-arch')[0];
  const cast = arch.all().filter((n) => n.getAttribute('data-cast') !== null);
  assert.deepEqual(cast.map((n) => n.getAttribute('data-cast')), ['heroes', 'ants']);
  const spot = CAST_SPOTS.wide.heroes;
  assert.equal(cast[0].style.left, `${spot.left}%`);
  assert.equal(cast[0].style.bottom, `${spot.bottom}%`);
  assert.equal(cast[0].style.width, `${spot.width}%`);
  assert.equal(cast[0].getAttribute('src'), ALL.heroes);
});

test('renderTitle: a new game shows the pair alone and two lamps in the valley', () => {
  const { root } = mount({ assets: ALL, wide: true });
  const cast = root.all().filter((n) => n.getAttribute('data-cast') !== null);
  assert.deepEqual(cast.map((n) => n.getAttribute('data-cast')), ['heroes']);
  const valley = byClass(root, 'title-valley')[0];
  const lamps = valley.all().filter((n) => n.className === 'title-lamp');
  assert.equal(lamps.length, 2);
  assert.equal(lamps[0].style.left, `${LAMP_SPOTS.wide.cut[0].left}%`);
  assert.equal(lamps[0].style.top, `${LAMP_SPOTS.wide.cut[0].top}%`);
});

test('renderTitle: the painted wordmark stands in for the typed name, which stays for screen readers', () => {
  const { root } = mount({ assets: ALL });
  const name = byClass(root, 'title-name')[0];
  assert.equal(name.tag, 'h1');
  assert.equal(name.text, GAME_TITLE, 'the name is still text');
  assert.ok(name.classList.contains('has-wordmark'));
  const mark = byClass(root, 'title-wordmark')[0];
  assert.equal(mark.getAttribute('src'), ALL.wordmark);
  assert.equal(mark.getAttribute('alt'), '');
});

test('renderTitle: a wordmark that fails to load gives way to the typed name', () => {
  const { root } = mount({ assets: ALL });
  byClass(root, 'title-wordmark')[0].dispatch('error');
  const name = byClass(root, 'title-name')[0];
  assert.ok(!name.classList.contains('has-wordmark'));
  assert.equal(byClass(root, 'title-wordmark').length, 0);
  assert.equal(name.text, GAME_TITLE);
});

test('renderTitle: a wordmark lettered with another name is not drawn', () => {
  const { root } = mount({ assets: ALL, wordmarkName: 'Overgrowth' });
  assert.equal(byClass(root, 'title-wordmark').length, 0);
  assert.ok(!byClass(root, 'title-name')[0].classList.contains('has-wordmark'));
  assert.equal(byClass(root, 'title-name')[0].text, GAME_TITLE);
});

test('renderTitle: with no assets there are no images, but title and buttons remain', () => {
  const { root } = mount({ assets: NONE });
  assert.equal(root.all().filter((n) => n.tag === 'img').length, 0);
  assert.ok(byClass(root, 'title-valley--gradient').length === 1, 'the gradient stands in');
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

// --- depth under the pointer ---

/**
 * Mounts with a browser that answers media queries as given.
 * @param {import('node:test').TestContext} t
 * @param {boolean} finePointer
 * @param {Record<string, unknown>} [opts]
 */
function mountWithPointer(t, finePointer, opts = {}) {
  const g = /** @type {any} */ (globalThis);
  const before = g.matchMedia;
  g.matchMedia = (/** @type {string} */ q) => ({ matches: q.includes('pointer: fine') ? finePointer : false });
  t.after(() => { g.matchMedia = before; });
  const ui = mount({ assets: ALL, ...opts });
  const screen = byClass(ui.root, 'title-screen')[0];
  screen.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 });
  return screen;
}

test('renderTitle: a mouse shifts the layers: the centre is 0, the edges are 1 and -1', (t) => {
  const screen = mountWithPointer(t, true);
  screen.dispatch('pointermove', { clientX: 500, clientY: 350 });
  assert.equal(screen.style['--px'], '0');
  assert.equal(screen.style['--py'], '0');
  screen.dispatch('pointermove', { clientX: 900, clientY: 50 });
  assert.equal(screen.style['--px'], '1');
  assert.equal(screen.style['--py'], '-1');
  screen.dispatch('pointermove', { clientX: 2000, clientY: 350 });
  assert.equal(screen.style['--px'], '1', 'never past the edge');
});

test('renderTitle: a touch screen, or reduced motion, shifts nothing', (t) => {
  const touch = mountWithPointer(t, false);
  touch.dispatch('pointermove', { clientX: 900, clientY: 50 });
  assert.equal(touch.style['--px'], undefined);
  const still = mountWithPointer(t, true, { reducedMotion: true });
  still.dispatch('pointermove', { clientX: 900, clientY: 50 });
  assert.equal(still.style['--px'], undefined);
});
