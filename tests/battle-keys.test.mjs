// The battle screen's keys (play-feel spec, "Changed after Jake's
// playtest of the full build"): Enter ends the turn (asking only for an
// untouched band, as the button does), Z or Backspace is Undo, Escape
// clears the selection. Nothing while a text field or a dialog has
// focus, and during the bots' turn a key only skips it, as a tap does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { keyCommand, mountBattle } from '../js/ui/battle-view.js';
import { createBattle } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { BOT_TURN_BUDGET_MS } from '../js/ui/anim-steps.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const PLAYER = { focus: /** @type {const} */ ('none'), phase: /** @type {const} */ ('player') };

test('keyCommand: Enter ends the turn, Z or Backspace undoes, Escape clears', () => {
  assert.equal(keyCommand({ key: 'Enter' }, PLAYER), 'endTurn');
  assert.equal(keyCommand({ key: 'z' }, PLAYER), 'undo');
  assert.equal(keyCommand({ key: 'Z' }, PLAYER), 'undo');
  assert.equal(keyCommand({ key: 'Backspace' }, PLAYER), 'undo');
  assert.equal(keyCommand({ key: 'Escape' }, PLAYER), 'clear');
  assert.equal(keyCommand({ key: 'q' }, PLAYER), null);
});

test('keyCommand: Tab, the digits, the cursor, Space, U and ?', () => {
  assert.equal(keyCommand({ key: 'Tab' }, PLAYER), 'next');
  assert.equal(keyCommand({ key: 'Tab', shiftKey: true }, PLAYER), 'prev');
  assert.equal(keyCommand({ key: '1' }, PLAYER), 'action1');
  assert.equal(keyCommand({ key: '9' }, PLAYER), 'action9');
  assert.equal(keyCommand({ key: '0' }, PLAYER), null);
  for (const [key, way] of [['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'],
    ['w', 'up'], ['s', 'down'], ['a', 'left'], ['d', 'right'], ['W', 'up'], ['D', 'right']]) {
    assert.equal(keyCommand({ key }, PLAYER), way, key);
  }
  assert.equal(keyCommand({ key: ' ' }, PLAYER), 'act');
  assert.equal(keyCommand({ key: 'u' }, PLAYER), 'undo');
  assert.equal(keyCommand({ key: 'U' }, PLAYER), 'undo');
  assert.equal(keyCommand({ key: '?' }, PLAYER), 'help');
});

test('keyCommand: a held key moves the cursor or the selection, but never acts, undoes or ends a turn', () => {
  for (const key of ['ArrowLeft', 'd', 'Tab']) assert.notEqual(keyCommand({ key, repeat: true }, PLAYER), null, key);
  for (const key of ['Enter', ' ', '1', 'z', 'u', 'Backspace', '?', 'Escape']) {
    assert.equal(keyCommand({ key, repeat: true }, PLAYER), null, key);
  }
});

test('keyCommand: with the settings or the leave bar open only Escape works, to close it', () => {
  const blocked = { focus: /** @type {const} */ ('none'), phase: /** @type {const} */ ('player'), blocked: true };
  for (const key of ['Enter', ' ', '1', 'z', 'Tab', 'ArrowUp', '?']) assert.equal(keyCommand({ key }, blocked), null, key);
  assert.equal(keyCommand({ key: 'Escape' }, blocked), 'clear');
});

test('keyCommand: Space on a focused button is left to the button', () => {
  assert.equal(keyCommand({ key: ' ' }, { focus: 'button', phase: 'player' }), null);
});

test('keyCommand: nothing with a modifier held, or for a held-down Enter', () => {
  assert.equal(keyCommand({ key: 'z', ctrlKey: true }, PLAYER), null, 'the browser undo');
  assert.equal(keyCommand({ key: 'z', metaKey: true }, PLAYER), null);
  assert.equal(keyCommand({ key: 'Enter', altKey: true }, PLAYER), null);
  assert.equal(keyCommand({ key: 'Enter', repeat: true }, PLAYER), null, 'one press, one turn');
});

