import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAction, actionTargets, resolveAction } from '../js/engine/actions.js';
import { bandById } from '../js/engine/band.js';
import { applyMove } from '../js/engine/battle.js';
import { planBots, replan, runBotPhase } from '../js/engine/bots.js';
import { makeState } from './helpers.mjs';

/**
 * A state from `makeState`, with every bot's plan made, as a battle has.
 * @param {string[]} grid
 * @param {object[]} bands
 */
function createTestBattle(grid, bands) {
  const s = makeState(grid, bands);
  replan(s);
  s.events = [];
  return s;
}

test('dig targets exclude occupied, objective, pickup, paving, water', () => {
  const s = makeState(['.P.', '#..', '~*.'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
  ]);
  assert.deepEqual(actionTargets(s, 'badger', 'dig'), [[2, 1]]);
});

test('dig turns forest into a hole; build dams a hole', () => {
  const s = makeState(['.T', '..'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]] },
  ]);
  const badger = bandById(s, 'badger');
  resolveAction(s, badger, findAction(badger, 'dig'), [1, 0]);
  assert.deepEqual(s.tiles[0][1], { kind: 'hole', variant: null, under: null });
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'badger', actionId: 'dig', from: [0, 0], target: [1, 0] },
    { kind: 'terrain', at: [1, 0], from: 'forest', to: 'hole', cause: 'dig' },
  ]);

  const s2 = makeState(['.o', '..'], [
    { id: 'beaver', type: 'beaver', cells: [[0, 0]] },
  ]);
  const beaver = bandById(s2, 'beaver');
  resolveAction(s2, beaver, findAction(beaver, 'build'), [1, 0]);
  assert.deepEqual(s2.tiles[0][1], { kind: 'dam', variant: null, under: 'hole' });
  assert.deepEqual(s2.events, [
    { kind: 'action', actor: 'beaver', actionId: 'build', from: [0, 0], target: [1, 0] },
    { kind: 'terrain', at: [1, 0], from: 'hole', to: 'dam', cause: 'build' },
  ]);
});

test('owl strike targets are occupied range 2–3 straight-line tiles only, never own bands', () => {
  const grid = Array.from({ length: 8 }, () => '........');
  const s = makeState(grid, [
    { id: 'owl', type: 'owl', cells: [[3, 3]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 1]] },
    { id: 'saw-0', type: 'saw', cells: [[6, 3]] },
    { id: 'ants', type: 'ants', cells: [[3, 5]] },
  ]);
  // Empty in-range tiles and the own Ants at [3,5] are not offered (M11).
  assert.deepEqual(actionTargets(s, 'owl', 'strike'), [[3, 1], [6, 3]]);
});

test('single attack targets are occupied tiles only, never own bands', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[1, 1]] },
    { id: 'badger', type: 'badger', cells: [[1, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
  ]);
  assert.deepEqual(actionTargets(s, 'ants', 'bite'), [[2, 1]]);
});

test('line3 attack targets are not restricted to occupied tiles', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'bees', type: 'bees', cells: [[1, 1]] },
  ]);
  assert.deepEqual(actionTargets(s, 'bees', 'sting'), [[1, 0], [2, 1], [1, 2], [0, 1]]);
});

test('bees sting hits three tiles in a line, friend or foe', () => {
  const s = makeState(['.....', '.....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0], [0, 1]] },
    { id: 'ants', type: 'ants', cells: [[2, 0], [2, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0], [3, 1]] },
  ]);
  const bees = bandById(s, 'bees');
  resolveAction(s, bees, findAction(bees, 'sting'), [1, 0]);
  assert.deepEqual(bandById(s, 'ants').cells, [[2, 0]]);
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[3, 0]]);
});

test('bear shove pushes a bot into a hole', () => {
  const s = makeState(['..o', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  const bear = bandById(s, 'bear');
  resolveAction(s, bear, findAction(bear, 'shove'), [1, 0]);
  assert.equal(bandById(s, 'harvester-0'), undefined);
  assert.ok(s.events.some((e) => e.kind === 'push' && e.outcome.kind === 'falls'));
});

test('ram does 0 damage but pushes', () => {
  const s = makeState(['....', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 6 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  const ants = bandById(s, 'ants');
  resolveAction(s, ants, findAction(ants, 'ram'), [1, 0]);
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[2, 0], [1, 0]]);
  assert.equal(s.events.some((e) => e.kind === 'damage'), false);
});

test('mow turns an empty forest tile to stubble', () => {
  const s = makeState(['.T.'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
  ]);
  const harvester = bandById(s, 'harvester-0');
  resolveAction(s, harvester, findAction(harvester, 'mow'), [1, 0]);
  assert.deepEqual(s.tiles[0][1], { kind: 'stubble', variant: null, under: null });
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [0, 0], target: [1, 0] },
    { kind: 'terrain', at: [1, 0], from: 'forest', to: 'stubble', cause: 'mow' },
  ]);
});

