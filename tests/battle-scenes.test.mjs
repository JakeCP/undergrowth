// Scenes in a battle (opening-act plan, Task 7): which story moments the
// battle screen asks for, when, and that it waits for them. The pure part
// is battleSceneMoments; the rest is mountBattle on the fake DOM with
// mocked timers and an onMoment that records what it is asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { mountBattle, battleSceneMoments } from '../js/ui/battle-view.js';
import { applyMove } from '../js/engine/battle.js';
import { replan } from '../js/engine/bots.js';
import { LEVELS } from '../data/levels/index.js';
import { BOT_TURN_BUDGET_MS } from '../js/ui/anim-steps.js';
import { COUNT_MS, COUNT_LEAD_MS } from '../js/ui/finale.js';
import { runScenes } from '../js/story/run.js';
import { dueScenes } from '../js/story/story.js';
import { newProgress } from '../js/campaign/progress.js';
import { makeState } from './helpers.mjs';

installFakeDom({ canvas: true });

/** Plenty of time for any one sequence, the finale included. */
const LONG = BOT_TURN_BUDGET_MS + COUNT_LEAD_MS + COUNT_MS + 1000;

/** Lets every pending promise run (only setTimeout is mocked). */
const flush = () => new Promise((r) => setImmediate(r));

const GRID = ['H.......', '........', '........', '........', '........', '........', '........', '.......P'];
const LEVEL = /** @type {any} */ ({ ...LEVELS.find((l) => l.id === 'l01'), id: 'test', name: 'Test', grid: GRID, turnLimit: null });

/**
 * One ant on the den at the top left shields it from the harvester's
 * plan. Walking off it, to (0,2), lets the plan strike the den: the den
 * is marked. Ending the turn then lets the harvester strike it.
 */
function shieldState(extra = {}) {
  const s = makeState(GRID, [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 1 },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0]], plan: { path: [], strike: null, actionId: null } },
  ], extra);
  replan(s);
  return s;
}

/** The den is free and the harvester's plan strikes it from the start. */
function markedState() {
  return makeState(GRID, [
    { id: 'ants', type: 'ants', cells: [[7, 6]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]], plan: { path: [], strike: [0, 0], actionId: 'mow' } },
  ]);
}

/**
 * An onMoment that records each moment and its resolve, and answers only
 * when the test says so.
 */
function teller() {
  /** @type {Array<{moment: any, resolve: Function}>} */
  const asked = [];
  /** @type {Array<() => void>} */
  const open = [];
  return {
    asked,
    whens: () => asked.map((a) => a.moment.when),
    open: () => open.length,
    onMoment: (moment, resolve) => new Promise((done) => {
      asked.push({ moment, resolve });
      open.push(() => done(undefined));
    }),
    async answer() {
      const next = open.shift();
      assert.ok(next, 'a moment is waiting for its answer');
      next();
      await flush();
    },
  };
}

/** An onMoment that answers at once. */
function quickTeller() {
  /** @type {any[]} */
  const asked = [];
  return { asked, whens: () => asked.map((m) => m.when), onMoment: async (m) => { asked.push(m); } };
}

function mount(t, extra = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), { level: LEVEL, state: shieldState(), onFinish() {}, onQuit() {}, ...extra });
  const wrap = root.all().find((n) => n.className === 'board-wrap');
  const svg = wrap.children.find((n) => n.tag === 'svg');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const byClass = (cls) => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes(cls));
  return {
    root,
    svg,
    button,
    byClass,
    click: (label) => button(label).dispatch('click'),
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    turnText: () => root.all().find((n) => typeof n.className === 'string' && n.className.startsWith('turn-label')).textContent,
    banner: () => byClass('turn-banner')[0]?.text ?? null,
    head: () => svg.querySelector('[data-band="ants"] [data-head]').attrs['data-cell'],
    endTurn() {
      this.click('End turn');
      const again = this.button('End turn');
      if (again !== undefined && again.textContent !== 'End turn') this.click('End turn');
    },
    /**
     * Select the ant and walk it off the den. The first selection asks
     * for firstSelect, and the board waits for it: `between` lets it end.
     * @param {() => Promise<void>} between
     */
    async walkOff(between) {
      this.tap(0, 0);
      await between();
      this.tap(0, 2);
    },
  };
}

