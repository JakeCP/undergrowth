// The band in focus on the battle screen (js/ui/battle-focus.js): what the
// side panel's card shows for each selection, the phone strip's collapse
// rule, and, mounted, that the card's action list does what the pop-up's
// buttons do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import {
  focusInfo, focusPrompt, phoneStrip, lengthMarks, speedMarks, PROMPT, TRAPPED_TEXT,
  STRIP_ROOM, STRIP_H, STRIP_LOG_H, STRIP_GAP, BOARD_MAX,
} from '../js/ui/battle-focus.js';
import { selectionView, offeredAction, mountBattle } from '../js/ui/battle-view.js';
import { TURN_STATE_TEXT } from '../js/ui/turn-state.js';
import { SPEED_SCALE } from '../js/ui/unit-info.js';
import { describeIntent } from '../js/ui/text.js';
import { applyMove, createBattle } from '../js/engine/battle.js';
import { BAND_TYPES } from '../js/engine/units.js';
import fs from 'node:fs';
import { makeState, valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

/** A fox, a badger and a grown Ant Colony against a harvester and a saw. */
function field(extra = {}) {
  return makeState(['........', '........', '........', '........', '........'], [
    { id: 'fox', type: 'fox', cells: [[0, 4]], maxLen: 2 },
    { id: 'badger', type: 'badger', cells: [[2, 4]], maxLen: 3 },
    { id: 'ants', type: 'ants', cells: [[4, 4], [4, 3]], maxLen: 6 },
    { id: 'harvester-0', type: 'harvester', cells: [[7, 0], [6, 0], [5, 0]], maxLen: 3 },
    { id: 'saw-0', type: 'saw', cells: [[7, 3], [7, 2]], maxLen: 2 },
  ], extra);
}

/**
 * @param {import('../js/engine/types.js').BattleState} s
 * @param {string} id
 * @param {string|null} [chosen]
 */
function selected(s, id, chosen = null) {
  const view = selectionView(s, id, chosen);
  assert.ok(view, `${id} can be selected`);
  return focusInfo(s, view);
}

// --- with nothing in focus ---

test('focusInfo: nothing selected shows the quiet prompt', () => {
  const s = field();
  assert.deepEqual(focusInfo(s, null), { kind: 'none', text: PROMPT.begin });
});

test('focusPrompt: how to begin, then what a tap does, then that the turn can end', () => {
  const s = field();
  assert.equal(focusPrompt(s), PROMPT.begin, 'turn 1, nothing done yet');
  const moved = applyMove(s, { kind: 'move', band: 'fox', path: [[0, 3]] });
  assert.equal(focusPrompt(moved), PROMPT.pick, 'once a band has done something');
  assert.equal(focusPrompt({ ...s, turn: 2 }), PROMPT.pick, 'on a later turn');
  const allDone = { ...s, bands: s.bands.map((b) => (b.side === 'us' ? { ...b, moved: true, acted: true } : b)) };
  assert.equal(focusPrompt(allDone), PROMPT.done);
  assert.equal(focusPrompt({ ...s, outcome: /** @type {const} */ ('won') }), '', 'nothing once it is over');
  assert.deepEqual(focusInfo({ ...s, outcome: /** @type {const} */ ('lost') }, null, 'harvester-0'), { kind: 'none', text: '' });
});

// --- one of the player's bands ---

test('focusInfo: the fox, with one action, lists it without a key, as the action a tap does', () => {
  const info = selected(field(), 'fox');
  assert.equal(info.kind, 'band');
  if (info.kind !== 'band') return;
  assert.equal(info.bandId, 'fox');
  assert.equal(info.typeId, 'fox');
  assert.equal(info.name, 'Fox');
  assert.equal(info.lengthText, '1/2');
  assert.deepEqual(info.speed, { filled: BAND_TYPES.fox.speed, hollow: SPEED_SCALE - BAND_TYPES.fox.speed });
  assert.deepEqual(info.length, { filled: 1, hollow: 1 });
  assert.equal(info.status, 'ready');
  assert.equal(info.statusText, TURN_STATE_TEXT.ready);
  assert.deepEqual(info.actions, [{ id: 'bite', label: 'Bite', key: null, enabled: false, active: true }]);
  assert.equal(info.choosable, false, 'nothing to choose: its targets show with its moves');
  assert.equal(info.hint, 'Tap a tile to move');
});

test('focusInfo: the badger lists Dig and Bite with their number keys; nothing marked until one is chosen', () => {
  const s = field();
  const info = selected(s, 'badger');
  assert.equal(info.kind, 'band');
  if (info.kind !== 'band') return;
  assert.equal(info.name, 'Badger');
  assert.equal(info.choosable, true);
  assert.deepEqual(info.actions.map((a) => [a.id, a.key, a.enabled, a.active]), [
    ['dig', '1', true, false],
    ['bite', '2', false, false],
  ]);
  assert.equal(info.hint, 'Tap a tile to move, or choose an action');
  const dig = selected(s, 'badger', 'dig');
  assert.equal(dig.kind, 'band');
  if (dig.kind !== 'band') return;
  assert.deepEqual(dig.actions.map((a) => a.active), [true, false], 'the chosen one is marked');
  assert.equal(dig.hint, 'Dig: tap a target');
});

test('focusInfo: the Ant Colony is named by its tier and lists Bite and Ram', () => {
  const info = selected(field(), 'ants');
  assert.equal(info.kind, 'band');
  if (info.kind !== 'band') return;
  assert.equal(info.name, 'Ant Colony');
  assert.equal(info.lengthText, '2/6');
  assert.deepEqual(info.length, { filled: 2, hollow: 4 });
  assert.deepEqual(info.actions.map((a) => `${a.key} ${a.label}`), ['1 Bite', '2 Ram']);
});

test('focusInfo: after a move next to a bot the offered attack is marked, and the band can still act', () => {
  const s = makeState(['....', '....'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]], maxLen: 3 },
    { id: 'saw-0', type: 'saw', cells: [[3, 0], [3, 1]] },
  ]);
  const moved = applyMove(s, { kind: 'move', band: 'badger', path: [[1, 0], [2, 0]] });
  const info = selected(moved, 'badger', offeredAction(moved, 'badger'));
  assert.equal(info.kind, 'band');
  if (info.kind !== 'band') return;
  assert.equal(info.status, 'canAct');
  assert.equal(info.statusText, TURN_STATE_TEXT.canAct);
  assert.deepEqual(info.actions.map((a) => [a.id, a.active]), [['dig', false], ['bite', true]]);
  assert.equal(info.hint, 'Bite: tap a target');
});

