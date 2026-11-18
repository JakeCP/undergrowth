// The trial rule `snakeBodies`: a band may step onto one of its own tiles
// only if that tile is its tail as the body stands at that step, and it does
// not grow on that step. Every other cell of its own blocks it. A push
// follows the same rule. With the rule off the engine behaves as before.
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove } from '../js/engine/battle.js';
import { bandById, reachable, canWalk, pushBand, stepBand, mendsOn } from '../js/engine/band.js';
import { planBots, replan, runBotPhase, bandInReach } from '../js/engine/bots.js';
import { actionTargets } from '../js/engine/actions.js';
import { actionsFor, BAND_TYPES } from '../js/engine/units.js';
import { describeEvents } from '../js/ui/text.js';
import { makeState } from './helpers.mjs';

const SNAKE = { rules: { snakeBodies: true } };
const OPEN4x2 = ['....', '....'];
const OPEN4x4 = ['....', '....', '....', '....'];

/** @param {Map<string, unknown>} map */
const keys = (map) => [...map.keys()].sort();

/**
 * Whether `cells` is a path: no tile twice, each cell next to the one before it.
 * @param {number[][]} cells
 */
function isPath(cells) {
  const seen = new Set(cells.map((c) => c.join()));
  if (seen.size !== cells.length) return false;
  return cells.every((c, i) => i === 0 || Math.abs(c[0] - cells[i - 1][0]) + Math.abs(c[1] - cells[i - 1][1]) === 1);
}

/**
 * What a bot did on the bots' turn that produced `n`, read off the events, in the shape of a plan.
 * @param {import('../js/engine/types.js').BattleState} n
 * @param {string} id
 */
function didOf(n, id) {
  const walk = n.events.find((e) => e.kind === 'move' && e.band === id);
  const strike = n.events.find((e) => e.kind === 'action' && e.actor === id);
  return {
    path: walk ? walk.path : [],
    strike: strike ? strike.target : null,
    actionId: strike ? strike.actionId : null,
  };
}

/**
 * Ends the turn and checks every bot did what its plan showed. Returns the state after.
 * @param {import('../js/engine/types.js').BattleState} s
 * @param {string} ctx
 */
function endTurn(s, ctx) {
  const shown = Object.fromEntries(s.bands.filter((b) => b.side === 'bots').map((b) => [b.id, b.plan]));
  const n = applyMove(s, { kind: 'end' });
  for (const [id, plan] of Object.entries(shown)) {
    assert.deepEqual(didOf(n, id), plan, `${ctx}: ${id} did not do what its plan showed`);
  }
  return n;
}

// --- Stepping ---

const threeLong = (extra) => makeState(OPEN4x2, [{ id: 'badger', type: 'badger', cells: [[2, 0], [1, 0], [0, 0]], fresh: false }], extra);

test('rule off, as today: a band may step onto its own neck', () => {
  const s = threeLong();
  assert.deepEqual(reachable(s, 'badger', 1).get('1,0'), [[1, 0]]);
  assert.ok(reachable(s, 'badger').has('1,0'));
});

test('rule on: neither its neck nor its tail two cells back is one step away; open ground is', () => {
  const s = threeLong(SNAKE);
  const one = reachable(s, 'badger', 1);
  assert.equal(one.has('1,0'), false);
  assert.equal(one.has('0,0'), false);
  assert.deepEqual(one.get('3,0'), [[3, 0]]);
  assert.deepEqual(one.get('2,1'), [[2, 1]]);
  assert.deepEqual(keys(one), ['2,1', '3,0']);
  assert.equal(canWalk(s, bandById(s, 'badger'), [[1, 0]]), false);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'badger', path: [[1, 0]] }), /cannot step to 1,0/);
});

const RING = [[1, 1], [1, 2], [2, 2], [2, 1]];
const ring = (over = {}) => makeState(OPEN4x4, [{ id: 'ants', type: 'ants', cells: RING, fresh: false, ...over }], SNAKE);

test('rule on: a ring may step onto its tail but not its neck, and the body turns round the ring', () => {
  const s = ring();
  const one = reachable(s, 'ants', 1);
  assert.deepEqual(one.get('2,1'), [[2, 1]]);
  assert.equal(one.has('1,2'), false);
  assert.deepEqual(keys(one), ['0,1', '1,0', '2,1']);
  const n = applyMove(s, { kind: 'move', band: 'ants', path: [[2, 1]] });
  assert.deepEqual(bandById(n, 'ants').cells, [[2, 1], [1, 1], [1, 2], [2, 2]]);
});