// --- the pure helper ---

test('battleSceneMoments: the start, with a den marked from the start, carries the level', () => {
  assert.deepEqual(battleSceneMoments('o02', { kind: 'start', state: shieldState() }), [{ when: 'start', level: 'o02' }]);
  assert.deepEqual(battleSceneMoments('o02', { kind: 'start', state: markedState() }), [
    { when: 'start', level: 'o02' },
    { when: 'denMarked', level: 'o02', at: [0, 0] },
  ]);
});

test('battleSceneMoments: a resolution hands over its moments with the level, but never won or lost', () => {
  const before = shieldState();
  const moved = applyMove(before, { kind: 'move', band: 'ants', path: [[0, 1], [0, 2]] });
  assert.deepEqual(battleSceneMoments('t', { kind: 'settled', before, after: moved }), [
    { when: 'denMarked', level: 't', at: [0, 0] },
  ]);
  const ended = applyMove(moved, { kind: 'end' });
  assert.deepEqual(battleSceneMoments('t', { kind: 'settled', before: moved, after: ended }), [
    { when: 'denDamaged', level: 't', at: [0, 0] },
    { when: 'turn', level: 't', turn: 2 },
  ]);
  // Out of turns: the den is struck and the battle is lost. No turn starts.
  const last = shieldState({ turnLimit: 1 });
  const lastMoved = applyMove(last, { kind: 'move', band: 'ants', path: [[0, 1], [0, 2]] });
  const lost = applyMove(lastMoved, { kind: 'end' });
  assert.equal(lost.outcome, 'lost');
  assert.deepEqual(battleSceneMoments('t', { kind: 'settled', before: lastMoved, after: lost }), [
    { when: 'denDamaged', level: 't', at: [0, 0] },
  ]);
});

test('battleSceneMoments: firstSelect only for one of our bands, and only once', () => {
  const s = shieldState();
  const ants = s.bands[0];
  const bot = s.bands[1];
  assert.deepEqual(battleSceneMoments('t', { kind: 'select', state: s, band: ants, asked: false }), [{ when: 'firstSelect', level: 't' }]);
  assert.deepEqual(battleSceneMoments('t', { kind: 'select', state: s, band: ants, asked: true }), []);
  assert.deepEqual(battleSceneMoments('t', { kind: 'select', state: s, band: bot, asked: false }), []);
  assert.deepEqual(battleSceneMoments('t', { kind: 'select', state: s, band: undefined, asked: false }), []);
});

test('battleSceneMoments: nothing once the battle is over', () => {
  const over = shieldState({ outcome: 'won' });
  assert.deepEqual(battleSceneMoments('t', { kind: 'start', state: over }), []);
  assert.deepEqual(battleSceneMoments('t', { kind: 'select', state: over, band: over.bands[0], asked: false }), []);
  assert.deepEqual(battleSceneMoments('t', { kind: 'settled', before: over, after: over }), []);
});

// --- the battle screen ---

test('the start is asked for once the board is drawn, and the opening banner waits for its scene', async (t) => {
  const story = teller();
  const ui = mount(t, { onMoment: story.onMoment });
  assert.deepEqual(story.whens(), ['start']);
  assert.equal(story.asked[0].moment.level, 'test');
  assert.ok(ui.svg.querySelector('[data-band="ants"]'), 'the board is drawn under the scene');
  assert.equal(ui.banner(), null, 'no banner under the scene');
  await story.answer();
  assert.equal(ui.banner(), 'Turn 1 · Your turn');
});