test('a strike on a band hits the band only: the tile under it is untouched', () => {
  for (const [type, actionId, row] of [
    ['harvester', 'mow', '.T'],
    ['planter', 'pave', '..'],
    ['planter', 'pave', '._'],
    ['saw', 'saw', '.='],
  ]) {
    const s = makeState([row, '..'], [
      { id: 'bot', type, cells: [[0, 0]] },
      { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [0, 1]] },
    ]);
    const before = structuredClone(s.tiles);
    const bot = bandById(s, 'bot');
    const action = findAction(bot, actionId);
    resolveAction(s, bot, action, [1, 0]);
    assert.deepEqual(s.tiles, before, `${type} on ${row[1]}`);
    assert.equal(bandById(s, 'ants').cells.length, 3 - action.damage, `${type} on ${row[1]}`);
    assert.deepEqual(s.events.map((e) => e.kind), ['action', 'damage'], `${type} on ${row[1]}`);
  }
});

test('a strike that wipes a band out still leaves the tile under it alone', () => {
  const s = makeState(['.T'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
  ]);
  const harvester = bandById(s, 'harvester-0');
  resolveAction(s, harvester, findAction(harvester, 'mow'), [1, 0]);
  assert.equal(bandById(s, 'ants'), undefined);
  assert.equal(s.tiles[0][1].kind, 'forest');
  assert.deepEqual(s.events.map((e) => e.kind), ['action', 'damage']);
});

test('a band crossing a dam is damaged, and the dam holds', () => {
  const s = makeState(['....', '~=~~', '....'], [
    { id: 'ants', type: 'ants', cells: [[1, 1], [1, 2], [0, 2]] },
    { id: 'saw-0', type: 'saw', cells: [[1, 0], [2, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 1]);
  assert.deepEqual(s.tiles[1][1], { kind: 'dam', variant: null, under: 'water' });
  assert.deepEqual(bandById(s, 'ants').cells, [[1, 1]]);
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'saw-0', actionId: 'saw', from: [1, 0], target: [1, 1] },
    { kind: 'damage', band: 'ants', amount: 2, wiped: false, cells: [[0, 2], [1, 2]] },
  ]);
});

test('with no band on it, a saw strike cuts the dam', () => {
  const s = makeState(['....', '~=~~', '....'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 0], [2, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 1]);
  assert.equal(s.tiles[1][1].kind, 'water');
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'saw-0', actionId: 'saw', from: [1, 0], target: [1, 1] },
    { kind: 'terrain', at: [1, 1], from: 'dam', to: 'water', cause: 'saw' },
  ]);
});

test('a bot struck on a dam is damaged like any band, and the dam holds', () => {
  const s = makeState(['....', '~=~~', '....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1], [1, 2], [0, 2]] },
    { id: 'saw-0', type: 'saw', cells: [[1, 0], [2, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 1]);
  assert.equal(s.tiles[1][1].kind, 'dam');
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[1, 1]]);
  assert.equal(s.events.some((e) => e.kind === 'terrain' || e.kind === 'push'), false);
});

test('a strike on a body cell on a dam takes the band from the tail, and the dam holds', () => {
  const s = makeState(['....', '.=..', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 1], [1, 1], [1, 2], [0, 2]] },
    { id: 'saw-0', type: 'saw', cells: [[1, 0], [2, 0]] },
  ]);
  s.tiles[1][1].under = 'hole';
  const saw = bandById(s, 'saw-0');
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 1]);
  assert.deepEqual(s.tiles[1][1], { kind: 'dam', variant: null, under: 'hole' });
  assert.deepEqual(bandById(s, 'ants').cells, [[0, 1], [1, 1]]);
  assert.deepEqual(s.events.slice(1), [
    { kind: 'damage', band: 'ants', amount: 2, wiped: false, cells: [[0, 2], [1, 2]] },
  ]);
});

test('dig that turns an occupied tile into a hole wipes the occupant like a fall', () => {
  const s = makeState(['...', '...'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  const badger = bandById(s, 'badger');
  resolveAction(s, badger, findAction(badger, 'dig'), [1, 0]);
  assert.equal(s.tiles[0][1].kind, 'hole');
  assert.equal(bandById(s, 'harvester-0'), undefined);
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'badger', actionId: 'dig', from: [0, 0], target: [1, 0] },
    { kind: 'terrain', at: [1, 0], from: 'open', to: 'hole', cause: 'dig' },
    { kind: 'damage', band: 'harvester-0', amount: 2, wiped: true, cells: [[1, 1], [1, 0]] },
    { kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [1, 0], cause: 'terrain' } },
  ]);
});

