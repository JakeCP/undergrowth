// The earthworks trial rules (js/engine/works.js): the beaver's Gnaw brings
// a whole bridge down, the bear's Shove moves stones, and the badger fills
// holes and digs away earth banks. Each is off unless a level turns it on,
// and with it off the band plays exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, TRIAL_RULE_IDS, parseGrid } from '../js/engine/battle.js';
import { actionTargets } from '../js/engine/actions.js';
import { bandById, reachable } from '../js/engine/band.js';
import { actionsFor } from '../js/engine/units.js';
import { canEnter, LEGEND, TERRAIN } from '../js/engine/terrain.js';
import { bridgeAt } from '../js/engine/works.js';
import { stopsShot } from '../js/engine/lanes.js';
import { makeState } from './helpers.mjs';

/** @typedef {import('../js/engine/types.js').Pos} Pos */
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */

/**
 * @param {string[]} grid
 * @param {object[]} bands
 * @param {import('../js/engine/types.js').Rules} [rules]
 * @returns {BattleState}
 */
function state(grid, bands, rules = {}) {
  return makeState(grid, /** @type {any} */ (bands), { rules });
}

/**
 * @param {BattleState} s
 * @param {string} bandId
 * @param {string} actionId
 * @returns {string[]}
 */
function targets(s, bandId, actionId) {
  return actionTargets(s, bandId, actionId).map((p) => p.join(',')).sort();
}

