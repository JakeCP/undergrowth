import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBots, runBotPhase, isEngaged, bandInReach, replan } from '../js/engine/bots.js';
import { bandById, damageBand, reachable, cellsAfter } from '../js/engine/band.js';
import { BAND_TYPES } from '../js/engine/units.js';
import { stopsShot, shotLane, shotTargets } from '../js/engine/lanes.js';
import { resolveAction, answeredByBristle } from '../js/engine/actions.js';
import { describeIntent } from '../js/ui/text.js';
import { DIR_ORDER, SHOT_DIR_ORDER, shotDirBetween } from '../js/engine/grid.js';
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

/** Checks the plans shown now against the real turn on a copy; returns the copy after its turn. */
function planIsTurn(s) {
  const plans = planBots(s);
  const real = structuredClone(s);
  assert.deepEqual(runBotPhase(real), plans);
  return real;
}

// --- Minds, and the Hunter ---

test('every bot type has a mind and no animal has one; the hunter is the saw at speed 4, four long, cutting for 3', () => {
  for (const [id, t] of Object.entries(BAND_TYPES)) assert.equal(t.mind === undefined, t.side === 'us', id);
  assert.deepEqual(['saw', 'harvester', 'planter'].map((id) => BAND_TYPES[id].mind), ['hunter', 'harvester', 'planter']);
  const h = BAND_TYPES.hunter;
  assert.deepEqual([h.mind, h.speed, h.startLen, h.maxLenCap, h.reach, h.alwaysEngaged, h.regrows], ['hunter', 4, 4, 4, 5, true, false]);
  // Its own cut: the saw's in every way but the damage, its id included, so it sounds and moves as the saw.
  assert.equal(h.actions.length, 1);
  const { damage: hunterDamage, ...hunterCut } = h.actions[0];
  const { damage: sawDamage, ...sawCut } = BAND_TYPES.saw.actions[0];
  assert.deepEqual(hunterCut, sawCut);
  assert.equal(hunterCut.id, 'saw');
  assert.deepEqual([hunterDamage, sawDamage], [3, 2]);
  for (const id of ['harvester', 'saw', 'planter']) assert.equal(BAND_TYPES[id].regrows, undefined, id);
});

test('a hunter and a saw on the same board make the same plan', () => {
  for (const type of ['saw', 'hunter']) {
    const s = makeState(['........'], [{ id: `${type}-0`, type, cells: [[1, 0], [0, 0]] }, { id: 'ants', type: 'ants', cells: [[5, 0], [6, 0]] }]);
    planIsTurn(s);
    assert.deepEqual(planOf(s, `${type}-0`), { path: [[2, 0], [3, 0], [4, 0]], strike: [5, 0], actionId: 'saw' }, type);
  }
});

test('a wounded hunter does not grow back as it walks, and its move says so; a wounded saw does', () => {
  const at = (type) => makeState(['........'], [{ id: `${type}-0`, type, cells: [[1, 0]], maxLen: 2 }, { id: 'ants', type: 'ants', cells: [[6, 0], [7, 0]] }]);
  const hunt = at('hunter');
  runBotPhase(hunt);
  assert.equal(bandById(hunt, 'hunter-0').cells.length, 1);
  assert.deepEqual(hunt.events.find((e) => e.kind === 'move').grow, [false, false, false, false]);
  const saw = at('saw');
  runBotPhase(saw);
  assert.equal(bandById(saw, 'saw-0').cells.length, 2);
  assert.equal('grow' in saw.events.find((e) => e.kind === 'move'), false, 'the old bots\' events are unchanged');
});

test('a hunter hit in the field stays short, is still engaged, and its plan matches its turn', () => {
  const s = makeState(['........'], [{ id: 'hunter-0', type: 'hunter', cells: [[1, 0], [0, 0]] }, { id: 'ants', type: 'ants', cells: [[7, 0], [6, 0]] }]);
  damageBand(s, 'hunter-0', 1);
  assert.deepEqual(bandById(s, 'hunter-0').cells, [[1, 0]]);
  assert.equal(isEngaged(s, bandById(s, 'hunter-0')), true);
  assert.notDeepEqual(planOf(s, 'hunter-0'), NOTHING);
  assert.deepEqual(planOf(s, 'hunter-0'), { path: [[2, 0], [3, 0], [4, 0], [5, 0]], strike: [6, 0], actionId: 'saw' });
  const after = planIsTurn(s);
  assert.equal(bandById(after, 'hunter-0').cells.length, 1);
});

// --- Shots, cover, and the Watchtower ---

// The tower at the west end of row 0; the ants' head six tiles east.
const lane = (row, extra = []) => makeState([row, '........'], [
  { id: 'tower-0', type: 'tower', cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [[6, 0], [7, 0], [7, 1]] }, ...extra,
]);
const struck = (s, id = 'tower-0') => planOf(s, id).strike;

