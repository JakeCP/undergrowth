import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGrid, createBattle, applyMove, advance, countForest, countHabitats, rewardFor } from '../js/engine/battle.js';
import { planBots } from '../js/engine/bots.js';
import { LEGEND } from '../js/engine/terrain.js';
import { bandById } from '../js/engine/band.js';
import { makeState } from './helpers.mjs';

test('parseGrid brief example', () => {
  const g = parseGrid(['DT', 'P*']);
  assert.deepEqual(g.deployTiles, [[0, 0]]);
  assert.deepEqual(g.objectives, [{ at: [0, 1], kind: 'permit', captured: false }]);
  assert.deepEqual(g.pickups, [[1, 1]]);
  assert.equal(g.tiles[0][1].kind, 'forest');
  assert.throws(() => parseGrid(['.x']), /unknown grid char "x" at 1,0/);
});

test('parseGrid dimensions and tiles[y][x] indexing', () => {
  const g = parseGrid(['T.~', '_#o', ',;S']);
  assert.equal(g.width, 3);
  assert.equal(g.height, 3);
  assert.deepEqual(g.tiles[0][0], { kind: 'forest', variant: null, under: null });
  assert.deepEqual(g.tiles[0][1], { kind: 'open', variant: 'grass', under: null });
  assert.deepEqual(g.tiles[0][2], { kind: 'water', variant: null, under: null });
  assert.deepEqual(g.tiles[1][0], { kind: 'stubble', variant: null, under: null });
  assert.deepEqual(g.tiles[1][1], { kind: 'paving', variant: null, under: null });
  assert.deepEqual(g.tiles[1][2], { kind: 'hole', variant: null, under: null });
  assert.deepEqual(g.tiles[2][0], { kind: 'open', variant: 'flowers', under: null });
  assert.deepEqual(g.tiles[2][1], { kind: 'open', variant: 'mushrooms', under: null });
  assert.deepEqual(g.tiles[2][2], { kind: 'stones', variant: null, under: null });
  assert.deepEqual(parseGrid(['=']).tiles[0][0], { kind: 'dam', variant: null, under: 'water' });
});

test('parseGrid marks sit on open/grass and are recorded in row-major order', () => {
  const g = parseGrid(['K.D', 'P*D', '*KP']);
  assert.deepEqual(g.deployTiles, [[2, 0], [2, 1]]);
  assert.deepEqual(g.objectives, [
    { at: [0, 0], kind: 'stake', captured: false },
    { at: [0, 1], kind: 'permit', captured: false },
    { at: [1, 2], kind: 'stake', captured: false },
    { at: [2, 2], kind: 'permit', captured: false },
  ]);
  assert.deepEqual(g.pickups, [[1, 1], [0, 2]]);
  for (const [x, y] of [[2, 0], [0, 0], [0, 1], [1, 1]]) {
    assert.deepEqual(g.tiles[y][x], { kind: 'open', variant: 'grass', under: null });
  }
});

test('parseGrid empty marks give empty lists', () => {
  const g = parseGrid(['..', 'T~']);
  assert.deepEqual(g.deployTiles, []);
  assert.deepEqual(g.objectives, []);
  assert.deepEqual(g.pickups, []);
});

test('parseGrid tiles are copies, not LEGEND references', () => {
  const g = parseGrid(['..', '..']);
  assert.notEqual(g.tiles[0][0], LEGEND['.'].tile);
  assert.notEqual(g.tiles[0][0], g.tiles[0][1]);
  assert.notEqual(g.tiles[0][0], g.tiles[1][0]);
  g.tiles[0][0].kind = 'water';
  assert.equal(g.tiles[0][1].kind, 'open');
  assert.equal(LEGEND['.'].tile.kind, 'open');
});

test('parseGrid throws on unequal row lengths', () => {
  assert.throws(() => parseGrid(['..', '.']), /^Error: grid rows must be equal length$/);
  assert.throws(() => parseGrid(['.', '..']), /grid rows must be equal length/);
  assert.throws(() => parseGrid(['...', '..', '...']), /grid rows must be equal length/);
});

test('parseGrid throws on unknown char with its position', () => {
  assert.throws(() => parseGrid(['.x']), /^Error: unknown grid char "x" at 1,0$/);
  assert.throws(() => parseGrid(['..', '.?']), /^Error: unknown grid char "\?" at 1,1$/);
  assert.throws(() => parseGrid(['z']), /unknown grid char "z" at 0,0/);
});