test('focusInfo: a band that has acted, tapped, shows as done with its actions as a plain list', () => {
  const s = field();
  const done = { ...s, bands: s.bands.map((b) => (b.id === 'badger' ? { ...b, moved: true, acted: true } : b)) };
  const info = focusInfo(done, null, 'badger');
  assert.equal(info.kind, 'band');
  if (info.kind !== 'band') return;
  assert.equal(info.status, 'done');
  assert.equal(info.statusText, TURN_STATE_TEXT.done);
  assert.equal(info.choosable, false);
  assert.equal(info.hint, null);
  assert.deepEqual(info.actions.map((a) => [a.id, a.key, a.enabled, a.active]), [
    ['dig', null, false, false],
    ['bite', null, false, false],
  ]);
});

test('focusInfo: a trapped band says how to free it', () => {
  const s = makeState(['....'], [{ id: 'trapped-bear', type: 'bear', cells: [[2, 0]], trapped: true }]);
  const info = focusInfo(s, null, 'trapped-bear');
  assert.equal(info.kind, 'band');
  if (info.kind !== 'band') return;
  assert.equal(info.status, 'trapped');
  assert.equal(info.statusText, TRAPPED_TEXT);
});

// --- a bot ---

test('focusInfo: a tapped bot shows its length and, in one plain line, what its plan does', () => {
  const s = field();
  const info = focusInfo(s, null, 'harvester-0');
  assert.equal(info.kind, 'bot');
  if (info.kind !== 'bot') return;
  assert.equal(info.name, 'Harvester');
  assert.equal(info.typeId, 'harvester');
  assert.equal(info.lengthText, '3/3');
  assert.deepEqual(info.length, { filled: 3, hollow: 0 });
  const bot = s.bands.find((b) => b.id === 'harvester-0');
  assert.ok(bot);
  assert.equal(info.plan, describeIntent(s, bot));
  assert.equal('actions' in info, false, 'a bot has no actions to choose');
});