test('a tower shoots the first band in its row or column, up to six tiles, for 2', () => {
  assert.deepEqual(planOf(lane('........'), 'tower-0'), { path: [], strike: [6, 0], actionId: 'shoot' });
  assert.equal(bandById(planIsTurn(lane('........')), 'ants').cells.length, 1);
  const far = makeState(['........'], [{ id: 'tower-0', type: 'tower', cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [[7, 0]] }]);
  assert.deepEqual(planOf(far, 'tower-0'), NOTHING, 'seven tiles is out of range');
});

test('the cover rule: what stops a shot and what does not', () => {
  assert.deepEqual(struck(lane('.~o=#_..')), [6, 0], 'water, a hole, a dam, paving and stubble do not');
  for (const row of ['...T....', '...S....', '...H....']) assert.equal(struck(lane(row)), null, row);
  assert.equal(struck(lane('......T.')), null, 'a band on a forest tile is safe in its own tree');
  assert.equal(struck(lane('........', [{ id: 'harvester-1', type: 'harvester', cells: [[3, 0]] }])), null, 'a bot is cover');
  assert.equal(struck(lane('........', [{ id: 'trapped-fox', type: 'fox', cells: [[3, 0]], trapped: true }])), null, 'a trapped band is cover, never hit');
  const shield = makeState(['........', '........'], [
    { id: 'tower-0', type: 'tower', cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [[3, 0], [3, 1]] }, { id: 'hedgehog', type: 'hedgehog', cells: [[6, 0], [7, 0]] },
  ]);
  assert.deepEqual(struck(shield), [3, 0], 'the first body, not the higher priority behind it');
});

test('a shot hits bands only, and is never answered by bristle, even from the next tile', () => {
  const real = planIsTurn(makeState(['........', 'H.......'], [{ id: 'tower-0', type: 'tower', cells: [[0, 0]] }, { id: 'hedgehog', type: 'hedgehog', cells: [[1, 0], [2, 0]] }]));
  assert.equal(bandById(real, 'hedgehog'), undefined);
  assert.equal(bandById(real, 'tower-0').cells.length, 1);
  assert.equal(real.events.some((e) => e.kind === 'terrain'), false);
});

test('a tower picks by target priority, then the nearest, then N, E, S, W', () => {
  const at = (...bands) => struck(makeState(Array(8).fill('........'), [{ id: 'tower-0', type: 'tower', cells: [[3, 3]] }, ...bands]));
  const ants = (id, cells) => ({ id, type: 'ants', cells });
  assert.deepEqual(at(ants('ants', [[4, 3], [5, 3]]), { id: 'hedgehog', type: 'hedgehog', cells: [[3, 6], [3, 7]] }), [3, 6]);
  assert.deepEqual(at(ants('ants', [[3, 0], [2, 0]]), ants('ants-b', [[1, 3], [0, 3]])), [1, 3]);
  assert.deepEqual(at(ants('ants', [[3, 1], [3, 0]]), ants('ants-b', [[1, 3], [0, 3]])), [3, 1]);
});

test('the plan already counts a bot that walks into the lane earlier in the same turn', () => {
  // The harvester goes first, walks to (4,0) to strike the ants, and so stands in the tower's lane.
  const s = makeState(['........', '........'], [
    { id: 'harvester-0', type: 'harvester', cells: [[3, 1]] }, { id: 'tower-1', type: 'tower', cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [[5, 0], [6, 0], [7, 0]] },
  ]);
  assert.deepEqual(planOf(s, 'tower-1'), NOTHING);
  const real = planIsTurn(s);
  assert.deepEqual(bandById(real, 'harvester-0').cells, [[4, 0]]);
  assert.equal(bandById(real, 'ants').cells.length, 2, 'only the harvester\'s strike landed');
});

test('engagement: a tower is engaged exactly when it can hit a band; walled in, it does nothing', () => {
  const open = lane('........');
  const covered = lane('...T....');
  assert.equal(isEngaged(open, bandById(open, 'tower-0')), true);
  assert.equal(isEngaged(covered, bandById(covered, 'tower-0')), false);
  const walled = makeState(['.S......', 'S.S.....', '.S......'], [{ id: 'tower-0', type: 'tower', cells: [[1, 1]] }, { id: 'ants', type: 'ants', cells: [[5, 1], [6, 1]] }]);
  assert.deepEqual(planOf(walled, 'tower-0'), NOTHING);
  assert.equal(isEngaged(walled, bandById(walled, 'tower-0')), false);
  assert.equal(bandById(planIsTurn(walled), 'ants').cells.length, 2);
});

