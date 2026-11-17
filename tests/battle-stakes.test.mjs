// The battle screen's stakes, endings, teaching and settings (look-and-
// motion spec), mounted on the fake DOM with mocked timers:
// - a bot that becomes engaged flashes its plan line once;
// - "Last turn!" on a turn-limited level;
// - victory: the bands hop, stubble regrows, the seeds count up;
// - defeat: the board dims and shows what was lost;
// - the settings control: bot speed and sound, saved by the caller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { mountBattle } from '../js/ui/battle-view.js';
import { createBattle, applyMove, rewardFor } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { BOT_TURN_BUDGET_MS, FADE_MS, animSteps, sequenceEnd } from '../js/ui/anim-steps.js';
import { CALLOUT_MS, tileKindOf } from '../js/ui/motion.js';
import { COUNT_MS, COUNT_LEAD_MS } from '../js/ui/finale.js';
import { FLASH_MS } from '../js/ui/stakes.js';
import { isEngaged } from '../js/engine/bots.js';
import { makeState, valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const L01 = LEVELS.find((l) => l.id === 'l01');

// Positions on l01 taken from its recorded solution, so a redone level
// still fits: the ants' deploy tile and the end of their first walk.
const FIRST = /** @type {{kind: 'move', band: string, path: [number, number][]}} */ (L01.solution.moves[0]);
const [AX, AY] = L01.solution.deploy[0].at;
const [BX, BY] = FIRST.path[FIRST.path.length - 1];

function startState(level = L01) {
  return createBattle(level, level.solution.deploy, valleyProgress());
}

/** Plenty of time for any one sequence, the finale included. */
const LONG = BOT_TURN_BUDGET_MS + COUNT_LEAD_MS + COUNT_MS + 1000;

function mount(t, extra = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level: L01, state: startState(), onFinish() {}, onQuit() {}, ...extra,
  });
  const wrap = root.all().find((n) => n.className === 'board-wrap');
  const svg = wrap.children.find((n) => n.tag === 'svg');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const byClass = (cls) => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes(cls));
  return {
    root,
    wrap,
    svg,
    button,
    byClass,
    one: (cls) => byClass(cls)[0],
    click: (label) => button(label).dispatch('click'),
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    turnText: () => root.all().find((n) => typeof n.className === 'string' && n.className.startsWith('turn-label')).textContent,
    endTurn() {
      this.click('End turn');
      if (this.button('End turn').textContent !== 'End turn') this.click('End turn');
    },
  };
}

// --- stakes ---

/**
 * The first solution move that engages the harvester, with the state it
 * starts from and the tiles to tap: the band's head, then where it walks.
 */
function engagingMove() {
  let s = startState();
  for (const move of L01.solution.moves) {
    if (move.kind === 'move') {
      const next = applyMove(s, move);
      const bot = (st) => st.bands.find((b) => b.id === 'harvester-0');
      if (!isEngaged(s, bot(s)) && isEngaged(next, bot(next))) {
        const head = s.bands.find((b) => b.id === move.band).cells[0];
        return { state: s, from: head, to: move.path[move.path.length - 1] };
      }
    }
    s = applyMove(s, move);
  }
  throw new Error('no move in the l01 solution engages the harvester');
}

test('a bot that becomes engaged flashes its plan line once, after the swap', (t) => {
  const { state, from, to } = engagingMove();
  const ui = mount(t, { state });
  ui.tap(from[0], from[1]);
  ui.tap(to[0], to[1]);
  t.mock.timers.tick(LONG);
  const plan = ui.svg.querySelector('[data-plan="harvester-0"]');
  assert.ok(plan, 'the harvester plan is drawn');
  const flashes = plan.animations.filter((a) => a.options.duration === FLASH_MS);
  assert.equal(flashes.length, 1);
  assert.equal(flashes[0].options.fill, 'none');
});

