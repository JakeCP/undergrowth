import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEngaged,
  bandInReach,
  botOrder,
  runBot,
  runBotPhase,
  planBots,
  replan,
} from '../js/engine/bots.js';
import { bandById } from '../js/engine/band.js';
import { applyMove } from '../js/engine/battle.js';
import { BAND_TYPES } from '../js/engine/units.js';
import { makeState } from './helpers.mjs';

const NOTHING = { path: [], strike: null, actionId: null };

/**
 * One bot's plan on this state (the whole turn is simulated on a copy).
 * @param {import('../js/engine/types.js').BattleState} s
 * @param {string} id
 */
function planOf(s, id) {
  return planBots(s)[id];
}

// --- The charge rule ---

test('a bot walks first, then strikes: move, action and damage events in that order', () => {
  const s = makeState(['......'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[4, 0], [5, 0]] },
  ]);
  const plans = runBotPhase(s);
  assert.deepEqual(plans, {
    'harvester-0': { path: [[2, 0], [3, 0]], strike: [4, 0], actionId: 'mow' },
  });
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[3, 0]]);
  assert.deepEqual(bandById(s, 'ants').cells, [[4, 0]]);
  assert.deepEqual(s.events, [
    { kind: 'move', band: 'harvester-0', path: [[2, 0], [3, 0]] },
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [3, 0], target: [4, 0] },
    { kind: 'damage', band: 'ants', amount: 1, wiped: false, cells: [[5, 0]] },
  ]);
});

test('bots go one at a time in level order, and a later bot acts on the board the earlier one left', () => {
  // The saw wipes the lone ant. The harvester was engaged by that ant, but
  // by its own turn the ant is gone, so it goes for the den instead.
  const s = makeState(['......H', '.......'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 1], [0, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[5, 1]] },
    { id: 'ants', type: 'ants', cells: [[3, 1]] },
  ]);
  assert.deepEqual(botOrder(s), ['saw-0', 'harvester-1']);
  assert.equal(isEngaged(s, bandById(s, 'harvester-1')), true);

  const plans = runBotPhase(s);
  assert.deepEqual(plans, {
    'saw-0': { path: [[1, 1], [2, 1]], strike: [3, 1], actionId: 'saw' },
    'harvester-1': { path: [[5, 0]], strike: [6, 0], actionId: 'mow' },
  });
  assert.equal(bandById(s, 'ants'), undefined);
  assert.equal(s.tiles[0][6].kind, 'habitatDamaged');
  assert.deepEqual(s.events.map((e) => e.kind), ['move', 'action', 'damage', 'move', 'action', 'terrain']);
});

test('planBots simulates on a copy: it leaves the state alone and matches the real turn', () => {
  const s = makeState(['......H', '.......'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 1], [0, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[5, 1]] },
    { id: 'ants', type: 'ants', cells: [[3, 1]] },
  ]);
  const before = structuredClone(s);
  const plans = planBots(s);
  assert.deepEqual(s, before);
  assert.deepEqual(plans, {
    'saw-0': { path: [[1, 1], [2, 1]], strike: [3, 1], actionId: 'saw' },
    'harvester-1': { path: [[5, 0]], strike: [6, 0], actionId: 'mow' },
  });
  assert.deepEqual(runBotPhase(s), plans);
});