/**
 * @param {BattleState} s
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
function kindAt(s, x, y) {
  return s.tiles[y][x].kind;
}

test('the three earthworks rules are trial rules', () => {
  for (const id of ['beaverGnaw', 'bearShovesStones', 'badgerEarthworks']) assert.ok(TRIAL_RULE_IDS.includes(id), id);
});

// ---------------------------------------------------------------- gnaw

// A bridge of five dams: (2,1) to (5,1) and (2,2) below its west end. The
// dam at (6,2) touches it only at a corner, so it is a bridge of its own.
const RIVER = [
  '........',
  '~~====~~',
  '~~=~~~=~',
  '........',
];

const beaver = (cells = [[2, 0], [1, 0], [0, 0]]) => ({ id: 'beaver', type: 'beaver', cells });
const GNAW = { beaverGnaw: true };

test('beaverGnaw off: the beaver has only Build, and a gnaw is no move', () => {
  const s = state(RIVER, [beaver()]);
  assert.deepEqual(actionsFor('beaver', 3, s.rules).map((a) => a.id), ['build']);
  assert.deepEqual(actionTargets(s, 'beaver', 'gnaw'), []);
  assert.throws(() => applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] }), /cannot use action "gnaw"/);
});

test('beaverGnaw on: Gnaw is listed after Build and aims at a dam next to the head', () => {
  const s = state(RIVER, [beaver()], GNAW);
  assert.deepEqual(actionsFor('beaver', 3, s.rules).map((a) => [a.id, a.label]), [['build', 'Build'], ['gnaw', 'Gnaw']]);
  assert.deepEqual(targets(s, 'beaver', 'gnaw'), ['2,1']);
  // Only from the head: from (4,0) it reaches (4,1).
  const along = state(RIVER, [beaver([[4, 0], [3, 0], [2, 0]])], GNAW);
  assert.deepEqual(targets(along, 'beaver', 'gnaw'), ['4,1']);
});

test('a bridge is every dam joined along rows and columns', () => {
  const s = state(RIVER, [beaver()], GNAW);
  assert.deepEqual(bridgeAt(s, [4, 1]).map((p) => p.join(',')).sort(), ['2,1', '2,2', '3,1', '4,1', '5,1']);
  assert.deepEqual(bridgeAt(s, [6, 2]), [[6, 2]]);
  assert.deepEqual(bridgeAt(s, [0, 0]), []);
});

test('the whole bridge falls back into the water, tile by tile, and the lone dam stands', () => {
  const s = state(RIVER, [beaver()], GNAW);
  const after = applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] });
  for (const [x, y] of [[2, 1], [3, 1], [4, 1], [5, 1], [2, 2]]) assert.equal(kindAt(after, x, y), 'water', `${x},${y}`);
  assert.equal(kindAt(after, 6, 2), 'dam');
  const terrain = after.events.filter((e) => e.kind === 'terrain');
  assert.equal(terrain.length, 5);
  for (const e of terrain) assert.deepEqual([e.kind === 'terrain' && e.from, e.kind === 'terrain' && e.to, e.kind === 'terrain' && e.cause], ['dam', 'water', 'gnaw']);
  assert.equal(bandById(after, 'beaver')?.acted, true);
});

test('a dam over a hole falls back into the hole', () => {
  const s = state(RIVER, [beaver()], GNAW);
  s.tiles[2][2] = { kind: 'dam', variant: null, under: 'hole' };
  const after = applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] });
  assert.equal(kindAt(after, 2, 2), 'hole');
  assert.equal(kindAt(after, 2, 1), 'water');
});

test('a band whose head is on the bridge drowns; one whose body is on it is cut off there', () => {
  const s = state(RIVER, [
    beaver(),
    // Head on the bridge: it goes down with it.
    { id: 'saw-0', type: 'saw', cells: [[4, 1], [4, 0]] },
    // Head on the bank, body across the bridge: it keeps the head only.
    { id: 'harvester-1', type: 'harvester', cells: [[2, 3], [2, 2], [2, 1]] },
    // A flier over the bridge is not touched.
    { id: 'owl', type: 'owl', cells: [[5, 1]] },
  ], GNAW);
  const after = applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] });
  assert.equal(bandById(after, 'saw-0'), undefined);
  assert.deepEqual(bandById(after, 'harvester-1')?.cells, [[2, 3]]);
  assert.deepEqual(bandById(after, 'owl')?.cells, [[5, 1]]);
  const falls = after.events.find((e) => e.kind === 'push');
  assert.deepEqual(falls, { kind: 'push', outcome: { kind: 'falls', band: 'saw-0', at: [4, 1], cause: 'terrain' } });
  const cut = after.events.find((e) => e.kind === 'damage' && e.band === 'harvester-1');
  assert.deepEqual(cut, { kind: 'damage', band: 'harvester-1', amount: 2, wiped: false, cells: [[2, 1], [2, 2]], cause: 'bridge' });
  // The terrain falls first, then the bands, in band order.
  const kinds = after.events.map((e) => e.kind);
  assert.ok(kinds.lastIndexOf('terrain') < kinds.indexOf('damage'));
});

test('a band cut off keeps its cells up to the first fallen one, even if later ones stand on land', () => {
  // The ants run land (3,0), bridge (3,1) and (4,1), then land (4,0) again.
  const s = state(RIVER, [
    beaver([[5, 0], [6, 0]]),
    { id: 'ants', type: 'ants', cells: [[3, 0], [3, 1], [4, 1], [4, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[0, 3], [1, 3]] },
  ], GNAW);
  const after = applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [5, 1] });
  // The cell at (4,0) is on land, but it was behind the break.
  assert.deepEqual(bandById(after, 'ants')?.cells, [[3, 0]]);
});

test('the beaver is never offered the bridge its own head stands on, but may cut off its own body', () => {
  const onIt = state(RIVER, [beaver([[3, 1], [3, 0], [2, 0]])], GNAW);
  assert.deepEqual(targets(onIt, 'beaver', 'gnaw'), []);
  // Head on the bank at (2,0), tail on the bridge at (3,1): it loses the tail.
  const tail = state(RIVER, [beaver([[2, 0], [3, 0], [3, 1]])], GNAW);
  const after = applyMove(tail, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] });
  assert.deepEqual(bandById(after, 'beaver')?.cells, [[2, 0], [3, 0]]);
});

test('gnawing the bridge the last bot stands on wins a clear', () => {
  const s = state(RIVER, [beaver(), { id: 'saw-0', type: 'saw', cells: [[3, 1], [4, 1]] }], GNAW);
  s.goal = 'clear';
  const after = applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] });
  assert.equal(after.outcome, 'won');
});

test('a ford is no dam: it is never gnawed', () => {
  const s = state(['.F......'], [beaver([[0, 0]])], GNAW);
  assert.deepEqual(targets(s, 'beaver', 'gnaw'), []);
});

// ---------------------------------------------------------------- shove stones

// The bear's head at (1,1). East: a stone with open ground beyond. South:
// a stone with water beyond. North: a stone at the board's edge.
const YARD = [
  '.S......',
  '..S.....',
  '.S......',
  '.~......',
];
const bear = (cells = [[1, 1], [0, 1]]) => ({ id: 'bear', type: 'bear', cells });
const SHOVE = { bearShovesStones: true };

test('bearShovesStones off: a stone is no target for the shove', () => {
  const s = state(YARD, [bear()]);
  assert.deepEqual(targets(s, 'bear', 'shove'), []);
  assert.throws(() => applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [2, 1] }), /not valid/);
});

test('bearShovesStones on: a stone that has somewhere to go is a target, one at the edge is not', () => {
  const s = state(YARD, [bear()], SHOVE);
  assert.deepEqual(targets(s, 'bear', 'shove'), ['1,2', '2,1']);
  // Maul is not a shove: it still aims at bands only.
  assert.deepEqual(targets(s, 'bear', 'maul'), []);
});

test('a shoved stone rolls one tile onto open ground, and leaves open ground behind', () => {
  const s = state(YARD, [bear()], SHOVE);
  const after = applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [2, 1] });
  assert.equal(kindAt(after, 2, 1), 'open');
  assert.equal(after.tiles[1][2].variant, 'grass');
  assert.equal(kindAt(after, 3, 1), 'stones');
  assert.deepEqual(after.events.filter((e) => e.kind === 'terrain'), [
    { kind: 'terrain', at: [2, 1], from: 'stones', to: 'open', cause: 'shove' },
    { kind: 'terrain', at: [3, 1], from: 'open', to: 'stones', cause: 'shove' },
  ]);
  assert.equal(bandById(after, 'bear')?.acted, true);
  assert.equal(after.events.some((e) => e.kind === 'damage'), false);
});

test('a stone shoved into water fills it as a ford that animals and bots walk', () => {
  const s = state(YARD, [bear()], SHOVE);
  const after = applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [1, 2] });
  assert.equal(kindAt(after, 1, 2), 'open');
  assert.deepEqual(after.tiles[3][1], { kind: 'ford', variant: null, under: 'water' });
  assert.equal(canEnter(after.tiles[3][1], 'us', false), true);
  assert.equal(canEnter(after.tiles[3][1], 'bots', false), true);
  assert.equal(canEnter(after.tiles[3][1], 'us', true), true);
  // Next turn the bear may walk down onto it.
  const walk = { ...after, bands: after.bands.map((b) => ({ ...b, moved: false, acted: false })) };
  assert.ok(reachable(walk, 'bear').has('1,3'));
});

test('a stone shoved into a hole fills it as a ford over the hole', () => {
  const s = state(['........', '.S......', '.o......'], [bear([[1, 0], [0, 0]])], SHOVE);
  // The bear is north of the stone: the stone goes south, into the hole.
  const after = applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [1, 1] });
  assert.equal(kindAt(after, 1, 1), 'open');
  assert.deepEqual(after.tiles[2][1], { kind: 'ford', variant: null, under: 'hole' });
  assert.deepEqual(after.events.filter((e) => e.kind === 'terrain').map((e) => e.kind === 'terrain' && [e.from, e.to]), [['stones', 'open'], ['hole', 'ford']]);
});

test('a stone does not move into forest, stones, a dam, a den, a band, an objective or a seed', () => {
  for (const beyond of ['T', 'S', '=', 'H', 'K', '*', 'F', 'B']) {
    const s = state([`.S${beyond}.....`], [bear([[0, 0]])], SHOVE);
    assert.deepEqual(targets(s, 'bear', 'shove'), [], beyond);
  }
  const blocked = state(['.S......'], [bear([[0, 0]]), { id: 'saw-0', type: 'saw', cells: [[2, 0], [3, 0]] }], SHOVE);
  assert.deepEqual(targets(blocked, 'bear', 'shove'), []);
  // An owl over the water is in the way too.
  const owl = state(['.S~.....'], [bear([[0, 0]]), { id: 'owl', type: 'owl', cells: [[2, 0]] }], SHOVE);
  assert.deepEqual(targets(owl, 'bear', 'shove'), []);
});

test('a stone rolls onto stubble and paving', () => {
  for (const beyond of ['_', '#']) {
    const s = state([`.S${beyond}.....`], [bear([[0, 0]])], SHOVE);
    assert.deepEqual(targets(s, 'bear', 'shove'), ['1,0'], beyond);
  }
});

test('with the rule on, the shove still pushes bands as before', () => {
  const s = state(['..~.....'], [bear([[0, 0]]), { id: 'saw-0', type: 'saw', cells: [[1, 0]] }], SHOVE);
  const after = applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [1, 0] });
  assert.equal(bandById(after, 'saw-0'), undefined, 'pushed into the water');
  assert.equal(kindAt(after, 2, 0), 'water');
});

// ---------------------------------------------------------------- earth banks

test('an earth bank (B) stops everything on foot and nothing that flies', () => {
  const bank = LEGEND.B.tile;
  assert.equal(bank.kind, 'earthbank');
  assert.equal(canEnter(bank, 'us', false), false);
  assert.equal(canEnter(bank, 'bots', false), false);
  assert.equal(canEnter(bank, 'us', true), true);
  assert.equal(TERRAIN.earthbank.diggable, false);
  assert.equal(stopsShot(bank), false);
  const { tiles } = parseGrid(['.B.']);
  assert.equal(tiles[0][1].kind, 'earthbank');
});

test('a wall of earth banks keeps a bot on its side, and an owl flies over it', () => {
  const grid = ['..B.....', '..B.....', '..B.....'];
  const s = state(grid, [
    { id: 'saw-0', type: 'saw', cells: [[0, 0], [0, 1]] },
    { id: 'owl', type: 'owl', cells: [[1, 2]] },
  ]);
  const saw = [...reachable(s, 'saw-0').keys()];
  assert.ok(saw.every((k) => Number(k.split(',')[0]) < 2), saw.join(' '));
  assert.ok(reachable(s, 'owl').has('3,2'));
});

// The badger's head at (1,0) has a bank east and a hole south; its tail
// at (0,0) has open ground south.
const DIGS = ['..B.....', '.o......'];
const badger = (cells = [[1, 0], [0, 0]]) => ({ id: 'badger', type: 'badger', cells });
const WORKS = { badgerEarthworks: true };

test('badgerEarthworks off: no Fill, and Dig never touches a bank', () => {
  const s = state(DIGS, [badger()]);
  assert.deepEqual(actionsFor('badger', 3, s.rules).map((a) => a.id), ['dig', 'bite']);
  assert.deepEqual(targets(s, 'badger', 'dig'), ['0,1']);
  assert.deepEqual(actionTargets(s, 'badger', 'fill'), []);
  assert.throws(() => applyMove(s, { kind: 'act', band: 'badger', action: 'dig', target: [2, 0] }), /not valid/);
});

test('badgerEarthworks on: Fill is listed third, and Dig reaches the bank', () => {
  const s = state(DIGS, [badger()], WORKS);
  assert.deepEqual(actionsFor('badger', 3, s.rules).map((a) => [a.id, a.label]), [['dig', 'Dig'], ['bite', 'Bite'], ['fill', 'Fill']]);
  assert.deepEqual(targets(s, 'badger', 'dig'), ['0,1', '2,0']);
  assert.deepEqual(targets(s, 'badger', 'fill'), ['1,1']);
});

test('the badger digs a bank away to open ground, not a hole', () => {
  const s = state(DIGS, [badger()], WORKS);
  const after = applyMove(s, { kind: 'act', band: 'badger', action: 'dig', target: [2, 0] });
  assert.deepEqual(after.tiles[0][2], { kind: 'open', variant: 'grass', under: null });
  assert.deepEqual(after.events.find((e) => e.kind === 'terrain'), { kind: 'terrain', at: [2, 0], from: 'earthbank', to: 'open', cause: 'dig' });
});

test('the badger digs a bank from its tail end too', () => {
  const s = state(DIGS, [badger([[4, 0], [3, 0]])], WORKS);
  assert.ok(targets(s, 'badger', 'dig').includes('2,0'));
});

test('the badger fills a hole to open ground that everyone walks', () => {
  const s = state(DIGS, [badger()], WORKS);
  const after = applyMove(s, { kind: 'act', band: 'badger', action: 'fill', target: [1, 1] });
  assert.deepEqual(after.tiles[1][1], { kind: 'open', variant: 'grass', under: null });
  assert.deepEqual(after.events.find((e) => e.kind === 'terrain'), { kind: 'terrain', at: [1, 1], from: 'hole', to: 'open', cause: 'fill' });
  assert.equal(canEnter(after.tiles[1][1], 'bots', false), true);
});

test('Fill takes only a hole with nobody over it: not water, a dam or a hole under an owl', () => {
  const s = state(['.~=o....', '........'], [badger([[1, 1], [0, 1]]), { id: 'owl', type: 'owl', cells: [[3, 0]] }], WORKS);
  // From (1,1): (1,0) is water. From (2,1)? Not the head. Nothing to fill.
  assert.deepEqual(targets(s, 'badger', 'fill'), []);
  const under = state(['...o....', '...o....'], [badger([[2, 0], [1, 0]]), { id: 'owl', type: 'owl', cells: [[3, 0]] }], WORKS);
  assert.deepEqual(targets(under, 'badger', 'fill'), []);
  const dam = state(['..=.....'], [badger([[1, 0], [0, 0]])], WORKS);
  assert.deepEqual(targets(dam, 'badger', 'fill'), []);
});
