// The battle screen with motion (look-and-motion spec, "Motion"; Builder's
// calls 2, 3 and 7), mounted on the fake DOM with mocked timers:
// - moves and the bots' turn animate on the drawing of the state before;
// - a tap during a player animation finishes it, then counts;
// - Undo never waits;
// - during the bots' turn input waits, and a tap jumps to the end;
// - the bot speed and reduced motion are honoured, and sounds play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { mountBattle } from '../js/ui/battle-view.js';
import { createBattle, applyMove } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { animSteps, sequenceEnd, FADE_MS, BOT_TURN_BUDGET_MS } from '../js/ui/anim-steps.js';
import { soundCues, tileKindOf } from '../js/ui/motion.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const L01 = LEVELS.find((l) => l.id === 'l01');

function startState() {
  const progress = valleyProgress();
  for (const [type, maxLen] of Object.entries(L01.assumes)) progress.bands[type] = { maxLen };
  return createBattle(L01, L01.solution.deploy, progress);
}

function mount(t, extra = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level: L01, state: startState(), onFinish() {}, onQuit() {}, ...extra,
  });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  return {
    root,
    svg,
    button,
    click: (label) => button(label).dispatch('click'),
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    head: (id) => svg.querySelector(`[data-band="${id}"] [data-head]`),
    turnText: () => root.all().find((n) => n.className === 'turn-label').textContent,
    running: () => svg.all().flatMap((n) => n.animations).filter((a) => !a.cancelled),
  };
}

// The solution's first move: the ants walk from their deploy tile to
// the end of its path. Taken from the level so a redone l01 still fits.
const FIRST = /** @type {{kind: 'move', band: string, path: [number, number][]}} */ (L01.solution.moves[0]);
const [AX, AY] = L01.solution.deploy[0].at;
const [BX, BY] = FIRST.path[FIRST.path.length - 1];
const A = `${AX},${AY}`;
const B = `${BX},${BY}`;

test('a move animates on the drawing from before it, and the board swaps when it ends', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  assert.ok(ui.svg.querySelector('[data-selected]'), 'the ants are selected');
  ui.tap(BX, BY);
  const head = ui.head('ants');
  assert.equal(head.attrs['data-cell'], A, 'still the old drawing');
  assert.equal(head.animations.length, 1);
  const frames = head.animations[0].keyframes;
  assert.equal(frames[frames.length - 1].transform, `translate(${(BX - AX) * 40}px, ${(BY - AY) * 40}px)`, `gliding to ${B}`);
  assert.equal(ui.svg.querySelector('[data-highlight]'), null, 'no highlights under the animation');
  assert.equal(ui.button('Undo').disabled, false, 'input is not locked');

  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.equal(ui.head('ants').attrs['data-cell'], B, 'swapped to the new state');
  assert.deepEqual(ui.running().filter((a) => a.options.delay > 0 || a.options.fill === 'forwards'), []);
  assert.ok(ui.svg.querySelector('[data-selected]'), 'still selected, ready to act');
});

test('a tap during a player animation finishes it at once, then counts as the tap', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  const old = ui.head('ants');
  assert.equal(old.attrs['data-cell'], A);
  assert.ok(old.animations.length > 0 && !old.animations[0].cancelled, 'the glide is running');
  ui.tap(0, 0);
  assert.ok(old.animations.every((a) => a.cancelled), 'the animation is finished');
  assert.equal(ui.head('ants').attrs['data-cell'], B, 'the board shows the result');
  assert.equal(ui.svg.querySelector('[data-selected]'), null, 'and the tap on empty ground let go of the band');
});

test('Undo never waits on an animation', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  assert.ok(ui.running().length > 0, 'the glide is running');
  ui.click('Undo');
  assert.equal(ui.head('ants').attrs['data-cell'], A);
  assert.equal(ui.head('ants').animations.length, 0);
  assert.equal(ui.button('Undo').disabled, true, 'back at the start of the turn');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.equal(ui.head('ants').attrs['data-cell'], A, 'nothing swaps in later');
});

/** Moves the ants and lets the move finish, then ends the turn. */
function endFirstTurn(ui, t) {
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  ui.click('End turn');
  if (ui.button('End turn').textContent !== 'End turn') ui.click('End turn');
}