test('dam cut under a flying band does not wipe it', () => {
  const s = makeState(['....', '~=~~', '....'], [
    { id: 'badger', type: 'badger', cells: [[1, 0]] },
    { id: 'owl', type: 'owl', cells: [[1, 1]] },
  ]);
  const badger = bandById(s, 'badger');
  resolveAction(s, badger, findAction(badger, 'dig'), [1, 1]);
  assert.equal(s.tiles[1][1].kind, 'water');
  assert.deepEqual(bandById(s, 'owl').cells, [[1, 1]]);
  assert.equal(s.events.some((e) => e.kind === 'push'), false);
});

test('animal actions cannot target a habitat in either state', () => {
  const s = makeState(['.H.', 'H.~', '.o.'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
    { id: 'beaver', type: 'beaver', cells: [[1, 1]] },
  ]);
  s.tiles[1][0].kind = 'habitatDamaged';
  assert.deepEqual(actionTargets(s, 'badger', 'dig'), []);
  assert.deepEqual(actionTargets(s, 'beaver', 'build'), [[2, 1], [1, 2]]);
});

test('any bot strike steps a habitat intact -> damaged -> stubble', () => {
  for (const [type, actionId] of [['harvester', 'mow'], ['saw', 'saw'], ['planter', 'pave']]) {
    const s = makeState(['.H'], [
      { id: 'bot', type, cells: [[0, 0]] },
    ]);
    const bot = bandById(s, 'bot');
    resolveAction(s, bot, findAction(bot, actionId), [1, 0]);
    assert.equal(s.tiles[0][1].kind, 'habitatDamaged', type);
    resolveAction(s, bot, findAction(bot, actionId), [1, 0]);
    assert.deepEqual(s.tiles[0][1], { kind: 'stubble', variant: null, under: null }, type);
    assert.deepEqual(
      s.events.filter((e) => e.kind === 'terrain').map((e) => [e.from, e.to]),
      [['habitat', 'habitatDamaged'], ['habitatDamaged', 'stubble']],
      type,
    );
  }
});

test('a habitat strike is one step whatever the damage number', () => {
  const s = makeState(['.H', '..'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  assert.equal(findAction(saw, 'saw').damage, 2);
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 0]);
  assert.equal(s.tiles[0][1].kind, 'habitatDamaged');
});

test('a band on a den shields it: the strike hits the band and the den stands as it was', () => {
  for (const kind of ['habitat', 'habitatDamaged']) {
    for (const [type, actionId] of [['harvester', 'mow'], ['saw', 'saw'], ['planter', 'pave']]) {
      const s = makeState(['.H', '..'], [
        { id: 'bot', type, cells: [[0, 0]] },
        { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [0, 1]] },
      ]);
      s.tiles[0][1].kind = /** @type {'habitat'|'habitatDamaged'} */ (kind);
      const bot = bandById(s, 'bot');
      const action = findAction(bot, actionId);
      resolveAction(s, bot, action, [1, 0]);
      assert.equal(s.tiles[0][1].kind, kind, `${type} on ${kind}`);
      assert.equal(bandById(s, 'ants').cells.length, 3 - action.damage, `${type} on ${kind}`);
      assert.deepEqual(s.events.map((e) => e.kind), ['action', 'damage'], `${type} on ${kind}`);
    }
  }
  // Even a band wiped out on the den takes the whole strike.
  const s = makeState(['.H'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 0]);
  assert.equal(bandById(s, 'ants'), undefined);
  assert.equal(s.tiles[0][1].kind, 'habitat');
});

test('an action event comes first, with the actor head and the target, even when nothing is hit', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'bees', type: 'bees', cells: [[1, 1], [1, 2]] },
  ]);
  const bees = bandById(s, 'bees');
  resolveAction(s, bees, findAction(bees, 'sting'), [1, 0]);
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'bees', actionId: 'sting', from: [1, 1], target: [1, 0] },
  ]);
  // from and target are copies.
  const event = s.events[0];
  assert.ok(event.kind === 'action');
  event.from[0] = 9;
  assert.deepEqual(bees.cells[0], [1, 1]);
});

test('a bot attack on a band emits action then damage', () => {
  const s = makeState(['..', '..'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [0, 1]] },
  ]);
  const saw = bandById(s, 'saw-0');
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 0]);
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'saw-0', actionId: 'saw', from: [0, 0], target: [1, 0] },
    { kind: 'damage', band: 'ants', amount: 2, wiped: false, cells: [[0, 1], [1, 1]] },
  ]);
});

// Bristle (opening-act spec): a bot that strikes the hedgehog takes 1 damage.