test('rule on: a ring that grows on the step may not take its tail, which stays where it is', () => {
  const s = ring({ maxLen: 6, fresh: true });
  assert.equal(reachable(s, 'ants', 1).has('2,1'), false);
  assert.equal(reachable(s, 'ants', 2).has('2,1'), false);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'ants', path: [[2, 1]] }), /cannot step to 2,1/);
  // Two steps make it whole, six long; a whole band does not grow, so the third may take the tail.
  assert.deepEqual(reachable(s, 'ants').get('2,1'), [[1, 0], [2, 0], [2, 1]]);
  const n = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0], [2, 1]] });
  assert.deepEqual(bandById(n, 'ants').cells, [[2, 1], [2, 0], [1, 0], [1, 1], [1, 2], [2, 2]]);
});

test('rule on: a two-long band turns round by stepping onto its tail', () => {
  const s = makeState(OPEN4x2, [{ id: 'fox', type: 'fox', cells: [[1, 0], [0, 0]], fresh: false }], SNAKE);
  assert.deepEqual(reachable(s, 'fox', 1).get('0,0'), [[0, 0]]);
  const n = applyMove(s, { kind: 'move', band: 'fox', path: [[0, 0]] });
  assert.deepEqual(bandById(n, 'fox').cells, [[0, 0], [1, 0]]);
});

test('rule on: where a band can go depends on the route, since the body follows the head', () => {
  // ants on a 3x2 board: head (0,1), neck (0,0), tail (1,0). The neck's tile
  // opens only once the head has led the body round the board.
  const cells = [[0, 1], [0, 0], [1, 0]];
  const board = ['...', '...'];
  const off = makeState(board, [{ id: 'ants', type: 'ants', cells, fresh: false }]);
  assert.deepEqual(reachable(off, 'ants').get('0,0'), [[0, 0]], 'rule off: straight onto the neck');
  const s = makeState(board, [{ id: 'ants', type: 'ants', cells, fresh: false }], SNAKE);
  assert.equal(reachable(s, 'ants', 2).has('0,0'), false);
  const path = [[1, 1], [1, 0], [0, 0]];
  assert.deepEqual(reachable(s, 'ants').get('0,0'), path);
  assert.equal(canWalk(s, bandById(s, 'ants'), path), true);
  // The tail's tile is free by the second step, though it was the tail's when the walk began.
  assert.deepEqual(reachable(s, 'ants').get('1,0'), [[1, 1], [1, 0]]);
  const n = applyMove(s, { kind: 'move', band: 'ants', path });
  assert.deepEqual(bandById(n, 'ants').cells, [[0, 0], [1, 0], [1, 1]]);
});

test('rule on: every path reachable gives is one canWalk accepts and applyMove plays', () => {
  for (const [id, type, cells, maxLen, fresh] of [
    ['ants', 'ants', [[1, 1], [1, 2], [2, 2], [2, 1], [3, 1]], 7, true],
    ['bees', 'bees', [[1, 1], [1, 2]], 2, false],
    ['fox', 'fox', [[2, 2], [2, 1]], 3, false],
  ]) {
    const s = makeState(OPEN4x4, [{ id, type, cells, maxLen, fresh }, { id: 'tower-0', type: 'tower', cells: [[3, 3]] }], SNAKE);
    replan(s);
    for (const path of reachable(s, id).values()) {
      assert.equal(canWalk(s, bandById(s, id), path), true, `${id} ${JSON.stringify(path)}`);
      assert.ok(isPath(bandById(applyMove(s, { kind: 'move', band: id, path }), id).cells), `${id} ${JSON.stringify(path)}`);
    }
  }
});

test('rule on: bees still pass through other bands, though not through their own body', () => {
  const s = makeState(['......', '......'], [
    { id: 'bees', type: 'bees', cells: [[1, 0], [0, 0]], fresh: false },
    { id: 'fox', type: 'fox', cells: [[2, 0], [2, 1]], fresh: false },
  ], SNAKE);
  assert.deepEqual(reachable(s, 'bees').get('4,0'), [[2, 0], [3, 0], [4, 0]], 'through the fox, which spans both rows');
  assert.equal(reachable(s, 'bees').has('2,0'), false, 'it may not stop on the fox');
  assert.deepEqual(reachable(s, 'bees', 1).get('0,0'), [[0, 0]], 'its tail it may take');
});

