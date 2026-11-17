// The turn banner (play-feel spec, "Changed after Jake's playtest of the
// full build"): a short flash at the start of each side's turn, inside
// the bots' time budget, and a plain line under reduced motion or at
// instant bot speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  animSteps, bannerSpan, sequenceEnd, BANNER_LEAD_MS, BOT_TURN_BUDGET_MS,
} from '../js/ui/anim-steps.js';
import { bannerText, bannerStyle, bannerFrames } from '../js/ui/turn-banner.js';

const move = (band, path) => ({ kind: 'move', band, path });
const action = (actor, actionId, from, target) => ({ kind: 'action', actor, actionId, from, target });
const damage = (band, cells, wiped = false) => ({ kind: 'damage', band, amount: cells.length, wiped, cells });

/** A short bots' turn: one walk and one strike. */
const SHORT = [
  move('harvester-0', [[4, 0], [3, 0]]),
  action('harvester-0', 'mow', [3, 0], [2, 0]),
  damage('ants', [[2, 1]]),
];

/** A long bots' turn: enough walks to run past the budget. */
const LONG = Array.from({ length: 12 }, (_, i) => move(`saw-${i}`, [[i, 0], [i, 1], [i, 2]]));

test('bannerText: the turn and whose it is', () => {
  assert.equal(bannerText(3, 'us'), 'Turn 3 · Your turn');
  assert.equal(bannerText(3, 'bots'), "Turn 3 · Bots' turn");
});

test('bannerStyle: a flash, but a plain line under reduced motion or at instant bot speed', () => {
  assert.equal(bannerStyle({}), 'flash');
  assert.equal(bannerStyle({ speed: 'normal' }), 'flash');
  assert.equal(bannerStyle({ speed: 'fast' }), 'flash');
  assert.equal(bannerStyle({ speed: 'instant' }), 'line');
  assert.equal(bannerStyle({ speed: 'normal', reducedMotion: true }), 'line');
});

test('bannerFrames: transform and opacity only, starting and ending hidden', () => {
  const frames = bannerFrames();
  for (const frame of frames) {
    assert.deepEqual(Object.keys(frame).filter((k) => !['offset', 'transform', 'opacity'].includes(k)), []);
  }
  assert.equal(frames[0].opacity, 0);
  assert.equal(frames[frames.length - 1].opacity, 0);
});

test('the bots banner comes first: their steps start once it has had its moment', () => {
  const plain = animSteps(SHORT, { turn: 'bots' });
  const withBanner = animSteps(SHORT, { turn: 'bots', banner: true });
  assert.deepEqual(bannerSpan(SHORT, { turn: 'bots', banner: true }), { start: 0, duration: BANNER_LEAD_MS });
  assert.equal(withBanner.length, plain.length);
  for (let i = 0; i < plain.length; i += 1) {
    assert.equal(withBanner[i].start, plain[i].start + BANNER_LEAD_MS, withBanner[i].kind);
    assert.equal(withBanner[i].duration, plain[i].duration);
  }
});

test('the bots banner counts inside the time budget', () => {
  const steps = animSteps(LONG, { turn: 'bots', banner: true });
  const span = bannerSpan(LONG, { turn: 'bots', banner: true });
  assert.ok(span !== null);
  assert.ok(sequenceEnd(steps) <= BOT_TURN_BUDGET_MS, `${sequenceEnd(steps)} ms`);
  assert.ok(span.duration < BANNER_LEAD_MS, 'it shrinks with the rest');
  assert.ok(steps[0].start >= span.duration, 'the first bot waits for the banner');
  const fast = animSteps(LONG, { turn: 'bots', speed: 'fast', banner: true });
  assert.ok(sequenceEnd(fast) <= BOT_TURN_BUDGET_MS / 2 + 1);
  const fastSpan = bannerSpan(LONG, { turn: 'bots', speed: 'fast', banner: true });
  assert.ok(fastSpan !== null && Math.abs(fastSpan.duration - span.duration / 2) <= 1);
});

test('a bots turn with nothing to show still gives the banner its moment', () => {
  assert.deepEqual(animSteps([], { turn: 'bots', banner: true }), []);
  assert.deepEqual(bannerSpan([], { turn: 'bots', banner: true }), { start: 0, duration: BANNER_LEAD_MS });
});