test('a bot that strikes the hedgehog takes 1 damage', () => {
  // harvester (3 cells) mows a hedgehog (2 cells) beside it
  const s = makeState(['....', '....'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0], [3, 0], [3, 1]] },
  ]);
  const harvester = bandById(s, 'harvester-0');
  resolveAction(s, harvester, findAction(harvester, 'mow'), [1, 0]);
  assert.deepEqual(bandById(s, 'hedgehog').cells, [[1, 0]]);
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[2, 0], [3, 0]]);
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [2, 0], target: [1, 0] },
    { kind: 'damage', band: 'hedgehog', amount: 1, wiped: false, cells: [[0, 0]] },
    { kind: 'damage', band: 'harvester-0', amount: 1, wiped: false, cells: [[3, 1]] },
  ]);
});

test('bristle fires for every bot strike: saw and pave too', () => {
  for (const [type, id] of [['saw', 'saw'], ['planter', 'pave']]) {
    const s = makeState(['....', '....'], [
      { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [1, 1]], maxLen: 4 },
      { id: `${type}-0`, type, cells: [[2, 0], [3, 0]] },
    ]);
    const bot = bandById(s, `${type}-0`);
    resolveAction(s, bot, findAction(bot, id), [1, 0]);
    assert.deepEqual(bandById(s, `${type}-0`).cells, [[2, 0]], type);
  }
});

test('bristle still hurts the bot when the strike wipes the hedgehog out', () => {
  const s = makeState(['....'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0]], maxLen: 2 },
    { id: 'saw-0', type: 'saw', cells: [[2, 0], [3, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  resolveAction(s, saw, findAction(saw, 'saw'), [1, 0]);
  assert.equal(bandById(s, 'hedgehog'), undefined);
  assert.deepEqual(bandById(s, 'saw-0').cells, [[2, 0]]);
  assert.deepEqual(s.events.slice(1), [
    { kind: 'damage', band: 'hedgehog', amount: 2, wiped: true, cells: [[1, 0]] },
    { kind: 'damage', band: 'saw-0', amount: 1, wiped: false, cells: [[3, 0]] },
  ]);
});

test('bristle does not fire for a bite from one of your own bands', () => {
  // The bees sting down a line through the hedgehog and into a harvester.
  const s = makeState(['.....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 2 },
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [2, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0], [4, 0]] },
  ]);
  const bees = bandById(s, 'bees');
  resolveAction(s, bees, findAction(bees, 'sting'), [1, 0]);
  assert.deepEqual(bandById(s, 'bees').cells, [[0, 0]]);
  assert.deepEqual(bandById(s, 'hedgehog').cells, [[1, 0]]);
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[3, 0]]);
  assert.deepEqual(s.events.filter((e) => e.kind === 'damage').map((e) => e.band), ['hedgehog', 'harvester-0']);

  // And the fox biting the hedgehog: the fox is not hurt.
  const t = makeState(['...'], [
    { id: 'fox', type: 'fox', cells: [[0, 0]] },
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [2, 0]] },
  ]);
  const fox = bandById(t, 'fox');
  resolveAction(t, fox, findAction(fox, 'bite'), [1, 0]);
  assert.deepEqual(bandById(t, 'fox').cells, [[0, 0]]);
  assert.deepEqual(bandById(t, 'hedgehog').cells, [[1, 0]]);
});

test('a bot strike on a band without bristle does not hurt the bot', () => {
  const s = makeState(['....'], [
    { id: 'fox', type: 'fox', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0], [3, 0]] },
  ]);
  const harvester = bandById(s, 'harvester-0');
  resolveAction(s, harvester, findAction(harvester, 'mow'), [1, 0]);
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[2, 0], [3, 0]]);
});

test('a harvester at length 1 that strikes the hedgehog is destroyed, and the plan showed it', () => {
  // A second harvester far off keeps the battle going after the first is gone.
  const s = createTestBattle(['.......', '.......', '.......'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[6, 2], [5, 2], [4, 2]] },
  ]);
  const plans = planBots(s);
  assert.deepEqual(plans['harvester-0'], { path: [], strike: [1, 0], actionId: 'mow' });
  assert.deepEqual(bandById(s, 'harvester-0').plan, plans['harvester-0']);

  // The planning run and the real turn give the same events.
  const planned = structuredClone({ ...s, events: [] });
  runBotPhase(planned);
  const n = applyMove(s, { kind: 'end' });
  const turn = n.events.filter((e) => e.kind !== 'plan');
  assert.deepEqual(turn, planned.events);
  assert.ok(turn.some((e) => e.kind === 'damage' && e.band === 'harvester-0' && e.wiped), 'harvester destroyed');
  assert.equal(bandById(n, 'harvester-0'), undefined);
  assert.equal(n.outcome, null);
  // The destroyed harvester has no plan left; the other is still planned.
  assert.ok(!n.events.some((e) => e.kind === 'plan' && e.band === 'harvester-0'));
  assert.ok(n.events.some((e) => e.kind === 'plan' && e.band === 'harvester-1'));
});