// --- Pushes ---

test('rule on: a band pushed onto its own neck bumps into itself; pushed onto its tail it moves', () => {
  const s = makeState(OPEN4x4, [{ id: 'badger', type: 'badger', cells: [[1, 0], [1, 1], [0, 1]], fresh: false }], SNAKE);
  const bumped = pushBand(s, 'badger', 'S');
  assert.deepEqual(bumped, { kind: 'bumped', band: 'badger', other: 'badger' });
  assert.deepEqual(bandById(s, 'badger').cells, [[1, 0], [1, 1]], 'it stays where it was and loses one segment, once');
  assert.deepEqual(s.events.filter((e) => e.kind === 'damage').map((e) => [e.band, e.amount]), [['badger', 1]]);
  assert.ok(describeEvents(s, s.events).some((line) => /pushed and bumps into its own body/.test(line)), describeEvents(s, s.events).join(' / '));

  const t = makeState(OPEN4x4, [{ id: 'ants', type: 'ants', cells: [[1, 0], [2, 0], [2, 1], [1, 1]], fresh: false }], SNAKE);
  assert.deepEqual(pushBand(t, 'ants', 'S'), { kind: 'moved', band: 'ants', to: [1, 1] });
  assert.deepEqual(bandById(t, 'ants').cells, [[1, 1], [1, 0], [2, 0], [2, 1]]);
});

test('rule off, as today: a band pushed onto its own neck moves there', () => {
  const s = makeState(OPEN4x4, [{ id: 'badger', type: 'badger', cells: [[1, 0], [1, 1], [0, 1]], fresh: false }]);
  assert.deepEqual(pushBand(s, 'badger', 'S'), { kind: 'moved', band: 'badger', to: [1, 1] });
  assert.deepEqual(bandById(s, 'badger').cells, [[1, 1], [1, 0], [0, 1]]);
});

// --- Bots ---

// The Coil's boxed-in board, with a coil of nine whose head lies inside the
// box, hemmed in by stones, its neck and its fourth cell.
const BOX = ['SSSS....', 'S..S....', 'S.......', 'SSSS....'];
const BOXED = [[2, 1], [1, 1], [1, 2], [2, 2], [3, 2], [4, 2], [4, 1], [4, 0], [5, 0]];

test('rule on: a coil of nine with its head boxed in by its own body cannot walk; it lies still, its plan is its turn, and nothing throws', () => {
  const off = makeState(BOX, [{ id: 'coil-0', type: 'coil', cells: BOXED }, { id: 'ants', type: 'ants', cells: [[6, 2], [6, 3]] }]);
  replan(off);
  assert.notDeepEqual(bandById(off, 'coil-0').plan.path, [], 'rule off: it walks out over itself');

  let s = makeState(BOX, [{ id: 'coil-0', type: 'coil', cells: BOXED }, { id: 'ants', type: 'ants', cells: [[6, 2], [6, 3]] }], SNAKE);
  replan(s);
  for (let turn = 1; turn <= 6; turn += 1) {
    assert.deepEqual(bandById(s, 'coil-0').plan, { path: [], strike: null, actionId: null }, `turn ${turn}`);
    s = endTurn(s, `turn ${turn}`);
    assert.deepEqual(bandById(s, 'coil-0').cells, BOXED, `turn ${turn}`);
    assert.ok(isPath(bandById(s, 'coil-0').cells), `turn ${turn}`);
  }
});

test('rule on: a coil wound round a post unwinds over its tail and hunts, its plan its turn, its body a path', () => {
  const COILED = [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]];
  const POST = ['........', '........', '..P.....', ...Array(5).fill('........')];
  let s = makeState(POST, [{ id: 'coil-0', type: 'coil', cells: COILED }, { id: 'ants', type: 'ants', cells: [[4, 0], [5, 0], [6, 0], [7, 0]] }], SNAKE);
  replan(s);
  let struck = 0;
  for (let turn = 1; turn <= 6 && s.outcome === null; turn += 1) {
    if (bandById(s, 'coil-0').plan.strike !== null) struck += 1;
    s = endTurn(s, `turn ${turn}`);
    const coil = bandById(s, 'coil-0');
    if (coil === undefined) break;
    assert.ok(isPath(coil.cells), `turn ${turn}: ${JSON.stringify(coil.cells)}`);
  }
  assert.ok(struck > 0, 'it hunted');
});