test('a move that engages nothing flashes nothing', (t) => {
  const ui = mount(t);
  const after = applyMove(startState(), FIRST);
  assert.ok(!isEngaged(after, after.bands.find((b) => b.id === 'harvester-0')),
    'the first move of the solution leaves the harvester alone');
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  t.mock.timers.tick(LONG);
  const anims = ui.svg.all().flatMap((n) => n.animations);
  assert.equal(anims.filter((a) => a.options.duration === FLASH_MS).length, 0);
});

test('"Last turn!" shows when the bots turn brings the last turn', (t) => {
  const state = startState();
  state.turnLimit = 2;
  const ui = mount(t, { state });
  assert.equal(ui.byClass('board-callout').length, 0, 'not on turn 1 of 2');
  assert.ok(!ui.one('turn-label').classList.contains('is-last'));
  ui.endTurn();
  const call = ui.byClass('board-callout__text').find((n) => n.textContent === 'Last turn!');
  assert.ok(call, 'the call-out is over the board');
  assert.ok(call.animations[0].options.delay > 0, 'it waits for the bots to finish');
  t.mock.timers.tick(LONG);
  assert.equal(ui.turnText(), 'Turn 2 of 2');
  assert.ok(ui.one('turn-label').classList.contains('is-last'), 'the turn count turns to the warning colour');
});

test('a battle that starts on its last turn says so at once', (t) => {
  const state = startState();
  state.turnLimit = 1;
  const ui = mount(t, { state });
  const call = ui.byClass('board-callout__text').find((n) => n.textContent === 'Last turn!');
  assert.ok(call);
  assert.equal(call.animations[0].options.delay, 0);
  assert.equal(call.animations[0].options.duration, CALLOUT_MS);
});

// --- victory and defeat ---

/** Level 1 one move from the end, as its solution plays it. */
function nearWin() {
  let s = startState();
  for (const move of L01.solution.moves.slice(0, -1)) s = applyMove(s, move);
  return s;
}

/** The winning move's taps: the band's head, then the end of its walk. */
function winningTaps(state) {
  const last = /** @type {{kind: 'move', band: string, path: [number, number][]}} */ (L01.solution.moves.at(-1));
  const head = state.bands.find((b) => b.id === last.band).cells[0];
  return { from: head, to: last.path[last.path.length - 1] };
}