test('the plan line promises the spines only for a contact strike', () => {
  const said = (bot, at) => { const s = makeState(['........', '........'], [bot, { id: 'hedgehog', type: 'hedgehog', cells: [at, [at[0] + 1, 0]] }]); replan(s); return describeIntent(s, bandById(s, bot.id)); };
  assert.equal(said({ id: 'tower-0', type: 'tower', cells: [[0, 0]] }, [3, 0]), 'Watchtower will hit Hedgehog to the east');
  assert.equal(said({ id: 'saw-0', type: 'saw', cells: [[0, 0], [0, 1]] }, [1, 0]), 'Saw-drone will hit Hedgehog to the east, and lose 1 to its spines');
});

test('the lane itself: off the board, out of range, too near, and the shooter\'s own body', () => {
  const shoot = BAND_TYPES.tower.actions[0];
  const s = makeState(['........', '........'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 0], [0, 0]] }, { id: 'ants', type: 'ants', cells: [[2, 0], [3, 0]] },
  ]);
  const saw = bandById(s, 'saw-0');
  assert.deepEqual(shotLane(s, saw, shoot, 'N'), { stop: null, hit: null }, 'off the board');
  assert.deepEqual(shotLane(s, saw, shoot, 'W'), { stop: [0, 0], hit: null }, 'its own body stops the shot');
  assert.deepEqual(shotLane(s, saw, shoot, 'E'), { stop: [2, 0], hit: [2, 0] });
  assert.deepEqual(shotLane(s, saw, { ...shoot, minRange: 2 }, 'E'), { stop: [2, 0], hit: null }, 'too near: a stop, not a hit');
  assert.deepEqual(shotLane(s, saw, { ...shoot, maxRange: 0 }, 'E'), { stop: null, hit: null }, 'runs out of range before the ants');
  assert.deepEqual(shotTargets(s, saw, shoot), [{ at: [2, 0], dir: 'E', dist: 1 }]);
  const kinds = ['open', 'water', 'hole', 'dam', 'paving', 'stubble', 'forest', 'stones', 'habitat', 'habitatDamaged'];
  assert.deepEqual(kinds.filter((kind) => stopsShot({ kind, variant: null, under: null })), ['forest', 'stones', 'habitat', 'habitatDamaged']);
});

test('a shot resolves only on the lane\'s hit: a target behind cover is not damaged', () => {
  const s = makeState(['...T....'], [{ id: 'tower-0', type: 'tower', cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [[5, 0], [6, 0]] }]);
  resolveAction(s, bandById(s, 'tower-0'), BAND_TYPES.tower.actions[0], [5, 0]);
  assert.equal(bandById(s, 'ants').cells.length, 2);
  assert.deepEqual(s.events.map((e) => e.kind), ['action']);
  assert.deepEqual(['attack', 'dig', 'build', 'mow', 'saw', 'pave', 'shot'].filter(answeredByBristle), ['mow', 'saw', 'pave']);
});

// --- The Beacon, and the four diagonals ---

test('shot directions: the four, then the diagonals; walking stays four-way', () => {
  assert.deepEqual(SHOT_DIR_ORDER, ['N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW']);
  assert.deepEqual(DIR_ORDER, ['N', 'E', 'S', 'W']);
  assert.deepEqual([shotDirBetween([0, 0], [3, 3]), shotDirBetween([2, 2], [0, 0]), shotDirBetween([0, 0], [0, 4]), shotDirBetween([0, 0], [2, 1])], ['SE', 'NW', 'S', null]);
});

test('a beacon shoots along a diagonal up to three tiles, and corner-to-corner stones do not close it; a tower never shoots diagonally', () => {
  const at = (type, head, grid = Array(8).fill('........')) => struck(makeState(grid, [{ id: `${type}-0`, type, cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [head, [head[0] + 1, head[1]]] }]), `${type}-0`);
  assert.deepEqual(at('beacon', [3, 3]), [3, 3]);
  assert.equal(at('beacon', [4, 4]), null);
  assert.equal(at('tower', [2, 2]), null);
  assert.deepEqual(at('beacon', [2, 2], ['.S......', 'S.......', '........']), [2, 2]);
  assert.equal(at('beacon', [2, 2], ['........', '.T......', '........']), null);
});

test('a beacon tries N, E, S, W before the diagonals, then NE, SE, SW, NW, and names the diagonal', () => {
  const at = (a, b) => struck(makeState(Array(8).fill('........'), [{ id: 'beacon-0', type: 'beacon', cells: [[3, 3]] }, { id: 'ants', type: 'ants', cells: a }, { id: 'ants-b', type: 'ants', cells: b }]), 'beacon-0');
  assert.deepEqual(at([[2, 3], [1, 3]], [[4, 2], [5, 2]]), [2, 3], 'W before NE');
  assert.deepEqual(at([[4, 4], [5, 4]], [[4, 2], [5, 2]]), [4, 2], 'NE before SE');
  const s = makeState(Array(4).fill('........'), [{ id: 'beacon-0', type: 'beacon', cells: [[0, 3]] }, { id: 'ants', type: 'ants', cells: [[2, 1], [3, 1]] }]);
  replan(s);
  assert.equal(describeIntent(s, bandById(s, 'beacon-0')), 'Beacon will hit Ants to the north-east');
});