// --- Bots route round their own bodies ---

const NOTHING = { path: [], strike: null, actionId: null };

/**
 * Runs up to `n` bots' turns on `s`, each checked against the plans shown
 * before it, and returns bot `id`'s plans, stopping after the turn it
 * strikes one of `targets`.
 * @param {import('../js/engine/types.js').BattleState} s
 * @param {string} id
 * @param {number} n
 * @param {number[][]} targets
 */
function botTurns(s, id, n, targets = []) {
  const plans = [];
  for (let turn = 1; turn <= n; turn += 1) {
    const shown = planBots(s);
    assert.deepEqual(runBotPhase(s), shown, `turn ${turn}: the plans shown are not the turn`);
    plans.push(shown[id]);
    const strike = shown[id].strike;
    if (strike !== null && targets.some((t) => t[0] === strike[0] && t[1] === strike[1])) break;
  }
  return plans;
}

/** @param {number[]} a @param {number[]} b */
const nextTo = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

// A bot with its head at (2,1) and its body running east; what it goes for
// lies further east, so the shortest way there is back over its own neck.
const facingAway = (type, cells, goal, rules, rows = 3) => makeState(
  Array(rows).fill('........').map((row, y) => (goal.den && y === goal.den[1] ? `${row.slice(0, goal.den[0])}H${row.slice(goal.den[0] + 1)}` : row)),
  [{ id: 'bot', type, cells }, ...(goal.ants ? [{ id: 'ants', type: 'ants', cells: goal.ants }] : [])],
  { rules },
);

test('rule on: a planter facing away from the ants walks round its own neck, stands beside them and strikes them', () => {
  // The reviewer's case: it used to stand on (2,1) for ever, paving round itself.
  const cells = [[2, 1], [3, 1], [4, 1]];
  const s = facingAway('planter', cells, { ants: [[7, 1]] }, { snakeBodies: true });
  const plans = botTurns(s, 'bot', 8, [[7, 1]]);
  assert.ok(plans[0].path.length > 0, 'it moves on the first turn');
  assert.deepEqual(plans.at(-1).strike, [7, 1], JSON.stringify(plans));
  assert.ok(nextTo(bandById(s, 'bot').cells[0], [7, 1]));
  assert.ok(isPath(bandById(s, 'bot').cells));
});

test('rule off, as today: the same planter walks straight back over its neck, and stands on (6,1) after two turns', () => {
  const s = facingAway('planter', [[2, 1], [3, 1], [4, 1]], { ants: [[7, 1]] }, {});
  const plans = botTurns(s, 'bot', 2);
  assert.deepEqual(plans.map((p) => p.path), [[[3, 1], [4, 1]], [[5, 1], [6, 1]]]);
  assert.deepEqual(bandById(s, 'bot').cells[0], [6, 1]);
});

test('rule on: a harvester, a saw and a hunter facing away from what they go for walk round and get there', () => {
  for (const [type, cells, goal, target] of [
    ['harvester', [[2, 1], [3, 1], [4, 1]], { den: [7, 1] }, [7, 1]],
    ['saw', [[2, 1], [3, 1]], { ants: [[7, 1]] }, [7, 1]],
    ['hunter', [[2, 1], [3, 1], [4, 1], [5, 1]], { ants: [[7, 1]] }, [7, 1]],
  ]) {
    const s = facingAway(type, cells, goal, { snakeBodies: true });
    const plans = botTurns(s, 'bot', 8, [target]);
    assert.deepEqual(plans.at(-1).strike, target, `${type}: ${JSON.stringify(plans)}`);
    assert.ok(nextTo(bandById(s, 'bot').cells[0], target), type);
    assert.ok(isPath(bandById(s, 'bot').cells), type);
  }
});