test('parseGrid handles an empty grid', () => {
  const g = parseGrid([]);
  assert.equal(g.width, 0);
  assert.equal(g.height, 0);
  assert.deepEqual(g.tiles, []);
  assert.deepEqual(g.deployTiles, []);
  assert.deepEqual(g.objectives, []);
  assert.deepEqual(g.pickups, []);
});

test('parseGrid does not mutate its input', () => {
  const grid = ['DT', 'P*'];
  parseGrid(grid);
  assert.deepEqual(grid, ['DT', 'P*']);
});

function makeLevel(overrides = {}) {
  return {
    id: 'lvl-1',
    name: 'Test level',
    blurb: '',
    goal: 'capture',
    maxBands: 2,
    turnLimit: null,
    grid: ['D...', '....', '....', '...P'],
    bots: [],
    trapped: [],
    firstClearSeeds: 20,
    assumes: {},
    solution: { deploy: [], moves: [] },
    ...overrides,
  };
}

function makeProgress(overrides = {}) {
  return {
    version: 1,
    seeds: 0,
    bands: {
      ants: { maxLen: 4 },
      badger: { maxLen: 3 },
      beaver: { maxLen: 3 },
      bear: { maxLen: 2 },
      owl: { maxLen: 1 },
      bees: { maxLen: 2 },
    },
    cleared: {},
    ...overrides,
  };
}

test('createBattle places length-1 leaders with progress maxLen and planned bots', () => {
  const level = makeLevel({
    id: 'lvl-create',
    turnLimit: 7,
    grid: ['DT*P', '....', '....', '....'],
    bots: [
      { type: 'harvester', cells: [[1, 1], [0, 1]] },
      { type: 'saw', cells: [[3, 3]] },
    ],
    trapped: [{ type: 'beaver', cells: [[3, 2], [2, 2]] }],
  });
  const progress = makeProgress({ bands: { ants: { maxLen: 5 }, badger: { maxLen: 3 } } });
  const deployments = [{ type: 'ants', at: [0, 0] }];
  const s = createBattle(level, deployments, progress);

  const ants = bandById(s, 'ants');
  assert.deepEqual(ants.cells, [[0, 0]]);
  assert.equal(ants.type, 'ants');
  assert.equal(ants.side, 'us');
  assert.equal(ants.maxLen, 5);
  assert.equal(ants.moved, false);
  assert.equal(ants.acted, false);
  assert.equal(ants.trapped, false);
  assert.equal(ants.plan, null);

  const bot = bandById(s, 'harvester-0');
  assert.deepEqual(bot.cells, [[1, 1], [0, 1]]);
  assert.equal(bot.side, 'bots');
  assert.equal(bot.maxLen, 2);
  // The harvester is in reach of the ants: it steps onto its own tail and
  // mows them. The saw goes second; in the plan the ants are already gone,
  // so it saws the trapped beaver beside it.
  assert.deepEqual(bot.plan, { path: [[0, 1]], strike: [0, 0], actionId: 'mow' });
  assert.deepEqual(bandById(s, 'saw-1').plan, { path: [], strike: [3, 2], actionId: 'saw' });
  assert.notEqual(bandById(s, 'saw-1'), undefined);
  assert.equal(bandById(s, 'saw-0'), undefined);

  const trapped = bandById(s, 'trapped-beaver');
  assert.deepEqual(trapped.cells, [[3, 2], [2, 2]]);
  assert.equal(trapped.side, 'us');
  assert.equal(trapped.maxLen, 2);
  assert.equal(trapped.trapped, true);
  assert.equal(trapped.plan, null);

  assert.equal(s.levelId, 'lvl-create');
  assert.equal(s.goal, 'capture');
  assert.equal(s.turnLimit, 7);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.events, []);
  assert.equal(s.forestStart, 1);
  assert.equal(countForest(s), 1);
  assert.deepEqual(s.pickups, [[2, 0]]);
  assert.deepEqual(s.objectives, [{ at: [3, 0], kind: 'permit', captured: false }]);
  assert.equal(s.pickupsTaken, 0);
  assert.equal(s.outcome, null);
  assert.equal(s.lostReason, null);
  assert.equal(s.habitatStart, 0);

  assert.notEqual(ants.cells[0], deployments[0].at);
  assert.notEqual(bot.cells[0], level.bots[0].cells[0]);
  assert.notEqual(trapped.cells[0], level.trapped[0].cells[0]);
});

