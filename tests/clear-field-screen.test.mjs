// Where the three playtest tracks meet on the battle screen (living-bots
// spec §8, play-feel spec "Changed after Jake's playtest of the full
// build"): the last bot falling on a capture level ends the battle, the
// field sweep animates, the reward counts the sweep, and once the battle
// is over no key acts on it and no "Your turn" banner comes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { mountBattle } from '../js/ui/battle-view.js';
import { createBattle, applyMove, rewardFor } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { animSteps } from '../js/ui/anim-steps.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const L03 = LEVELS.find((level) => level.id === 'l03');
assert.ok(L03 !== undefined);
assert.equal(L03.goal, 'capture');

function progressFor(level) {
  const progress = valleyProgress();
  for (const [type, maxLen] of Object.entries(level.assumes)) progress.bands[type] = { maxLen };
  return progress;
}

/** l03 one move short of its recorded win: the bite that kills the last bot. */
function lastMoveSetup() {
  const progress = progressFor(L03);
  const moves = L03.solution.moves;
  let state = createBattle(L03, L03.solution.deploy, progress);
  for (const move of moves.slice(0, -1)) state = applyMove(state, move);
  const last = moves[moves.length - 1];
  assert.equal(last.kind, 'act', 'l03 is won by an action');
  return { progress, state, last };
}

test('l03 is won by killing the last bot, with an objective still open: the engine sweeps it up', () => {
  const { state, last } = lastMoveSetup();
  assert.equal(state.outcome, null);
  assert.ok(state.objectives.some((o) => !o.captured), 'something is left for the sweep');
  const won = applyMove(state, last);
  assert.equal(won.outcome, 'won');
  assert.ok(!won.bands.some((band) => band.side === 'bots'));
  assert.ok(won.objectives.every((o) => o.captured));
  // The sweep animates after the bot is gone.
  const steps = animSteps(won.events);
  const scatter = steps.find((s) => s.kind === 'scatter');
  const collects = steps.filter((s) => s.kind === 'collect');
  assert.ok(scatter !== undefined, 'the last bot scatters');
  assert.ok(collects.length > 0, 'the swept objective is collected on screen');
  for (const step of collects) assert.ok(step.start >= scatter.start + scatter.duration);
});

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
  const { progress, state, last } = lastMoveSetup();
  const root = new FakeEl('div');
  /** @type {any[]} */
  const finished = [];
  mountBattle(/** @type {any} */ (root), {
    level: L03,
    state,
    onFinish: (s) => finished.push(s),
    onQuit() {},
    rewardOf: (final) => rewardFor(final, L03, progress),
  });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const press = (key, extra = {}) => {
    let prevented = false;
    for (const l of [...listeners]) {
      if (l.type === 'keydown') l.fn({ key, ...extra, preventDefault() { prevented = true; } });
    }
    return prevented;
  };
  return {
    root,
    svg,
    button,
    press,
    finished,
    progress,
    state,
    last,
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    banners: () => root.all().filter((n) => typeof n.className === 'string' && n.className.startsWith('turn-banner')
      && n.parent !== null),
    text: () => root.all().map((n) => n.textContent ?? '').join(' '),
  };
}

/** Does the winning bite through the screen: select the band, pick the action if asked, tap the target. */
function bite(ui) {
  const band = ui.state.bands.find((b) => b.id === ui.last.band);
  const [hx, hy] = band.cells[0];
  ui.tap(hx, hy);
  const actionBtn = ui.root.all().find((n) => n.tag === 'button' && n.parent !== null
    && n.parent.className === 'action-popup' && n.textContent.toLowerCase().startsWith(ui.last.action));
  if (actionBtn !== undefined) actionBtn.dispatch('click');
  ui.tap(ui.last.target[0], ui.last.target[1]);
}