test('keyCommand: nothing while a text field or a dialog has focus', () => {
  for (const key of ['Enter', 'z', 'Backspace', 'Escape', 'Tab', '1', ' ', 'ArrowUp', 'a', '?']) {
    assert.equal(keyCommand({ key }, { focus: 'text', phase: 'player' }), null, `${key} in a text field`);
    assert.equal(keyCommand({ key }, { focus: 'dialog', phase: 'player' }), null, `${key} in a dialog`);
    assert.equal(keyCommand({ key }, { focus: 'dialog', phase: 'bots' }), null, `${key} in a dialog, bots' turn`);
  }
});

test('keyCommand: Enter on a focused button is left to the button', () => {
  assert.equal(keyCommand({ key: 'Enter' }, { focus: 'button', phase: 'player' }), null);
  assert.equal(keyCommand({ key: 'z' }, { focus: 'button', phase: 'player' }), 'undo');
  assert.equal(keyCommand({ key: 'Escape' }, { focus: 'button', phase: 'player' }), 'clear');
});

test('keyCommand: during the bots turn the keys only skip it', () => {
  for (const key of ['Enter', 'z', 'Backspace', 'Escape']) {
    assert.equal(keyCommand({ key }, { focus: 'none', phase: 'bots' }), 'skip', key);
  }
  for (const key of ['a', 'Tab', '1', ' ', 'u', '?', 'ArrowUp']) {
    assert.equal(keyCommand({ key }, { focus: 'none', phase: 'bots' }), null, key);
  }
});

// --- mounted ---

const L01 = LEVELS.find((l) => l.id === 'l01');
const FIRST = /** @type {{kind: 'move', band: string, path: [number, number][]}} */ (L01.solution.moves[0]);
const [AX, AY] = L01.solution.deploy[0].at;
const [BX, BY] = FIRST.path[FIRST.path.length - 1];

function mount(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
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
  const progress = valleyProgress();
  for (const [type, maxLen] of Object.entries(L01.assumes)) progress.bands[type] = { maxLen };
  const root = new FakeEl('div');
  const finished = [];
  mountBattle(/** @type {any} */ (root), {
    level: L01,
    state: createBattle(L01, L01.solution.deploy, progress),
    onFinish: (s) => finished.push(s),
    onQuit() {},
  });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const press = (key, extra = {}) => {
    let prevented = false;
    const evt = { key, ...extra, preventDefault() { prevented = true; } };
    for (const l of [...listeners]) if (l.type === 'keydown') l.fn(evt);
    return prevented;
  };
  return {
    root,
    svg,
    button,
    press,
    listeners,
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    turnText: () => root.all().find((n) => n.className === 'turn-label').textContent,
    selected: () => svg.querySelector('[data-selected]'),
  };
}

test('mounted: Enter asks for an untouched band, a second Enter ends the turn', (t) => {
  const ui = mount(t);
  assert.equal(ui.press('Enter'), true, 'handled');
  assert.equal(ui.button('End turn').textContent, 'End turn? Tap again');
  assert.equal(ui.turnText(), 'Turn 1');
  ui.press('Enter');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS * 2);
  assert.equal(ui.turnText(), 'Turn 2');
});

test('mounted: Z undoes a move, Escape lets go of the band', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  assert.ok(ui.selected());
  ui.press('Escape');
  assert.equal(ui.selected(), null, 'Escape cleared the selection');
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  assert.equal(ui.button('Undo').disabled, false);
  ui.press('z');
  assert.equal(ui.button('Undo').disabled, true, 'back at the start of the turn');
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  ui.press('Backspace');
  assert.equal(ui.button('Undo').disabled, true, 'Backspace undoes too');
});

test('mounted: during the bots turn a key skips to its end and does nothing else', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  ui.press('Enter');
  assert.equal(ui.turnText(), 'Turn 1', 'the bots are moving');
  ui.press('Enter');
  assert.equal(ui.turnText(), 'Turn 2', 'skipped to the end of their turn');
  assert.equal(ui.button('End turn').textContent, 'End turn', 'and did not also arm End turn');
});