test('createBattle rejects bad deployments', () => {
  const grid = ['DD..', '....', '....', '...P'];
  const level = makeLevel({ grid, maxBands: 2 });
  const progress = makeProgress();

  assert.throws(() => createBattle(level, [], progress), Error);
  assert.throws(
    () => createBattle(makeLevel({ grid, maxBands: 1 }), [
      { type: 'ants', at: [0, 0] },
      { type: 'badger', at: [1, 0] },
    ], progress),
    Error,
  );
  assert.throws(() => createBattle(level, [{ type: 'ants', at: [1, 1] }], progress), Error);
  assert.throws(
    () => createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress({ bands: { ants: { maxLen: 4 } } })),
    Error,
  );
  assert.throws(
    () => createBattle(level, [
      { type: 'ants', at: [0, 0] },
      { type: 'ants', at: [1, 0] },
    ], progress),
    Error,
  );
  assert.throws(
    () => createBattle(level, [
      { type: 'ants', at: [0, 0] },
      { type: 'badger', at: [0, 0] },
    ], progress),
    /duplicate deployment tile/,
  );
});

test('move onto own middle or own tail is allowed and keeps full length', () => {
  const middle = makeState(['.....', '.....', '.....', '.....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]], maxLen: 5 },
  ]);
  const ontoMiddle = applyMove(middle, { kind: 'move', band: 'ants', path: [[0, 1]] });
  assert.deepEqual(bandById(ontoMiddle, 'ants').cells, [[0, 1], [0, 0], [1, 0], [1, 1], [0, 2]]);

  const tail = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 1], [0, 0], [1, 0], [1, 1]] },
  ]);
  const moved = applyMove(tail, { kind: 'move', band: 'ants', path: [[1, 1]] });
  assert.deepEqual(bandById(moved, 'ants').cells, [[1, 1], [0, 1], [0, 0], [1, 0]]);
});

test('a path may pass through its own neck without losing length (l05 solution shape)', () => {
  const s = makeState(['...', '...', '...', '...'], [
    { id: 'badger', type: 'badger', cells: [[2, 0], [2, 1], [1, 1]], maxLen: 5 },
  ]);
  const moved = applyMove(s, { kind: 'move', band: 'badger', path: [[2, 1], [2, 2]] });
  assert.deepEqual(bandById(moved, 'badger').cells, [[2, 2], [2, 1], [2, 0], [1, 1]]);
});

test('move validation', () => {
  const level = makeLevel({ bots: [{ type: 'harvester', cells: [[3, 2]] }] });
  const s = createBattle(level, [{ type: 'badger', at: [0, 0] }], makeProgress());

  assert.throws(
    () => applyMove(s, { kind: 'move', band: 'badger', path: [[1, 0], [2, 0], [3, 0]] }),
    Error,
  );
  assert.throws(() => applyMove(s, { kind: 'move', band: 'badger', path: [[1, 1]] }), Error);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'harvester-0', path: [[2, 2]] }), Error);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'badger', path: [] }), Error);

  const s1 = applyMove(s, { kind: 'move', band: 'badger', path: [[1, 0]] });
  assert.deepEqual(bandById(s1, 'badger').cells[0], [1, 0]);
  assert.equal(bandById(s1, 'badger').moved, true);
  assert.throws(() => applyMove(s1, { kind: 'move', band: 'badger', path: [[2, 0]] }), Error);
});

test('move captures objective and collects pickup on the leader\'s path', () => {
  const level = makeLevel({ grid: ['D*P.', '....', '....', '....'] });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] });

  assert.deepEqual(bandById(s1, 'ants').cells, [[2, 0], [1, 0], [0, 0]]);
  assert.equal(bandById(s1, 'ants').moved, true);
  assert.equal(s1.objectives[0].captured, true);
  assert.deepEqual(s1.pickups, []);
  assert.equal(s1.pickupsTaken, 1);
  assert.deepEqual(s1.events, [
    { kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] },
    { kind: 'pickup', at: [1, 0] },
    { kind: 'capture', at: [2, 0] },
  ]);
});

