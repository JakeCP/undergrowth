// The result screen (play-feel spec, "Changed after Jake's playtest of
// the full build"): after a victory the default is the map. "Back to
// map" is the main button and has the focus; "Play again" is a second,
// quieter button, and nothing replays unless the player asks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import {
  renderResult, resultLine, denPlace, resultRibbon, resultScene, tallyRows, standingRows, entranceSteps, tallyAt,
  ROW_COUNT_MS,
} from '../js/ui/result-view.js';
import { UI_ASSETS } from '../js/ui/ui-assets.js';
import { createBattle, applyMove, rewardFor } from '../js/engine/battle.js';
import { applyVictory } from '../js/campaign/progress.js';
import { LEVELS } from '../data/levels/index.js';
import { CAMPAIGN_NODES } from '../data/campaign.js';
import { nodeStates } from '../js/ui/map-layout.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const L01 = LEVELS.find((l) => l.id === 'l01');

function wonL01() {
  const progress = valleyProgress();
  let state = createBattle(L01, L01.solution.deploy, progress);
  for (const move of L01.solution.moves) state = applyMove(state, move);
  assert.equal(state.outcome, 'won');
  return { progress, state, reward: rewardFor(state, L01, progress) };
}

/**
 * Shows the result screen. Unless `arriving` is set, it is then let finish
 * its entrance with a tap, as a player would (the tap does nothing else).
 */
function show(final, reward, { arriving = false, assets = undefined } = {}) {
  const root = new FakeEl('div');
  const calls = [];
  const settled = renderResult(/** @type {any} */ (root), {
    level: L01, final, reward, onMap: () => calls.push('map'), onReplay: () => calls.push('replay'), assets,
  });
  const screen = root.children[0];
  if (!arriving) screen.dispatch('click');
  const buttons = root.all().filter((n) => n.tag === 'button');
  const classes = (btn) => btn.className.split(' ');
  const byClass = (cls) => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes(cls));
  return { root, screen, calls, buttons, classes, byClass, settled };
}

test('after a victory, Back to map comes first and is the main button; Play again is quieter', () => {
  const { state, reward } = wonL01();
  const ui = show(state, reward);
  assert.deepEqual(ui.buttons.map((b) => b.textContent), ['Back to map', 'Play again']);
  const [map, again] = ui.buttons;
  assert.ok(ui.classes(map).includes('ui-btn--primary'));
  assert.ok(!ui.classes(again).includes('ui-btn--primary'));
  assert.ok(ui.classes(again).includes('ui-btn--secondary'));
});

test('after a victory, Back to map has the focus, so Enter goes to the map', () => {
  const { state, reward } = wonL01();
  const focused = [];
  const was = FakeEl.prototype.focus;
  FakeEl.prototype.focus = function focus() { focused.push(this); };
  try {
    const ui = show(state, reward);
    assert.deepEqual(focused.map((n) => n.textContent), ['Back to map']);
    assert.deepEqual(ui.calls, [], 'nothing happens by itself');
  } finally {
    if (was === undefined) delete FakeEl.prototype.focus;
    else FakeEl.prototype.focus = was;
  }
});

test('the buttons do what they say, and only when pressed', () => {
  const { state, reward } = wonL01();
  const ui = show(state, reward);
  ui.buttons[0].dispatch('click');
  assert.deepEqual(ui.calls, ['map']);
  const again = show(state, reward);
  again.buttons[1].dispatch('click');
  assert.deepEqual(again.calls, ['replay']);
});

test('the screen is left once, however many presses arrive', () => {
  const { state, reward } = wonL01();
  const ui = show(state, reward);
  ui.buttons[0].dispatch('click');
  ui.buttons[0].dispatch('click');
  ui.buttons[1].dispatch('click');
  assert.deepEqual(ui.calls, ['map']);
});

test('after a defeat, Back to map is still the main button', () => {
  const lost = { ...wonL01().state, outcome: /** @type {const} */ ('lost'), lostReason: null };
  const ui = show(lost, null);
  assert.deepEqual(ui.buttons.map((b) => b.textContent), ['Back to map', 'Play again']);
  assert.ok(ui.classes(ui.buttons[0]).includes('ui-btn--primary'));
});