test('mounted: nothing while the focus is in a dialog or a text field', (t) => {
  const ui = mount(t);
  const doc = /** @type {any} */ (globalThis.document);
  const dialog = new FakeEl('div');
  dialog.setAttribute('role', 'dialog');
  const inside = new FakeEl('button');
  dialog.appendChild(inside);
  doc.activeElement = inside;
  assert.equal(ui.press('Enter'), false);
  assert.equal(ui.button('End turn').textContent, 'End turn');
  doc.activeElement = new FakeEl('input');
  assert.equal(ui.press('Enter'), false);
  assert.equal(ui.button('End turn').textContent, 'End turn');
});

test('mounted: the keys let go when the screen is left', (t) => {
  const ui = mount(t);
  assert.equal(ui.listeners.length, 1);
  ui.button('Quit').dispatch('click');
  ui.button('Leave').dispatch('click');
  assert.equal(ui.listeners.length, 0);
});

// --- found in the final review ---

test('keyCommand: a key still held from before the bots turn does not skip it', () => {
  // Enter ends the turn; if it is held a moment too long the keyboard
  // repeats it, and that repeat must not jump over the bots' turn.
  for (const key of ['Enter', 'z', 'Backspace', 'Escape']) {
    assert.equal(keyCommand({ key, repeat: true }, { focus: 'none', phase: 'bots' }), null, key);
  }
});

test('mounted: Enter held down ends one turn and lets the bots turn play', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  ui.press('Enter');
  assert.equal(ui.turnText(), 'Turn 1', 'the bots are moving');
  ui.press('Enter', { repeat: true });
  ui.press('Enter', { repeat: true });
  assert.equal(ui.turnText(), 'Turn 1', 'the repeats did not skip their turn');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS * 2);
  assert.equal(ui.turnText(), 'Turn 2');
  ui.press('Enter', { repeat: true });
  assert.equal(ui.button('End turn').textContent, 'End turn', 'and did not arm the next End turn');
});

test('mounted: Enter does not end the turn behind "Leave battle?"', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  ui.button('Quit').dispatch('click');
  assert.ok(ui.button('Leave'), 'the bar asks "Leave battle?"; End turn is not on screen');
  ui.press('Enter');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS * 2);
  assert.equal(ui.turnText(), 'Turn 1', 'no turn was ended out of sight');
  assert.ok(ui.button('Leave'), 'still asking');
  ui.press('Escape');
  assert.equal(ui.button('Leave'), undefined, 'Escape takes the question back');
  assert.ok(ui.button('End turn'));
});

// --- after the l03 playtest: the offered attack, Tab, 1-9, the cursor, ? ---

/** A small field: a badger and a bear against two saw-drones. */
const FIELD = /** @type {import('../js/engine/types.js').Level} */ ({
  id: 'keys-test',
  name: 'Key Test',
  blurb: '',
  goal: 'clear',
  maxBands: 3,
  turnLimit: null,
  grid: [
    '........',
    '........',
    '........',
    '.D......',
    '........',
    '.D......',
    '........',
    '.......S',
  ],
  bots: [{ type: 'saw', cells: [[4, 3], [5, 3]] }, { type: 'saw', cells: [[7, 0], [6, 0]] }],
  trapped: [],
  firstClearSeeds: 0,
  assumes: {},
  solution: { deploy: [], moves: [] },
});

