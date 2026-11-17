// Bristle on the bots' turn (opening-act spec, "Constraints": a bot's plan
// still shows exactly what happens, including the damage it takes). The
// cases the review asked for: the bot that strikes the hedgehog is hurt,
// is destroyed, is the last bot on the field (the clear-the-field win
// then comes on the bots' own turn, which nothing could do before
// bristle), and a den falls in the same turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { applyMove } from '../js/engine/battle.js';
import { bandById } from '../js/engine/band.js';
import { planBots, replan, runBotPhase } from '../js/engine/bots.js';
import { battleMoments } from '../js/story/moments.js';
import { struckHabitats } from '../js/ui/plans.js';
import { describeEvents, describeIntent } from '../js/ui/text.js';
import { animSteps, BOT_TURN_BUDGET_MS } from '../js/ui/anim-steps.js';
import { COUNT_MS, COUNT_LEAD_MS } from '../js/ui/finale.js';
import { mountBattle, battleSceneMoments } from '../js/ui/battle-view.js';
import { LEVELS } from '../data/levels/index.js';
import { makeState } from './helpers.mjs';

installFakeDom({ canvas: true });

/**
 * A battle as the game holds it: every bot's plan made.
 * @param {string[]} grid
 * @param {object[]} bands
 * @param {object} [extra]
 */
function battle(grid, bands, extra = {}) {
  const s = makeState(grid, /** @type {any} */ (bands), extra);
  replan(s);
  s.events = [];
  return s;
}

/**
 * Ends the turn and checks the shown plans against it: each bot's stored
 * plan is what planBots says, and the planning run's events are the
 * turn's events, with only a cleared field's sweep and the new plans
 * after them.
 * @param {import('../js/engine/types.js').BattleState} s
 */
function endTurnChecked(s) {
  const shown = Object.fromEntries(s.bands.filter((b) => b.side === 'bots').map((b) => [b.id, b.plan]));
  assert.deepEqual(shown, planBots(s), 'the plans on the bots are the planning run');
  const planned = structuredClone({ ...s, events: [] });
  const did = runBotPhase(planned);
  assert.deepEqual(did, shown, 'the turn does what the plans showed');
  const n = applyMove(s, { kind: 'end' });
  assert.deepEqual(n.events.slice(0, planned.events.length), planned.events, 'the turn is the planning run');
  for (const e of n.events.slice(planned.events.length)) {
    assert.ok(['pickup', 'capture', 'freed', 'plan'].includes(e.kind), `${e.kind} after the bots' turn`);
  }
  // The log and the animation read the turn without complaint.
  describeEvents(n, n.events);
  animSteps(n.events, { turn: 'bots', speed: 'normal', reducedMotion: false, tileKind: () => 'open', banner: true });
  return n;
}

test('the last bot destroyed by bristle wins the battle on the bots\' turn, as its plan showed', () => {
  // One harvester, one segment left, beside the hedgehog; a stake is
  // still standing, so only the cleared field can win.
  const s = battle(['...K', '....'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  assert.deepEqual(bandById(s, 'harvester-0')?.plan, { path: [], strike: [1, 0], actionId: 'mow' });
  const n = endTurnChecked(s);
  assert.equal(n.outcome, 'won');
  assert.equal(n.bands.some((b) => b.side === 'bots'), false);
  assert.deepEqual(bandById(n, 'hedgehog')?.cells, [[1, 0]]);
  assert.ok(n.objectives.every((o) => o.captured), 'the field is swept');
  assert.equal(n.events.some((e) => e.kind === 'plan'), false, 'no plan follows the end');
  // The story: the bot destroyed, the last one, the win; the screen
  // leaves the win to the result and starts no new turn.
  assert.deepEqual(battleMoments(s, n).map((m) => m.when), ['botDestroyed', 'lastBotDestroyed', 'turn', 'won']);
  assert.deepEqual(battleSceneMoments('t', { kind: 'settled', before: s, after: n }).map((m) => m.when), ['botDestroyed', 'lastBotDestroyed']);
});

test('the last bot and the last band wiping each other out is still a win', () => {
  const s = battle(['....'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0]], maxLen: 2 },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  const n = endTurnChecked(s);
  assert.equal(n.bands.length, 0);
  assert.equal(n.outcome, 'won');
  assert.deepEqual(battleMoments(s, n).map((m) => m.when), ['bandWiped', 'botDestroyed', 'lastBotDestroyed', 'turn', 'won']);
});

test('a bot hurt by bristle, with more bots to come, changes nothing the later plans showed', () => {
  // The first harvester is cut from three segments to two by the strike;
  // the second, behind it, planned its walk on the board as the first
  // leaves it.
  const s = battle(['.......', '.......'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0], [3, 0], [4, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[6, 0], [6, 1]] },
  ]);
  const n = endTurnChecked(s);
  assert.equal(bandById(n, 'harvester-0')?.cells.length, 2);
  assert.equal(n.outcome, null);
});