test('no banner time on the player turn, at instant speed, under reduced motion, or unasked', () => {
  assert.equal(bannerSpan(SHORT, { banner: true }), null, 'player turn');
  assert.equal(bannerSpan(SHORT, { turn: 'bots' }), null, 'not asked for');
  assert.equal(bannerSpan(SHORT, { turn: 'bots', speed: 'instant', banner: true }), null);
  assert.equal(bannerSpan(SHORT, { turn: 'bots', reducedMotion: true, banner: true }), null);
  assert.deepEqual(
    animSteps(SHORT, { turn: 'bots', speed: 'instant', banner: true }),
    animSteps(SHORT, { turn: 'bots', speed: 'instant' }),
  );
  assert.deepEqual(
    animSteps(SHORT, { turn: 'bots', reducedMotion: true, banner: true }),
    animSteps(SHORT, { turn: 'bots', reducedMotion: true }),
  );
  assert.deepEqual(animSteps(SHORT, { banner: true }), animSteps(SHORT), 'the player turn is untouched');
});

// --- mounted ---

import fs from 'node:fs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { mountBattle } from '../js/ui/battle-view.js';
import { createBattle } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const L01 = LEVELS.find((l) => l.id === 'l01');
const FIRST = /** @type {{kind: 'move', band: string, path: [number, number][]}} */ (L01.solution.moves[0]);
const [AX, AY] = L01.solution.deploy[0].at;
const [BX, BY] = FIRST.path[FIRST.path.length - 1];

function mount(t, extra = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const progress = valleyProgress();
  for (const [type, maxLen] of Object.entries(L01.assumes)) progress.bands[type] = { maxLen };
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level: L01, state: createBattle(L01, L01.solution.deploy, progress), onFinish() {}, onQuit() {}, ...extra,
  });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const banners = () => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes('turn-banner'));
  return {
    root,
    button,
    banners,
    bannerText: () => banners().map((b) => b.text).join(' | '),
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    turnText: () => root.all().find((n) => n.className === 'turn-label').textContent,
  };
}

/** Moves the ants, lets the move finish, and ends the turn. */
function endFirstTurn(ui, t) {
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  ui.button('End turn').dispatch('click');
}

test('mounted: the battle opens with "Turn 1 · Your turn", which flashes and goes', (t) => {
  const ui = mount(t);
  assert.equal(ui.bannerText(), 'Turn 1 · Your turn');
  const [banner] = ui.banners();
  assert.equal(banner.animations.length, 1, 'a flash');
  assert.deepEqual(banner.animations[0].keyframes, bannerFrames());
  t.mock.timers.tick(5000);
  assert.equal(ui.banners().length, 0, 'gone by itself');
});

test('mounted: the bots turn opens with its banner, and the player turn with the next count', (t) => {
  const ui = mount(t);
  endFirstTurn(ui, t);
  assert.equal(ui.bannerText(), "Turn 1 · Bots' turn", 'one banner at a time');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.equal(ui.turnText(), 'Turn 2', 'the bots turn ended inside the budget');
  assert.equal(ui.bannerText(), 'Turn 2 · Your turn');
});

test('mounted: the banner never blocks input', (t) => {
  const ui = mount(t);
  assert.equal(ui.banners().length, 1);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  assert.equal(ui.button('Undo').disabled, false, 'the move went through under the banner');
  const css = fs.readFileSync(new URL('../css/game.css', import.meta.url), 'utf8');
  const rule = css.match(/\.turn-banner\s*\{([^}]*)\}/);
  assert.ok(rule, 'a rule for the banner');
  assert.match(rule[1], /pointer-events:\s*none/);
});

test('mounted: a tap skipping the bots turn goes straight to the player banner', (t) => {
  const ui = mount(t);
  endFirstTurn(ui, t);
  ui.tap(AX, AY);
  assert.equal(ui.turnText(), 'Turn 2');
  assert.equal(ui.bannerText(), 'Turn 2 · Your turn');
});

test('mounted: at instant bot speed the banner is a plain line, not a flash', (t) => {
  const ui = mount(t, { botSpeed: 'instant' });
  const [opening] = ui.banners();
  assert.ok(opening.className.split(' ').includes('turn-banner--line'));
  assert.equal(opening.animations.length, 0, 'nothing moves');
  endFirstTurn(ui, t);
  assert.equal(ui.turnText(), 'Turn 2');
  assert.equal(ui.bannerText(), 'Turn 2 · Your turn');
  assert.ok(ui.banners()[0].className.split(' ').includes('turn-banner--line'));
});

test('mounted: under reduced motion the banner is a plain line too', (t) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' });
  t.after(() => { globalThis.matchMedia = was; });
  const ui = mount(t);
  const [opening] = ui.banners();
  assert.ok(opening.className.split(' ').includes('turn-banner--line'));
  assert.equal(opening.animations.length, 0);
});