function mountField(t, extra = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  /** @type {Array<{type: string, fn: Function}>} */
  const listeners = [];
  const doc = /** @type {any} */ (globalThis.document);
  doc.activeElement = null;
  doc.addEventListener = (type, fn) => listeners.push({ type, fn });
  doc.removeEventListener = () => {};
  t.after(() => {
    delete doc.addEventListener;
    delete doc.removeEventListener;
    delete doc.activeElement;
  });
  const progress = valleyProgress();
  progress.bands.bear = { maxLen: 2 };
  const state = createBattle(FIELD, [{ type: 'badger', at: [1, 3] }, { type: 'bear', at: [1, 5] }], progress);
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), { level: FIELD, state, onFinish() {}, onQuit() {}, ...extra });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const popupButton = (label) => root.all().find((n) => n.tag === 'button' && n.parent !== null
    && n.parent.className.split(' ').includes('action-popup') && n.textContent.startsWith(label));
  const press = (key, more = {}) => {
    let prevented = false;
    const evt = { key, ...more, preventDefault() { prevented = true; } };
    for (const l of [...listeners]) if (l.type === 'keydown') l.fn(evt);
    t.mock.timers.tick(5000);
    return prevented;
  };
  const selectedBand = () => {
    const ring = svg.querySelector('[data-selected]');
    return ring === null ? null : ring.parent.parent.attrs['data-band'];
  };
  const cells = (id) => {
    const g = svg.querySelector(`[data-band="${id}"]`);
    return g === null ? [] : g.findAll('data-token').map((n) => n.attrs['data-cell']).sort();
  };
  const cursor = () => root.all().find((n) => n.className === 'board-cursor');
  const tap = (x, y) => {
    svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' });
    t.mock.timers.tick(5000);
  };
  return { root, svg, button, popupButton, press, selectedBand, cells, cursor, tap };
}

test('mounted: a band that moves next to a bot has its attack chosen, so one tap attacks', (t) => {
  const ui = mountField(t);
  ui.tap(1, 3);
  assert.equal(ui.selectedBand(), 'badger');
  assert.equal(ui.popupButton('Dig').attrs['aria-pressed'], 'false', 'nothing chosen before it moves');
  ui.tap(3, 3);
  assert.equal(ui.selectedBand(), 'badger', 'still selected after the move');
  assert.equal(ui.popupButton('Bite').attrs['aria-pressed'], 'true', 'Bite is offered');
  assert.equal(ui.popupButton('Dig').attrs['aria-pressed'], 'false', 'Dig is one tap away');
  assert.ok(ui.svg.querySelector('[data-target="4,3"]'), 'the saw lights up as a target');
  ui.tap(4, 3);
  assert.deepEqual(ui.cells('saw-0'), ['4,3'], 'one tap bit the saw');
});

test('mounted: a move with nothing to hit offers nothing', (t) => {
  const ui = mountField(t);
  ui.tap(1, 3);
  ui.tap(1, 1);
  assert.equal(ui.selectedBand(), 'badger');
  assert.ok(ui.popupButton('Dig'), 'the pop-up offers Dig');
  assert.equal(ui.popupButton('Dig').attrs['aria-pressed'], 'false', 'but does not choose it');
  assert.equal(ui.svg.querySelector('[data-target]'), null, 'and nothing is lit');
});

test('mounted: Tab and Shift+Tab go through the bands with something left to do', (t) => {
  const ui = mountField(t);
  assert.equal(ui.press('Tab'), true);
  assert.equal(ui.selectedBand(), 'badger');
  ui.press('Tab');
  assert.equal(ui.selectedBand(), 'bear');
  ui.press('Tab');
  assert.equal(ui.selectedBand(), 'badger', 'wraps round');
  ui.press('Tab', { shiftKey: true });
  assert.equal(ui.selectedBand(), 'bear');
  // The bear moves away and acts on nothing: it is done, and Tab skips it.
  ui.tap(1, 7);
  ui.press('Escape');
  ui.press('Tab');
  assert.equal(ui.selectedBand(), 'badger');
  ui.press('Tab');
  assert.equal(ui.selectedBand(), 'badger', 'the bear is done');
});