test('the bots\' turn stops the moment a habitat is destroyed: later bots neither walk nor strike', () => {
  const s = makeState(['.H......', '........'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'saw-1', type: 'saw', cells: [[7, 0]] },
    { id: 'ants', type: 'ants', cells: [[5, 0]] },
  ]);
  s.tiles[0][1].kind = 'habitatDamaged';
  // Alone, the saw would walk up to the ants and strike them.
  const sawAlone = structuredClone(s);
  sawAlone.bands = sawAlone.bands.filter((b) => b.id !== 'harvester-0');
  assert.deepEqual(planOf(sawAlone, 'saw-1'), { path: [[6, 0]], strike: [5, 0], actionId: 'saw' });

  const expected = {
    'harvester-0': { path: [], strike: [1, 0], actionId: 'mow' },
    'saw-1': NOTHING,
  };
  // Planning stops at the same point, so the plans shown match the turn.
  assert.deepEqual(planBots(s), expected);
  assert.deepEqual(runBotPhase(s), expected);
  assert.equal(s.tiles[0][1].kind, 'stubble');
  assert.deepEqual(bandById(s, 'saw-1').cells, [[7, 0]]);
  assert.deepEqual(bandById(s, 'ants').cells, [[5, 0]]);
  // No events follow the habitat's.
  assert.deepEqual(s.events, [
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [0, 0], target: [1, 0] },
    { kind: 'terrain', at: [1, 0], from: 'habitatDamaged', to: 'stubble', cause: 'mow' },
  ]);
});

test('a habitat only damaged does not stop the bots\' turn', () => {
  const s = makeState(['.H......', '........'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'saw-1', type: 'saw', cells: [[7, 0]] },
    { id: 'ants', type: 'ants', cells: [[5, 0]] },
  ]);
  assert.deepEqual(runBotPhase(s), {
    'harvester-0': { path: [], strike: [1, 0], actionId: 'mow' },
    'saw-1': { path: [[6, 0]], strike: [5, 0], actionId: 'saw' },
  });
  assert.equal(s.tiles[0][1].kind, 'habitatDamaged');
});

test('once the battle is over the bots do nothing, so they plan nothing', () => {
  const s = makeState(['......'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[4, 0], [5, 0]] },
  ], { outcome: 'won' });
  assert.deepEqual(planBots(s), { 'harvester-0': NOTHING });
  assert.deepEqual(runBotPhase(s), { 'harvester-0': NOTHING });
  assert.deepEqual(s.events, []);
  // A re-plan on a finished battle clears the plans and says nothing.
  bandById(s, 'harvester-0').plan = { path: [[2, 0]], strike: [3, 0], actionId: 'mow' };
  replan(s);
  assert.deepEqual(bandById(s, 'harvester-0').plan, NOTHING);
  assert.deepEqual(s.events, []);
});

test('replan stores each bot plan on its band, clears animal plans and emits plan events', () => {
  const s = makeState(['......'], [
    { id: 'ants', type: 'ants', cells: [[4, 0], [5, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  replan(s);
  const plan = { path: [[2, 0], [3, 0]], strike: [4, 0], actionId: 'mow' };
  assert.equal(bandById(s, 'ants').plan, null);
  assert.deepEqual(bandById(s, 'harvester-0').plan, plan);
  assert.deepEqual(s.events, [{ kind: 'plan', band: 'harvester-0', plan }]);
  // The event holds its own copy.
  const event = s.events[0];
  assert.ok(event.kind === 'plan' && event.plan !== null);
  assert.notEqual(event.plan, bandById(s, 'harvester-0').plan);
  // Nothing moved: planning is a simulation.
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[1, 0]]);
  assert.deepEqual(bandById(s, 'ants').cells, [[4, 0], [5, 0]]);
});

test('runBot runs one bot and reports what it did; an unknown id does nothing', () => {
  const s = makeState(['......'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[4, 0], [5, 0]] },
  ]);
  assert.deepEqual(runBot(s, 'gone'), NOTHING);
  assert.deepEqual(runBot(s, 'ants'), NOTHING);
  assert.deepEqual(s.events, []);
  assert.deepEqual(runBot(s, 'harvester-0'), { path: [[2, 0], [3, 0]], strike: [4, 0], actionId: 'mow' });
});

test('pushing a bot moves it, and it re-plans from where it lands', () => {
  const s = makeState(['.....', '.....'], [
    { id: 'ants', type: 'ants', cells: [[1, 0]], maxLen: 6 },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'harvester-0'), { path: [], strike: [1, 0], actionId: 'mow' });
  const s1 = applyMove(s, { kind: 'act', band: 'ants', action: 'ram', target: [2, 0] });
  assert.deepEqual(bandById(s1, 'harvester-0').cells, [[3, 0]]);
  assert.deepEqual(bandById(s1, 'harvester-0').plan, { path: [[2, 0]], strike: [1, 0], actionId: 'mow' });
});

test('deterministic', () => {
  const base = makeState(['.T..P.', '......', '..T..H', '......'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[5, 1], [5, 0]] },
    { id: 'planter-0', type: 'planter', cells: [[0, 3]] },
    { id: 'ants', type: 'ants', cells: [[3, 1], [4, 1]] },
    { id: 'owl', type: 'owl', cells: [[2, 3]] },
  ]);
  const s1 = structuredClone(base);
  const s2 = structuredClone(base);
  assert.deepEqual(runBotPhase(s1), runBotPhase(s2));
  assert.deepEqual(s1, s2);
  assert.notDeepEqual(s1, base);
});

