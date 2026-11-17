// The scene overlay (opening-act spec, "The scene system"; plan Task 5):
// the speaker lookup, where the text box goes, who stands where on the
// visual-novel stage, and playScene's queue, taps, keys and Skip, with
// the fake document the other view tests use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { speakerSpec, portraitSpec, shopkeeperSpec } from '../js/ui/portraits.js';
import { PORTRAIT_LIST } from '../js/ui/portrait-list.js';
import { boxSide, stageFor, HOME_SIDE, playScene } from '../js/ui/scene-view.js';
import { BAND_TYPES } from '../js/engine/units.js';
import { PALETTE } from '../js/ui/patterns.js';
import { fakeClock } from './helpers.mjs';

installFakeDom({ canvas: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// --- speakerSpec ---

test('speakerSpec: a band type gives its name and portrait; hazel is the shopkeeper; narrator has neither', () => {
  const beaver = speakerSpec('beaver', undefined, []);
  assert.equal(beaver.name, 'Beaver');
  assert.equal(beaver.portrait?.kind, 'stamp');
  assert.equal(speakerSpec('beaver', undefined, ['beaver']).portrait?.kind, 'image');
  assert.equal(
    /** @type {any} */ (speakerSpec('beaver', undefined, ['beaver']).portrait).href,
    'assets/portraits/beaver.webp',
  );

  const hazel = speakerSpec('hazel', undefined, []);
  assert.equal(hazel.name, 'Hazel');
  assert.equal(hazel.portrait?.kind, 'stamp');
  assert.match(hazel.portrait?.alt ?? '', /Hazel/);
  assert.equal(
    /** @type {any} */ (speakerSpec('hazel', undefined, ['shopkeeper']).portrait).href,
    'assets/portraits/shopkeeper.webp',
  );

  assert.deepEqual(speakerSpec('narrator'), { name: '', portrait: null });
});


test('a mood portrait is used when it exists, the plain one when it does not, the stamp when neither does', () => {
  assert.equal(/** @type {any} */ (speakerSpec('fox', 'surprised', ['fox', 'fox-surprised']).portrait).href, 'assets/portraits/fox-surprised.webp');
  assert.equal(/** @type {any} */ (speakerSpec('fox', 'sad', ['fox']).portrait).href, 'assets/portraits/fox.webp');
  assert.equal(speakerSpec('fox', 'sad', []).portrait?.kind, 'stamp');
});

test('speakerSpec uses the shipped portrait list, the same images as the unit cards and the shop', () => {
  assert.ok(PORTRAIT_LIST.includes('fox-surprised'), 'the surprised fox ships');
  assert.equal(/** @type {any} */ (speakerSpec('fox', 'surprised').portrait).href, 'assets/portraits/fox-surprised.webp');
  for (const id of Object.keys(BAND_TYPES)) {
    assert.deepEqual(speakerSpec(id).portrait, portraitSpec(id), id);
  }
  assert.equal(/** @type {any} */ (speakerSpec('hazel').portrait).href, /** @type {any} */ (shopkeeperSpec()).href);
});

test('a fox line with mood "surprised" shows fox-surprised on the stage when that image is listed', async (t) => {
  assert.ok(PORTRAIT_LIST.includes('fox-surprised'));
  const s = stage(t);
  const done = playScene({ id: 'surprise', when: 'map', lines: [{ who: 'fox', mood: 'surprised', text: 'Oh!' }] }, { reducedMotion: true });
  const layer = s.layers()[0];
  const left = byClass(layer, 'scene__cutout--left');
  assert.equal(left.dataset.who, 'fox');
  assert.equal(left.dataset.mood, 'surprised');
  const art = byClass(left, 'scene__art');
  assert.ok(art, 'an image, not a stamp');
  assert.equal(/** @type {any} */ (art).src, 'assets/portraits/fox-surprised.webp');
  layer.dispatch('click');
  assert.equal(await done, 'done');
});

test('speakerSpec: an unknown speaker is named by its id and has no portrait', () => {
  assert.deepEqual(speakerSpec('weasel', 'happy', []), { name: 'weasel', portrait: null });
  assert.deepEqual(speakerSpec('weasel'), { name: 'weasel', portrait: null });
});

test('speakerSpec: works for every band type there is', () => {
  for (const [id, def] of Object.entries(BAND_TYPES)) {
    const spec = speakerSpec(id, 'happy', []);
    assert.equal(spec.name, def.name, id);
    assert.equal(spec.portrait?.kind, 'stamp', id);
  }
});

// --- boxSide ---

test('boxSide puts the box away from what is pointed at', () => {
  assert.equal(boxSide(800, { x: 0, y: 600, width: 40, height: 40 }), 'top');
  assert.equal(boxSide(800, { x: 0, y: 100, width: 40, height: 40 }), 'bottom');
  assert.equal(boxSide(800, null), 'bottom');
});

// --- stageFor ---

test('stage: the fox stands left and the hedgehog right, and the speaker is marked', () => {
  const lines = [{ who: 'hedgehog', text: 'a' }, { who: 'fox', text: 'b', mood: 'surprised' }, { who: 'hedgehog', text: 'c', mood: 'angry' }];
  assert.deepEqual(stageFor(lines, 0), { left: null, right: { who: 'hedgehog', mood: undefined }, speaking: 'right', compact: false });
  assert.deepEqual(stageFor(lines, 1), { left: { who: 'fox', mood: 'surprised' }, right: { who: 'hedgehog', mood: undefined }, speaking: 'left', compact: false });
  assert.deepEqual(stageFor(lines, 2), { left: { who: 'fox', mood: 'surprised' }, right: { who: 'hedgehog', mood: 'angry' }, speaking: 'right', compact: false });
  assert.equal(HOME_SIDE.fox, 'left');
});

test('stage: with the right taken, a second right-home speaker takes the free left', () => {
  // hedgehog then beaver, no fox: hedgehog right, beaver left
  const lines = [{ who: 'hedgehog', text: 'a' }, { who: 'beaver', text: 'b' }];
  assert.deepEqual(stageFor(lines, 1), { left: { who: 'beaver', mood: undefined }, right: { who: 'hedgehog', mood: undefined }, speaking: 'left', compact: false });
});

test('stage: a newcomer with no side free replaces the one who spoke longest ago, on whichever side', () => {
  const lines = [{ who: 'beaver', text: 'a' }, { who: 'hedgehog', text: 'b' }, { who: 'hazel', text: 'c' }];
  // beaver right, hedgehog left; hazel replaces the beaver, who spoke longest ago
  assert.deepEqual(stageFor(lines, 2), { left: { who: 'hedgehog', mood: undefined }, right: { who: 'hazel', mood: undefined }, speaking: 'right', compact: false });
});

test('stage: a third speaker replaces whoever spoke longest ago', () => {
  // fox, hedgehog, fox, beaver: beaver replaces the hedgehog on the right
  const lines = [{ who: 'fox', text: 'a' }, { who: 'hedgehog', text: 'b' }, { who: 'fox', text: 'c' }, { who: 'beaver', text: 'd' }];
  assert.deepEqual(stageFor(lines, 3), { left: { who: 'fox', mood: undefined }, right: { who: 'beaver', mood: undefined }, speaking: 'right', compact: false });
  // and a speaker who comes back stays where they now are
  const back = [...lines, { who: 'fox', text: 'e', mood: 'happy' }];
  assert.deepEqual(stageFor(back, 4), { left: { who: 'fox', mood: 'happy' }, right: { who: 'beaver', mood: undefined }, speaking: 'left', compact: false });
});

test('stage: the narrator changes nobody and speaks from neither side', () => {
  const lines = [{ who: 'fox', text: 'a', mood: 'sad' }, { who: 'narrator', text: 'b' }, { who: 'hedgehog', text: 'c' }];
  assert.deepEqual(stageFor(lines, 1), { left: { who: 'fox', mood: 'sad' }, right: null, speaking: null, compact: false });
  assert.deepEqual(stageFor([{ who: 'narrator', text: 'x' }], 0), { left: null, right: null, speaking: null, compact: false });
  assert.deepEqual(stageFor(lines, 2), { left: { who: 'fox', mood: 'sad' }, right: { who: 'hedgehog', mood: undefined }, speaking: 'right', compact: false });
});

test('stage: a pointed line is compact', () => {
  const lines = [{ who: 'beaver', text: 'a' }, { who: 'beaver', text: 'b', point: { kind: 'tile', at: [2, 3] } }];
  assert.equal(stageFor(lines, 0).compact, false);
  assert.deepEqual(stageFor(lines, 1), { left: null, right: { who: 'beaver', mood: undefined }, speaking: 'right', compact: true });
});

// --- playScene, mounted on the fake document ---

/**
 * A fake body and document keys for one test.
 * @param {import('node:test').TestContext} t
 */
function stage(t) {
  const doc = /** @type {any} */ (globalThis.document);
  const body = new FakeEl('body');
  const app = new FakeEl('main');
  body.appendChild(app);
  /** @type {Array<{type: string, fn: Function, capture: boolean}>} */
  const listeners = [];
  doc.body = body;
  doc.activeElement = null;
  doc.addEventListener = (type, fn, capture) => listeners.push({ type, fn, capture: capture === true });
  doc.removeEventListener = (type, fn) => {
    const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) listeners.splice(i, 1);
  };
  t.after(() => {
    delete doc.body;
    delete doc.activeElement;
    delete doc.addEventListener;
    delete doc.removeEventListener;
  });
  const layers = () => body.children.filter((c) => hasClass(c, 'scene'));
  const press = (key, extra = {}) => {
    let prevented = false;
    let stopped = false;
    const evt = {
      key, target: body, ...extra,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
    };
    for (const l of [...listeners]) if (l.type === 'keydown') l.fn(evt);
    return { prevented, stopped };
  };
  return { body, app, layers, press, listeners };
}

/** @param {FakeEl} node @param {string} cls */
function hasClass(node, cls) {
  return node.className.split(/\s+/).includes(cls);
}

/** @param {FakeEl} root @param {string} cls */
function byClass(root, cls) {
  return root.all().find((n) => hasClass(n, cls));
}

/** @param {string} id @param {Array<{who: string, text: string, mood?: string, point?: object}>} lines */
function scene(id, lines) {
  return /** @type {any} */ ({ id, when: 'map', lines });
}

const TWO = scene('two', [{ who: 'hedgehog', text: 'They mow.' }, { who: 'fox', text: 'Only grass.', mood: 'happy' }]);
const TWO_PLAIN = scene('two-plain', [{ who: 'hedgehog', text: 'They mow.' }, { who: 'fox', text: 'Only grass.' }]);

test('two scenes asked for together play one after the other', async (t) => {
  const s = stage(t);
  const first = playScene(TWO, { reducedMotion: true });
  const second = playScene(scene('next', [{ who: 'narrator', text: 'Later.' }]), { reducedMotion: true });
  assert.equal(s.layers().length, 1, 'never stacked');
  assert.equal(s.layers()[0].dataset.scene, 'two');

  s.layers()[0].dispatch('click');
  assert.equal(s.layers().length, 1);
  assert.equal(s.layers()[0].dataset.scene, 'two', 'still the first, on its second line');
  s.layers()[0].dispatch('click');
  assert.equal(await first, 'done');

  assert.equal(s.layers().length, 1, 'the second opens once the first has closed');
  assert.equal(s.layers()[0].dataset.scene, 'next');
  s.layers()[0].dispatch('click');
  assert.equal(await second, 'done');
  assert.equal(s.layers().length, 0);
});

test('skip resolves "skipped"; reaching the last line resolves "done"', async (t) => {
  const s = stage(t);
  const skipped = playScene(TWO, { reducedMotion: true });
  const skip = byClass(s.layers()[0], 'scene__skip');
  assert.ok(skip, 'a Skip button');
  assert.equal(skip.tag, 'button');
  assert.equal(skip.textContent, 'Skip');
  skip.dispatch('click');
  assert.equal(await skipped, 'skipped');
  assert.equal(s.layers().length, 0, 'gone');

  const done = playScene(TWO, { reducedMotion: true });
  const layer = s.layers()[0];
  assert.equal(byClass(layer, 'scene__text').textContent, 'They mow.');
  layer.dispatch('click');
  assert.equal(byClass(layer, 'scene__text').textContent, 'Only grass.');
  layer.dispatch('click');
  assert.equal(await done, 'done');
});

test('Enter and Space go on, Escape skips, and the battle underneath never sees a key', async (t) => {
  const s = stage(t);
  const done = playScene(TWO, { reducedMotion: true });
  const layer = s.layers()[0];
  assert.ok(s.listeners.some((l) => l.type === 'keydown' && l.capture), 'keys are caught before the battle\'s own');
  const held = s.press('Enter', { repeat: true });
  assert.ok(held.stopped);
  assert.equal(byClass(layer, 'scene__text').textContent, 'They mow.', 'a held key does not race on');
  const enter = s.press('Enter');
  assert.ok(enter.prevented && enter.stopped);
  assert.equal(byClass(layer, 'scene__text').textContent, 'Only grass.');
  assert.ok(s.press('z').stopped, 'other keys are swallowed too');
  s.press(' ');
  assert.equal(await done, 'done');
  assert.equal(s.listeners.length, 0, 'the key listener is removed');

  const skipped = playScene(TWO, { reducedMotion: true });
  s.press('Escape');
  assert.equal(await skipped, 'skipped');
});

test('nothing underneath can be tapped or focused while a scene is open', async (t) => {
  const s = stage(t);
  const alreadyInert = new FakeEl('div');
  /** @type {any} */ (alreadyInert).inert = true;
  s.body.appendChild(alreadyInert);
  const done = playScene(TWO, { reducedMotion: true });
  const layer = s.layers()[0];
  assert.equal(/** @type {any} */ (s.app).inert, true);
  assert.notEqual(/** @type {any} */ (layer).inert, true);
  assert.equal(layer.attrs.role, 'dialog');
  assert.equal(layer.attrs['aria-modal'], 'true');
  byClass(layer, 'scene__skip').dispatch('click');
  await done;
  assert.equal(/** @type {any} */ (s.app).inert, false, 'given back');
  assert.equal(/** @type {any} */ (alreadyInert).inert, true, 'left as it was');
});

test('the stage: two cut-outs, the speaker marked and named on their side', async (t) => {
  const s = stage(t);
  const done = playScene(TWO, { reducedMotion: true });
  const layer = s.layers()[0];
  const left = byClass(layer, 'scene__cutout--left');
  const right = byClass(layer, 'scene__cutout--right');
  const box = byClass(layer, 'scene__box');
  assert.equal(left.hidden, true, 'nobody on the left yet');
  assert.equal(right.hidden, false);
  assert.equal(right.dataset.who, 'hedgehog');
  assert.equal(right.dataset.speaking, 'true');
  assert.equal(box.dataset.speaker, 'right');
  assert.equal(byClass(layer, 'scene__name').textContent, BAND_TYPES.hedgehog.name);
  assert.ok(right.children.length > 0, 'the hedgehog stands there');

  layer.dispatch('click');
  assert.equal(left.hidden, false);
  assert.equal(left.dataset.who, 'fox');
  assert.equal(left.dataset.mood, 'happy');
  assert.equal(left.dataset.speaking, 'true');
  assert.equal(right.dataset.speaking, 'false', 'the other dims');
  assert.equal(box.dataset.speaker, 'left');
  layer.dispatch('click');
  await done;
});

test('a cut-out whose image fails to load gives way to the character\'s stamp', async (t) => {
  const s = stage(t);
  const done = playScene(TWO, { reducedMotion: true });
  const layer = s.layers()[0];
  const right = byClass(layer, 'scene__cutout--right');
  const img = right.children[0];
  assert.equal(img.tag, 'img', 'the hedgehog has an image');
  img.dispatch('error');
  assert.equal(right.children.length, 1);
  assert.equal(right.children[0].tag, 'svg', 'the stamp stands in the same place');
  assert.equal(right.children[0].attrs.class, 'scene__stamp');
  assert.equal(right.hidden, false);
  byClass(layer, 'scene__skip').dispatch('click');
  await done;
});

test('the narrator has no name and dims everyone', async (t) => {
  const s = stage(t);
  const done = playScene(scene('n', [{ who: 'hazel', text: 'Seeds?' }, { who: 'narrator', text: 'A pause.' }]), { reducedMotion: true });
  const layer = s.layers()[0];
  assert.equal(byClass(layer, 'scene__name').textContent, 'Hazel');
  layer.dispatch('click');
  assert.equal(byClass(layer, 'scene__name').hidden, true);
  assert.equal(byClass(layer, 'scene__cutout--right').dataset.speaking, 'false');
  assert.equal(byClass(layer, 'scene__box').dataset.speaker, 'none');
  layer.dispatch('click');
  await done;
});

test('a pointed line rings what resolve returns, shrinks the cast to a head and moves the box away', async (t) => {
  const s = stage(t);
  globalThis.innerHeight = 800;
  t.after(() => { delete globalThis.innerHeight; });
  const asked = [];
  const point = { kind: 'tile', at: [4, 7] };
  const lines = [{ who: 'beaver', text: 'Water.' }, { who: 'beaver', text: 'That bank.', point }, { who: 'beaver', text: 'Here?', point: { kind: 'den' } }];
  const done = playScene(scene('p', lines), {
    reducedMotion: true,
    resolve: (p) => {
      asked.push(p);
      return p.kind === 'tile' ? { x: 100, y: 600, width: 40, height: 40 } : null;
    },
  });
  const layer = s.layers()[0];
  const ring = byClass(layer, 'scene__ring');
  assert.equal(ring.hidden, true, 'no ring on a plain line');
  assert.equal(layer.dataset.side, 'bottom');
  assert.equal(layer.dataset.compact, 'false');
  assert.equal(byClass(layer, 'scene__head-wrap').hidden, true);

  layer.dispatch('click');
  assert.deepEqual(asked, [point]);
  assert.equal(ring.hidden, false);
  assert.equal(ring.style.left, '94px');
  assert.equal(ring.style.top, '594px');
  assert.equal(ring.style.width, '52px');
  assert.equal(ring.style.height, '52px');
  assert.equal(layer.dataset.side, 'top', 'away from the lower half');
  assert.equal(layer.dataset.compact, 'true');
  assert.equal(byClass(layer, 'scene__stage').hidden, true, 'the cut-outs make way');
  assert.equal(byClass(layer, 'scene__head-wrap').hidden, false, 'a small head in the box');

  layer.dispatch('click');
  assert.equal(ring.hidden, true, 'resolve gave null: no ring');
  assert.equal(layer.dataset.side, 'bottom');
  layer.dispatch('click');
  await done;
});

test('reduced motion is marked on the layer', async (t) => {
  const s = stage(t);
  const a = playScene(TWO, { reducedMotion: true });
  assert.equal(s.layers()[0].dataset.motion, 'reduced');
  s.press('Escape');
  await a;
  const b = playScene(TWO, { reducedMotion: false });
  assert.equal(s.layers()[0].dataset.motion, 'full');
  s.press('Escape');
  await b;
});

test('a scene with no lines is done at once', async (t) => {
  const s = stage(t);
  assert.equal(await playScene(scene('empty', []), {}), 'done');
  assert.equal(s.layers().length, 0);
});

// --- the stylesheet ---

test('css/scene.css: palette colours, a 44px Skip, cut-outs that fit two abreast, a box that never passes 45%', () => {
  const css = read('css/scene.css');
  const rootBlock = read('css/game.css').match(/:root\s*\{([^}]*)\}/);
  assert.ok(rootBlock);
  const allowed = new Set([
    ...Object.values(PALETTE),
    ...[...rootBlock[1].matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]),
  ].map((c) => c.toLowerCase()));
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  const allowedRgb = new Set([...allowed].map(rgb));
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    assert.ok(allowed.has(m[0].toLowerCase()), `${m[0]} is not a palette colour`);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/g)) {
    assert.ok(allowedRgb.has(`${m[1]},${m[2]},${m[3]}`), `rgb(${m[1]}, ${m[2]}, ${m[3]}) is not a palette colour`);
  }
  assert.match(css, /\.scene__skip\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/);
  assert.match(css, /--cut:\s*min\(44vw,\s*38vh/);
  assert.match(css, /\.scene__box\s*\{[^}]*max-height:\s*45vh/);
  assert.match(css, /\.scene\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0/);
  assert.match(css, /\.scene__cutout--left \.scene__art\s*\{[^}]*transform:\s*scaleX\(-1\)/, 'the left one is mirrored');
  // Dimmed by darkening, not by letting the screen show through: at 55%
  // opacity the map's labels read through a character's face.
  assert.match(css, /\.scene__cutout\s*\{[^}]*filter:\s*brightness\(0\.55\)/, 'the one not speaking is dimmed');
  assert.doesNotMatch(css, /\.scene__cutout\s*\{[^}]*opacity/, 'and stays solid');
  assert.match(css, /\.scene__cutout\[data-speaking="true"\]\s*\{[^}]*filter:\s*none/, 'the speaker is bright');
  // The box is the interface kit's wood panel (css/ui.css): solid in
  // code (the frame's green) and solid when painted (the board's middle).
  const ui = read('css/ui.css');
  assert.match(ui, /\.ui-panel--wood\s*\{[^}]*background:\s*var\(--frame\);/, 'the text box is solid: nothing reads through the words');
  assert.match(read('js/ui/scene-view.js'), /html\('div', 'scene__box ui-panel--wood'\)/);
});

