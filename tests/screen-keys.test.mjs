// The keys on every screen outside the battle (js/ui/keys.js): the owner
// asked for "the 'continue', 'back to map', conversations etc" to be
// easily keyboarded. Enter is each screen's main button, Escape goes back
// or closes what is on top, ? lists the keys, arrows move a selection; a
// held key never buys, places, starts, ends or leaves; nothing while a
// text field or a scene has the focus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  titleKey, mapKey, deployKey, shopKey, resultKey, stepToward, wayOf, focusKind,
  TITLE_KEY_LIST, MAP_KEY_LIST, DEPLOY_KEY_LIST, SHOP_KEY_LIST, RESULT_KEY_LIST,
} from '../js/ui/keys.js';
import { keyCommand } from '../js/ui/battle-view.js';
import { FakeEl } from './fake-dom.mjs';

const NONE = { focus: /** @type {const} */ ('none') };
const BUTTON = { focus: /** @type {const} */ ('button') };
const SCREENS = { titleKey, mapKey, deployKey, shopKey, resultKey };

test('every screen: Enter is the main action, Escape goes back, ? lists the keys', () => {
  for (const [name, fn] of Object.entries(SCREENS)) {
    assert.equal(fn({ key: 'Enter' }, NONE), 'main', name);
    assert.equal(fn({ key: 'Escape' }, NONE), 'back', name);
    assert.equal(fn({ key: '?', shiftKey: true }, NONE), 'help', name);
    assert.equal(fn({ key: 'q' }, NONE), null, name);
  }
});

test('every screen: nothing while a text field or a scene has the focus, or with Ctrl, Cmd or Alt', () => {
  for (const [name, fn] of Object.entries(SCREENS)) {
    for (const key of ['Enter', 'Escape', '?', 'ArrowUp', ' ', '1', 's', 't', 'r']) {
      assert.equal(fn({ key }, { focus: 'text' }), null, `${name} ${key} in a text field`);
      assert.equal(fn({ key }, { focus: 'dialog' }), null, `${name} ${key} in a scene`);
    }
    assert.equal(fn({ key: 'Enter', ctrlKey: true }, NONE), null, name);
    assert.equal(fn({ key: 'Enter', metaKey: true }, NONE), null, name);
    assert.equal(fn({ key: 'Escape', altKey: true }, NONE), null, name);
  }
});

test('every screen: a held key never does the main action, goes back, or anything else but move', () => {
  for (const [name, fn] of Object.entries(SCREENS)) {
    for (const key of ['Enter', 'Escape', '?', ' ', '1', 't', 'T', 'r', 'R']) {
      assert.equal(fn({ key, repeat: true }, NONE), null, `${name}: held ${key}`);
    }
  }
  assert.equal(titleKey({ key: 's', repeat: true }, NONE), null, 'a held S does not flicker the sound');
  // Holding an arrow keeps moving the selection, as in battle.
  assert.equal(mapKey({ key: 'ArrowUp', repeat: true }, NONE), 'up');
  assert.equal(deployKey({ key: 'd', repeat: true }, NONE), 'right');
  assert.equal(shopKey({ key: 'ArrowDown', repeat: true }, NONE), 'down');
});

test('every screen: Enter on a button the keyboard reached is left to the button', () => {
  for (const [name, fn] of Object.entries(SCREENS)) {
    assert.equal(fn({ key: 'Enter' }, BUTTON), null, name);
    assert.equal(fn({ key: 'Escape' }, BUTTON), 'back', name);
  }
  assert.equal(deployKey({ key: ' ' }, BUTTON), null, 'and Space too');
});

test('title: S is the sound', () => {
  assert.equal(titleKey({ key: 's' }, NONE), 'sound');
  assert.equal(titleKey({ key: 'S' }, NONE), 'sound');
  assert.equal(titleKey({ key: 'ArrowUp' }, NONE), null);
});

test('map: arrows and W A S D move, T is the trading post', () => {
  for (const [key, way] of [['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'],
    ['w', 'up'], ['S', 'down'], ['a', 'left'], ['D', 'right']]) {
    assert.equal(mapKey({ key }, NONE), way, key);
  }
  assert.equal(mapKey({ key: 't' }, NONE), 'shop');
  assert.equal(mapKey({ key: 'T' }, NONE), 'shop');
  assert.equal(mapKey({ key: ' ' }, NONE), null);
});

test('deploy: 1 to 9 pick a band, arrows move, Space places', () => {
  assert.equal(deployKey({ key: '1' }, NONE), 'band1');
  assert.equal(deployKey({ key: '9' }, NONE), 'band9');
  assert.equal(deployKey({ key: '0' }, NONE), null);
  assert.equal(deployKey({ key: ' ' }, NONE), 'place');
  assert.equal(deployKey({ key: 'ArrowLeft' }, NONE), 'left');
  assert.equal(deployKey({ key: 'W' }, NONE), 'up');
});

test('shop: arrows move; Tab is left to the browser', () => {
  assert.equal(shopKey({ key: 'ArrowRight' }, NONE), 'right');
  assert.equal(shopKey({ key: 's' }, NONE), 'down');
  assert.equal(shopKey({ key: 'Tab' }, NONE), null);
  assert.equal(shopKey({ key: ' ' }, NONE), null);
});

test('result: R is Play again', () => {
  assert.equal(resultKey({ key: 'r' }, NONE), 'replay');
  assert.equal(resultKey({ key: 'R' }, NONE), 'replay');
});

