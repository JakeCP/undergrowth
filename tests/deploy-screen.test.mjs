// The deploy screen, rebuilt to the battle screen's standard: where the
// picked band's card goes (js/ui/menu-layout.js, pure), and the screen
// itself mounted on the fake DOM: the battle's head, the tray of tokens,
// the deploy tiles marked over the board, Start, and the full card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { renderDeploy, DEPLOY_HINT } from '../js/ui/deploy-view.js';
import {
  cardPlacement, placedCount, startLabel, panelHalf, underHalf, MIN_BOARD, MAX_BOARD, BOARD_KEEP, CARD_GAP,
} from '../js/ui/menu-layout.js';
import { parseGrid } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

/** @param {FakeEl} root @param {string} cls */
const byClass = (root, cls) => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes(cls));
const level = (/** @type {string} */ id) => LEVELS.find((l) => l.id === id);

// --- where the card goes ---

test('cardPlacement: on a wide screen the card is in the side panel, full when it fits', () => {
  assert.deepEqual(cardPlacement({ wide: true, fullH: 300, briefH: 100, sideH: 400, half: 'top' }), { place: 'side', form: 'full', slot: 0 });
  assert.deepEqual(cardPlacement({ wide: true, fullH: 300, briefH: 100, sideH: 200, half: 'top' }), { place: 'side', form: 'brief', slot: 0 }, 'too tall: the brief card');
  assert.equal(cardPlacement({ wide: true, fullH: 0, briefH: 0, half: null }).form, 'full', 'not measured: full');
});

test('cardPlacement: with nothing measured, over the free half as before, else under the board', () => {
  assert.deepEqual(cardPlacement({ wide: false, fullH: 0, briefH: 0, half: 'right' }), { place: 'over', form: 'brief', slot: 0 });
  assert.deepEqual(cardPlacement({ wide: false, fullH: 0, briefH: 0, half: null }), { place: 'below', form: 'brief', slot: 0 });
  assert.equal(cardPlacement({ wide: false, areaW: Number.NaN, areaH: 500, fullH: 200, briefH: 100, half: 'top' }).place, 'over');
});

test('cardPlacement: a phone with room has the card under the board, full if it fits, else brief', () => {
  // A tall phone: the full card fits under a full-width board.
  assert.deepEqual(cardPlacement({ wide: false, areaW: 398, areaH: 700, fullH: 260, briefH: 103, half: 'top' }), { place: 'below', form: 'full', slot: 260 + CARD_GAP });
  // 390 by 844: the brief one does.
  assert.deepEqual(cardPlacement({ wide: false, areaW: 358, areaH: 440, fullH: 260, briefH: 103, half: 'top' }), { place: 'below', form: 'brief', slot: 103 + CARD_GAP });
});

test('cardPlacement: a short phone has the brief card over the free half, never shrinking the board for it', () => {
  // 360 by 640: no room under a fair board.
  assert.deepEqual(cardPlacement({ wide: false, areaW: 328, areaH: 290, fullH: 260, briefH: 103, half: 'right' }), { place: 'over', form: 'brief', slot: 0 });
  // No half clear of the deploy tiles: under the board all the same.
  assert.deepEqual(cardPlacement({ wide: false, areaW: 328, areaH: 290, fullH: 260, briefH: 103.4, half: null }), { place: 'below', form: 'brief', slot: 104 + CARD_GAP });
});

test('cardPlacement: under the board, the board keeps most of its width, and never less than the least board', () => {
  for (let areaW = 280; areaW <= 700; areaW += 20) {
    for (let areaH = 240; areaH <= 900; areaH += 20) {
      for (const [fullH, briefH] of [[220, 90], [330, 130], [400, 160]]) {
        const got = cardPlacement({ wide: false, areaW, areaH, fullH, briefH, half: 'top' });
        if (got.place !== 'below') continue;
        const board = Math.min(areaW, areaH - got.slot, MAX_BOARD);
        assert.ok(board >= MIN_BOARD, `${areaW}x${areaH}: board ${board}`);
        assert.ok(board >= Math.floor(Math.min(areaW, MAX_BOARD) * BOARD_KEEP) || board >= Math.min(areaW, areaH, MAX_BOARD),
          `${areaW}x${areaH}: board ${board} gave up too much`);
        assert.equal(got.slot, Math.ceil(got.form === 'full' ? fullH : briefH) + CARD_GAP);
      }
    }
  }
});