// --- Reach and engagement ---

test('reach is speed + 1 and lives on the bot type; only the saw is always engaged', () => {
  assert.equal(BAND_TYPES.harvester.reach, 3);
  assert.equal(BAND_TYPES.saw.reach, 4);
  assert.equal(BAND_TYPES.planter.reach, 3);
  for (const id of ['harvester', 'saw', 'planter']) {
    assert.equal(BAND_TYPES[id].reach, BAND_TYPES[id].speed + 1, id);
  }
  assert.equal(BAND_TYPES.saw.alwaysEngaged, true);
  assert.notEqual(BAND_TYPES.harvester.alwaysEngaged, true);
  assert.notEqual(BAND_TYPES.planter.alwaysEngaged, true);
});

test('a bot is engaged when it can walk up to a band and strike it this turn', () => {
  // Speed 2: it can stand on [2,0] and strike [3,0], but not reach [3,0] to strike [4,0].
  const near = makeState(['.......'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[3, 0]] },
  ]);
  assert.equal(isEngaged(near, bandById(near, 'harvester-0')), true);
  const far = makeState(['.......'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[4, 0]] },
  ]);
  assert.equal(isEngaged(far, bandById(far, 'harvester-0')), false);
  // Animals are never engaged.
  assert.equal(isEngaged(near, bandById(near, 'ants')), false);
});

test('a bot across a river it cannot cross is not engaged; a dam changes that', () => {
  const river = makeState(['..~..', '..~..'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[3, 1]] },
  ]);
  assert.equal(isEngaged(river, bandById(river, 'harvester-0')), false);
  const dammed = makeState(['..~..', '..=..'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[3, 1]] },
  ]);
  assert.equal(isEngaged(dammed, bandById(dammed, 'harvester-0')), true);
});

test('a band two tiles deep in forest engages nothing; one at the forest edge does', () => {
  const deep = makeState(['..TT.'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[3, 0]] },
  ]);
  assert.equal(isEngaged(deep, bandById(deep, 'harvester-0')), false);
  const edge = makeState(['..TT.'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[2, 0]] },
  ]);
  assert.equal(isEngaged(edge, bandById(edge, 'harvester-0')), true);
});

test('engagement uses ordinary movement: another band in the only lane blocks it', () => {
  const s = makeState(['....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'planter-1', type: 'planter', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[3, 0]] },
  ]);
  assert.equal(isEngaged(s, bandById(s, 'harvester-0')), false);
  assert.equal(isEngaged(s, bandById(s, 'planter-1')), true);
});