test('a beacon\'s diagonal shot wounds the band its plan shows', () => {
  const s = makeState(Array(4).fill('........'), [{ id: 'beacon-0', type: 'beacon', cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [[2, 2], [3, 2], [4, 2]] }]);
  assert.deepEqual(planOf(s, 'beacon-0'), { path: [], strike: [2, 2], actionId: 'shoot' });
  const real = planIsTurn(s);
  assert.equal(bandById(real, 'ants').cells.length, 1, 'the diagonal shot dealt its 2');
  const direct = makeState(Array(4).fill('........'), [{ id: 'beacon-0', type: 'beacon', cells: [[3, 3]] }, { id: 'ants', type: 'ants', cells: [[1, 1], [0, 1], [0, 0]] }]);
  resolveAction(direct, bandById(direct, 'beacon-0'), BAND_TYPES.beacon.actions[0], [1, 1]);
  assert.equal(bandById(direct, 'ants').cells.length, 1, 'resolved along the NW lane');
});

test('a diagonal step counts as one: two diagonal steps are nearer than three straight ones', () => {
  const s = makeState(Array(8).fill('........'), [
    { id: 'beacon-0', type: 'beacon', cells: [[3, 3]] }, { id: 'ants', type: 'ants', cells: [[3, 0], [2, 0]] }, { id: 'ants-b', type: 'ants', cells: [[5, 5], [6, 5]] },
  ]);
  assert.deepEqual(shotTargets(s, bandById(s, 'beacon-0'), BAND_TYPES.beacon.actions[0]), [{ at: [3, 0], dir: 'N', dist: 3 }, { at: [5, 5], dir: 'SE', dist: 2 }]);
  assert.deepEqual(struck(s, 'beacon-0'), [5, 5]);
});

test('a shot along a direction its shooter does not have wounds nobody: a tower resolving a diagonal target', () => {
  const s = makeState(Array(4).fill('........'), [{ id: 'tower-0', type: 'tower', cells: [[0, 0]] }, { id: 'ants', type: 'ants', cells: [[2, 2], [3, 2], [4, 2]] }]);
  resolveAction(s, bandById(s, 'tower-0'), BAND_TYPES.tower.actions[0], [2, 2]);
  assert.equal(bandById(s, 'ants').cells.length, 3);
  assert.equal(s.events.some((e) => e.kind === 'damage'), false);
});

// --- The Crane ---

const crane = { id: 'crane-0', type: 'crane', cells: [[2, 0], [1, 0], [0, 0]] };
const ants = (...cells) => ({ id: 'ants', type: 'ants', cells });

test('a crane strikes exactly two tiles away in a clear row, for 3, and never the tile next to it', () => {
  const two = makeState(['........'], [crane, ants([4, 0], [5, 0], [6, 0], [7, 0])]);
  assert.deepEqual(planOf(two, 'crane-0'), { path: [], strike: [4, 0], actionId: 'swing' });
  assert.equal(bandById(planIsTurn(two), 'ants').cells.length, 1);
  const one = makeState(['........'], [crane, ants([3, 0], [4, 0])]);
  assert.equal(struck(one, 'crane-0'), null);
  assert.equal(bandById(planIsTurn(one), 'ants').cells.length, 2);
});

test('a band on the tile between, or the crane\'s own neck, stops its shot', () => {
  const between = makeState(['........', '........'], [crane, { id: 'fox', type: 'fox', cells: [[3, 0], [3, 1]] }, ants([4, 0], [5, 0])]);
  assert.equal(struck(between, 'crane-0'), null);
  assert.equal(planIsTurn(between).events.some((e) => e.kind === 'damage'), false);
  const neck = makeState(Array(3).fill('........'), [{ id: 'crane-0', type: 'crane', cells: [[2, 2], [2, 1], [3, 1]] }, { id: 'fox', type: 'fox', cells: [[2, 0], [1, 0]] }]);
  assert.deepEqual(shotLane(neck, bandById(neck, 'crane-0'), BAND_TYPES.crane.actions[0], 'N'), { stop: [2, 1], hit: null });
});

test('a crane that can hit a band from where it stands swings and does not walk', () => {
  for (const rules of [{}, { snakeBodies: true }]) {
    const s = makeState(['........', '........'], [crane, ants([4, 0], [5, 0], [6, 0])], { rules });
    assert.equal(isEngaged(s, bandById(s, 'crane-0')), true);
    assert.deepEqual(planOf(s, 'crane-0'), { path: [], strike: [4, 0], actionId: 'swing' });
    const after = planIsTurn(s);
    assert.deepEqual(bandById(after, 'crane-0').cells, crane.cells);
    assert.equal(bandById(after, 'ants'), undefined, 'a swing of 3 wipes a band three long');
  }
});

