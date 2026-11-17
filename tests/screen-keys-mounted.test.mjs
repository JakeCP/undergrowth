// The keys on the map, the deploy screen, the trading post and the
// result screen, pressed on the screens themselves (the fake DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { renderMap } from '../js/ui/map-view.js';
import { renderDeploy } from '../js/ui/deploy-view.js';
import { renderShop } from '../js/ui/shop-view.js';
import { renderResult } from '../js/ui/result-view.js';
import { mapPlaces, mapStartPlace, buildMapLayout, POST_ID } from '../js/ui/map-layout.js';
import { REGIONS, CAMPAIGN_NODES, TRADING_POST, HOME_CAMP } from '../data/campaign.js';
import { MAP_ASSETS } from '../js/ui/map-assets.js';
import { LEVELS } from '../data/levels/index.js';
import { newProgress } from '../js/campaign/progress.js';
import { createBattle } from '../js/engine/battle.js';
import { valleyProgress, fakeClock } from './helpers.mjs';

installFakeDom({ canvas: true });

/** @param {FakeEl} root @param {string} cls */
const byClass = (root, cls) => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes(cls));

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
  /** @param {string} key @param {Record<string, unknown>} [extra] @returns {boolean} whether it was taken */
  const press = (key, extra = {}) => {
    let taken = false;
    for (const l of [...listeners]) if (l.type === 'keydown') l.fn({ key, ...extra, preventDefault() { taken = true; } });
    return taken;
  };
  return { press, listeners };
}

const names = Object.fromEntries(LEVELS.map((l) => [l.id, l.name]));
const MAP = { regions: REGIONS, nodes: CAMPAIGN_NODES, post: TRADING_POST, home: HOME_CAMP };
const cleared = (/** @type {string[]} */ ...ids) => {
  const p = newProgress();
  for (const id of ids) p.cleared[id] = true;
  return p;
};

// --- the map ---

test('mapPlaces: every level shown, then the trading post; the selection starts on the next level', () => {
  const layout = buildMapLayout(MAP, cleared('o01'), names, MAP_ASSETS.markers);
  const places = mapPlaces(layout);
  assert.deepEqual(places.map((p) => p.id), ['o01', 'o02', POST_ID]);
  assert.equal(mapStartPlace(layout), 'o02');
  const done = buildMapLayout(MAP, cleared(...LEVELS.map((l) => l.id)), names, MAP_ASSETS.markers);
  const top = done.nodes.reduce((a, n) => (n.y < a.y ? n : a));
  assert.equal(mapStartPlace(done), top.levelId, 'all cleared: the highest place');
});

function mountMap(t, progress) {
  const keys = keyboard(t);
  const root = new FakeEl('div');
  const chosen = [];
  let shop = 0;
  renderMap(/** @type {any} */ (root), { progress, onLevel: (id) => chosen.push(id), onShop: () => { shop += 1; } });
  const panelName = () => byClass(root, 'map-panel__name')[0]?.textContent ?? null;
  const ring = () => root.all().find((n) => n.attrs.class === 'map-select');
  return { ...keys, root, chosen, shop: () => shop, panelName, ring };
}

test('map: the first key shows the selection on the next level; arrows move it; Enter marches', (t) => {
  const ui = mountMap(t, cleared('o01'));
  assert.equal(ui.panelName(), null, 'nothing selected before a key');
  assert.equal(ui.ring().attrs.visibility, 'hidden');
  ui.press('ArrowDown');
  assert.equal(ui.panelName(), 'The Ant Hill', 'shown where it starts, not moved');
  assert.equal(ui.ring().attrs.visibility, 'visible');
  ui.press('ArrowDown');
  assert.equal(ui.panelName(), 'The Mown Strip', 'down the map');
  ui.press('d');
  assert.equal(ui.panelName(), 'Trading post', 'right, to the trading post');
  ui.press('ArrowLeft');
  assert.equal(ui.panelName(), 'The Mown Strip');
  ui.press('Enter', { repeat: true });
  assert.deepEqual(ui.chosen, [], 'not a held Enter');
  ui.press('Enter');
  assert.deepEqual(ui.chosen, ['o01']);
  ui.press('Enter');
  assert.deepEqual(ui.chosen, ['o01'], 'the map is left once');
});