test('saw-drones are always engaged, but only in reach when they can strike this turn', () => {
  const s = makeState(['.........'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[8, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  assert.equal(isEngaged(s, saw), true);
  assert.equal(bandInReach(s, saw), false);
  const none = makeState(['...'], [{ id: 'saw-0', type: 'saw', cells: [[0, 0]] }]);
  assert.equal(isEngaged(none, bandById(none, 'saw-0')), true);
});

test('a trapped band never engages a harvester or planter, and counts once it is freed', () => {
  const s = makeState(['....', '....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'planter-1', type: 'planter', cells: [[0, 1]] },
    { id: 'saw-2', type: 'saw', cells: [[3, 1]] },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 0]], trapped: true },
  ]);
  assert.equal(isEngaged(s, bandById(s, 'harvester-0')), false);
  assert.equal(isEngaged(s, bandById(s, 'planter-1')), false);
  // The saw sees it: it is the nearest band, and it is in reach.
  assert.equal(bandInReach(s, bandById(s, 'saw-2')), true);

  bandById(s, 'trapped-bear').trapped = false;
  assert.equal(isEngaged(s, bandById(s, 'harvester-0')), true);
  assert.equal(isEngaged(s, bandById(s, 'planter-1')), true);
});

test('a planter is engaged by a band anywhere but in forest', () => {
  for (const [row, engaged] of [['..#.', true], ['..T.', false], ['..=.', true], ['..H.', true], ['.._.', true], ['....', true]]) {
    const s = makeState([row], [
      { id: 'planter-0', type: 'planter', cells: [[0, 0]] },
      { id: 'ants', type: 'ants', cells: [[2, 0]] },
    ]);
    assert.equal(isEngaged(s, bandById(s, 'planter-0')), engaged, row);
  }
});

// --- Saw-drone: hunts the nearest band; strikes band, then habitat, then dam ---

test('saw walks toward the nearest band from anywhere on the map', () => {
  const s = makeState(['........'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[7, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'saw-0'), { path: [[1, 0], [2, 0], [3, 0]], strike: null, actionId: null });
});

test('saw counts a trapped band when it looks for the nearest band', () => {
  const s = makeState(['.........'], [
    { id: 'saw-0', type: 'saw', cells: [[4, 0]] },
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'trapped-bear', type: 'bear', cells: [[7, 0]], trapped: true },
  ]);
  assert.deepEqual(planOf(s, 'saw-0'), { path: [[5, 0], [6, 0]], strike: [7, 0], actionId: 'saw' });
});

test('between equally near bands a bot walks toward the one highest in TARGET_PRIORITY', () => {
  // Ants one step west, owl one step east. Position order alone (smaller x) would pick the ants.
  const s = makeState(['.....'], [
    { id: 'saw-0', type: 'saw', cells: [[2, 0]] },
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'owl', type: 'owl', cells: [[4, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'saw-0'), { path: [[3, 0]], strike: [4, 0], actionId: 'saw' });
  // A nearer band still wins over a preferred one.
  const nearer = makeState(['......'], [
    { id: 'saw-0', type: 'saw', cells: [[2, 0]] },
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'owl', type: 'owl', cells: [[5, 0]] },
  ]);
  assert.deepEqual(planOf(nearer, 'saw-0'), { path: [[1, 0]], strike: [0, 0], actionId: 'saw' });
});

test('saw strikes the adjacent band highest in TARGET_PRIORITY (owl over ants)', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1]] },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
    { id: 'owl', type: 'owl', cells: [[2, 1]] },
  ]);
  assert.deepEqual(planOf(s, 'saw-0'), { path: [], strike: [2, 1], actionId: 'saw' });
});

test('adjacent bands of the same type tie-break by direction: N, E, S, W', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1]] },
    { id: 'ants', type: 'ants', cells: [[0, 1], [0, 2], [1, 2]] },
  ]);
  // The ants are to the west and the south; south comes first.
  assert.deepEqual(planOf(s, 'saw-0'), { path: [], strike: [1, 2], actionId: 'saw' });
});