test('screen: the bite that kills the last bot ends the battle, animates the sweep and pays the full reward', (t) => {
  const ui = mount(t);
  const open = ui.state.objectives.filter((o) => !o.captured).map((o) => `${o.at[0]},${o.at[1]}`);
  bite(ui);
  assert.ok(ui.button('Continue'), 'the battle is over: Continue replaces End turn');
  assert.equal(ui.button('End turn'), undefined);
  // The swept objective animates on the drawing from before the bite.
  for (const at of open) {
    const mark = ui.svg.querySelector(`[data-objective="${at}"]`);
    assert.ok(mark !== null, `objective ${at} is drawn`);
    assert.ok(mark.animations.length > 0, `objective ${at} animates its capture`);
  }
  t.mock.timers.tick(10_000);
  assert.match(ui.text(), /Victory!/);
  ui.button('Continue').dispatch('click');
  assert.equal(ui.finished.length, 1);
  const final = ui.finished[0];
  assert.equal(final.outcome, 'won');
  const reward = rewardFor(final, L03, ui.progress);
  const expected = rewardFor(applyMove(ui.state, ui.last), L03, ui.progress);
  assert.deepEqual(reward, expected);
  assert.ok(reward.objectives > 0, 'the swept objective is paid for');
  // The count hangs under the ribbon on a parchment tag (css/result.css).
  const seeds = ui.root.all().find((n) => typeof n.className === 'string' && n.className.split(' ').includes('board-banner__seeds'));
  assert.equal(seeds.text, ` +${reward.total}`);
  assert.equal(seeds.children[0].getAttribute('alt'), 'Seeds', 'after the seed icon');
});

test('screen: once the battle is won only Enter acts on it, as Continue, and no "Your turn" banner comes back', (t) => {
  const ui = mount(t);
  bite(ui);
  // While the winning bite and the sweep still play: Z must not undo it,
  // and Enter only lets them play out.
  ui.press('z');
  ui.press('Enter');
  assert.ok(ui.button('Continue'), 'still won');
  assert.equal(ui.button('Undo'), undefined);
  assert.equal(ui.finished.length, 0, 'the first Enter let the end play out, it did not continue');
  t.mock.timers.tick(10_000);
  const banners = ui.banners().length;
  for (const key of ['z', 'Backspace', 'Escape', 'u', '1', 'Tab']) {
    ui.press(key);
    t.mock.timers.tick(5_000);
  }
  ui.press('Enter', { repeat: true });
  assert.equal(ui.finished.length, 0, 'no other key, and no held Enter, finishes the battle');
  assert.ok(ui.button('Continue'), 'still on the finished battle');
  assert.equal(ui.button('Continue').disabled, false);
  assert.equal(ui.button('Undo'), undefined, 'the winning move cannot be undone');
  assert.ok(ui.banners().length <= banners, 'no new turn banner');
  assert.doesNotMatch(ui.banners().map((n) => n.textContent).join(' '), /Your turn/);
  ui.press('Enter');
  assert.equal(ui.finished.length, 1, 'a fresh Enter is Continue');
  ui.press('Enter');
  ui.button('Continue')?.dispatch('click');
  assert.equal(ui.finished.length, 1, 'once');
});

test('screen: the end of the battle runs with the focus card in place, and puts the card away', (t) => {
  const ui = mount(t);
  const has = (n, cls) => typeof n.className === 'string' && n.className.split(' ').includes(cls);
  const focus = ui.root.all().find((n) => has(n, 'battle-focus'));
  assert.ok(focus, 'the battle screen has its focus card');
  assert.equal(focus.classList.contains('is-over'), false, 'during the battle the card is out');
  bite(ui);
  // The bite's band was in focus; once the battle is over the card is
  // empty and put away, so the phone's strip leaves its room to the
  // verdict in the message box (css/game.css).
  assert.equal(focus.children.length, 0);
  assert.equal(focus.classList.contains('is-over'), true);
  t.mock.timers.tick(10_000);
  const ribbon = ui.root.all().find((n) => has(n, 'board-banner__ribbon'));
  assert.ok(ribbon && has(ribbon, 'ui-ribbon--green'), 'the green ribbon is across the board');
  assert.match(ribbon.text, /Victory!/);
  assert.equal(ui.button('Continue').disabled, false);
  ui.button('Continue').dispatch('click');
  assert.equal(ui.finished.length, 1, 'Continue goes on to the result');
});