test('a den marked from the start is asked for after the start, one at a time', async (t) => {
  const story = teller();
  mount(t, { onMoment: story.onMoment, state: markedState() });
  assert.deepEqual(story.whens(), ['start']);
  await story.answer();
  assert.deepEqual(story.whens(), ['start', 'denMarked']);
  assert.deepEqual(story.asked[1].moment.at, [0, 0]);
});

test('a scene triggered by a move is asked for after its animation, not during', async (t) => {
  const story = quickTeller();
  const ui = mount(t, { onMoment: story.onMoment });
  await flush();
  await ui.walkOff(flush);
  assert.ok(!story.whens().includes('denMarked'), 'not while the ant walks');
  t.mock.timers.tick(LONG);
  assert.deepEqual(story.whens(), ['start', 'firstSelect', 'denMarked']);
  assert.deepEqual(story.asked[2], { when: 'denMarked', level: 'test', at: [0, 0] });
});

test('a tap that cuts the animation short asks for its scene, and does nothing else', async (t) => {
  const story = teller();
  const ui = mount(t, { onMoment: story.onMoment });
  await story.answer(); // start
  ui.tap(0, 0);
  await story.answer(); // firstSelect
  ui.tap(0, 2);
  ui.tap(5, 5); // finishes the walk
  assert.deepEqual(story.whens(), ['start', 'firstSelect', 'denMarked']);
  assert.equal(ui.head(), '0,2');
  assert.ok(ui.svg.querySelector('[data-selected]'), 'the tap did not let go of the ant');
});

test('while a scene is open the battle takes no taps, buttons or keys', async (t) => {
  const listeners = [];
  const doc = /** @type {any} */ (globalThis.document);
  doc.addEventListener = (type, fn) => listeners.push({ type, fn });
  doc.removeEventListener = () => {};
  t.after(() => {
    delete doc.addEventListener;
    delete doc.removeEventListener;
  });
  const press = (key) => { for (const l of [...listeners]) if (l.type === 'keydown') l.fn({ key, preventDefault() {} }); };
  const story = teller();
  const ui = mount(t, { onMoment: story.onMoment });
  // The start scene is open.
  ui.tap(0, 0);
  assert.equal(ui.svg.querySelector('[data-selected]'), null, 'no selection');
  assert.equal(ui.button('End turn').disabled, true);
  assert.equal(ui.button('Quit').disabled, true);
  ui.endTurn();
  press('Enter');
  press('Enter');
  t.mock.timers.tick(LONG);
  assert.equal(ui.turnText(), 'Turn 1');
  await story.answer();
  assert.equal(ui.button('End turn').disabled, false);
  ui.tap(0, 0);
  assert.ok(ui.svg.querySelector('[data-selected]'), 'taps count again once it is over');
});

test('a scene after the bots\' turn waits for their animation, and "Your turn" waits for the scene', async (t) => {
  const story = teller();
  const ui = mount(t, { onMoment: story.onMoment });
  await story.answer(); // start
  await ui.walkOff(() => story.answer()); // firstSelect
  t.mock.timers.tick(LONG);
  await story.answer(); // denMarked
  ui.endTurn();
  assert.deepEqual(story.whens(), ['start', 'firstSelect', 'denMarked'], 'nothing during the bots\' turn');
  t.mock.timers.tick(LONG);
  assert.deepEqual(story.whens().slice(3), ['denDamaged'], 'one at a time');
  assert.equal(ui.turnText(), 'Turn 2', 'the board has settled under the scene');
  assert.equal(ui.banner(), null, 'no "Your turn" under the scene');
  assert.equal(ui.button('End turn').disabled, true);
  await story.answer();
  assert.deepEqual(story.whens().slice(3), ['denDamaged', 'turn']);
  assert.equal(story.asked[4].moment.turn, 2);
  assert.equal(ui.banner(), null);
  await story.answer();
  assert.equal(ui.banner(), 'Turn 2 · Your turn');
  assert.equal(ui.button('End turn').disabled, false);
});