test('act after act rejected; act without moving allowed; move after act rejected', () => {
  // A bot on the field, so no move counts as clearing it.
  const level = makeLevel({ bots: [{ type: 'harvester', cells: [[3, 2]] }] });
  const s = createBattle(level, [{ type: 'badger', at: [0, 0] }], makeProgress());

  const s1 = applyMove(s, { kind: 'act', band: 'badger', action: 'dig', target: [1, 0] });
  assert.equal(s1.tiles[0][1].kind, 'hole');
  assert.equal(bandById(s1, 'badger').acted, true);
  assert.equal(bandById(s1, 'badger').moved, true);
  assert.throws(() => applyMove(s1, { kind: 'act', band: 'badger', action: 'dig', target: [0, 1] }), Error);
  assert.throws(() => applyMove(s1, { kind: 'move', band: 'badger', path: [[0, 1]] }), Error);

  const sMoved = applyMove(s, { kind: 'move', band: 'badger', path: [[0, 1]] });
  const s2 = applyMove(sMoved, { kind: 'act', band: 'badger', action: 'dig', target: [1, 1] });
  assert.equal(s2.tiles[1][1].kind, 'hole');

  assert.throws(() => applyMove(s, { kind: 'act', band: 'badger', action: 'maul', target: [1, 0] }), Error);
  assert.throws(() => applyMove(s, { kind: 'act', band: 'badger', action: 'dig', target: [3, 3] }), Error);
});

test('applyMove does not mutate its input', () => {
  const level = makeLevel({ grid: ['D*P.', '....', '....', '....'] });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const before = structuredClone(s);
  applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] });
  assert.deepEqual(s, before);
  applyMove(s, { kind: 'end' });
  assert.deepEqual(s, before);
});

test('advance is applyMove without the copy and without the re-plan', () => {
  const level = makeLevel({
    grid: ['DT..', '.H..', '....', '...P'],
    bots: [{ type: 'harvester', cells: [[3, 1], [3, 0]] }],
  });
  /** @type {import('../js/engine/types.js').Move[]} */
  const moves = [
    { kind: 'move', band: 'ants', path: [[0, 1], [0, 2]] },
    { kind: 'end' },
    { kind: 'move', band: 'ants', path: [[1, 2], [2, 2]] },
    { kind: 'act', band: 'ants', action: 'bite', target: [2, 1] },
    { kind: 'end' },
    { kind: 'move', band: 'ants', path: [[2, 3], [3, 3]] },
  ];
  const strip = (state) => ({
    ...state,
    bands: state.bands.map((b) => ({ ...b, plan: null })),
    events: state.events.filter((e) => e.kind !== 'plan'),
  });
  let pure = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const inPlace = structuredClone(pure);
  for (const move of moves) {
    pure = applyMove(pure, move);
    inPlace.events = [];
    assert.equal(advance(inPlace, move), undefined);
    assert.deepEqual(strip(inPlace), strip(pure), JSON.stringify(move));
  }
  // The den took a hit, the harvester took a bite, and the outcome is settled in place too.
  assert.equal(inPlace.tiles[1][1].kind, 'habitatDamaged');
  assert.equal(inPlace.outcome, 'won');
  assert.throws(() => advance(inPlace, { kind: 'end' }), /battle is over/);
});

test('end runs the bots\' turn, increments turn, resets flags', () => {
  const level = makeLevel({
    grid: ['DT..', '....', '....', '...P'],
    bots: [{ type: 'harvester', cells: [[1, 1]] }],
  });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'move', band: 'ants', path: [[0, 1]] });
  assert.equal(bandById(s1, 'ants').moved, true);

  // The ants stand beside the harvester, so it mows them, not the tree.
  const s2 = applyMove(s1, { kind: 'end' });
  assert.equal(s2.turn, 2);
  assert.equal(s2.tiles[0][1].kind, 'forest');
  assert.deepEqual(bandById(s2, 'ants').cells, [[0, 1]]);
  assert.equal(bandById(s2, 'ants').moved, false);
  assert.equal(bandById(s2, 'ants').acted, false);
  assert.equal(s2.outcome, null);
  assert.equal(s2.lostReason, null);
});

const NOTHING = { path: [], strike: null, actionId: null };