test('saw strike order: band, then habitat, then a dam as a last resort; never forest', () => {
  const band = makeState(['.H.', '=..', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1]] },
    { id: 'ants', type: 'ants', cells: [[2, 1]] },
  ]);
  assert.deepEqual(planOf(band, 'saw-0'), { path: [], strike: [2, 1], actionId: 'saw' });

  const habitat = makeState(['.H.', '=..', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1]] },
  ]);
  assert.deepEqual(planOf(habitat, 'saw-0'), { path: [], strike: [1, 0], actionId: 'saw' });

  const dam = makeState(['.T.', '=..', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1]] },
  ]);
  assert.deepEqual(planOf(dam, 'saw-0'), { path: [], strike: [0, 1], actionId: 'saw' });
  runBotPhase(dam);
  assert.equal(dam.tiles[1][0].kind, 'water');

  const forest = makeState(['.T.', '...', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1]] },
  ]);
  assert.deepEqual(planOf(forest, 'saw-0'), NOTHING);
});

test('a saw walled off from every band waits at the wall: it does not turn on the den', () => {
  const s = makeState(['..~.', '..~.', 'H.~.'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[3, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'saw-0'), { path: [], strike: null, actionId: null });
});

test('a walled-off saw walks up to the wall nearest the band', () => {
  const s = makeState(['H.....o.', '......o.', '......o.'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 2], [0, 1]] },
    { id: 'ants', type: 'ants', cells: [[7, 1]] },
  ]);
  // Three steps nearer, ties to the smaller y as ever.
  assert.deepEqual(planOf(s, 'saw-0'), { path: [[0, 1], [1, 1], [2, 1]], strike: null, actionId: null });
  const later = makeState(['H.....o.', '......o.', '......o.'], [
    { id: 'saw-0', type: 'saw', cells: [[3, 1], [3, 2]] },
    { id: 'ants', type: 'ants', cells: [[7, 1]] },
  ]);
  assert.deepEqual(planOf(later, 'saw-0'), { path: [[4, 1], [5, 1]], strike: null, actionId: null });
});


test('bots never enter forest: the saw goes around, ties by y then x', () => {
  const s = makeState(['.....', '..T..', '.....'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 1]] },
    { id: 'ants', type: 'ants', cells: [[4, 1]] },
  ]);
  const plans = runBotPhase(s);
  assert.deepEqual(plans['saw-0'], { path: [[0, 0], [1, 0], [2, 0]], strike: null, actionId: null });
  const saw = bandById(s, 'saw-0');
  assert.deepEqual(saw.cells[0], [2, 0]);
  for (const [x, y] of saw.cells) {
    assert.notEqual(s.tiles[y][x].kind, 'forest');
  }
});

// --- Harvester: dens unless engaged; strikes band, then habitat, then forest ---

test('an unengaged harvester walks to the nearest habitat and strikes it until it is destroyed', () => {
  const s = makeState(['.....H'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
  ]);
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[1, 0], [2, 0]], strike: null, actionId: null });
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[3, 0], [4, 0]], strike: [5, 0], actionId: 'mow' });
  assert.equal(s.tiles[0][5].kind, 'habitatDamaged');
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [], strike: [5, 0], actionId: 'mow' });
  assert.equal(s.tiles[0][5].kind, 'stubble');
});

test('harvester strike order: band, then habitat, then forest', () => {
  const band = makeState(['T.H', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 1]] },
  ]);
  assert.deepEqual(planOf(band, 'harvester-0'), { path: [], strike: [1, 1], actionId: 'mow' });

  const habitat = makeState(['T.H', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  assert.deepEqual(planOf(habitat, 'harvester-0'), { path: [], strike: [2, 0], actionId: 'mow' });

  const forest = makeState(['T..', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  assert.deepEqual(planOf(forest, 'harvester-0'), { path: [], strike: [0, 0], actionId: 'mow' });
});

test('engaging a harvester pulls it off the den and onto the band', () => {
  const s = makeState(['H....', '.....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[4, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'harvester-0'), { path: [[2, 0], [3, 0]], strike: [4, 0], actionId: 'mow' });
  // Out of reach, it stays on the den.
  bandById(s, 'ants').cells = [[4, 1]];
  assert.deepEqual(planOf(s, 'harvester-0'), { path: [], strike: [0, 0], actionId: 'mow' });
});

test('walled-in habitat: the harvester mows the next forest tile on its route, then walks in', () => {
  // North of the harvester is a tree that is not on the route; the tree to
  // the east is. Direction order alone would pick north.
  const s = makeState(['.....', 'TTTT.', '.THT.', '.TTT.', '.....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 2]] },
  ]);
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [], strike: [1, 2], actionId: 'mow' });
  assert.equal(s.tiles[2][1].kind, 'stubble');
  assert.equal(s.tiles[1][0].kind, 'forest');
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[1, 2]], strike: [2, 2], actionId: 'mow' });
  assert.equal(s.tiles[2][2].kind, 'habitatDamaged');
});