test('mounted: 1 to 9 choose the selected band\'s actions as the pop-up lists them', (t) => {
  const ui = mountField(t);
  ui.tap(1, 3);
  ui.press('1');
  assert.equal(ui.popupButton('Dig').attrs['aria-pressed'], 'true');
  ui.press('2');
  assert.equal(ui.popupButton('Dig').attrs['aria-pressed'], 'true', 'Bite has no target: nothing changes');
  ui.press('1');
  assert.equal(ui.popupButton('Dig').attrs['aria-pressed'], 'true', 'a number chooses, it does not toggle');
  ui.press('1', { repeat: true });
  assert.equal(ui.popupButton('Dig').attrs['aria-pressed'], 'true');
});

test('mounted: the cursor starts on the first ready band, moves with the arrows, and Space taps its tile', (t) => {
  const ui = mountField(t);
  assert.equal(ui.cursor().hidden, true, 'hidden until an arrow');
  ui.press('ArrowRight');
  assert.equal(ui.cursor().hidden, false);
  assert.equal(ui.cursor().style.left, `${(1 * 100) / 8}%`, 'on the badger');
  assert.equal(ui.cursor().style.top, `${(3 * 100) / 8}%`);
  ui.press(' ');
  assert.equal(ui.selectedBand(), 'badger', 'Space selected it, as a tap would');
  ui.press('d');
  ui.press('ArrowRight');
  assert.equal(ui.cursor().style.left, `${(3 * 100) / 8}%`);
  ui.press(' ');
  assert.deepEqual(ui.cells('badger'), ['1,3', '2,3', '3,3'], 'Space moved it');
  ui.press('ArrowRight');
  ui.press(' ', { repeat: true });
  assert.deepEqual(ui.cells('saw-0'), ['4,3', '5,3'], 'a held Space does not act');
  ui.press(' ');
  assert.deepEqual(ui.cells('saw-0'), ['4,3'], 'Space bit the saw: the offered attack');
  ui.tap(0, 0);
  assert.equal(ui.cursor().hidden, true, 'a tap puts the cursor away');
});

test('mounted: ? shows the list of keys and hides it; Escape closes it too', (t) => {
  const ui = mountField(t);
  const list = () => ui.root.all().find((n) => typeof n.className === 'string' && n.className.split(' ').includes('battle-keys'));
  assert.equal(list(), undefined);
  ui.press('?');
  assert.ok(list());
  assert.match(list().text, /Tab/);
  assert.match(list().text, /End turn/);
  ui.press('?');
  assert.equal(list(), undefined);
  ui.press('?');
  ui.tap(1, 3);
  ui.press('Escape');
  assert.equal(list(), undefined, 'Escape closed the list');
  assert.equal(ui.selectedBand(), 'badger', 'and did not also let go of the band');
});

test('mounted: with the settings open the keys do nothing but Escape, which closes them', (t) => {
  const ui = mountField(t);
  ui.root.all().find((n) => n.tag === 'button' && n.attrs['aria-label'] === 'Settings').dispatch('click');
  const settings = () => ui.root.all().find((n) => typeof n.className === 'string' && n.className.split(' ').includes('battle-settings'));
  assert.ok(settings());
  ui.press('Enter');
  ui.press('Tab');
  assert.equal(ui.button('End turn').textContent, 'End turn', 'Enter did nothing');
  assert.equal(ui.selectedBand(), null, 'Tab did nothing');
  ui.press('Escape');
  assert.equal(settings(), undefined);
  ui.press('Tab');
  assert.equal(ui.selectedBand(), 'badger');
});

test('mounted: the buttons carry their key hints', (t) => {
  const ui = mountField(t);
  const hint = (btn) => btn.children.find((n) => n.tag === 'kbd')?.textContent;
  assert.equal(hint(ui.button('End turn')), 'Enter');
  assert.equal(hint(ui.button('Undo')), 'Z');
  ui.tap(1, 3);
  assert.equal(hint(ui.popupButton('Dig')), '1');
  assert.equal(hint(ui.popupButton('Bite')), '2');
  for (const btn of ui.root.all().filter((n) => n.tag === 'kbd')) {
    assert.equal(btn.attrs['aria-hidden'], 'true');
    assert.equal(btn.className, 'key-hint');
  }
});