test('map: Enter on the trading post goes in; T goes there from anywhere', (t) => {
  const a = mountMap(t, newProgress());
  a.press('Enter');
  assert.equal(a.panelName(), 'The Mown Strip', 'the first Enter shows the selection');
  a.press('ArrowRight');
  a.press('Enter');
  assert.equal(a.shop(), 1);
  const b = mountMap(t, newProgress());
  b.press('t');
  assert.equal(b.shop(), 1);
  assert.deepEqual(b.chosen, []);
});

test('map: ? lists the keys; Escape closes them, then lets go of the place', (t) => {
  const ui = mountMap(t, newProgress());
  ui.press('ArrowUp');
  ui.press('?');
  assert.ok(byClass(ui.root, 'battle-keys')[0], 'the list');
  ui.press('Escape');
  assert.equal(byClass(ui.root, 'battle-keys')[0], undefined);
  assert.equal(ui.panelName(), 'The Mown Strip', 'the first Escape only closed the list');
  ui.press('Escape');
  assert.equal(ui.panelName(), null);
  assert.equal(ui.ring().attrs.visibility, 'hidden');
});

test('map: the March button carries its key hint; nothing while a scene has the focus', (t) => {
  const ui = mountMap(t, newProgress());
  const doc = /** @type {any} */ (globalThis.document);
  const scene = new FakeEl('div');
  scene.setAttribute('role', 'dialog');
  doc.activeElement = scene;
  assert.equal(ui.press('Enter'), false);
  assert.equal(ui.panelName(), null);
  doc.activeElement = null;
  ui.press('Enter');
  const march = ui.root.all().find((n) => n.tag === 'button' && n.textContent === 'March');
  assert.equal(march.children.find((n) => n.tag === 'kbd')?.textContent, 'Enter');
});

// --- the deploy screen ---

function mountDeploy(t, levelId = 'l01') {
  const keys = keyboard(t);
  const level = LEVELS.find((l) => l.id === levelId);
  const root = new FakeEl('div');
  /** @type {any[]} */
  const started = [];
  let back = 0;
  renderDeploy(/** @type {any} */ (root), { level, progress: valleyProgress(), onStart: (d) => started.push(d), onBack: () => { back += 1; } });
  // Start says what is missing until it can start (js/ui/menu-layout.js, startLabel).
  const start = () => root.all().find((n) => n.tag === 'button' && n.className === 'ui-btn ui-btn--primary');
  const count = () => byClass(root, 'deploy-tray__count')[0].textContent;
  const picked = () => byClass(root, 'roster-btn').findIndex((b) => b.attrs['aria-pressed'] === 'true');
  const cursor = () => {
    const c = byClass(root, 'board-cursor')[0];
    return c.hidden ? null : [Math.round(parseFloat(c.style.left) / 12.5), Math.round(parseFloat(c.style.top) / 12.5)];
  };
  const cardOpen = () => !byClass(root, 'deploy-panel')[0].hidden;
  return { ...keys, root, level, started, back: () => back, start, count, picked, cursor, cardOpen };
}

test('deploy: 1 to 9 pick a band; arrows show and move the cursor over the deploy tiles; Space places', (t) => {
  const ui = mountDeploy(t);
  assert.equal(ui.picked(), 0);
  ui.press('3');
  assert.equal(ui.picked(), 2, 'the third band in the roster');
  ui.press('9');
  assert.equal(ui.picked(), 2, 'no ninth band: nothing changes');
  assert.equal(ui.cursor(), null, 'the cursor waits for a key');
  ui.press('ArrowRight');
  assert.deepEqual(ui.cursor(), [0, 7], 'it shows on the first free deploy tile');
  ui.press('ArrowRight');
  assert.deepEqual(ui.cursor(), [1, 7]);
  ui.press('ArrowRight');
  assert.deepEqual(ui.cursor(), [1, 7], 'no deploy tile further right');
  assert.equal(ui.start().textContent, 'Place at least one band');
  assert.equal(ui.start().disabled, true);
  ui.press(' ');
  assert.equal(ui.count(), '1 of 2 placed');
  assert.equal(ui.start().textContent, 'Start');
  assert.equal(ui.start().disabled, false);
  ui.press(' ', { repeat: true });
  assert.equal(ui.count(), '1 of 2 placed', 'a held Space does nothing more');
  ui.press(' ');
  assert.equal(ui.count(), '0 of 2 placed', 'Space on a placed band takes it away');
  assert.equal(ui.start().textContent, 'Place at least one band');
});