test('on every level the card, when it lies over the board, covers no deploy tile', () => {
  for (const lvl of LEVELS) {
    const { width, height, deployTiles } = parseGrid(lvl.grid);
    const half = panelHalf(deployTiles, width, height);
    const got = cardPlacement({ wide: false, areaW: 328, areaH: 290, fullH: 260, briefH: 103, half });
    if (got.place !== 'over') continue;
    assert.ok(half !== null);
    for (const tile of deployTiles) assert.equal(underHalf(half, tile, width, height), false, `${lvl.id}: ${tile}`);
  }
});

test('placedCount: how many are down, of the most that may go', () => {
  assert.deepEqual(placedCount(1, 3, 5), { placed: 1, room: 3, left: 2, line: '1 of 3 placed' });
  assert.equal(placedCount(0, 3, 2).line, '0 of 2 placed', 'no more than the bands owned');
  assert.equal(placedCount(2, 2, 4).left, 0);
});

test('startLabel: Start says what is missing while it cannot start', () => {
  assert.deepEqual(startLabel(0, 3), { label: 'Place at least one band', ready: false });
  assert.deepEqual(startLabel(1, 3), { label: 'Start', ready: true });
  assert.deepEqual(startLabel(3, 3), { label: 'Start', ready: true });
  assert.equal(startLabel(4, 3).ready, false);
});

// --- the screen ---

/**
 * @param {import('../js/engine/types.js').Level} lvl
 * @param {import('../js/engine/types.js').Progress} [progress]
 */
function mount(lvl, progress = valleyProgress()) {
  const root = new FakeEl('div');
  /** @type {any[]} */
  const started = [];
  let back = 0;
  renderDeploy(/** @type {any} */ (root), { level: lvl, progress, onStart: (d) => started.push(d), onBack: () => { back += 1; } });
  const svg = root.all().find((n) => n.tag === 'svg');
  return {
    root,
    started,
    back: () => back,
    tokens: () => byClass(root, 'deploy-token'),
    token: (/** @type {string} */ name) => byClass(root, 'deploy-token').find((t) => t.text.startsWith(name)),
    marks: () => byClass(root, 'deploy-mark'),
    mark: (/** @type {[number, number]} */ [x, y]) => byClass(root, 'deploy-mark').find((m) => m.dataset.tile === `${x},${y}`),
    panel: () => byClass(root, 'deploy-panel')[0],
    start: () => root.all().find((n) => n.tag === 'button' && n.className === 'ui-btn ui-btn--primary'),
    count: () => byClass(root, 'deploy-tray__count')[0].textContent,
    hint: () => byClass(root, 'deploy-tray__hint')[0],
    tap: (/** @type {[number, number]} */ [x, y]) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    svg,
  };
}

test('the head is the battle screen\'s: the name with Back, the goal on parchment, the counts as chips', () => {
  const ui = mount(level('l03'));
  const head = byClass(ui.root, 'battle-head')[0];
  assert.equal(byClass(head, 'battle-head__title')[0].textContent, 'The Dry Stone Wall');
  const back = head.all().find((n) => n.tag === 'button');
  assert.equal(back.className, 'quit-btn ui-btn ui-btn--secondary ui-btn--small');
  const card = byClass(ui.root, 'battle-goal__card')[0];
  assert.ok(card.className.includes('ui-panel--parchment'));
  assert.match(card.text, /^Goal/);
  const chips = byClass(ui.root, 'battle-chip');
  assert.deepEqual(chips.map((c) => c.className.split(' ')[1]), ['battle-chip--den', 'battle-chip--forest'], 'no turn chip without a limit');
  assert.match(chips[0].text, /2\/2$/);
  assert.match(chips[1].text, /12\/12$/);
  // A level with a turn limit shows it.
  const limited = mount({ ...level('l03'), turnLimit: 8 });
  const turn = byClass(limited.root, 'battle-chip--turn')[0];
  assert.match(turn.text, /8 turns/);
});