test('plans are re-made after every player move and after the bots\' turn, and undo keeps the old ones', () => {
  const level = makeLevel({
    grid: ['D......', '.......'],
    bots: [{ type: 'harvester', cells: [[6, 0], [6, 1]] }],
  });
  const s0 = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  assert.deepEqual(bandById(s0, 'harvester-0').plan, NOTHING);

  // Marching into its reach changes the plan at once.
  const charge = { path: [[5, 0], [4, 0]], strike: [3, 0], actionId: 'mow' };
  const s1 = applyMove(s0, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0], [3, 0]] });
  assert.deepEqual(bandById(s1, 'harvester-0').plan, charge);
  assert.deepEqual(s1.events, [
    { kind: 'move', band: 'ants', path: [[1, 0], [2, 0], [3, 0]] },
    { kind: 'plan', band: 'harvester-0', plan: charge },
  ]);
  // Undo is the earlier state, plans included.
  assert.deepEqual(bandById(s0, 'harvester-0').plan, NOTHING);

  // The bots' turn does exactly what the plan showed, then plans again.
  const s2 = applyMove(s1, { kind: 'end' });
  const stay = { path: [], strike: [3, 0], actionId: 'mow' };
  assert.deepEqual(s2.events, [
    { kind: 'move', band: 'harvester-0', path: [[5, 0], [4, 0]] },
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [4, 0], target: [3, 0] },
    { kind: 'damage', band: 'ants', amount: 1, wiped: false, cells: [[0, 0]] },
    { kind: 'plan', band: 'harvester-0', plan: stay },
  ]);
  assert.deepEqual(bandById(s2, 'harvester-0').cells, [[4, 0], [5, 0]]);
  assert.deepEqual(bandById(s2, 'harvester-0').plan, stay);

  // An action re-plans too.
  const s3 = applyMove(s2, { kind: 'act', band: 'ants', action: 'bite', target: [4, 0] });
  assert.deepEqual(s3.events.map((e) => e.kind), ['action', 'damage', 'plan']);
  assert.deepEqual(bandById(s3, 'harvester-0').plan, planBots(s3)['harvester-0']);
  assert.deepEqual(bandById(s2, 'harvester-0').cells, [[4, 0], [5, 0]]);
});

test('no free kiting: a band that drags its tail inside a bot\'s reach is struck every turn', () => {
  let s = makeState(['..........'], [
    { id: 'ants', type: 'ants', cells: [[3, 0], [2, 0], [1, 0]], maxLen: 6 },
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
  ]);
  const marches = [[[4, 0]], [[5, 0], [6, 0]], [[7, 0], [8, 0], [9, 0]]];
  const struck = [];
  for (const path of marches) {
    s = applyMove(s, { kind: 'move', band: 'ants', path });
    const plan = bandById(s, 'harvester-0').plan;
    s = applyMove(s, { kind: 'end' });
    const hit = s.events.find((e) => e.kind === 'damage');
    assert.ok(hit && hit.kind === 'damage' && hit.band === 'ants', `struck after marching to ${path.at(-1)}`);
    assert.deepEqual(hit.cells, [plan.strike]);
    struck.push(plan.strike);
  }
  // The harvester followed the tail: stand still, one step, then two.
  assert.deepEqual(struck, [[1, 0], [2, 0], [4, 0]]);
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[3, 0]]);
});

test('no free kiting: a band cannot turn a bot back and forth by stepping into the lane it is coming down', () => {
  // The den has a north side and a south side, nine steps apart round the
  // stones. The ants always stand on the side the bot is coming down.
  for (const type of ['harvester', 'planter']) {
    let s = makeState(['.......', 'HSSSSS.', '.......'], [
      { id: 'ants', type: 'ants', cells: [[0, 0], [0, 1]], maxLen: 2 },
      { id: 'bot-0', type, cells: [[5, 0]] },
    ]);
    let struck = false;
    for (let turn = 0; turn < 12 && s.outcome === null && !struck; turn += 1) {
      const botY = bandById(s, 'bot-0').cells[0][1];
      const antsY = bandById(s, 'ants').cells[0][1];
      if (botY !== 1 && botY !== antsY) {
        s = applyMove(s, { kind: 'move', band: 'ants', path: [[0, 1], [0, botY]] });
      }
      s = applyMove(s, { kind: 'end' });
      struck = s.events.some((e) => e.kind === 'damage' || (e.kind === 'terrain' && e.from === 'habitat'));
    }
    assert.ok(struck, `the ${type} was led round the stones for 12 turns and struck nothing`);
  }
});

test('a habitat survives one strike; the second destroys it and the battle is lost', () => {
  const level = makeLevel({
    grid: ['D...', '....', '..H.', '...P'],
    bots: [{ type: 'harvester', cells: [[3, 2]] }],
  });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  assert.equal(s.habitatStart, 1);
  assert.equal(countHabitats(s), 1);
  assert.deepEqual(bandById(s, 'harvester-0').plan, { path: [], strike: [2, 2], actionId: 'mow' });

  const s1 = applyMove(s, { kind: 'end' });
  assert.equal(s1.tiles[2][2].kind, 'habitatDamaged');
  assert.equal(countHabitats(s1), 1);
  assert.equal(s1.outcome, null);
  assert.equal(s1.lostReason, null);

  const s2 = applyMove(s1, { kind: 'end' });
  assert.equal(s2.tiles[2][2].kind, 'stubble');
  assert.equal(countHabitats(s2), 0);
  assert.equal(s2.outcome, 'lost');
  assert.equal(s2.lostReason, 'habitat');
  assert.deepEqual(s2.events.filter((e) => e.kind === 'terrain'), [
    { kind: 'terrain', at: [2, 2], from: 'habitatDamaged', to: 'stubble', cause: 'mow' },
  ]);
  assert.throws(() => applyMove(s2, { kind: 'end' }), /over/);
});