test('harvester judges the nearest habitat as if it could walk through forest', () => {
  // The open den is 4 steps away, the walled one 2 (counting the tree).
  const s = makeState(['H......TH'], [
    { id: 'harvester-0', type: 'harvester', cells: [[5, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'harvester-0'), { path: [[6, 0]], strike: [7, 0], actionId: 'mow' });
});

test('with no habitat standing a harvester heads for the nearest forest, ties by y then x', () => {
  const s = makeState(['..T..', '.....', '.....', '.....', '..T..'], [
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]] },
  ]);
  assert.deepEqual(planOf(s, 'harvester-0'), { path: [[2, 1]], strike: [2, 0], actionId: 'mow' });

  const s2 = makeState(['.....', '.....', 'T...T', '.....', '.....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]] },
  ]);
  assert.deepEqual(planOf(s2, 'harvester-0'), { path: [[1, 2]], strike: [0, 2], actionId: 'mow' });
});

test('a harvester does not see a trapped band: it neither strikes it nor mows the tree it stands in', () => {
  const open = makeState(['...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'trapped-bear', type: 'bear', cells: [[1, 0]], trapped: true },
  ]);
  assert.deepEqual(planOf(open, 'harvester-0'), NOTHING);
  bandById(open, 'trapped-bear').trapped = false;
  assert.deepEqual(planOf(open, 'harvester-0'), { path: [], strike: [1, 0], actionId: 'mow' });

  const tree = makeState(['T..'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'trapped-bear', type: 'bear', cells: [[0, 0]], trapped: true },
  ]);
  assert.deepEqual(planOf(tree, 'harvester-0'), NOTHING);
});

test('a bot walks around a band that blocks the short way when another route is open', () => {
  // The trapped bear sits in the direct lane. Judged by terrain alone the
  // harvester would walk up behind it and wait there for ever.
  const s = makeState(['.....H', '......'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 0]], trapped: true },
  ]);
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[1, 0], [1, 1]], strike: null, actionId: null });
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[2, 1], [3, 1]], strike: null, actionId: null });
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[3, 0], [4, 0]], strike: [5, 0], actionId: 'mow' });
});

test('a band it can strike is no obstacle: the bot keeps coming at it instead of turning for the long way round', () => {
  // The den has two sides. The ants stand on the near one, out of reach.
  // Counted as a wall they would send the harvester nine steps round the
  // stones, and a band could turn it back and forth for ever that way.
  const grid = ['.......', 'HSSSSS.', '.......'];
  const s = makeState(grid, [
    { id: 'harvester-0', type: 'harvester', cells: [[5, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0], [0, 0]] },
  ]);
  assert.equal(isEngaged(s, bandById(s, 'harvester-0')), false);
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[4, 0], [3, 0]], strike: null, actionId: null });
  // Now the ants are in reach, and holding the lane costs them.
  assert.equal(isEngaged(s, bandById(s, 'harvester-0')), true);
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[2, 0]], strike: [1, 0], actionId: 'mow' });

  // The same for a planter and a band on ground it can pave.
  const p = makeState(grid, [
    { id: 'planter-0', type: 'planter', cells: [[5, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0], [0, 0]] },
  ]);
  assert.deepEqual(runBotPhase(p)['planter-0'].path, [[4, 0], [3, 0]]);
  assert.deepEqual(runBotPhase(p)['planter-0'], { path: [[2, 0]], strike: [1, 0], actionId: 'pave' });
});