test('the moments of one resolution are handed over in order, one at a time', async (t) => {
  const story = teller();
  const ui = mount(t, { onMoment: story.onMoment });
  await story.answer(); // start
  await ui.walkOff(() => story.answer()); // firstSelect
  t.mock.timers.tick(LONG);
  await story.answer(); // denMarked
  ui.endTurn();
  t.mock.timers.tick(LONG);
  assert.equal(story.open(), 1, 'only one moment is out at a time');
  assert.equal(story.whens().at(-1), 'denDamaged');
  await story.answer();
  assert.equal(story.open(), 1);
  assert.equal(story.whens().at(-1), 'turn');
  await story.answer();
  assert.equal(story.open(), 0);
});

test('undo after a move that showed a scene does not ask for it again (Review Focus 4)', async (t) => {
  let progress = newProgress();
  /** @type {string[]} */
  const played = [];
  /** @type {string[]} */
  const asked = [];
  const ctx = {
    scenes: [{ id: 'den-seen', when: /** @type {const} */ ('denMarked'), lines: [{ who: 'fox', text: 'Look!' }] }],
    getProgress: () => progress,
    setProgress: (p) => { progress = p; },
    play: async (scene) => { played.push(scene.id); return 'done'; },
  };
  const onMoment = (m, resolve) => {
    asked.push(m.when);
    return runScenes(m, { ...ctx, resolve }).then(() => {});
  };
  const ui = mount(t, { onMoment });
  await flush();
  await ui.walkOff(flush);
  t.mock.timers.tick(LONG);
  await flush();
  assert.deepEqual(played, ['den-seen']);
  ui.click('Undo');
  assert.equal(ui.head(), '0,0', 'back on the den');
  assert.deepEqual(played, ['den-seen'], 'undo itself asks for nothing');
  ui.tap(0, 2);
  t.mock.timers.tick(LONG);
  await flush();
  assert.equal(asked.filter((w) => w === 'denMarked').length, 2, 'the same moment comes again');
  assert.deepEqual(dueScenes(ctx.scenes, { when: 'denMarked', level: 'test', at: [0, 0] }, progress), [], 'but its scene is seen');
  assert.deepEqual(played, ['den-seen'], 'and does not play again');
});

test('the first selection asks for firstSelect once per battle', async (t) => {
  const story = quickTeller();
  const ui = mount(t, { onMoment: story.onMoment });
  await flush();
  ui.tap(3, 0); // the harvester: not one of ours
  await flush();
  assert.deepEqual(story.whens(), ['start']);
  ui.tap(0, 0);
  await flush();
  assert.deepEqual(story.whens(), ['start', 'firstSelect']);
  assert.ok(ui.svg.querySelector('[data-selected]'), 'the band stays selected');
  ui.tap(5, 5);
  ui.tap(0, 0);
  await flush();
  assert.deepEqual(story.whens(), ['start', 'firstSelect'], 'once only');
});

test('no moment is asked for after the battle has ended, except through the result screen', async (t) => {
  const story = teller();
  const finished = [];
  const ui = mount(t, { onMoment: story.onMoment, state: shieldState({ turnLimit: 1 }), onFinish: (s) => finished.push(s) });
  await story.answer(); // start
  await ui.walkOff(() => story.answer()); // firstSelect
  t.mock.timers.tick(LONG);
  await story.answer(); // denMarked
  ui.endTurn();
  t.mock.timers.tick(LONG);
  // The losing turn: the den was struck, then the turns ran out.
  assert.deepEqual(story.whens().slice(3), ['denDamaged']);
  assert.equal(ui.byClass('board-banner').length, 0, 'the defeat waits for the scene');
  assert.equal(ui.button('Continue').disabled, true);
  await story.answer();
  t.mock.timers.tick(LONG);
  assert.match(ui.byClass('board-banner')[0].text, /Defeat/);
  assert.equal(ui.button('Continue').disabled, false);
  ui.tap(0, 2);
  ui.tap(5, 5);
  await flush();
  assert.deepEqual(story.whens(), ['start', 'firstSelect', 'denMarked', 'denDamaged'], 'never won or lost, and nothing after');
  ui.click('Continue');
  assert.equal(finished.length, 1);
});