test('the map that Back to map opens lights the next level', () => {
  const { progress, reward } = wonL01();
  const after = applyVictory(progress, L01.id, reward);
  const states = nodeStates(CAMPAIGN_NODES, after);
  assert.equal(states.get(L01.id), 'cleared');
  assert.equal([...states.values()].filter((s) => s === 'next').length, 1, 'one level is lit');
  const after01 = CAMPAIGN_NODES.find((n) => n.levelId === L01.id);
  assert.ok(after01 && after01.unlocks.length > 0);
  for (const id of after01.unlocks) assert.notEqual(states.get(id), 'locked', id);
});

// The result screen used to set its own buttons (a hazard-yellow main
// one and a transparent outline); since the interface kit it uses the
// shared ones, as every screen does: the green main button and the plain
// wood one (css/ui.css).
test('the stylesheet: on the result screen the main button stands out and Play again does not', () => {
  const css = fs.readFileSync(new URL('../css/ui.css', import.meta.url), 'utf8');
  const main = css.match(/\.ui-btn--primary\s*\{([^}]*)\}/);
  assert.ok(main, 'a rule for the main button');
  assert.match(main[1], /background:\s*linear-gradient/);
  assert.match(main[1], /color:\s*var\(--cream\)/);
  const quiet = css.match(/\.ui-btn--secondary\s*\{([^}]*)\}/);
  assert.ok(quiet, 'a rule for the quieter button');
  assert.match(quiet[1], /color:\s*var\(--ink\)/);
  const game = fs.readFileSync(new URL('../css/game.css', import.meta.url), 'utf8');
  assert.doesNotMatch(game, /\.result-screen \.btn-primary|\.btn-quiet/, 'no button style of its own');
});

// --- what happened, on the card (after the l03 playtest) ---

test('resultLine: a win says the goal was met', () => {
  const { state } = wonL01();
  assert.equal(resultLine(L01, state), 'The forged permit is captured');
  const L05 = LEVELS.find((l) => l.id === 'l05');
  assert.equal(resultLine(L05, { ...state, outcome: 'won' }), 'Every bot is driven off the field');
  const L04 = LEVELS.find((l) => l.id === 'l04');
  assert.equal(resultLine(L04, { ...state, outcome: 'won' }), 'The trapped bear is free');
});

test('resultLine: a loss says which den, or that the bands were wiped out, or the turns ran out', () => {
  const L03 = LEVELS.find((l) => l.id === 'l03');
  const progress = valleyProgress();
  const start = createBattle(L03, L03.solution.deploy, progress);
  // The east den (6,4) burnt to stubble.
  const tiles = start.tiles.map((row) => row.map((t) => ({ ...t })));
  tiles[4][6] = { kind: 'stubble', variant: null, under: null };
  const denLost = { ...start, tiles, outcome: /** @type {const} */ ('lost'), lostReason: /** @type {const} */ ('habitat') };
  assert.equal(resultLine(L03, denLost), 'The east den was destroyed');
  assert.equal(resultLine(L01, { ...wonL01().state, outcome: 'lost', lostReason: 'habitat' }), 'The den was destroyed');
  assert.equal(resultLine(L03, { ...start, outcome: 'lost', lostReason: 'wiped' }), 'Every band was wiped out');
  assert.equal(resultLine(L03, { ...start, outcome: 'lost', lostReason: 'turns', turnLimit: 6 }), 'Out of turns: the bots held on past turn 6');
});

test('denPlace: names a den by its side of the board, only as far as needed', () => {
  assert.equal(denPlace([0, 4], [[0, 4]], 8, 8), '');
  assert.equal(denPlace([0, 4], [[0, 4], [6, 4]], 8, 8), 'west');
  assert.equal(denPlace([7, 0], [[7, 0], [7, 1], [0, 1]], 8, 8), 'north-east');
});