test('a band deep in the trees on a harvester\'s way in is mown up to, then struck', () => {
  // The only way to the den is the lane of trees, and the ants sit two deep in it.
  const s = makeState(['SSSSSS', '..TTTH', 'SSSSSS'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1]] },
    { id: 'ants', type: 'ants', cells: [[3, 1]] },
  ]);
  assert.equal(isEngaged(s, bandById(s, 'harvester-0')), false);
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [], strike: [2, 1], actionId: 'mow' });
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[2, 1]], strike: [3, 1], actionId: 'mow' });
  assert.equal(bandById(s, 'ants'), undefined);
});

test('when every route is blocked a bot gets as close as it can and waits', () => {
  const s = makeState(['.....H'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 0]], trapped: true },
  ]);
  assert.deepEqual(runBotPhase(s)['harvester-0'], { path: [[1, 0]], strike: null, actionId: null });
  assert.deepEqual(runBotPhase(s)['harvester-0'], NOTHING);
});

test('a hole in the only lane stops a bot: it cannot route to the den', () => {
  const s = makeState(['..o.H'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'harvester-0'), NOTHING);
});

// --- Bands on dens: a strike on a band hits the band only ---

test('a bot next to a den with a band on it strikes the band, and the den stands', () => {
  for (const type of ['harvester', 'saw', 'planter']) {
    const s = makeState(['.H.', '...'], [
      { id: 'bot', type, cells: [[0, 0]] },
      { id: 'ants', type: 'ants', cells: [[1, 0], [2, 0], [2, 1]] },
    ]);
    const plan = runBotPhase(s).bot;
    assert.deepEqual(plan.strike, [1, 0], type);
    assert.equal(s.tiles[0][1].kind, 'habitat', type);
    assert.ok(bandById(s, 'ants').cells.length < 3, type);
  }
});

test('a planter strikes an open den before one a band is shielding', () => {
  // Direction order alone would pick the den to the east, under the ants.
  const s = makeState(['H.H'], [
    { id: 'planter-0', type: 'planter', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[2, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'planter-0'), { path: [], strike: [0, 0], actionId: 'pave' });
});

test('a trapped band on a den shields it from harvesters and planters, which do not strike it; the saw does', () => {
  for (const type of ['harvester', 'planter']) {
    const s = makeState(['.H'], [
      { id: 'bot', type, cells: [[0, 0]] },
      { id: 'trapped-bear', type: 'bear', cells: [[1, 0]], trapped: true },
    ]);
    assert.deepEqual(runBotPhase(s).bot, NOTHING, type);
    assert.equal(s.tiles[0][1].kind, 'habitat', type);
  }
  const saw = makeState(['.H'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
    { id: 'trapped-bear', type: 'bear', cells: [[1, 0]], trapped: true, maxLen: 3 },
  ]);
  assert.deepEqual(runBotPhase(saw)['saw-0'], { path: [], strike: [1, 0], actionId: 'saw' });
  assert.equal(saw.tiles[0][1].kind, 'habitat');
});

test('a saw next to a dam with a band on it strikes the band, and the dam holds', () => {
  const s = makeState(['.=.', '~~~'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0], [2, 0]] },
  ]);
  assert.deepEqual(runBotPhase(s)['saw-0'], { path: [], strike: [1, 0], actionId: 'saw' });
  assert.equal(s.tiles[0][1].kind, 'dam');
  assert.equal(bandById(s, 'ants'), undefined);
});

// --- Planter: the den-breaker; strikes habitat, then band, then open ground ---