test('deploy: Enter starts once there is a band, once; held Enter does not', (t) => {
  const ui = mountDeploy(t);
  ui.press('Enter');
  assert.equal(ui.started.length, 0, 'nothing placed yet');
  ui.press('ArrowLeft');
  ui.press(' ');
  ui.press('Enter', { repeat: true });
  assert.equal(ui.started.length, 0);
  ui.press('Enter');
  assert.equal(ui.started.length, 1);
  assert.equal(ui.started[0][0].type, ui.level.id === 'l01' ? 'fox' : ui.started[0][0].type);
  ui.press('Enter');
  assert.equal(ui.started.length, 1, 'once');
});

// The audit: the card was open from the start and took the first
// Escape, so leaving by keyboard took two. The card in its place never
// takes Escape now; only what opens on top of the screen does.
test('deploy: one Escape goes back, though the card is open; the keys and the full card close first', (t) => {
  const ui = mountDeploy(t);
  assert.ok(ui.cardOpen());
  ui.press('?');
  assert.ok(byClass(ui.root, 'battle-keys')[0]);
  ui.press('Escape');
  assert.equal(byClass(ui.root, 'battle-keys')[0], undefined);
  assert.equal(ui.back(), 0);
  // The full card, one tap away from the brief one, closes on Escape.
  byClass(ui.root, 'deploy-panel__more')[0].dispatch('click');
  assert.ok(byClass(ui.root, 'deploy-sheet')[0], 'the full card is open');
  ui.press('Escape');
  assert.equal(byClass(ui.root, 'deploy-sheet')[0], undefined);
  assert.equal(ui.back(), 0);
  assert.ok(ui.cardOpen(), 'the card is still in its place');
  ui.press('Escape', { repeat: true });
  assert.equal(ui.back(), 0, 'not a held Escape');
  ui.press('Escape');
  assert.equal(ui.back(), 1, 'one press, with the card open');
});

test('deploy: the buttons carry their key hints', (t) => {
  const ui = mountDeploy(t);
  const hint = (/** @type {FakeEl} */ btn) => btn.children.find((n) => n.tag === 'kbd')?.textContent;
  assert.equal(hint(ui.start()), undefined, 'no Enter while it cannot start');
  ui.press('ArrowLeft');
  ui.press(' ');
  assert.equal(hint(ui.start()), 'Enter');
  assert.deepEqual(byClass(ui.root, 'roster-btn').map(hint), ['1', '2', '3', '4', '5']);
  assert.equal(hint(ui.root.all().find((n) => n.tag === 'button' && n.textContent === 'Back')), 'Esc');
});

// --- the trading post ---

function mountShop(t, seeds = 100) {
  const keys = keyboard(t);
  const doc = /** @type {any} */ (globalThis.document);
  const progress = valleyProgress();
  progress.seeds = seeds;
  const root = new FakeEl('div');
  /** @type {string[]} */
  const bought = [];
  let back = 0;
  const focus = FakeEl.prototype.focus;
  const blur = FakeEl.prototype.blur;
  FakeEl.prototype.focus = function () { doc.activeElement = this; };
  FakeEl.prototype.blur = function () { if (doc.activeElement === this) doc.activeElement = null; };
  t.after(() => {
    if (focus === undefined) delete FakeEl.prototype.focus;
    else FakeEl.prototype.focus = focus;
    if (blur === undefined) delete FakeEl.prototype.blur;
    else FakeEl.prototype.blur = blur;
  });
  renderShop(/** @type {any} */ (root), {
    progress, onBuy: (id) => bought.push(id), onBack: () => { back += 1; }, clock: fakeClock(), reducedMotion: true,
  });
  const buys = byClass(root, 'shop-deal__buy');
  const selected = () => buys.indexOf(doc.activeElement);
  return { ...keys, root, bought, back: () => back, buys, selected };
}