test('the result card: the line, then the seed tally with the painted acorn after a win', () => {
  const { state, reward } = wonL01();
  const ui = show(state, reward);
  const card = ui.root.all().find((n) => n.className === 'result-card ui-panel--parchment');
  assert.ok(card, 'a card on the kit\'s parchment');
  assert.match(card.text, /The forged permit is captured/);
  const total = card.all().find((n) => n.className === 'reward-row reward-row--total');
  assert.ok(total);
  assert.match(total.text, new RegExp(`\\+${reward.total}$`));
  const img = total.all().find((n) => n.tag === 'img');
  assert.equal(img?.getAttribute('alt'), 'Seeds');
  assert.equal(ui.root.all().some((n) => /[\u{1F300}-\u{1FAFF}]/u.test(n.textContent)), false, 'no emoji');
});

test('the result card after a defeat says what was lost', () => {
  const lost = { ...wonL01().state, outcome: /** @type {const} */ ('lost'), lostReason: /** @type {const} */ ('wiped') };
  const ui = show(lost, null);
  const card = ui.root.all().find((n) => n.className === 'result-card ui-panel--parchment');
  assert.match(card.text, /Every band was wiped out/);
  assert.equal(card.all().find((n) => n.className === 'reward-list'), undefined);
});

// --- the painted scene, the ribbon and the entrance (the result screen
// built around the kit's result scene) ---

test('resultRibbon: green Victory after a win, rust Defeat after a loss', () => {
  const { state } = wonL01();
  assert.deepEqual(resultRibbon(state), { tone: 'green', word: 'Victory' });
  assert.deepEqual(resultRibbon({ ...state, outcome: 'lost', lostReason: 'wiped' }), { tone: 'rust', word: 'Defeat' });
});

test('resultScene: the painted scene of the win or the loss, or none when the kit lacks it', () => {
  const { state } = wonL01();
  const lost = { ...state, outcome: /** @type {const} */ ('lost') };
  assert.equal(resultScene(state), UI_ASSETS['result-victory']);
  assert.equal(resultScene(lost), UI_ASSETS['result-defeat']);
  assert.equal(resultScene(state, {}), null);
  assert.equal(resultScene(lost, { 'result-victory': 'v.webp' }), null);
});

test('tallyRows: each line of the reward that earned something, in order, and the reward\'s own total', () => {
  assert.deepEqual(tallyRows({ pickups: 0, objectives: 5, forest: 18, firstClear: 10, total: 33 }), {
    rows: [{ label: 'Objectives', value: 5 }, { label: 'Forest kept', value: 18 }, { label: 'First clear', value: 10 }],
    total: 33,
  });
  assert.deepEqual(tallyRows({ pickups: 10, objectives: 0, forest: 0, firstClear: 0, total: 10 }).rows, [{ label: 'Pickups', value: 10 }]);
});

test('standingRows: dens standing of the level\'s dens and forest kept of the forest it started with', () => {
  const { state } = wonL01();
  const rows = standingRows(state);
  assert.deepEqual(rows.map((r) => r.icon), ['den', 'forest']);
  const [den, forest] = rows;
  assert.equal(den.of, state.habitatStart);
  assert.equal(den.label, state.habitatStart === 1 ? 'den standing' : 'dens standing');
  assert.equal(forest.of, state.forestStart);
  assert.ok(forest.have <= forest.of && forest.have > 0);
  assert.deepEqual(standingRows({ ...state, habitatStart: 0 }).map((r) => r.icon), ['forest'], 'no dens on the level, no den mark');
  assert.deepEqual(standingRows({ ...state, habitatStart: 0, forestStart: 0 }), []);
});

test('entranceSteps: the ribbon first, then the panel, the marks and the lines in turn; the buttons last', () => {
  const steps = entranceSteps({ standing: 2, rows: 3 });
  assert.ok(steps.ribbon.duration > 0);
  assert.ok(steps.panel.start >= steps.ribbon.start);
  assert.ok(steps.name.start > steps.ribbon.start, 'the name comes onto the opened ribbon');
  assert.ok(steps.standing[0].start > steps.panel.start && steps.standing[1].start > steps.standing[0].start);
  assert.ok(steps.rows[0].start > steps.standing[1].start);
  assert.ok(steps.rows[1].start > steps.rows[0].start && steps.rows[2].start > steps.rows[1].start);
  assert.ok(steps.actions.start >= steps.rows[2].start);
  assert.equal(steps.end, steps.actions.start + steps.actions.duration);
  assert.ok(steps.end >= steps.rows[2].start + ROW_COUNT_MS, 'the count is done before the screen is steady');
  assert.ok(steps.end <= 2500, `short: ${steps.end} ms`);
});