test('an unengaged planter walks to the nearest habitat, paving ground on the way', () => {
  const s = makeState(['....H'], [
    { id: 'planter-0', type: 'planter', cells: [[0, 0]] },
  ]);
  assert.deepEqual(runBotPhase(s)['planter-0'], { path: [[1, 0], [2, 0]], strike: [3, 0], actionId: 'pave' });
  assert.equal(s.tiles[0][3].kind, 'paving');
  assert.deepEqual(runBotPhase(s)['planter-0'], { path: [[3, 0]], strike: [4, 0], actionId: 'pave' });
  assert.equal(s.tiles[0][4].kind, 'habitatDamaged');
});

test('planter strikes a habitat before a band, even when engaged', () => {
  const s = makeState(['H.', '..'], [
    { id: 'planter-0', type: 'planter', cells: [[1, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 1]] },
  ]);
  assert.equal(isEngaged(s, bandById(s, 'planter-0')), true);
  assert.deepEqual(planOf(s, 'planter-0'), { path: [], strike: [0, 0], actionId: 'pave' });
});

test('an engaged planter goes for the nearest band, unless a habitat is as close or closer', () => {
  // Band 1 step away, habitat 3: the band.
  const band = makeState(['H.......'], [
    { id: 'planter-0', type: 'planter', cells: [[4, 0]] },
    { id: 'ants', type: 'ants', cells: [[6, 0], [7, 0]] },
  ]);
  assert.deepEqual(planOf(band, 'planter-0'), { path: [[5, 0]], strike: [6, 0], actionId: 'pave' });

  // Band 2 steps away, habitat 2: equally far, so the habitat.
  const tie = makeState(['H......'], [
    { id: 'planter-0', type: 'planter', cells: [[3, 0]] },
    { id: 'ants', type: 'ants', cells: [[6, 0]] },
  ]);
  assert.equal(isEngaged(tie, bandById(tie, 'planter-0')), true);
  assert.deepEqual(planOf(tie, 'planter-0'), { path: [[2, 0], [1, 0]], strike: [0, 0], actionId: 'pave' });
});

test('a planter strikes a band on open ground, stubble or paving, and leaves the tile as it was', () => {
  for (const ground of ['.', '_', '#']) {
    const s = makeState([`.${ground}.`], [
      { id: 'planter-0', type: 'planter', cells: [[0, 0]] },
      { id: 'ants', type: 'ants', cells: [[1, 0], [2, 0]] },
    ]);
    const before = s.tiles[0][1].kind;
    assert.deepEqual(runBotPhase(s)['planter-0'], { path: [], strike: [1, 0], actionId: 'pave' }, ground);
    assert.deepEqual(bandById(s, 'ants').cells, [[1, 0]], ground);
    assert.equal(s.tiles[0][1].kind, before, ground);
  }
});

test('only forest shelters a band from a planter', () => {
  const s = makeState(['.T.'], [
    { id: 'planter-0', type: 'planter', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'planter-0'), NOTHING);
});

test('a planter with no habitat it can walk to heads for open ground near uncaptured objectives', () => {
  const s = makeState(['.....P', 'TT....', 'HT....'], [
    { id: 'planter-0', type: 'planter', cells: [[0, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'planter-0'), { path: [[1, 0], [2, 0]], strike: [3, 0], actionId: 'pave' });
});

test('once a harvester has opened a lane, the planter uses it', () => {
  const s = makeState(['.....P', '_T....', 'HT....'], [
    { id: 'planter-0', type: 'planter', cells: [[0, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'planter-0'), { path: [[0, 1]], strike: [0, 2], actionId: 'pave' });
});

test('a ground strike never lands on a bot: not its own body, not another bot', () => {
  const s = makeState(['...'], [
    { id: 'planter-0', type: 'planter', cells: [[1, 0], [0, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[2, 0]] },
  ]);
  assert.deepEqual(runBotPhase(s), { 'planter-0': NOTHING, 'harvester-1': NOTHING });
  assert.deepEqual(s.events, []);
});