test('a scene waits while the settings panel is open', async (t) => {
  const story = quickTeller();
  const ui = mount(t, { onMoment: story.onMoment });
  await flush();
  await ui.walkOff(flush);
  const gear = ui.root.all().find((n) => n.tag === 'button' && n.getAttribute('aria-label') === 'Settings');
  gear.dispatch('click');
  t.mock.timers.tick(LONG);
  await flush();
  assert.ok(!story.whens().includes('denMarked'), 'not over the settings');
  ui.tap(5, 5);
  assert.ok(ui.svg.querySelector('[data-selected]'), 'and the board waits with it');
  ui.click('Done');
  await flush();
  assert.equal(story.whens().at(-1), 'denMarked');
});

test('a scene waits while the bar asks "Leave battle?"', async (t) => {
  const story = quickTeller();
  const ui = mount(t, { onMoment: story.onMoment });
  await flush();
  await ui.walkOff(flush);
  ui.click('Quit');
  t.mock.timers.tick(LONG);
  await flush();
  assert.ok(!story.whens().includes('denMarked'), 'not over the leave bar');
  assert.equal(ui.button('Leave').disabled, false, 'the player can still leave');
  ui.click('Stay');
  await flush();
  assert.equal(story.whens().at(-1), 'denMarked');
});

test('a scene waiting on the leave bar is dropped if the player leaves', async (t) => {
  const story = quickTeller();
  let quit = 0;
  const ui = mount(t, { onMoment: story.onMoment, onQuit: () => { quit += 1; } });
  await flush();
  await ui.walkOff(flush);
  ui.click('Quit');
  t.mock.timers.tick(LONG);
  ui.click('Leave');
  await flush();
  assert.equal(quit, 1);
  assert.ok(!story.whens().includes('denMarked'));
});

test('resolve turns a pointer into a rectangle on the screen', async (t) => {
  const story = teller();
  const ui = mount(t, { onMoment: story.onMoment });
  await story.answer(); // start
  await ui.walkOff(() => story.answer()); // firstSelect
  t.mock.timers.tick(LONG);
  const resolve = story.asked[2].resolve;
  // The fake board is 320px square: 40px a tile.
  assert.deepEqual(resolve({ kind: 'den' }), { x: 0, y: 0, width: 40, height: 40 }, 'the den in the moment');
  assert.deepEqual(resolve({ kind: 'tile', at: [2, 3] }), { x: 80, y: 120, width: 40, height: 40 });
  assert.deepEqual(resolve({ kind: 'band', type: 'ants' }), { x: 0, y: 80, width: 40, height: 40 }, 'the band\'s head');
  assert.equal(resolve({ kind: 'band', type: 'beaver' }), null, 'a band not on the board');
  assert.deepEqual(resolve({ kind: 'ui', id: 'endTurn' }), { x: 0, y: 0, width: 320, height: 320 });
  assert.ok(resolve({ kind: 'ui', id: 'undo' }));
  assert.deepEqual(story.asked[0].resolve({ kind: 'den' }), { x: 0, y: 0, width: 40, height: 40 },
    'a moment with no den of its own points at the den a plan strikes now');
  assert.ok(ui.button('Undo'));
});

test('without onMoment the battle runs as before, with no wait', async (t) => {
  const ui = mount(t);
  assert.equal(ui.banner(), 'Turn 1 · Your turn');
  await ui.walkOff(async () => {});
  t.mock.timers.tick(LONG);
  assert.equal(ui.head(), '0,2');
});