test('two bots striking the same habitat in one turn destroy it from intact', () => {
  const level = makeLevel({
    grid: ['D...', '....', '..H.', '....'],
    bots: [
      { type: 'harvester', cells: [[3, 2]] },
      { type: 'planter', cells: [[2, 3]] },
    ],
  });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  // Both plans are on the board the turn before.
  assert.deepEqual(bandById(s, 'harvester-0').plan, { path: [], strike: [2, 2], actionId: 'mow' });
  assert.deepEqual(bandById(s, 'planter-1').plan, { path: [], strike: [2, 2], actionId: 'pave' });
  const s1 = applyMove(s, { kind: 'end' });
  assert.equal(s1.tiles[2][2].kind, 'stubble');
  assert.equal(s1.outcome, 'lost');
  assert.equal(s1.lostReason, 'habitat');
});

test('when a habitat falls the bots\' turn ends there: the plans shown matched, and no events follow', () => {
  const s = makeState(['........', '........', '..H.....', '........'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [0, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
    { id: 'saw-1', type: 'saw', cells: [[7, 0]] },
  ]);
  s.tiles[2][2].kind = 'habitatDamaged';
  // The harvester will destroy the den, so the saw's plan shows it standing still.
  const shown = planBots(s);
  assert.deepEqual(shown, {
    'harvester-0': { path: [], strike: [2, 2], actionId: 'mow' },
    'saw-1': NOTHING,
  });

  const s1 = applyMove(s, { kind: 'end' });
  assert.equal(s1.outcome, 'lost');
  assert.equal(s1.lostReason, 'habitat');
  assert.deepEqual(bandById(s1, 'saw-1').cells, [[7, 0]]);
  assert.deepEqual(bandById(s1, 'ants').cells, [[0, 0], [0, 1]]);
  assert.deepEqual(s1.events, [
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [3, 2], target: [2, 2] },
    { kind: 'terrain', at: [2, 2], from: 'habitatDamaged', to: 'stubble', cause: 'mow' },
  ]);
  // A finished battle shows no plans.
  assert.deepEqual(bandById(s1, 'harvester-0').plan, NOTHING);
  assert.deepEqual(bandById(s1, 'saw-1').plan, NOTHING);
});

test('lost wins when one resolution both reaches the goal and destroys a habitat', () => {
  const s = makeState(['.PH.'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0]] },
  ]);
  s.objectives[0].captured = true;
  s.tiles[0][2].kind = 'habitatDamaged';
  const s1 = applyMove(s, { kind: 'end' });
  assert.equal(s1.tiles[0][2].kind, 'stubble');
  assert.equal(s1.outcome, 'lost');
  assert.equal(s1.lostReason, 'habitat');
});

test('habitats are not forest: they do not count for the reward', () => {
  const s = makeState(['THT', 'H..'], [
    { id: 'ants', type: 'ants', cells: [[1, 1]] },
  ]);
  s.tiles[1][0].kind = 'habitatDamaged';
  assert.equal(countForest(s), 2);
  assert.equal(s.forestStart, 2);
  assert.equal(countHabitats(s), 2);
  assert.equal(s.habitatStart, 2);
  assert.equal(rewardFor(s, makeLevel(), makeProgress()).forest, 2);
});

test('capture win is immediate', () => {
  const level = makeLevel({ grid: ['D.P.', '....', '....', '....'] });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] });
  assert.equal(s1.outcome, 'won');
  assert.equal(s1.lostReason, null);
  assert.equal(s1.turn, 1);
});

test('clear win', () => {
  const level = makeLevel({
    goal: 'clear',
    grid: ['D...', '....', '....', '....'],
    bots: [{ type: 'saw', cells: [[1, 0], [2, 0]] }],
  });
  const s = createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'act', band: 'bear', action: 'maul', target: [1, 0] });
  assert.equal(bandById(s1, 'saw-0'), undefined);
  assert.equal(s1.bands.some((b) => b.side === 'bots'), false);
  assert.equal(s1.outcome, 'won');
});