test('rule on: a bot boxed in by its own body and stones, with no way round, stays put and plans nothing', () => {
  // Its head's only open neighbour is its own neck.
  const SHUT = ['SSS.....', 'S.S.....', 'S...S...', 'SSSSS...'];
  for (const [type, cells] of [
    ['planter', [[1, 1], [1, 2], [2, 2]]],
    ['harvester', [[1, 1], [1, 2], [2, 2]]],
    ['hunter', [[1, 1], [1, 2], [2, 2], [3, 2]]],
    ['coil', [[1, 1], [1, 2], [2, 2], [3, 2], [3, 1], [3, 0], [4, 0], [5, 0], [6, 0]]],
  ]) {
    const s = makeState(SHUT, [{ id: 'bot', type, cells }, { id: 'ants', type: 'ants', cells: [[6, 2], [7, 2]] }], SNAKE);
    assert.deepEqual(botTurns(s, 'bot', 4), [NOTHING, NOTHING, NOTHING, NOTHING], type);
    assert.deepEqual(bandById(s, 'bot').cells, cells, type);
  }
  // A harvester in a sealed two-by-two pocket could step round inside it, but
  // no walk ever takes it out to the den, so it does not walk at all.
  const POCKET = ['SSSS....', 'S..S....', 'S..S...H', 'SSSS....'];
  const s = makeState(POCKET, [{ id: 'bot', type: 'harvester', cells: [[1, 1], [1, 2], [2, 2]] }], SNAKE);
  assert.ok(reachable(s, 'bot').size > 0, 'it could step');
  assert.deepEqual(botTurns(s, 'bot', 4), [NOTHING, NOTHING, NOTHING, NOTHING]);
});

/**
 * Whether some walk, one step at a time under the rule, takes `bot` to a
 * tile where `arrived` holds; the band it goes for stands still. Tiles in
 * `off` are never stepped onto unless the bot arrives there.
 * @param {import('../js/engine/types.js').BattleState} s
 * @param {(t: import('../js/engine/types.js').BattleState) => boolean} arrived
 * @param {Set<string>} off
 */
function canEverArrive(s, arrived, off) {
  const seen = new Set();
  const queue = [bandById(s, 'bot').cells];
  while (queue.length > 0) {
    const cells = queue.shift();
    const k = cells.map((c) => c.join()).join(';');
    if (seen.has(k)) continue;
    seen.add(k);
    const t = { ...s, bands: s.bands.map((b) => (b.id === 'bot' ? { ...b, cells } : b)) };
    if (arrived(t)) return true;
    for (const [dest, [p]] of reachable(t, 'bot', 1)) {
      const next = stepBand(bandById(t, 'bot'), p, false).cells;
      if (!off.has(dest) || arrived({ ...t, bands: t.bands.map((b) => (b.id === 'bot' ? { ...b, cells: next } : b)) })) queue.push(next);
    }
  }
  return false;
}