test('entranceSteps under reduced motion: everything is simply there', () => {
  const steps = entranceSteps({ standing: 2, rows: 3, reducedMotion: true });
  assert.equal(steps.end, 0);
  for (const span of [steps.ribbon, steps.name, steps.panel, steps.actions, ...steps.standing, ...steps.rows]) {
    assert.deepEqual(span, { start: 0, duration: 0 });
  }
  assert.equal(tallyAt(steps, [{ label: 'a', value: 5 }, { label: 'b', value: 7 }, { label: 'c', value: 1 }], 0), 13);
});

test('tallyAt: the total climbs line by line, never backwards, and ends on the sum', () => {
  const rows = [{ label: 'Objectives', value: 5 }, { label: 'Forest kept', value: 18 }, { label: 'First clear', value: 10 }];
  const steps = entranceSteps({ standing: 0, rows: rows.length });
  assert.equal(tallyAt(steps, rows, 0), 0);
  assert.equal(tallyAt(steps, rows, steps.rows[1].start), 5, 'the first line is in when the second lands');
  let last = 0;
  for (let t = 0; t <= steps.end; t += 20) {
    const v = tallyAt(steps, rows, t);
    assert.ok(v >= last && Number.isInteger(v));
    last = v;
  }
  assert.equal(tallyAt(steps, rows, steps.end), 33);
});

test('the screen: the painted scene under the ribbon, which carries the word and the level\'s name', () => {
  const { state, reward } = wonL01();
  const ui = show(state, reward);
  const img = ui.root.all().find((n) => n.tag === 'img' && n.className === 'result-scene__img');
  assert.equal(img?.getAttribute('src'), UI_ASSETS['result-victory']);
  assert.equal(img?.getAttribute('alt'), '', 'the scene is a picture only; the words say what happened');
  const title = ui.byClass('result-title')[0];
  assert.ok(title.className.split(' ').includes('ui-ribbon'));
  assert.ok(title.className.split(' ').includes('ui-ribbon--green'));
  assert.equal(title.tag, 'h1');
  assert.equal(ui.byClass('result-title__word')[0].text, 'Victory');
  assert.equal(ui.byClass('result-sub')[0].text, L01.name);
  assert.ok(!ui.screen.className.split(' ').includes('result-screen--bare'));
  const lost = show({ ...state, outcome: /** @type {const} */ ('lost'), lostReason: /** @type {const} */ ('wiped') }, null);
  assert.ok(lost.byClass('result-title')[0].className.split(' ').includes('ui-ribbon--rust'));
  assert.equal(lost.byClass('result-title__word')[0].text, 'Defeat');
  assert.equal(lost.root.all().find((n) => n.tag === 'img' && n.className === 'result-scene__img')?.getAttribute('src'), UI_ASSETS['result-defeat']);
});

test('the screen without a painted scene: the ribbon and the panel on the backdrop alone', () => {
  const { state, reward } = wonL01();
  const ui = show(state, reward, { assets: {} });
  assert.ok(ui.screen.className.split(' ').includes('result-screen--bare'));
  assert.equal(ui.root.all().some((n) => n.className === 'result-scene'), false);
  assert.ok(ui.byClass('result-title')[0]);
  assert.ok(ui.byClass('result-card')[0]);
});

test('after a win, how well it went: dens standing and forest kept, each with its painted icon', () => {
  const { state, reward } = wonL01();
  const ui = show(state, reward);
  const marks = ui.byClass('result-stand');
  assert.equal(marks.length, 2);
  const [den, forest] = standingRows(state);
  assert.match(marks[0].text, new RegExp(`${den.have}/${den.of}`));
  assert.equal(marks[0].all().find((n) => n.tag === 'img')?.getAttribute('alt'), 'Dens');
  assert.match(marks[1].text, new RegExp(`${forest.have}/${forest.of}`));
  assert.equal(marks[1].all().find((n) => n.tag === 'img')?.getAttribute('alt'), 'Forest');
  assert.equal(marks[1].getAttribute('aria-label'), `${forest.have} of ${forest.of} forest kept`);
  const lost = show({ ...state, outcome: /** @type {const} */ ('lost'), lostReason: /** @type {const} */ ('wiped') }, null);
  assert.equal(lost.byClass('result-stand').length, 0, 'not after a loss');
});