test('index.html links css/scene.css after the menus', () => {
  const html = read('index.html');
  const menus = html.indexOf('href="css/menus.css"');
  const sceneCss = html.indexOf('<link rel="stylesheet" href="css/scene.css">');
  assert.ok(menus >= 0 && sceneCss > menus);
});

// --- blinking ---

/** Lets the images' decoding (a promise) settle. */
const settle = () => new Promise((r) => setImmediate(r));

/** @param {FakeEl} root @param {string} cls */
const allByClass = (root, cls) => root.all().filter((n) => hasClass(n, cls));

const PRESENT = ['fox', 'fox-blink', 'fox-happy', 'hedgehog', 'hedgehog-blink', 'beaver'];

test('the fox and the hedgehog standing both blink, over their plain portraits, never in step', async (t) => {
  const s = stage(t);
  const clock = fakeClock([0.5]);
  const done = playScene(TWO_PLAIN, { reducedMotion: false, clock, portraits: PRESENT });
  const layer = s.layers()[0];
  layer.dispatch('click');
  await settle();
  const left = byClass(layer, 'scene__cutout--left');
  const right = byClass(layer, 'scene__cutout--right');
  const eyes = { left: byClass(left, 'scene__blink'), right: byClass(right, 'scene__blink') };
  assert.equal(eyes.left.src, 'assets/portraits/fox-blink.webp');
  assert.equal(eyes.right.src, 'assets/portraits/hedgehog-blink.webp');
  for (const e of Object.values(eyes)) {
    assert.ok(hasClass(e, 'scene__art'), 'sized and mirrored as the art under it');
    assert.equal(e.style.opacity, '0');
    assert.equal(e.alt, '');
  }
  // Over the art, after it.
  assert.equal(left.children.indexOf(eyes.left), left.children.indexOf(byClass(left, 'scene__art')) + 1);
  /** @type {Record<string, number>} */
  const blinks = { left: 0, right: 0 };
  let was = { left: '0', right: '0' };
  for (let ms = 0; ms < 60000; ms += 10) {
    clock.advance(10);
    const now = { left: eyes.left.style.opacity, right: eyes.right.style.opacity };
    assert.ok(!(now.left === '1' && now.right === '1'), `both shut at ${clock.now()}`);
    for (const side of ['left', 'right']) if (now[side] === '1' && was[side] === '0') blinks[side] += 1;
    was = now;
  }
  assert.ok(blinks.left >= 10 && blinks.right >= 10, JSON.stringify(blinks));
  layer.dispatch('click');
  assert.equal(await done, 'done');
  assert.equal(clock.pending(), 0, 'the scene closed: no blinking left behind');
});