test('a crane with a band three away walks one tile and does not swing; the next turn, the band still there, it swings', () => {
  for (const rules of [{}, { snakeBodies: true }]) {
    const s = makeState(['........', '........'], [crane, ants([5, 0], [6, 0], [7, 0])], { rules });
    assert.equal(isEngaged(s, bandById(s, 'crane-0')), false);
    assert.deepEqual(planOf(s, 'crane-0'), { path: [[3, 0]], strike: null, actionId: null });
    const next = planIsTurn(s);
    assert.deepEqual(bandById(next, 'ants').cells, [[5, 0], [6, 0], [7, 0]], 'the band is unharmed after the walk');
    assert.equal(next.events.some((e) => e.kind === 'action' || e.kind === 'damage'), false);
    assert.equal(isEngaged(next, bandById(next, 'crane-0')), true);
    next.events = [];
    assert.deepEqual(planOf(next, 'crane-0'), { path: [], strike: [5, 0], actionId: 'swing' });
    const last = planIsTurn(next);
    assert.deepEqual(bandById(last, 'crane-0').cells, [[3, 0], [2, 0], [1, 0]]);
    assert.equal(bandById(last, 'ants'), undefined);
  }
});

test('a crane whose lane another bot opens earlier in the same bots\' turn swings without walking, and its plan says so', () => {
  // crane-a, wounded to two, has its neck on (4,1), between crane-b and the ants.
  // It cannot hit, so it walks east; that frees (4,1), and crane-b, next in order, swings north.
  for (const rules of [{}, { snakeBodies: true }]) {
    const s = makeState(Array(5).fill('........'), [
      { id: 'crane-a', type: 'crane', cells: [[5, 1], [4, 1]], maxLen: 3 },
      { id: 'crane-b', type: 'crane', cells: [[4, 2], [4, 3], [4, 4]] },
      ants([4, 0]),
    ], { rules });
    assert.equal(isEngaged(s, bandById(s, 'crane-a')), false);
    assert.equal(isEngaged(s, bandById(s, 'crane-b')), false, 'the mark is read from where it stands now');
    const plans = planBots(s);
    assert.deepEqual(plans['crane-a'], { path: [[6, 1]], strike: null, actionId: null });
    assert.deepEqual(plans['crane-b'], { path: [], strike: [4, 0], actionId: 'swing' });
    const after = planIsTurn(s);
    assert.equal(bandById(after, 'ants'), undefined);
    assert.deepEqual(bandById(after, 'crane-b').cells, [[4, 2], [4, 3], [4, 4]]);
  }
});

test('a crane walks toward a firing tile however many turns it takes, engaged only when it can strike from where it stands', () => {
  const s = makeState(['........', '........'], [crane, ants([7, 0], [7, 1])]);
  const head = () => bandById(s, 'crane-0').cells[0];
  const engaged = () => isEngaged(s, bandById(s, 'crane-0'));
  for (const expected of [[3, 0], [4, 0], [5, 0]]) {
    assert.equal(engaged(), false);
    const plans = planBots(s);
    assert.deepEqual(runBotPhase(s), plans);
    assert.deepEqual([head(), plans['crane-0'].strike, bandById(s, 'ants').cells.length], [expected, null, 2]);
  }
  assert.equal(engaged(), true);
  assert.deepEqual(planOf(s, 'crane-0'), { path: [], strike: [7, 0], actionId: 'swing' });
  runBotPhase(s);
  assert.equal(bandById(s, 'ants'), undefined);
});

test('under snake bodies, a crane facing away from the band turns round its own neck instead of standing still', () => {
  // Its one firing tile, (5,1), lies behind it; the shortest way there is
  // over its own neck and tail, which it may not step back onto.
  const at = (rules) => makeState(Array(3).fill('........'), [{ id: 'crane-0', type: 'crane', cells: [[2, 1], [3, 1], [4, 1]] }, ants([7, 1])], { rules });
  const walks = (plans) => plans.map((p) => p.path);
  assert.deepEqual(walks(craneTurns(at({}), 8)), [[[3, 1]], [[4, 1]], [[5, 1]], []]);
  const snake = craneTurns(at({ snakeBodies: true }), 8);
  assert.deepEqual(walks(snake), [[[2, 0]], [[3, 0]], [[4, 0]], [[5, 0]], [[5, 1]], []]);
  assert.deepEqual(snake.at(-1).strike, [7, 1]);
});