test('focusInfo: the last tap wins: a bot tapped over a selection, and a band gone falls back', () => {
  const s = field();
  const view = selectionView(s, 'badger', null);
  assert.equal(focusInfo(s, view, 'saw-0').kind, 'bot');
  const gone = { ...s, bands: s.bands.map((b) => (b.id === 'saw-0' ? { ...b, cells: [] } : b)) };
  const back = focusInfo(gone, view, 'saw-0');
  assert.equal(back.kind === 'band' && back.bandId, 'badger', 'back to the selected band');
  assert.equal(focusInfo(gone, null, 'saw-0').kind, 'none');
  assert.equal(focusInfo(s, null, 'nobody').kind, 'none');
});

test('lengthMarks and speedMarks: what is left filled, what is lost hollow; speed out of the fastest', () => {
  const s = field();
  const ants = s.bands.find((b) => b.id === 'ants');
  assert.ok(ants);
  assert.deepEqual(lengthMarks(ants), { filled: 2, hollow: 4 });
  assert.deepEqual(lengthMarks({ ...ants, cells: [], maxLen: 3 }), { filled: 0, hollow: 3 });
  const fastest = Object.values(BAND_TYPES).filter((d) => d.side === 'us').map((d) => d.speed);
  assert.equal(SPEED_SCALE, Math.max(...fastest));
  assert.deepEqual(speedMarks('badger'), { filled: BAND_TYPES.badger.speed, hollow: SPEED_SCALE - BAND_TYPES.badger.speed });
  assert.deepEqual(speedMarks('nothing'), { filled: 0, hollow: SPEED_SCALE });
});

// --- the phone's strip ---

test('phoneStrip: a tall phone shows the strip; 360 by 640 collapses to the one-line message', () => {
  // The board's cell on a 390 by 844 phone, and on a 360 by 640 one, as measured.
  assert.equal(phoneStrip({ wide: false, width: 358, height: 582 }), true, '390 x 844');
  assert.equal(phoneStrip({ wide: false, width: 328, height: 398 }), false, '360 x 640');
  assert.equal(phoneStrip({ wide: true, width: 358, height: 900 }), false, 'never beside the side panel');
  assert.equal(phoneStrip({ wide: false, width: 0, height: 0 }), false, 'not measured yet');
});

test('phoneStrip: only when the strip fits under a board that keeps its full width', () => {
  assert.equal(STRIP_ROOM, STRIP_GAP + STRIP_H + STRIP_GAP + STRIP_LOG_H);
  assert.equal(phoneStrip({ wide: false, width: 340, height: 340 + STRIP_ROOM }), true, 'exactly enough');
  assert.equal(phoneStrip({ wide: false, width: 340, height: 340 + STRIP_ROOM - 1 }), false, 'a pixel short');
  // A wide cell: the board stops at its widest, so the room is measured from that.
  assert.equal(phoneStrip({ wide: false, width: 700, height: BOARD_MAX + STRIP_ROOM }), true);
  assert.equal(phoneStrip({ wide: false, width: 700, height: BOARD_MAX + STRIP_ROOM - 1 }), false);
});

// --- mounted: the card's list does what the pop-up does ---