test('a cut-out in a mood portrait does not blink; back in its plain one, it does', async (t) => {
  const s = stage(t);
  const clock = fakeClock([0.2]);
  const lines = scene('moods', [
    { who: 'fox', text: 'Ha!', mood: 'happy' },
    { who: 'fox', text: 'Well.' },
  ]);
  const done = playScene(lines, { reducedMotion: false, clock, portraits: PRESENT });
  const layer = s.layers()[0];
  await settle();
  const left = byClass(layer, 'scene__cutout--left');
  assert.equal(byClass(left, 'scene__art').src, 'assets/portraits/fox-happy.webp');
  assert.equal(allByClass(left, 'scene__blink').length, 0, 'no closed eyes over a mood');
  clock.advance(20000);
  layer.dispatch('click');
  await settle();
  assert.equal(byClass(left, 'scene__art').src, 'assets/portraits/fox.webp');
  const eyes = byClass(left, 'scene__blink');
  let shut = false;
  for (let ms = 0; ms < 7000 && !shut; ms += 10) {
    clock.advance(10);
    shut = eyes.style.opacity === '1';
  }
  assert.ok(shut, 'blinks within six seconds');
  layer.dispatch('click');
  assert.equal(await done, 'done');
});

test('no blinking under reduced motion, nor for a character with no blink frame', async (t) => {
  const s = stage(t);
  const clock = fakeClock();
  const reduced = playScene(TWO_PLAIN, { reducedMotion: true, clock, portraits: PRESENT });
  s.layers()[0].dispatch('click');
  await settle();
  assert.equal(allByClass(s.layers()[0], 'scene__blink').length, 0);
  s.layers()[0].dispatch('click');
  await reduced;
  const plain = playScene(scene('beaver', [{ who: 'beaver', text: 'Logs.' }]), { reducedMotion: false, clock, portraits: PRESENT });
  await settle();
  assert.equal(byClass(s.layers()[0], 'scene__art').src, 'assets/portraits/beaver.webp');
  assert.equal(allByClass(s.layers()[0], 'scene__blink').length, 0);
  assert.equal(clock.pending(), 0);
  s.layers()[0].dispatch('click');
  await plain;
});

test('the closed eyes sit over the art at its size, in the cut-out', () => {
  const css = read('css/scene.css');
  assert.match(css, /\.scene__cutout \{\n  position: relative;/);
  assert.match(css, /\.scene__blink \{[^}]*position: absolute;[^}]*inset: 0;/);
});