test('victory: the bands hop, stubble regrows to grass, the seeds count up, and the sound plays', (t) => {
  const state = nearWin();
  const stubble = [];
  state.tiles.forEach((row, y) => row.forEach((tile, x) => { if (tile.kind === 'stubble') stubble.push([x, y]); }));
  assert.ok(stubble.length > 0, 'the harvester mowed some forest');
  const played = [];
  let finalState = null;
  const rewardOf = (final) => { finalState = final; return rewardFor(final, L01, valleyProgress()); };
  const ui = mount(t, { state, rewardOf, sound: { play: (n) => played.push(n) } });
  const { from, to } = winningTaps(state);
  ui.tap(from[0], from[1]);
  ui.tap(to[0], to[1]);
  // The winning move plays first; the finale starts when it settles.
  const last = L01.solution.moves.at(-1);
  const moveEnd = sequenceEnd(animSteps(applyMove(state, last).events, { tileKind: tileKindOf(state) }));
  t.mock.timers.tick(moveEnd);
  assert.equal(finalState?.outcome, 'won');
  const total = rewardFor(finalState, L01, valleyProgress()).total;
  const banner = ui.one('board-banner');
  assert.ok(banner, 'a victory banner over the board');
  assert.match(banner.text, /Victory/);
  const seeds = ui.one('board-banner__seeds');
  assert.equal(seeds.text, ' +0', 'the count starts at nothing');
  assert.equal(seeds.children[0].getAttribute('alt'), 'Seeds', 'after the seed icon');
  const hop = ui.svg.querySelector('[data-band="ants"]').animations.at(-1);
  assert.ok(hop.keyframes.some((f) => /translate\(0px, -\d/.test(f.transform ?? '')), 'the ants hop');
  assert.ok(played.includes('victory'));
  t.mock.timers.tick(COUNT_LEAD_MS + COUNT_MS / 2);
  const mid = Number(seeds.text.replace(/\D/g, ''));
  assert.ok(mid > 0 && mid < total, `counting: ${mid} of ${total}`);
  t.mock.timers.tick(LONG);
  assert.equal(seeds.text, ` +${total}`);
  for (const [x, y] of stubble) {
    assert.equal(ui.svg.querySelector(`[data-tile="${x},${y}"] > [data-feature]`).attrs['data-feature'], 'grass', `${x},${y} regrew`);
  }
  assert.equal(ui.button('Continue').disabled, false);
});

test('victory: a tap finishes the finale at once, with the full count', (t) => {
  const state = nearWin();
  const ui = mount(t, { state, rewardOf: (final) => rewardFor(final, L01, valleyProgress()) });
  const { from, to } = winningTaps(state);
  ui.tap(from[0], from[1]);
  ui.tap(to[0], to[1]);
  ui.tap(0, 0); // finishes the move
  ui.tap(0, 0); // finishes the finale
  const seeds = ui.one('board-banner__seeds');
  assert.notEqual(seeds.text, ' +0');
  assert.equal(ui.svg.querySelector('[data-layer="fx"]'), null, 'the effects are cleared');
});

test('defeat: out of turns dims the board and says why; Undo and End turn are not covered', (t) => {
  const state = startState();
  state.turnLimit = 1;
  const ui = mount(t, { state });
  ui.endTurn();
  t.mock.timers.tick(LONG);
  assert.ok(ui.one('board-dim'), 'the board is dimmed');
  assert.equal(ui.one('board-dim').parent.parent, ui.wrap, 'inside the board, never over the bar');
  const banner = ui.one('board-banner');
  assert.match(banner.text, /Defeat/);
  assert.match(banner.text, /Out of turns/);
  assert.equal(ui.byClass('board-mark').length, 0, 'nothing to mark for the turn limit');
  assert.ok(ui.button('Continue'));
});

test('defeat: a lost den is marked where it stood', (t) => {
  const grid = ['H.......', '........', '........', '........', '........', '........', '........', '.......P'];
  const level = /** @type {any} */ ({ ...L01, id: 'test', name: 'Test', grid, turnLimit: null });
  const state = makeState(grid, [
    { id: 'ants', type: 'ants', cells: [[7, 6]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]], plan: { path: [], strike: [0, 0], actionId: 'mow' } },
  ]);
  state.tiles[0][0] = { kind: 'habitatDamaged', variant: null, under: null };
  const ui = mount(t, { level, state });
  ui.endTurn();
  t.mock.timers.tick(LONG);
  const marks = ui.byClass('board-mark');
  assert.equal(marks.length, 1);
  assert.equal(marks[0].style.left, '0%');
  assert.equal(marks[0].style.top, '0%');
  assert.match(ui.one('board-banner').text, /A den was destroyed/);
});

// --- the ribbon over the board (the kit's ribbon in place of the little box) ---

test('victory: the green ribbon unfurls across the board with the word on it; the seeds hang under it', (t) => {
  const state = nearWin();
  const ui = mount(t, { state, rewardOf: (final) => rewardFor(final, L01, valleyProgress()) });
  const { from, to } = winningTaps(state);
  ui.tap(from[0], from[1]);
  ui.tap(to[0], to[1]);
  ui.tap(0, 0); // finishes the move; the finale starts
  const ribbon = ui.one('board-banner__ribbon');
  assert.ok(ribbon, 'a ribbon over the board');
  assert.deepEqual(ribbon.className.split(' ').filter((c) => c.startsWith('ui-ribbon')), ['ui-ribbon', 'ui-ribbon--green']);
  assert.equal(ui.one('board-banner__title').text, 'Victory!');
  assert.ok(ribbon.animations.some((a) => a.keyframes.some((k) => /scaleX/.test(k.transform ?? ''))), 'it unfurls');
  assert.equal(ui.byClass('board-banner__box').length, 0, 'no little box any more');
  const seeds = ui.one('board-banner__seeds');
  assert.ok(seeds.className.split(' ').includes('ui-panel--parchment'));
  assert.equal(seeds.parent, ribbon.parent, 'under the ribbon, in the same banner');
  assert.equal(ui.button('Continue').className, 'end-btn is-ready ui-btn ui-btn--primary', 'Continue stays the main button');
});