test('a crane that cannot reach any firing tile stays where it is', () => {
  const s = makeState(['SSSSS...', 'S...S...', 'SSSSS...'], [{ id: 'crane-0', type: 'crane', cells: [[3, 1], [2, 1], [1, 1]] }, ants([7, 2], [7, 1])]);
  assert.deepEqual(planOf(s, 'crane-0'), NOTHING);
  assert.equal(isEngaged(s, bandById(s, 'crane-0')), false);
});

/**
 * Runs up to `n` bots' turns on `s`, each checked against the plans shown
 * before it, and returns the crane's plans, stopping after its first strike.
 * Each turn the crane walks or swings, never both, and (being the only bot)
 * it is engaged exactly when it swings.
 * @param {import('../js/engine/types.js').BattleState} s
 * @param {number} n
 */
function craneTurns(s, n) {
  const plans = [];
  for (let t = 0; t < n; t += 1) {
    const shown = planBots(s);
    const engaged = isEngaged(s, bandById(s, 'crane-0'));
    assert.deepEqual(runBotPhase(s), shown);
    const plan = shown['crane-0'];
    assert.equal(plan.path.length > 0 && plan.strike !== null, false, 'it walks or swings, never both');
    assert.equal(engaged, plan.strike !== null, 'a lone crane is engaged exactly on the turns it swings');
    plans.push(plan);
    if (shown['crane-0'].strike !== null) break;
  }
  return plans;
}

test('a crane beside a band walks round, not through the tiles beside it, and strikes', () => {
  // It used to route through the tile between its firing tile and the
  // ants, spoil that firing tile with its own neck, and pace for ever.
  const s = makeState(Array(3).fill('........'), [{ id: 'crane-0', type: 'crane', cells: [[3, 0], [2, 0], [1, 0]] }, ants([4, 0], [5, 0])]);
  assert.deepEqual(craneTurns(s, 6), [
    { path: [[3, 1]], strike: null, actionId: null },
    { path: [[3, 2]], strike: null, actionId: null },
    { path: [[4, 2]], strike: null, actionId: null },
    { path: [], strike: [4, 0], actionId: 'swing' },
  ]);
  assert.equal(bandById(s, 'ants'), undefined, 'the fourth turn\'s swing dealt its 3');
});

test('a crane whose only way to a firing tile is beside the band stays put', () => {
  // The one firing tile, (5,2), opens only onto (5,1), the tile beside the ants.
  const s = makeState(['SSSS..SS', '........', 'SSSSS.SS'], [{ id: 'crane-0', type: 'crane', cells: [[2, 1], [1, 1], [0, 1]] }, ants([4, 0], [5, 0])]);
  assert.deepEqual(craneTurns(s, 4), [NOTHING, NOTHING, NOTHING, NOTHING]);
  assert.deepEqual(bandById(s, 'crane-0').cells, [[2, 1], [1, 1], [0, 1]]);
  assert.equal(isEngaged(s, bandById(s, 'crane-0')), false);
});

test('a crane beside a band does not step straight back, where its own neck would block its lane', () => {
  // Stepping back from (3,1) to (2,1) leaves the neck on (3,1), between the crane and the ants.
  const s = makeState(Array(5).fill('........'), [{ id: 'crane-0', type: 'crane', cells: [[3, 1], [3, 2], [3, 3]] }, ants([4, 1])]);
  const plans = craneTurns(s, 6);
  assert.notDeepEqual(plans[0].path, [[2, 1]]);
  assert.deepEqual(plans.slice(-2), [
    { path: [[4, 3]], strike: null, actionId: null },
    { path: [], strike: [4, 1], actionId: 'swing' },
  ]);
  assert.equal(bandById(s, 'ants'), undefined);
});

test('a wounded shooter that regrew would keep its tail in its own lane, and its engaged mark and plan both see that', () => {
  // No shipped shooter regrows, so the case uses a copy of the crane with
  // `regrows` left to its default. Wounded (3 of 4), it cannot hit from
  // (1,0), so it steps east to (2,0) and does not swing. Growing, it keeps
  // its tail on (2,1), between it and the ants on (2,2), so the next turn
  // it still cannot swing; the crane that does not grow back can.
  const { regrows, ...craneEntry } = BAND_TYPES.crane;
  assert.equal(regrows, false);
  BAND_TYPES['crane-regrows'] = { ...craneEntry, id: 'crane-regrows' };
  try {
    const grid = ['........', '........', 'S.......', 'S.......', '..S.....', '........'];
    const at = (type) => makeState(grid, [{ id: 'c', type, cells: [[1, 0], [1, 1], [2, 1]], maxLen: 4 }, ants([2, 2], [2, 3])]);
    for (const [type, strike, cells] of [
      ['crane', [2, 2], [[2, 0], [1, 0], [1, 1]]],
      ['crane-regrows', null, [[2, 0], [1, 0], [1, 1], [2, 1]]],
    ]) {
      const s = at(type);
      assert.equal(isEngaged(s, bandById(s, 'c')), false, type);
      assert.deepEqual(planOf(s, 'c'), { path: [[2, 0]], strike: null, actionId: null }, type);
      const next = planIsTurn(s);
      assert.deepEqual(bandById(next, 'c').cells, cells, type);
      assert.equal(isEngaged(next, bandById(next, 'c')), strike !== null, type);
      assert.deepEqual(planOf(next, 'c').strike, strike, type);
      planIsTurn(next);
    }
  } finally {
    delete BAND_TYPES['crane-regrows'];
  }
});