test('the tray: a token per band owned, the picked one pressed, a tick once placed, and how many more may go', () => {
  const lvl = level('l01');
  const ui = mount(lvl);
  assert.equal(ui.tokens().length, 5, 'the valley save owns five bands');
  assert.equal(ui.token('Fox').getAttribute('aria-pressed'), 'true', 'the first band starts picked');
  assert.equal(ui.count(), '0 of 2 placed');
  const { deployTiles } = parseGrid(lvl.grid);
  ui.tap(deployTiles[0]);
  assert.equal(ui.token('Fox').classList.contains('is-placed'), true);
  assert.equal(ui.token('Fox').getAttribute('aria-label'), 'Fox, length 2, on the board');
  assert.equal(ui.token('Hedgehog').getAttribute('aria-pressed'), 'true', 'on to the next band');
  assert.equal(ui.count(), '1 of 2 placed');
  ui.tap(deployTiles[1]);
  assert.equal(ui.count(), '2 of 2 placed');
  // The board is full: the bands left off rest (a tap still shows their card).
  assert.equal(ui.token('Badger').classList.contains('is-out'), true);
  assert.equal(ui.token('Fox').classList.contains('is-out'), false);
  ui.token('Badger').dispatch('click');
  assert.equal(byClass(ui.panel(), 'unit-card')[0].dataset.unit, 'badger');
});

test('the hint is small and goes once the first band is placed, for good', () => {
  const lvl = level('l01');
  const ui = mount(lvl);
  assert.ok(ui.hint().text.startsWith(DEPLOY_HINT));
  assert.equal(ui.hint().classList.contains('is-hint'), true);
  const { deployTiles } = parseGrid(lvl.grid);
  ui.tap(deployTiles[0]);
  assert.equal(ui.hint().text, 'Your bands');
  ui.tap(deployTiles[0]);
  assert.equal(ui.count(), '0 of 2 placed');
  assert.equal(ui.hint().text, 'Your bands', 'taking it back does not bring the hint back');
});

test('the deploy tiles are marked over the board: ready, held, picked and resting', () => {
  const lvl = level('l03');
  const ui = mount(lvl);
  const { deployTiles } = parseGrid(lvl.grid);
  assert.equal(ui.svg.find('data-highlight'), undefined, 'the board draws no dashed highlight of its own');
  assert.equal(ui.marks().length, deployTiles.length);
  for (const tile of deployTiles) assert.ok(ui.mark(tile).classList.contains('is-ready'), `${tile} ready for the picked band`);
  assert.equal(ui.mark(deployTiles[0]).style.left, `${(deployTiles[0][0] * 100) / 8}%`);
  ui.tap(deployTiles[0]);
  assert.ok(ui.mark(deployTiles[0]).classList.contains('is-held'));
  assert.ok(!ui.mark(deployTiles[0]).classList.contains('is-picked'), 'the next band is picked now');
  assert.equal(byClass(ui.mark(deployTiles[0]), 'deploy-mark__ring').length, 1, 'it lands with a ring');
  ui.token('Fox').dispatch('click');
  assert.ok(ui.mark(deployTiles[0]).classList.contains('is-picked'), 'the picked band\'s tile');
  assert.equal(byClass(ui.mark(deployTiles[0]), 'deploy-mark__ring').length, 0, 'the ring only once');
  ui.tap(deployTiles[1]);
  ui.tap(deployTiles[2]);
  ui.tap(deployTiles[0]);
  // Fox moved to deployTiles[1]; then the hedgehog went on [2]... the board fills.
  const free = ui.marks().filter((m) => !m.classList.contains('is-held'));
  for (const m of free) assert.ok(m.classList.contains('is-ready') || m.classList.contains('is-idle'));
});

test('Start is the main button: what is missing until a band is down, then Start, once', () => {
  const lvl = level('l01');
  const ui = mount(lvl);
  assert.equal(ui.start().textContent, 'Place at least one band');
  assert.equal(ui.start().disabled, true);
  const { deployTiles } = parseGrid(lvl.grid);
  ui.tap(deployTiles[0]);
  assert.equal(ui.start().textContent, 'Start');
  assert.equal(ui.start().disabled, false);
  ui.start().dispatch('click');
  ui.start().dispatch('click');
  assert.deepEqual(ui.started, [[{ type: 'fox', at: deployTiles[0] }]]);
});