test('no bots left wins a capture level: pickups collected and objectives captured, each with its event', () => {
  const level = makeLevel({
    id: 'lvl-sweep',
    grid: ['D...', '..*.', '*..P', '...K'],
    bots: [{ type: 'saw', cells: [[1, 0]] }],
    firstClearSeeds: 20,
  });
  const s = createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'act', band: 'bear', action: 'maul', target: [1, 0] });
  assert.equal(s1.outcome, 'won');
  assert.equal(s1.lostReason, null);
  assert.deepEqual(s1.pickups, []);
  assert.equal(s1.pickupsTaken, 2);
  assert.ok(s1.objectives.every((o) => o.captured));
  assert.deepEqual(s1.events, [
    { kind: 'action', actor: 'bear', actionId: 'maul', from: [0, 0], target: [1, 0] },
    { kind: 'damage', band: 'saw-0', amount: 3, wiped: true, cells: [[1, 0]] },
    { kind: 'pickup', at: [2, 1] },
    { kind: 'pickup', at: [0, 2] },
    { kind: 'capture', at: [3, 2] },
    { kind: 'capture', at: [3, 3] },
  ]);
  // The reward counts what the sweep took: 2 pickups and 2 objectives at 5 each.
  assert.deepEqual(rewardFor(s1, level, makeProgress()), {
    pickups: 10,
    objectives: 10,
    forest: 0,
    firstClear: 20,
    total: 40,
  });
});

test('no bots left: an objective already captured is not captured again', () => {
  const level = makeLevel({
    grid: ['DP..', '....', '...K', '....'],
    bots: [{ type: 'saw', cells: [[1, 1]] }],
  });
  const s = createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'move', band: 'bear', path: [[1, 0]] });
  assert.equal(s1.objectives[0].captured, true);
  assert.equal(s1.outcome, null);
  const s2 = applyMove(s1, { kind: 'act', band: 'bear', action: 'maul', target: [1, 1] });
  assert.equal(s2.outcome, 'won');
  assert.deepEqual(s2.events.filter((e) => e.kind === 'capture'), [{ kind: 'capture', at: [3, 2] }]);
  assert.equal(rewardFor(s2, level, makeProgress({ cleared: { [level.id]: true } })).objectives, 10);
});

test('no bots left wins a rescue level and frees the trapped band', () => {
  const level = makeLevel({
    goal: 'rescue',
    grid: ['D...', '....', '....', '....'],
    trapped: [{ type: 'beaver', cells: [[3, 3], [2, 3]] }],
    bots: [{ type: 'harvester', cells: [[1, 0]] }],
  });
  const s = createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'act', band: 'bear', action: 'maul', target: [1, 0] });
  assert.equal(s1.outcome, 'won');
  const freed = bandById(s1, 'trapped-beaver');
  assert.equal(freed.trapped, false);
  assert.equal(freed.moved, true);
  assert.equal(freed.acted, true);
  assert.deepEqual(s1.events.slice(-1), [{ kind: 'freed', band: 'trapped-beaver' }]);
});

test('no bots left on a clear level collects the pickups too', () => {
  const level = makeLevel({
    goal: 'clear',
    grid: ['D..*', '....', '....', '....'],
    bots: [{ type: 'saw', cells: [[1, 0], [2, 0]] }],
  });
  const s = createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'act', band: 'bear', action: 'maul', target: [1, 0] });
  assert.equal(s1.outcome, 'won');
  assert.equal(s1.pickupsTaken, 1);
  assert.deepEqual(s1.events.slice(-1), [{ kind: 'pickup', at: [3, 0] }]);
});

test('with a bot left nothing is swept up', () => {
  const level = makeLevel({
    grid: ['D..*', '....', '....', '...P'],
    bots: [{ type: 'saw', cells: [[1, 0]] }, { type: 'harvester', cells: [[3, 2]] }],
  });
  const s = createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'act', band: 'bear', action: 'maul', target: [1, 0] });
  assert.equal(s1.outcome, null);
  assert.equal(s1.pickups.length, 1);
  assert.equal(s1.pickupsTaken, 0);
  assert.equal(s1.objectives[0].captured, false);
});