test('defeat: the rust ribbon unfurls after the dim, with what was lost under it', (t) => {
  const state = startState();
  state.turnLimit = 1;
  const ui = mount(t, { state });
  ui.endTurn();
  t.mock.timers.tick(LONG);
  const ribbon = ui.one('board-banner__ribbon');
  assert.ok(ribbon.className.split(' ').includes('ui-ribbon--rust'));
  assert.equal(ui.one('board-banner__title').text, 'Defeat');
  const unfurl = ribbon.animations.find((a) => a.keyframes.some((k) => /scaleX/.test(k.transform ?? '')));
  assert.ok(unfurl, 'it unfurls');
  const dim = ui.one('board-dim').animations[0];
  assert.ok(unfurl.options.delay >= dim.options.delay, 'once the board has begun to dim');
  assert.match(ui.one('board-banner__text').text, /Out of turns/);
});

test('under reduced motion the ribbon is simply there: no unfurl', (t) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' });
  t.after(() => { globalThis.matchMedia = was; });
  const state = startState();
  state.turnLimit = 1;
  const ui = mount(t, { state });
  ui.endTurn();
  t.mock.timers.tick(LONG);
  assert.equal(ui.one('board-banner__ribbon').animations.length, 0);
  assert.equal(ui.one('board-banner__title').animations.length, 0);
  assert.match(ui.one('board-banner').text, /Defeat/);
});

// --- settings ---

test('settings: bot speed and sound from the battle screen, saved through the caller', (t) => {
  const changes = [];
  const ui = mount(t, { botSpeed: 'normal', soundOn: false, onSettings: (s) => changes.push(s) });
  const gear = ui.root.all().find((n) => n.tag === 'button' && n.getAttribute('aria-label') === 'Settings');
  assert.ok(gear, 'a settings button in the header');
  assert.equal(ui.byClass('battle-settings').length, 0);
  gear.dispatch('click');
  assert.ok(ui.one('battle-settings'));
  assert.equal(ui.button('Normal').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.button('Sound').getAttribute('aria-pressed'), 'false', 'sound is off until turned on');
  ui.click('Instant');
  assert.deepEqual(changes.at(-1), { botSpeed: 'instant', soundOn: false });
  assert.equal(ui.button('Instant').getAttribute('aria-pressed'), 'true');
  ui.click('Sound');
  assert.deepEqual(changes.at(-1), { botSpeed: 'instant', soundOn: true });
  assert.equal(ui.button('Sound').getAttribute('aria-pressed'), 'true');
  ui.click('Done');
  assert.equal(ui.byClass('battle-settings').length, 0);
  // The new speed is used at once: the bots turn shows its result.
  ui.endTurn();
  assert.equal(ui.turnText(), 'Turn 2');
});

test('victory under reduced motion: nothing hops, the full count shows at once', (t) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' });
  t.after(() => { globalThis.matchMedia = was; });
  const state = nearWin();
  let total = null;
  const ui = mount(t, {
    state,
    rewardOf: (final) => { total = rewardFor(final, L01, valleyProgress()).total; return rewardFor(final, L01, valleyProgress()); },
  });
  const { from, to } = winningTaps(state);
  ui.tap(from[0], from[1]);
  ui.tap(to[0], to[1]);
  t.mock.timers.tick(FADE_MS);
  assert.equal(ui.one('board-banner__seeds').text, ` +${total}`);
  const anims = ui.svg.all().flatMap((n) => n.animations);
  assert.ok(anims.every((a) => a.keyframes.every((k) => k.transform === undefined)), 'fades only');
});