const LEVEL = /** @type {import('../js/engine/types.js').Level} */ ({
  id: 'focus-test',
  name: 'Focus Test',
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

/**
 * @param {import('node:test').TestContext} t
 * @param {boolean} [again]  a second screen in the same test: the timers are already mocked
 */
function mount(t, again = false) {
  if (!again) t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = /** @type {any} */ (globalThis.document);
  doc.activeElement = null;
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  t.after(() => {
    delete doc.addEventListener;
    delete doc.removeEventListener;
    delete doc.activeElement;
  });
  const progress = valleyProgress();
  progress.bands.bear = { maxLen: 2 };
  const state = createBattle(LEVEL, [{ type: 'badger', at: [1, 3] }, { type: 'bear', at: [1, 5] }], progress);
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), { level: LEVEL, state, onFinish() {}, onQuit() {} });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  assert.ok(svg);
  const classes = (/** @type {FakeEl} */ n) => (typeof n.className === 'string' ? n.className.split(' ') : []);
  const focus = () => root.all().find((n) => classes(n).includes('battle-focus'));
  const within = (/** @type {string} */ cls, /** @type {string} */ label) => root.all().find((n) => n.tag === 'button'
    && n.textContent.startsWith(label) && n.parent !== null
    && (classes(n.parent).includes(cls) || (n.parent.parent !== null && classes(n.parent.parent).includes(cls))));
  return {
    svg,
    focus,
    panelButton: (/** @type {string} */ label) => within('battle-focus__action', label),
    popupButton: (/** @type {string} */ label) => within('action-popup', label),
    targets: () => svg.findAll('data-target').map((n) => n.attrs['data-target']).sort(),
    tap: (/** @type {number} */ x, /** @type {number} */ y) => {
      svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' });
      t.mock.timers.tick(5000);
    },
  };
}

test('mounted: the card shows the prompt, then the selected band with its actions as buttons', (t) => {
  const ui = mount(t);
  const box = ui.focus();
  assert.ok(box);
  assert.equal(box.dataset.kind, 'none');
  assert.match(box.text, /Pick one of your bands to begin/);
  ui.tap(1, 3);
  assert.equal(box.dataset.kind, 'band');
  assert.match(box.text, /Badger/);
  assert.match(box.text, new RegExp(TURN_STATE_TEXT.ready));
  const dig = ui.panelButton('Dig');
  const bite = ui.panelButton('Bite');
  assert.ok(dig && bite, 'Dig and Bite are buttons on the card');
  assert.equal(dig.disabled, false);
  assert.equal(bite.disabled, true, 'nothing in reach: as dead as the pop-up\'s');
  assert.ok(dig.all().some((n) => n.className === 'key-hint' && n.textContent === '1'), 'with its number key');
  assert.ok(dig.all().some((n) => n.className === 'ui-emblem'), 'and its emblem');
});

test('mounted: choosing an action on the card does exactly what its pop-up button does', (t) => {
  const byPopup = mount(t);
  byPopup.tap(1, 3);
  const popupDig = byPopup.popupButton('Dig');
  assert.ok(popupDig);
  popupDig.dispatch('click');

  const byCard = mount(t, true);
  byCard.tap(1, 3);
  const cardDig = byCard.panelButton('Dig');
  assert.ok(cardDig);
  cardDig.dispatch('click');

  assert.ok(byCard.targets().length > 0, 'Dig\'s targets are lit');
  assert.deepEqual(byCard.targets(), byPopup.targets(), 'the same targets either way');
  assert.equal(byCard.popupButton('Dig').attrs['aria-pressed'], 'true', 'the pop-up shows it chosen');
  assert.equal(byCard.panelButton('Dig').attrs['aria-pressed'], 'true', 'and so does the card');
  assert.ok(byCard.panelButton('Dig').className.split(' ').includes('ui-btn--primary'));
  assert.equal(byPopup.panelButton('Dig').attrs['aria-pressed'], 'true', 'the pop-up\'s choice shows on the card');

  // A second tap lets go of it, as on the pop-up.
  byCard.panelButton('Dig').dispatch('click');
  byPopup.popupButton('Dig').dispatch('click');
  assert.deepEqual(byCard.targets(), [], 'back to the move tiles');
  assert.deepEqual(byCard.targets(), byPopup.targets());
  assert.equal(byCard.popupButton('Dig').attrs['aria-pressed'], 'false');
});