test('battle, once it is over: Enter or Space is Continue, once per press; nothing else acts', () => {
  const ended = { focus: /** @type {const} */ ('none'), phase: /** @type {const} */ ('player'), ended: true };
  assert.equal(keyCommand({ key: 'Enter' }, ended), 'continue');
  assert.equal(keyCommand({ key: ' ' }, ended), 'continue');
  assert.equal(keyCommand({ key: 'Enter', repeat: true }, ended), null, 'not a held Enter');
  assert.equal(keyCommand({ key: 'Enter' }, { ...ended, focus: 'button' }), null, 'a focused button takes it');
  assert.equal(keyCommand({ key: 'Enter' }, { ...ended, focus: 'dialog' }), null, 'not under a scene');
  for (const key of ['z', 'Backspace', 'Tab', '1', 'ArrowUp']) assert.equal(keyCommand({ key }, ended), null, key);
  assert.equal(keyCommand({ key: '?' }, ended), 'help');
  assert.equal(keyCommand({ key: 'Escape' }, ended), 'clear');
});

test('every screen lists its keys, each key once, ? last', () => {
  for (const list of [TITLE_KEY_LIST, MAP_KEY_LIST, DEPLOY_KEY_LIST, SHOP_KEY_LIST, RESULT_KEY_LIST]) {
    assert.ok(list.some((e) => e.keys === 'Enter'));
    assert.equal(list[list.length - 1].keys, '?');
    assert.equal(new Set(list.map((e) => e.keys)).size, list.length);
  }
});

test('wayOf: the arrows and W A S D', () => {
  assert.equal(wayOf('ArrowUp'), 'up');
  assert.equal(wayOf('a'), 'left');
  assert.equal(wayOf('x'), null);
});

test('focusKind: a button the keyboard reached is a button; one a click left focused is not', () => {
  const btn = new FakeEl('button');
  assert.equal(focusKind(btn), 'button', 'where the browser cannot say, it counts as reached by the keyboard');
  /** @type {any} */ (btn).matches = (/** @type {string} */ sel) => sel === ':focus-visible';
  assert.equal(focusKind(btn), 'button');
  /** @type {any} */ (btn).matches = () => false;
  assert.equal(focusKind(btn), 'none');
  assert.equal(focusKind(new FakeEl('input')), 'text');
  const dialog = new FakeEl('div');
  dialog.setAttribute('role', 'dialog');
  const inside = new FakeEl('button');
  dialog.appendChild(inside);
  assert.equal(focusKind(inside), 'dialog');
  assert.equal(focusKind(null), 'none');
});

// --- which place an arrow moves to ---

test('stepToward: the nearest point that way, preferring one straight ahead', () => {
  // A plus: from the middle each arrow goes to its own arm.
  const plus = [{ x: 5, y: 5 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 5 }, { x: 10, y: 5 }];
  assert.equal(stepToward(plus, 0, 'up'), 1);
  assert.equal(stepToward(plus, 0, 'down'), 2);
  assert.equal(stepToward(plus, 0, 'left'), 3);
  assert.equal(stepToward(plus, 0, 'right'), 4);
  // From the top arm, down goes to the middle, not past it.
  assert.equal(stepToward(plus, 1, 'down'), 0);
  // A nearer point well off to the side loses to one straight ahead.
  const row = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 0 }];
  assert.equal(stepToward(row, 0, 'right'), 2);
});

test('stepToward: nothing behind, nothing far off to the side, and null at an edge', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: -3, y: 0 }];
  assert.equal(stepToward(pts, 0, 'right'), null, 'the one to the right is mostly below');
  assert.equal(stepToward(pts, 0, 'down'), 1);
  assert.equal(stepToward(pts, 0, 'up'), null);
  assert.equal(stepToward(pts, 2, 'left'), null);
  assert.equal(stepToward(pts, 9, 'left'), null, 'no such point');
  assert.equal(stepToward([], 0, 'left'), null);
});

test('stepToward: a tie goes to the nearer, then the first listed', () => {
  // Equal score (ahead + 2 * side): 3 + 0 against 1 + 2 * 1.
  const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 1 }];
  assert.equal(stepToward(pts, 0, 'right'), 2);
  const twins = [{ x: 0, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }];
  assert.equal(stepToward(twins, 0, 'right'), 1);
});

test('stepToward: down from the Ant Hill goes back down the path to the Mown Strip, not to the trading post', () => {
  // Column units from data/campaign.js: both are 80 by the score; the
  // Mown Strip is the nearer.
  const places = [{ x: 40, y: 340 }, { x: 58, y: 296 }, { x: 74, y: 344 }];
  assert.equal(stepToward(places, 1, 'down'), 0);
  assert.equal(stepToward(places, 0, 'right'), 2);
  assert.equal(stepToward(places, 2, 'up'), 1);
});

test('stepToward: a row of deploy tiles, left and right', () => {
  const tiles = [[0, 7], [1, 7], [2, 7], [0, 6]].map(([x, y]) => ({ x, y }));
  assert.equal(stepToward(tiles, 0, 'right'), 1);
  assert.equal(stepToward(tiles, 1, 'right'), 2);
  assert.equal(stepToward(tiles, 2, 'right'), null);
  assert.equal(stepToward(tiles, 2, 'left'), 1);
  assert.equal(stepToward(tiles, 0, 'up'), 3);
  assert.equal(stepToward(tiles, 3, 'down'), 0);
  assert.equal(stepToward(tiles, 3, 'right'), 1, 'the nearest one down the row');
});