test('the brief card opens the full one, without the next growth tier; any tap closes it', () => {
  const ui = mount(level('l01'), { ...valleyProgress(), bands: { ...valleyProgress().bands, ants: { maxLen: 5 } } });
  ui.token('Ants').dispatch('click');
  const brief = byClass(ui.panel(), 'unit-card')[0];
  assert.ok(brief.className.includes('unit-card--compact'), 'the brief card where nothing is measured');
  byClass(ui.panel(), 'deploy-panel__more')[0].dispatch('click');
  const sheet = byClass(ui.root, 'deploy-sheet')[0];
  assert.ok(sheet);
  assert.equal(sheet.getAttribute('role'), 'dialog');
  const full = byClass(sheet, 'unit-card')[0];
  assert.ok(!full.className.includes('unit-card--compact'));
  assert.match(full.text, /The workhorse/);
  assert.doesNotMatch(full.text, /At length 6/, 'nothing can be bought here');
  sheet.dispatch('click');
  assert.equal(byClass(ui.root, 'deploy-sheet')[0], undefined);
  // A tap anywhere on the brief card opens it too.
  byClass(ui.panel(), 'unit-card')[0].dispatch('click');
  assert.ok(byClass(ui.root, 'deploy-sheet')[0]);
});

/**
 * Lays the fake DOM out at a size for the length of a test: every box
 * measures `w` by `h`, every card `cardH` tall.
 * @param {import('node:test').TestContext} t
 * @param {{w: number, h: number, cardH: number, wide?: boolean}} size
 */
function layOut(t, size) {
  const proto = FakeEl.prototype;
  const saved = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => size.w });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => size.h });
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => size.w });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => size.cardH });
  const media = globalThis.matchMedia;
  globalThis.matchMedia = /** @type {any} */ (() => ({ matches: size.wide === true }));
  t.after(() => {
    delete proto.clientWidth;
    delete proto.clientHeight;
    delete proto.scrollWidth;
    if (saved) Object.defineProperty(proto, 'offsetHeight', saved);
    globalThis.matchMedia = media;
  });
}

test('measured on a phone with room, the card sits under the board, in the flow, with no hide button', (t) => {
  layOut(t, { w: 358, h: 470, cardH: 100 });
  const ui = mount(level('l03'));
  const panel = ui.panel();
  assert.equal(panel.parent.className, 'deploy-slot', 'under the board, not over it');
  assert.ok(panel.className.includes('deploy-panel--below'));
  assert.equal(byClass(panel, 'deploy-panel__hide').length, 0, 'it covers nothing: nothing to hide');
  assert.equal(byClass(panel, 'unit-card')[0].className, 'unit-card ui-panel--parchment', 'the full card fits');
  const screen = byClass(ui.root, 'deploy-screen')[0];
  assert.equal(screen.style['--slot-h'], `${100 + CARD_GAP}px`);
});

test('measured on a short phone, the brief card lies over the half away from the deploy tiles', (t) => {
  layOut(t, { w: 328, h: 290, cardH: 120 });
  const lvl = level('l03');
  const ui = mount(lvl);
  const { deployTiles, width, height } = parseGrid(lvl.grid);
  const panel = ui.panel();
  assert.equal(panel.parent.className, 'board-wrap');
  assert.ok(panel.className.includes(`deploy-panel--${panelHalf(deployTiles, width, height)}`));
  assert.ok(byClass(panel, 'unit-card')[0].className.includes('unit-card--compact'));
  assert.equal(byClass(panel, 'deploy-panel__hide').length, 1, 'over the board it can be put away');
});

test('measured on a wide screen, the card is in the side panel', (t) => {
  layOut(t, { w: 340, h: 400, cardH: 260, wide: true });
  const ui = mount(level('l03'));
  assert.equal(ui.panel().parent.className, 'deploy-slot');
  assert.ok(ui.panel().className.includes('deploy-panel--side'));
  assert.equal(byClass(ui.panel(), 'unit-card')[0].className, 'unit-card ui-panel--parchment');
});