test('on 300 seeded boards with stones, snake bodies on and off, a crane that walks always swings within 30 turns', () => {
  let seed = 7;
  const random = () => {
    // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (n) => Math.floor(random() * n);
  let boards = 0;
  let movers = 0;
  while (boards < 300) {
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => (random() < 1 / 8 ? 'S' : '.')));
    const used = new Set();
    const open = ([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 8 && grid[y][x] === '.' && !used.has(`${x},${y}`);
    // A random band of `len` cells on open ground, or null.
    const snake = (len) => {
      const cells = [[pick(8), pick(8)]];
      if (!open(cells[0])) return null;
      used.add(cells[0].join());
      while (cells.length < len) {
        const [x, y] = cells.at(-1);
        const next = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]].filter(open);
        if (next.length === 0) return null;
        cells.push(next[pick(next.length)]);
        used.add(cells.at(-1).join());
      }
      return cells;
    };
    const craneCells = snake(3);
    const antCells = craneCells === null ? null : snake(2 + pick(3));
    if (antCells === null) continue;
    boards += 1;
    const rows = grid.map((row) => row.join(''));
    const rules = boards % 2 === 0 ? { snakeBodies: true } : {};
    const s = makeState(rows, [{ id: 'crane-0', type: 'crane', cells: craneCells }, { id: 'ants', type: 'ants', cells: antCells }], { rules });
    const plans = craneTurns(s, 30);
    const moved = plans.some((p) => p.path.length > 0);
    if (moved) movers += 1;
    const strikes = plans.at(-1).strike !== null;
    assert.ok(strikes || !moved, `walked but never swung: ${JSON.stringify({ rows, craneCells, antCells, rules })}`);
    // A swing comes after the walk, on a turn of its own, from where the walk ended.
    if (moved && strikes) assert.deepEqual(plans.at(-1).path, []);
  }
  assert.ok(movers > 250, `most cranes have somewhere to go (${movers})`);
});

// --- The Coil ---

// A coil of eight wrapped round the post at (2,2), head at (1,1).
const RING = [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]];
const POST = ['........', '........', '..P.....', ...Array(5).fill('........')];
const coiled = (antsCells) => makeState(POST, [{ id: 'coil-0', type: 'coil', cells: RING }, { id: 'ants', type: 'ants', cells: antsCells }]);

test('a coil lies still until a band is in reach, then hunts it: the post opens, its length holds, and it does not go home', () => {
  assert.deepEqual(planOf(coiled([[7, 7], [7, 6]]), 'coil-0'), NOTHING);
  // Ants three long, so the squeeze for two leaves one.
  const real = planIsTurn(coiled([[5, 1], [6, 1], [7, 1]]));
  const coil = bandById(real, 'coil-0');
  assert.equal(coil.cells.length, 8);
  assert.equal(bandById(real, 'ants').cells.length, 1);
  assert.equal([[2, 1], [3, 2], [2, 3], [1, 2]].some((p) => !coil.cells.some((c) => c[0] === p[0] && c[1] === p[1])), true);
  bandById(real, 'ants').cells = [[7, 7], [7, 6]];
  assert.deepEqual(planOf(real, 'coil-0'), NOTHING);
});

test('a bitten coil stays bitten as it walks', () => {
  const s = coiled([[5, 1], [6, 1]]);
  damageBand(s, 'coil-0', 2);
  runBotPhase(s);
  assert.equal(bandById(s, 'coil-0').cells.length, 6);
});

test('a coil whose head is boxed in by its own body walks out over itself', () => {
  const s = makeState(['SSSS....', 'S..S....', 'S.......', 'SSSS....'], [{ id: 'coil-0', type: 'coil', cells: [[1, 1], [2, 1], [2, 2], [1, 2]] }, { id: 'ants', type: 'ants', cells: [[4, 2], [5, 2], [6, 2]] }]);
  const real = planIsTurn(s);
  assert.deepEqual([bandById(real, 'coil-0').cells.length, bandById(real, 'ants').cells.length], [4, 1]);
});