test('the bots turn locks input until it ends by itself, within the budget, with no fixed pause', (t) => {
  const ui = mount(t);
  endFirstTurn(ui, t);
  assert.equal(ui.button('End turn').disabled, true, 'input waits during the bots turn');
  assert.equal(ui.button('Undo').disabled, true);
  assert.equal(ui.turnText(), 'Turn 1', 'the count waits for the end of their turn');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.equal(ui.turnText(), 'Turn 2');
  assert.equal(ui.button('End turn').disabled, false);
});

test('a tap during the bots turn jumps to its end and does nothing else', (t) => {
  const ui = mount(t);
  endFirstTurn(ui, t);
  assert.equal(ui.turnText(), 'Turn 1');
  ui.tap(AX, AY);
  assert.equal(ui.turnText(), 'Turn 2', 'at the end of the bots turn at once');
  assert.equal(ui.svg.querySelector('[data-selected]'), null, 'the tap selected nothing');
  // The click that follows the same tap must not press a button either.
  ui.click('End turn');
  assert.equal(ui.button('End turn').textContent, 'End turn', 'not armed');
  assert.equal(ui.turnText(), 'Turn 2');
  // The next tap is ordinary input.
  ui.root.dispatch('pointerdown');
  ui.tap(BX, BY);
  assert.ok(ui.svg.querySelector('[data-selected]'));
});

test('bot speed instant: the bots turn shows its result at once', (t) => {
  const ui = mount(t, { botSpeed: 'instant' });
  endFirstTurn(ui, t);
  assert.equal(ui.turnText(), 'Turn 2');
  assert.equal(ui.button('End turn').disabled, false);
});

test('bot speed fast: the bots turn is over in half the time', (t) => {
  const afterMove = applyMove(startState(), FIRST);
  const afterEnd = applyMove(afterMove, { kind: 'end' });
  const tileKind = tileKindOf(afterMove);
  // The bots' turn opens with the turn banner, as the screen plays it.
  const normal = sequenceEnd(animSteps(afterEnd.events, { turn: 'bots', tileKind, banner: true }));
  const fast = sequenceEnd(animSteps(afterEnd.events, { turn: 'bots', speed: 'fast', tileKind, banner: true }));
  assert.equal(fast, Math.round(normal / 2));
  const ui = mount(t, { botSpeed: 'fast' });
  endFirstTurn(ui, t);
  t.mock.timers.tick(fast - 1);
  assert.equal(ui.turnText(), 'Turn 1');
  t.mock.timers.tick(1);
  assert.equal(ui.turnText(), 'Turn 2');
});

test('reduced motion: nothing moves, quick fades only, and the bots turn is over at once', (t) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' });
  t.after(() => { globalThis.matchMedia = was; });
  const ui = mount(t);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  const anims = ui.svg.all().flatMap((n) => n.animations);
  assert.ok(anims.length > 0);
  for (const a of anims) {
    assert.ok(a.keyframes.every((k) => k.transform === undefined), 'no transform');
    assert.ok(a.options.duration <= FADE_MS);
  }
  t.mock.timers.tick(FADE_MS);
  assert.equal(ui.head('ants').attrs['data-cell'], B);
  ui.click('End turn');
  if (ui.button('End turn').textContent !== 'End turn') ui.click('End turn');
  t.mock.timers.tick(FADE_MS);
  assert.equal(ui.turnText(), 'Turn 2');
});

test('sounds: the bots turn plays its sounds on cue, through the sound passed in', (t) => {
  const played = [];
  const ui = mount(t, { sound: { play: (name) => played.push(name) } });
  // The same turn, worked out on the side, to know what to expect.
  const afterMove = applyMove(startState(), FIRST);
  const afterEnd = applyMove(afterMove, { kind: 'end' });
  const steps = animSteps(afterEnd.events, { turn: 'bots', tileKind: tileKindOf(afterMove), banner: true });
  const expected = soundCues(afterEnd.events, steps, tileKindOf(afterMove)).map((c) => c.name);
  endFirstTurn(ui, t);
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.deepEqual(played, expected);
});