test('shop: arrows choose what to buy, starting on the first; Escape goes back', (t) => {
  const ui = mountShop(t);
  assert.ok(ui.buys.length >= 3);
  assert.equal(ui.selected(), -1, 'nothing chosen before a key');
  ui.press('ArrowDown');
  assert.equal(ui.selected(), 0, 'the first key shows the selection on the first');
  ui.press('ArrowRight');
  assert.equal(ui.selected(), 1);
  ui.press('ArrowRight', { repeat: true });
  assert.equal(ui.selected(), 2, 'a held arrow keeps moving');
  ui.press('ArrowLeft');
  assert.equal(ui.selected(), 1);
  ui.press('Escape', { repeat: true });
  assert.equal(ui.back(), 0);
  ui.press('Escape');
  assert.equal(ui.back(), 1);
  ui.press('Escape');
  assert.equal(ui.back(), 1, 'once');
});

test('shop: Enter with nothing chosen chooses the first; on a chosen button it is left to the button', (t) => {
  const ui = mountShop(t);
  assert.equal(ui.press('Enter'), true);
  assert.equal(ui.selected(), 0);
  // The browser's own Enter on the focused button buys (or lets Hazel refuse).
  assert.equal(ui.press('Enter'), false, 'left to the button');
  ui.buys[0].dispatch('click');
  assert.equal(ui.bought.length, 1);
});

// --- the result screen ---

function mountResult(t) {
  const keys = keyboard(t);
  const level = LEVELS.find((l) => l.id === 'o01');
  const state = createBattle(level, level.solution.deploy, newProgress());
  const root = new FakeEl('div');
  /** @type {string[]} */
  const calls = [];
  renderResult(/** @type {any} */ (root), {
    level, final: { ...state, outcome: 'won' }, reward: null, onMap: () => calls.push('map'), onReplay: () => calls.push('replay'),
  });
  return { ...keys, root, calls };
}

// The result screen arrives (its ribbon unfurls, its tally counts up):
// while it does, Enter or R only finishes it, as Enter does on the board
// at the end of a battle; then they act.
test('result: Enter is Back to map, R is Play again, once; held keys do nothing', (t) => {
  const a = mountResult(t);
  a.press('Enter', { repeat: true });
  a.press('r', { repeat: true });
  assert.deepEqual(a.calls, []);
  assert.equal(a.press('Enter'), true, 'the first Enter finishes the arrival');
  assert.deepEqual(a.calls, []);
  a.press('Enter');
  a.press('Enter');
  a.press('r');
  assert.deepEqual(a.calls, ['map']);
  const b = mountResult(t);
  b.press('R');
  assert.deepEqual(b.calls, [], 'R while it arrives only finishes it');
  b.press('R');
  assert.deepEqual(b.calls, ['replay']);
});

test('result: under reduced motion nothing arrives, and the first Enter acts', (t) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' });
  t.after(() => { globalThis.matchMedia = was; });
  const a = mountResult(t);
  a.press('Enter');
  assert.deepEqual(a.calls, ['map']);
});

test('result: ? lists the keys and Escape closes them; the buttons carry their hints', (t) => {
  const ui = mountResult(t);
  ui.press('?');
  assert.match(byClass(ui.root, 'battle-keys')[0].text, /Play again/);
  ui.press('Escape');
  assert.equal(byClass(ui.root, 'battle-keys')[0], undefined);
  assert.deepEqual(ui.calls, []);
  const hints = ui.root.all().filter((n) => n.tag === 'button').map((b) => b.children.find((n) => n.tag === 'kbd')?.textContent);
  assert.deepEqual(hints, ['Enter', 'R']);
});

test('one screen holds the keys at a time: a new screen lets go of the last one\'s', (t) => {
  const ui = mountMap(t, newProgress());
  assert.equal(ui.listeners.length, 1);
  const root = new FakeEl('div');
  const level = LEVELS.find((l) => l.id === 'o01');
  renderDeploy(/** @type {any} */ (root), { level, progress: newProgress(), onStart() {}, onBack() {} });
  assert.equal(ui.listeners.length, 1, 'the map\'s listener is gone, the deploy screen\'s is there');
  ui.press('t');
  assert.equal(ui.shop(), 0, 'the map no longer hears T');
});