test('lost wins when the last bot falls in a resolution that also destroyed a habitat', () => {
  const s = makeState(['.._*', '...P'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[1, 0]] },
  ], { habitatStart: 1 });
  const s1 = applyMove(s, { kind: 'act', band: 'bear', action: 'maul', target: [1, 0] });
  assert.equal(s1.outcome, 'lost');
  assert.equal(s1.lostReason, 'habitat');
  assert.equal(s1.pickupsTaken, 0);
  assert.equal(s1.objectives[0].captured, false);
  assert.ok(!s1.events.some((e) => e.kind === 'pickup' || e.kind === 'capture'));
});

test('rescue: freeing wins', () => {
  const level = makeLevel({
    goal: 'rescue',
    grid: ['D...', '....', '....', '....'],
    trapped: [{ type: 'beaver', cells: [[2, 0], [3, 0]] }],
  });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  assert.equal(s.outcome, null);

  const s1 = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0]] });
  const freed = bandById(s1, 'trapped-beaver');
  assert.equal(freed.trapped, false);
  assert.equal(freed.moved, true);
  assert.equal(freed.acted, true);
  assert.deepEqual(s1.events, [
    { kind: 'move', band: 'ants', path: [[1, 0]] },
    { kind: 'freed', band: 'trapped-beaver' },
  ]);
  assert.equal(s1.outcome, 'won');
});

test('rescue: trapped band wiped loses', () => {
  const level = makeLevel({
    goal: 'rescue',
    grid: ['D...', '....', '....', '....'],
    trapped: [{ type: 'beaver', cells: [[2, 0]] }],
    bots: [{ type: 'saw', cells: [[3, 0], [3, 1]] }],
  });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'end' });
  assert.equal(bandById(s1, 'trapped-beaver'), undefined);
  assert.notEqual(bandById(s1, 'ants'), undefined);
  assert.equal(s1.outcome, 'lost');
  assert.equal(s1.lostReason, 'rescue');
});

test('all bands wiped loses', () => {
  const level = makeLevel({
    bots: [{ type: 'saw', cells: [[1, 0], [2, 0]] }],
  });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'end' });
  assert.equal(bandById(s1, 'ants'), undefined);
  assert.equal(s1.outcome, 'lost');
  assert.equal(s1.lostReason, 'wiped');
});

test('turn limit loses', () => {
  // A harvester out of reach, with no forest or den to go for: it stays put,
  // and its being there keeps the field from counting as cleared.
  const level = makeLevel({ turnLimit: 1, bots: [{ type: 'harvester', cells: [[3, 2]] }] });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'end' });
  assert.equal(s1.turn, 2);
  assert.equal(s1.outcome, 'lost');
  assert.equal(s1.lostReason, 'turns');
});

test('no moves after outcome', () => {
  const level = makeLevel({ grid: ['D.P.', '....', '....', '....'] });
  const s = createBattle(level, [{ type: 'ants', at: [0, 0] }], makeProgress());
  const won = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] });
  assert.equal(won.outcome, 'won');
  assert.throws(() => applyMove(won, { kind: 'end' }), /over/);
  assert.throws(() => applyMove(won, { kind: 'move', band: 'ants', path: [[3, 0]] }), /over/);
});

test('preview via events', () => {
  const level = makeLevel({
    bots: [{ type: 'saw', cells: [[1, 0], [1, 1]] }],
  });
  const s = createBattle(level, [{ type: 'bear', at: [0, 0] }], makeProgress());
  const s1 = applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [1, 0] });
  assert.deepEqual(s1.events[0], { kind: 'action', actor: 'bear', actionId: 'shove', from: [0, 0], target: [1, 0] });
  assert.deepEqual(s1.events.filter((e) => e.kind === 'push'), [
    { kind: 'push', outcome: { kind: 'moved', band: 'saw-0', to: [2, 0] } },
  ]);
  assert.deepEqual(bandById(s1, 'saw-0').cells, [[2, 0]]);
  assert.equal(s1.outcome, null);
});

test('rewardFor', () => {
  const s = makeState(['TTT.', 'P...', '....', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 2]] },
  ], { pickupsTaken: 2 });
  s.objectives[0].captured = true;
  const level = makeLevel({ id: 'lvl-reward', firstClearSeeds: 20 });

  assert.equal(countForest(s), 3);
  assert.deepEqual(rewardFor(s, level, makeProgress()), {
    pickups: 10,
    objectives: 5,
    forest: 3,
    firstClear: 20,
    total: 38,
  });
  assert.deepEqual(rewardFor(s, level, makeProgress({ cleared: { 'lvl-reward': true } })), {
    pickups: 10,
    objectives: 5,
    forest: 3,
    firstClear: 0,
    total: 18,
  });
});