test('mounted: a tapped bot shows its plan on the card; empty ground puts the prompt back', (t) => {
  const ui = mount(t);
  ui.tap(1, 3);
  ui.tap(4, 3);
  const box = ui.focus();
  assert.ok(box);
  assert.equal(box.dataset.kind, 'bot');
  assert.match(box.text, /Saw/);
  assert.match(box.text, /Plan/);
  ui.tap(0, 0);
  assert.equal(box.dataset.kind, 'none');
});

// --- End turn's badge ---

test('mounted: End turn counts the untouched bands on its badge while it would ask, and while it asks', (t) => {
  const ui = mount(t);
  const end = () => ui.svg.parent.parent.parent.all().find((n) => n.tag === 'button' && n.className.split(' ').includes('end-btn'));
  assert.equal(end().dataset.waiting, '2', 'the badger and the bear');
  assert.match(end().attrs['aria-label'], /2 bands have not moved yet/);
  end().dispatch('click');
  assert.equal(end().textContent, 'End turn? Tap again');
  assert.equal(end().dataset.waiting, '2', 'still counted while it asks');
  ui.tap(1, 3);
  ui.tap(1, 1);
  assert.equal(end().dataset.waiting, '1', 'the badger has moved');
  assert.match(end().attrs['aria-label'], /1 band has not moved yet/);
  ui.tap(1, 5);
  ui.tap(1, 7);
  assert.equal(end().dataset.waiting, undefined, 'one tap ends the turn now: no badge');
  assert.ok(end().className.split(' ').includes('is-ready'));
});

// --- the stylesheet ---

const css = fs.readFileSync(new URL('../css/game.css', import.meta.url), 'utf8');

test('the stylesheet: on a wide screen the card is the middle of the side panel, the log just above the buttons', () => {
  const areas = [...css.matchAll(/grid-template-areas:([^;]*);/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  assert.ok(areas.includes('"board head" "board goal" "board focus" "board log" "board dock" "board bar"'), areas.join(' | '));
  assert.match(css, /\.battle-focus\s*\{[^}]*grid-area:\s*focus/);
});

test('the stylesheet: the strip shows only with .has-strip, at its fixed height', () => {
  assert.match(css, /\.battle-focus\s*\{\s*display:\s*none;/, 'hidden by default (a short phone)');
  const strip = css.match(/\.battle\.has-strip \.battle-focus\s*\{([^}]*)\}/);
  assert.ok(strip);
  assert.match(strip[1], /display:\s*flex/);
  assert.match(strip[1], /height:\s*var\(--strip-h\)/);
  // Put away once the battle is over, its room (height and gap) given to
  // the message box, so the column keeps its height and the board stays.
  assert.match(css, /\.battle\.has-strip \.battle-focus\.is-over\s*\{\s*display:\s*none;/);
  assert.match(css, /\.battle\.has-strip \.battle-focus\.is-over \+ \.battle-log\s*\{\s*max-height:\s*calc\(92px \+ var\(--strip-h\) \+ 6px\);/);
  assert.match(css, /\.battle\.has-strip \.battle-log\s*\{[^}]*max-height:\s*92px/, 'the 92px it adds to');
  assert.match(strip[1], /margin-top:\s*6px/, 'the 6px gap it adds');
});

test('the stylesheet: End turn\'s badge shows the count, in the board\'s ready-ring colour', () => {
  const badge = css.match(/\.end-btn\[data-waiting\]::before\s*\{([^}]*)\}/);
  assert.ok(badge);
  assert.match(badge[1], /content:\s*attr\(data-waiting\)/);
  assert.match(badge[1], /#d6f77a/);
  assert.match(badge[1], /pointer-events:\s*none/);
});