// Last: it leaves the page marked as last used by a key.
test('shop: a purchase drawn again keeps the selection on what was bought, for a keyboard player', (t) => {
  const keys = keyboard(t);
  const doc = /** @type {any} */ (globalThis.document);
  const was = FakeEl.prototype.focus;
  FakeEl.prototype.focus = function () { doc.activeElement = this; };
  t.after(() => {
    if (was === undefined) delete FakeEl.prototype.focus;
    else FakeEl.prototype.focus = was;
  });
  // A key was the last input (as js/ui/keys.js's watchInput records).
  const watch = [];
  doc.addEventListener = ((orig) => (type, fn, opts) => { watch.push({ type, fn }); orig(type, fn, opts); })(doc.addEventListener);
  return import('../js/ui/keys.js').then(({ watchInput }) => {
    watchInput();
    for (const l of watch) if (l.type === 'keydown') l.fn({ key: 'Enter', repeat: false, target: null, preventDefault() {} });
    const progress = valleyProgress();
    progress.seeds = 100;
    const root = new FakeEl('div');
    renderShop(/** @type {any} */ (root), {
      progress, sold: true, chosen: 'recruit:hedgehog', onBuy() {}, onBack() {}, clock: fakeClock(), reducedMotion: true,
    });
    const row = byClass(root, 'shop-item').find((n) => n.dataset.item === 'recruit:hedgehog');
    assert.ok(row, 'the hedgehog is for sale');
    assert.equal(doc.activeElement, byClass(row, 'shop-deal__buy')[0]);
    assert.ok(keys.listeners.length > 0);
  });
});

test('a button a mouse or finger pressed lets go of the focus; one pressed by a key keeps it; a held Enter never presses a button', (t) => {
  const doc = /** @type {any} */ (globalThis.document);
  /** @type {Array<{type: string, fn: Function}>} */
  const listeners = [];
  doc.addEventListener = (type, fn) => listeners.push({ type, fn });
  doc.body = new FakeEl('body');
  t.after(() => {
    delete doc.addEventListener;
    delete doc.activeElement;
    delete doc.body;
  });
  const fire = (type, evt) => { for (const l of listeners) if (l.type === type) l.fn(evt); };
  return import('../js/ui/keys.js').then(({ watchInput, cameByKey }) => {
    watchInput();
    const btn = new FakeEl('button');
    let blurred = 0;
    /** @type {any} */ (btn).blur = () => { blurred += 1; doc.activeElement = doc.body; };
    doc.activeElement = btn;
    fire('pointerdown', {});
    assert.equal(cameByKey(), false);
    fire('click', { detail: 1, target: btn });
    assert.equal(blurred, 1, 'a click leaves no focus, so no ring can come up on it later');
    doc.activeElement = btn;
    fire('keydown', { key: 'Enter', repeat: false, target: btn, preventDefault() {} });
    assert.equal(cameByKey(), true);
    fire('click', { detail: 0, target: btn });
    assert.equal(blurred, 1, 'the keyboard\'s own press keeps the focus');
    let prevented = false;
    fire('keydown', { key: 'Enter', repeat: true, target: btn, preventDefault() { prevented = true; } });
    assert.ok(prevented, 'a held Enter does not press the button again');
  });
});

test('map: a place reached with Tab takes Enter to select it, then Enter marches; arrows carry its focus along', (t) => {
  const ui = mountMap(t, cleared('o01'));
  const doc = /** @type {any} */ (globalThis.document);
  const focus = FakeEl.prototype.focus;
  FakeEl.prototype.focus = function () { doc.activeElement = this; };
  t.after(() => {
    if (focus === undefined) delete FakeEl.prototype.focus;
    else FakeEl.prototype.focus = focus;
  });
  const button = (/** @type {string} */ name) => ui.root.all().find((n) => n.className.startsWith('map-node-btn') && n.attrs['aria-label'] === name);
  doc.activeElement = button('The Mown Strip');
  assert.equal(ui.press('Enter'), false, 'the focused place takes the first Enter itself');
  button('The Mown Strip').dispatch('click');
  assert.equal(ui.panelName(), 'The Mown Strip');
  ui.press('ArrowUp');
  assert.equal(ui.panelName(), 'The Ant Hill');
  assert.equal(doc.activeElement, button('The Ant Hill'), 'the focus went along');
  assert.equal(ui.press('Enter'), true);
  assert.deepEqual(ui.chosen, ['o02']);
});