test('the squeeze takes two from a band, hits bands only, and the hedgehog\'s spines answer it', () => {
  const s = makeState(['H.......', '........'], [{ id: 'coil-0', type: 'coil', cells: [[1, 0], [1, 1]] }, { id: 'hedgehog', type: 'hedgehog', cells: [[2, 0], [3, 0], [4, 0]] }]);
  resolveAction(s, bandById(s, 'coil-0'), BAND_TYPES.coil.actions[0], [0, 0]);
  assert.equal(s.tiles[0][0].kind, 'habitat');
  resolveAction(s, bandById(s, 'coil-0'), BAND_TYPES.coil.actions[0], [2, 0]);
  assert.deepEqual([bandById(s, 'hedgehog').cells.length, bandById(s, 'coil-0').cells.length], [1, 1]);
  assert.equal(s.events.some((e) => e.kind === 'terrain'), false);
  // A hedgehog at its starting two is wiped by one squeeze, and its spines still answer.
  const t = makeState(['........', '........'], [{ id: 'coil-0', type: 'coil', cells: [[1, 0], [1, 1]] }, { id: 'hedgehog', type: 'hedgehog', cells: [[2, 0], [3, 0]] }]);
  resolveAction(t, bandById(t, 'coil-0'), BAND_TYPES.coil.actions[0], [2, 0]);
  assert.deepEqual([bandById(t, 'hedgehog'), bandById(t, 'coil-0').cells.length], [undefined, 1]);
});

test('the coil is the squeeze at speed 4, nine long, and its wounds stay; the crush is answered by bristle', () => {
  const c = BAND_TYPES.coil;
  assert.deepEqual([c.mind, c.speed, c.startLen, c.reach, c.alwaysEngaged, c.regrows], ['coil', 4, 9, 5, undefined, false]);
  assert.equal(answeredByBristle('crush'), true);
});

test('on 300 seeded boards with stones and wandering bands, a coil of nine moves only with a band in reach, never grows, and its plan is its turn', () => {
  let seed = 11;
  const random = () => {
    // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (n) => Math.floor(random() * n);
  let boards = 0;
  let stillTurns = 0;
  let huntTurns = 0;
  while (boards < 300) {
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => (random() < 1 / 8 ? 'S' : '.')));
    const used = new Set();
    const open = ([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 8 && grid[y][x] === '.' && !used.has(`${x},${y}`);
    // A random body of `len` cells on open ground, or null.
    const snake = (len) => {
      const cells = [[pick(8), pick(8)]];
      if (!open(cells[0])) return null;
      used.add(cells[0].join());
      while (cells.length < len) {
        const [x, y] = cells.at(-1);
        const next = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]].filter(open);
        if (next.length === 0) return null;
        cells.push(next[pick(next.length)]);
        used.add(cells.at(-1).join());
      }
      return cells;
    };
    const coilCells = snake(9);
    if (coilCells === null) continue;
    const bands = [{ id: 'coil-0', type: 'coil', cells: coilCells }];
    const wanted = 1 + pick(2);
    for (let i = 0; i < wanted; i += 1) {
      const type = ['ants', 'hedgehog', 'fox'][pick(3)];
      const cells = snake(type === 'ants' ? 4 : 2);
      if (cells !== null) bands.push({ id: `${type}-${i}`, type, cells });
    }
    if (bands.length === 1) continue;
    boards += 1;
    const rows = grid.map((row) => row.join(''));
    const s = makeState(rows, bands);
    const where = JSON.stringify({ rows, bands });
    for (let turn = 0; turn < 12; turn += 1) {
      const coil = bandById(s, 'coil-0');
      if (coil === undefined || s.bands.every((b) => b.side === 'bots')) break;
      const before = coil.cells.map((c) => [c[0], c[1]]);
      const inReach = bandInReach(s, coil);
      const shown = planBots(s);
      assert.deepEqual(runBotPhase(s), shown, where);
      const after = bandById(s, 'coil-0');
      if (after !== undefined) assert.ok(after.cells.length <= before.length, `the coil grew: ${where}`);
      if (inReach) {
        // In reach means it can walk up and strike this turn, and it does.
        huntTurns += 1;
        assert.notEqual(shown['coil-0'].strike, null, where);
      } else {
        stillTurns += 1;
        assert.deepEqual(shown['coil-0'], NOTHING, where);
        assert.deepEqual(after.cells, before, `a coil with no band in reach moved: ${where}`);
      }
      // The animals wander: each walks somewhere it may, at random, or stays.
      for (const band of s.bands) {
        if (band.side !== 'us') continue;
        const paths = [...reachable(s, band.id).values()];
        const choice = pick(paths.length + 1);
        if (choice < paths.length) band.cells = cellsAfter(s, band, paths[choice]);
      }
    }
  }
  assert.ok(stillTurns > 400 && huntTurns > 400, JSON.stringify({ stillTurns, huntTurns }));
});