test('a den destroyed after a bot is destroyed by bristle in the same turn: the battle is lost, as the plans showed', () => {
  // harvester-0 strikes the hedgehog and is destroyed; the planter, which
  // goes for a den before a band, then finishes the damaged den.
  const s = battle(['......H', '.......'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
    { id: 'planter-0', type: 'planter', cells: [[6, 1]] },
  ]);
  s.tiles[0][6] = { kind: 'habitatDamaged', variant: null, under: null };
  replan(s);
  s.events = [];
  assert.deepEqual(bandById(s, 'planter-0')?.plan, { path: [], strike: [6, 0], actionId: 'pave' });
  assert.deepEqual(struckHabitats(s), ['6,0'], 'the den is shown as struck');
  const n = endTurnChecked(s);
  assert.equal(n.outcome, 'lost');
  assert.equal(n.lostReason, 'habitat');
  assert.equal(bandById(n, 'harvester-0'), undefined, 'the harvester was destroyed first');
  const last = n.events[n.events.length - 1];
  assert.ok(last.kind === 'terrain' && last.from === 'habitatDamaged', 'the den is the last event');
  assert.deepEqual(battleMoments(s, n).map((m) => m.when), ['botDestroyed', 'denDamaged', 'turn', 'lost']);
});

test('a den destroyed before the bot reaches the hedgehog: the turn stops, and that bot\'s plan showed nothing', () => {
  const s = battle(['......H', '.......'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'planter-0', type: 'planter', cells: [[6, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  s.tiles[0][6] = { kind: 'habitatDamaged', variant: null, under: null };
  replan(s);
  s.events = [];
  assert.deepEqual(bandById(s, 'planter-0')?.plan, { path: [], strike: [6, 0], actionId: 'pave' });
  assert.deepEqual(bandById(s, 'harvester-0')?.plan, { path: [], strike: null, actionId: null });
  const n = endTurnChecked(s);
  assert.equal(n.outcome, 'lost');
  assert.deepEqual(bandById(n, 'harvester-0')?.cells, [[2, 0]], 'the harvester never struck');
  assert.deepEqual(bandById(n, 'hedgehog')?.cells, [[1, 0], [0, 0]]);
});

test('a bot\'s plan line says what striking the hedgehog will cost it', () => {
  const hurt = battle(['.....', '.....'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0], [3, 0], [4, 0]] },
  ]);
  assert.equal(describeIntent(hurt, /** @type {any} */ (bandById(hurt, 'harvester-0'))), 'Harvester will hit Hedgehog to the west, and lose 1 to its spines');
  const destroyed = battle(['.....', '.....'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  assert.equal(describeIntent(destroyed, /** @type {any} */ (bandById(destroyed, 'harvester-0'))), 'Harvester will hit Hedgehog to the west, and be destroyed by its spines');
  // A band without bristle: the line is as it was.
  const fox = battle(['.....', '.....'], [
    { id: 'fox', type: 'fox', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  assert.equal(describeIntent(fox, /** @type {any} */ (bandById(fox, 'harvester-0'))), 'Harvester will hit Fox to the west');
});

// --- the battle screen ---

const LONG = BOT_TURN_BUDGET_MS + COUNT_LEAD_MS + COUNT_MS + 1000;
const flush = () => new Promise((r) => setImmediate(r));

test('screen: ending the turn into the last bot\'s death shows the victory, with no "Your turn" and no new-turn scene', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const grid = ['...K....', '........', '........', '........', '........', '........', '........', '........'];
  const level = /** @type {any} */ ({ ...LEVELS.find((l) => l.id === 'o01'), id: 'test', name: 'Test', grid });
  const state = battle(grid, [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  /** @type {string[]} */
  const asked = [];
  /** @type {any[]} */
  const finished = [];
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level,
    state,
    onFinish: (s) => finished.push(s),
    onQuit() {},
    onMoment: async (m) => { asked.push(m.when); },
  });
  await flush();
  const button = (/** @type {string} */ label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const banners = () => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes('turn-banner') && n.parent !== null).map((n) => n.text);
  const text = () => root.all().map((n) => n.textContent ?? '').join(' ');
  button('End turn').dispatch('click');
  const again = button('End turn');
  if (again !== undefined) again.dispatch('click');
  assert.ok(!asked.includes('botDestroyed'), 'nothing is asked for while the bots move');
  t.mock.timers.tick(LONG);
  await flush();
  t.mock.timers.tick(LONG);
  await flush();
  assert.deepEqual(asked, ['start', 'botDestroyed', 'lastBotDestroyed'], 'no turn, won or lost moment');
  assert.match(text(), /Victory!/);
  assert.ok(!banners().some((b) => /Your turn/.test(b ?? '')), 'no "Your turn" after the win');
  assert.equal(button('End turn'), undefined);
  const go = button('Continue');
  assert.ok(go !== undefined && go.disabled === false);
  go.dispatch('click');
  assert.equal(finished.length, 1);
  assert.equal(finished[0].outcome, 'won');
});