test('rule on, 300 seeded boards: a harvester, planter or crane three long either gets to what it goes for within 30 turns or never moves, and then it is walled in or its own body lies where it is going', () => {
  let seed = 1617;
  const random = () => {
    // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (n) => Math.floor(random() * n);
  const KINDS = ['harvester', 'planter', 'crane'];
  const tally = { boards: 0, arrived: 0, walledIn: 0, ownBodyInTheWay: 0 };
  while (tally.boards < 300) {
    const type = KINDS[tally.boards % 3];
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => (random() < 1 / 8 ? 'S' : '.')));
    const used = new Set();
    const open = ([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 8 && grid[y][x] === '.' && !used.has(`${x},${y}`);
    // A random body of `len` cells on open ground, or null: its facing is random.
    const body = (len) => {
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
    const botCells = body(3);
    const antCells = botCells === null ? null : body(1 + pick(3));
    if (antCells === null) continue;
    // The harvester goes for a den, so it gets one; the others go for the ants.
    let den = null;
    if (type === 'harvester') {
      den = [pick(8), pick(8)];
      if (!open(den)) continue;
      grid[den[1]][den[0]] = 'H';
    }
    const goals = den === null ? antCells : [den];
    // Somewhere reachable: a tile beside the goal joins the bot's head over
    // open ground, counting the bot's own body as open.
    const free = ([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 8 && grid[y][x] === '.' && !antCells.some((c) => c[0] === x && c[1] === y);
    const joined = new Set([botCells[0].join()]);
    const queue = [botCells[0]];
    while (queue.length > 0) {
      const [x, y] = queue.shift();
      for (const p of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (free(p) && !joined.has(p.join())) { joined.add(p.join()); queue.push(p); }
      }
    }
    const beside = (c) => [[c[0], c[1] - 1], [c[0] + 1, c[1]], [c[0], c[1] + 1], [c[0] - 1, c[1]]];
    if (!goals.some((g) => beside(g).some((p) => joined.has(p.join())))) continue;
    tally.boards += 1;

    const rows = grid.map((row) => row.join(''));
    const where = JSON.stringify({ type, rows, botCells, antCells });
    const s = makeState(rows, [{ id: 'bot', type, cells: botCells }, { id: 'ants', type: 'ants', cells: antCells }], SNAKE);
    const isGoal = (p) => goals.some((g) => g[0] === p[0] && g[1] === p[1]);
    // A harvester or planter has got there when its head is beside its goal;
    // a crane, when it can swing at the ants from where it stands.
    const there = (t) => (type === 'crane' ? bandInReach(t, bandById(t, 'bot')) : goals.some((g) => nextTo(bandById(t, 'bot').cells[0], g)));
    // The crane never walks beside the ants (see tests/new-bots.test.mjs).
    const off = new Set(type === 'crane' ? antCells.flatMap((c) => [c, ...beside(c)]).map((c) => c.join()) : []);
    const walledIn = !canEverArrive(s, there, off);
    // What the distance field still does not see: a tile it goes for under
    // its own body (a harvester's or planter's tile beside the goal on its
    // neck, a crane's firing tile or the tile between on its neck or tail).
    // The field counts such a tile as a goal next to its head, so it waits
    // for its own body to leave a tile it is standing on.
    const own = new Set(botCells.slice(1, type === 'crane' ? undefined : -1).map((c) => c.join()));
    const lanes = (c) => beside(c).map((b) => [b, [2 * b[0] - c[0], 2 * b[1] - c[1]]]);
    const ownBodyInTheWay = type === 'crane'
      ? antCells.some((c) => lanes(c).some(([b, f]) => own.has(b.join()) || own.has(f.join())))
      : goals.some((g) => beside(g).some((p) => own.has(p.join())));

    let moved = false;
    let arrived = there(s);
    for (let turn = 1; turn <= 30 && !arrived; turn += 1) {
      const shown = planBots(s);
      assert.deepEqual(runBotPhase(s), shown, `turn ${turn}: plan is not the turn on ${where}`);
      if (shown.bot.path.length > 0) moved = true;
      arrived = (shown.bot.strike !== null && isGoal(shown.bot.strike)) || there(s);
    }
    assert.ok(arrived || !moved, `walked for 30 turns and never got there: ${where}`);
    if (arrived) tally.arrived += 1;
    else {
      assert.ok(walledIn || ownBodyInTheWay, `stood still though a walk could get it there: ${where}`);
      if (walledIn) tally.walledIn += 1;
      else tally.ownBodyInTheWay += 1;
    }
  }
  assert.equal(tally.arrived + tally.walledIn + tally.ownBodyInTheWay, 300);
  // Every bot that never got there never moved, and was walled in or had its
  // own body on the tile it went for. Walled-in boards are 21 of these 300
  // (stones and the ants' own body shut the bot's head away); the own-body
  // case is rarer still. Neither may grow past a few in a hundred.
  assert.ok(tally.walledIn <= 30, JSON.stringify(tally));
  assert.ok(tally.ownBodyInTheWay <= 6, JSON.stringify(tally));
});

// --- Seeded random play ---

const ANIMALS = ['ants', 'badger', 'beaver', 'fox', 'hedgehog', 'bear', 'bees'];
const BOTS = Object.keys(BAND_TYPES).filter((t) => BAND_TYPES[t].side === 'bots');

/**
 * Random boards, random animal moves and actions, the real bots' turns.
 * @param {boolean} snake  whether the rule is on
 * @param {(s: object, ctx: string) => void} check  run after every move and every bots' turn
 */
function playBoards(snake, check) {
  let seed = 2026;
  const random = () => {
    // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (n) => Math.floor(random() * n);
  const tally = { boards: 0, moves: 0, turns: 0, tailSteps: 0, pushes: 0 };
  while (tally.boards < 200) {
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => {
      const r = random();
      return r < 0.08 ? 'S' : r < 0.16 ? 'T' : '.';
    }));
    const used = new Set();
    const open = ([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 8 && grid[y][x] === '.' && !used.has(`${x},${y}`);
    // A random body of `len` cells on open ground, or null.
    const body = (len) => {
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
    const bands = [];
    const animals = [...ANIMALS];
    for (let i = 0; i < 2; i += 1) {
      const type = animals.splice(pick(animals.length), 1)[0];
      const len = 1 + pick(BAND_TYPES[type].maxLenCap === 2 ? 2 : 5);
      const cells = body(len);
      if (cells !== null) bands.push({ id: type, type, cells, maxLen: len + pick(3), fresh: random() < 0.5 });
    }
    const wanted = 2 + pick(2);
    for (let i = 0; i < wanted; i += 1) {
      const type = BOTS[pick(BOTS.length)];
      const cells = body(BAND_TYPES[type].startLen);
      if (cells !== null) bands.push({ id: `${type}-${i}`, type, cells });
    }
    if (bands.filter((b) => BAND_TYPES[b.type].side === 'us').length < 2) continue;
    if (bands.filter((b) => BAND_TYPES[b.type].side === 'bots').length < 2) continue;
    tally.boards += 1;
    const rows = grid.map((row) => row.join(''));
    const where = JSON.stringify({ rows, bands });
    let s = makeState(rows, bands, { goal: 'clear', ...(snake ? SNAKE : {}) });
    replan(s);
    check(s, `start ${where}`);
    for (let turn = 1; turn <= 10 && s.outcome === null; turn += 1) {
      for (const band of [...s.bands]) {
        if (s.outcome !== null) break;
        const own = bandById(s, band.id);
        if (own === undefined || own.side !== 'us' || random() < 0.2) continue;
        /** @type {object[]} */
        const moves = [...reachable(s, own.id).values()].map((path) => ({ kind: 'move', band: own.id, path }));
        for (const a of actionsFor(own.type, own.maxLen)) {
          for (const target of actionTargets(s, own.id, a.id)) moves.push({ kind: 'act', band: own.id, action: a.id, target });
        }
        if (moves.length === 0) continue;
        const move = moves[pick(moves.length)];
        if (move.kind === 'move') {
          let walker = own;
          for (const p of move.path) {
            const tail = walker.cells.at(-1);
            if (walker.cells.length > 1 && tail[0] === p[0] && tail[1] === p[1]) tally.tailSteps += 1;
            walker = stepBand(walker, p, mendsOn(s, own, p));
          }
        }
        s = applyMove(s, move);
        if (s.events.some((e) => e.kind === 'push')) tally.pushes += 1;
        tally.moves += 1;
        check(s, `turn ${turn} after ${JSON.stringify(move)} on ${where}`);
      }
      if (s.outcome !== null) break;
      s = endTurn(s, `turn ${turn} on ${where}`);
      tally.turns += 1;
      check(s, `bots' turn ${turn} on ${where}`);
    }
  }
  return tally;
}

test('rule on, 200 seeded boards with every bot type: every body stays a path, every plan is its turn, nothing throws', () => {
  const tally = playBoards(true, (s, ctx) => {
    const tiles = new Set();
    for (const b of s.bands) {
      assert.ok(isPath(b.cells), `${ctx}: ${b.id} is not a path: ${JSON.stringify(b.cells)}`);
      for (const c of b.cells) {
        assert.ok(!tiles.has(c.join()), `${ctx}: two bands on ${c}`);
        tiles.add(c.join());
      }
    }
    // The stored plans are a fresh planning run on this state.
    const fresh = planBots(structuredClone(s));
    for (const b of s.bands) if (b.side === 'bots') assert.deepEqual(b.plan, fresh[b.id], `${ctx}: stale plan on ${b.id}`);
  });
  assert.equal(tally.boards, 200);
  // The cases the rule is about came up.
  assert.ok(tally.tailSteps > 0, JSON.stringify(tally));
  assert.ok(tally.pushes > 0, JSON.stringify(tally));
  assert.ok(tally.turns > 500, JSON.stringify(tally));
});

test('rule off, the same boards: the engine\'s own invariant holds, and some body is not a path', () => {
  let notPaths = 0;
  playBoards(false, (s, ctx) => {
    for (const b of s.bands) {
      b.cells.forEach((c, i) => {
        if (i === 0) return;
        assert.ok(
          b.cells.slice(0, i).some((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) === 1),
          `${ctx}: ${b.id} cell ${i} has no earlier orthogonally adjacent cell`,
        );
      });
      assert.equal(new Set(b.cells.map((c) => c.join())).size, b.cells.length, `${ctx}: ${b.id} holds a tile twice`);
      if (!isPath(b.cells)) notPaths += 1;
    }
  });
  assert.ok(notPaths > 0, 'without the rule some body stops being a path');
});