test('the entrance: the ribbon unfurls, the lines land and the total counts up, transform and opacity only', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, reward } = wonL01();
  const ui = show(state, reward, { arriving: true });
  const total = ui.byClass('reward-row--total')[0];
  assert.match(total.text, /\+0$/, 'the count starts at nothing');
  const title = ui.byClass('result-title')[0];
  assert.ok(title.animations[0].keyframes.some((k) => /scaleX/.test(k.transform ?? '')), 'the ribbon unfurls');
  const anims = ui.root.all().flatMap((n) => n.animations);
  for (const a of anims) {
    for (const k of a.keyframes) {
      for (const prop of Object.keys(k)) assert.ok(['offset', 'transform', 'opacity', 'easing'].includes(prop), prop);
    }
  }
  const steps = entranceSteps({ standing: 2, rows: tallyRows(reward).rows.length });
  t.mock.timers.tick(steps.rows[1].start);
  const mid = Number(total.text.replace(/\D/g, ''));
  assert.ok(mid > 0 && mid < reward.total, `counting: ${mid} of ${reward.total}`);
  t.mock.timers.tick(steps.end);
  assert.match(total.text, new RegExp(`\\+${reward.total}$`));
  assert.equal(total.getAttribute('aria-label'), `Seeds: ${reward.total} more`, 'a screen reader hears the whole sum at once');
});

test('while the screen arrives a press only finishes it; the next one acts', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, reward } = wonL01();
  const ui = show(state, reward, { arriving: true });
  let steady = false;
  void ui.settled.then(() => { steady = true; });
  ui.buttons[0].dispatch('click');
  assert.deepEqual(ui.calls, [], 'the first tap only finishes the entrance');
  assert.match(ui.byClass('reward-row--total')[0].text, new RegExp(`\\+${reward.total}$`), 'the whole sum at once');
  assert.ok(ui.root.all().flatMap((n) => n.animations).every((a) => a.cancelled), 'every effect is at its end');
  await ui.settled;
  assert.ok(steady, 'the screen is steady');
  ui.buttons[0].dispatch('click');
  assert.deepEqual(ui.calls, ['map']);
});

test('the screen settles by itself once its entrance has played, so a story scene can open over it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, reward } = wonL01();
  const ui = show(state, reward, { arriving: true });
  let steady = false;
  void ui.settled.then(() => { steady = true; });
  await Promise.resolve();
  assert.equal(steady, false, 'not while it still arrives');
  t.mock.timers.tick(entranceSteps({ standing: 2, rows: tallyRows(reward).rows.length }).end);
  await ui.settled;
  assert.ok(steady);
  ui.buttons[1].dispatch('click');
  assert.deepEqual(ui.calls, ['replay'], 'and then the buttons answer at once');
});

test('under reduced motion nothing moves: the whole tally is there and the screen is steady at once', async (t) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' });
  t.after(() => { globalThis.matchMedia = was; });
  const { state, reward } = wonL01();
  const ui = show(state, reward, { arriving: true });
  assert.equal(ui.root.all().flatMap((n) => n.animations).length, 0, 'no unfurl, no count');
  assert.match(ui.byClass('reward-row--total')[0].text, new RegExp(`\\+${reward.total}$`));
  await ui.settled;
  ui.buttons[0].dispatch('click');
  assert.deepEqual(ui.calls, ['map'], 'the first press acts');
});

test('index.html and the service worker carry the result screen\'s stylesheet', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /href="css\/result\.css"/);
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'css\/result\.css'/);
  const css = fs.readFileSync(new URL('../css/result.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /animation:|transition:/, 'all motion is played from script, and checks reduced motion');
});
