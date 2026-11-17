// Bees are small and slip through: at most two long, and they may walk
// through tiles other bands stand on, friend or bot, so long as every
// tile they end on (head and body) is free when the move ends. Terrain
// blocks them as it blocks any walker. Bots never pass through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND_TYPES, recruitCost } from '../js/engine/units.js';
import { bandById, reachable, passesThrough, canWalk } from '../js/engine/band.js';
import { applyMove } from '../js/engine/battle.js';
import { planBots } from '../js/engine/bots.js';
import { shopItems, buy } from '../js/campaign/shop.js';
import { newProgress } from '../js/campaign/progress.js';
import { search } from '../scripts/solve.mjs';
import { makeState } from './helpers.mjs';

const keys = (map) => [...map.keys()].sort();

test('bees top out at two, start at one, and are the only band that passes through', () => {
  assert.equal(BAND_TYPES.bees.maxLenCap, 2);
  assert.equal(BAND_TYPES.bees.startLen, 1);
  assert.equal(BAND_TYPES.bees.passThrough, true);
  for (const [id, type] of Object.entries(BAND_TYPES)) {
    if (id !== 'bees') assert.notEqual(type.passThrough, true, id);
  }
  // They keep the sting in a line of three.
  assert.equal(BAND_TYPES.bees.actions[0].id, 'sting');
  assert.equal(BAND_TYPES.bees.actions[0].pattern, 'line3');
});

test('the shop sells bees at one and grows them once, to two', () => {
  const p = newProgress();
  p.seeds = 200;
  const offer = shopItems(p).find((i) => i.id === 'type:bees');
  assert.ok(offer);
  assert.equal(offer.price, BAND_TYPES.bees.price);
  const owned = buy(p, 'type:bees');
  assert.deepEqual(owned.bands.bees, { maxLen: 1 });
  const grow = shopItems(owned).find((i) => i.id === 'recruit:bees');
  assert.ok(grow);
  assert.equal(grow.available, true);
  assert.equal(grow.price, recruitCost('bees', 1));
  const full = buy(owned, 'recruit:bees');
  assert.deepEqual(full.bands.bees, { maxLen: 2 });
  assert.equal(shopItems(full).find((i) => i.id === 'recruit:bees').available, false);
});

test('passesThrough: bees only, and never a bot', () => {
  const s = makeState(['....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[3, 0]] },
  ]);
  assert.equal(passesThrough(bandById(s, 'bees')), true);
  assert.equal(passesThrough(bandById(s, 'ants')), false);
  assert.equal(passesThrough(bandById(s, 'saw-0')), false);
  // A bee type on the bots' side would not pass either.
  assert.equal(passesThrough({ ...bandById(s, 'bees'), side: 'bots' }), false);
});

test('bees walk through a friend and a bot to the free tile beyond', () => {
  const s = makeState(['.....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 1 },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[2, 0]] },
  ]);
  const paths = reachable(s, 'bees');
  assert.deepEqual(keys(paths), ['3,0']);
  assert.deepEqual(paths.get('3,0'), [[1, 0], [2, 0], [3, 0]]);
  const next = applyMove(s, { kind: 'move', band: 'bees', path: [[1, 0], [2, 0], [3, 0]] });
  assert.deepEqual(bandById(next, 'bees').cells, [[3, 0]]);
  assert.deepEqual(bandById(next, 'ants').cells, [[1, 0]]);
  assert.deepEqual(bandById(next, 'saw-0').cells, [[2, 0]]);
  assert.deepEqual(next.events[0], { kind: 'move', band: 'bees', path: [[1, 0], [2, 0], [3, 0]] });
});

test('bees cannot stop on another band', () => {
  const s = makeState(['...'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 1 },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
  ]);
  assert.equal(reachable(s, 'bees').has('1,0'), false);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'bees', path: [[1, 0]] }), /cannot stop/);
});

test('a two-long bee band cannot leave its body cell on another band', () => {
  // Bees at 0,0 with room to grow to two. Walking 1,0 -> 2,0 would leave
  // the body on 1,0, where the ants are; walking on to 3,0 leaves it on
  // the free 2,0.
  const s = makeState(['....', '....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 2 },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
  ]);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'bees', path: [[1, 0], [2, 0]] }), /cannot stop/);
  const paths = reachable(s, 'bees');
  // 2,0 is two steps away only through the ants, and four round them.
  assert.equal(paths.has('2,0'), false);
  assert.deepEqual(paths.get('3,0'), [[1, 0], [2, 0], [3, 0]]);
  const next = applyMove(s, { kind: 'move', band: 'bees', path: [[1, 0], [2, 0], [3, 0]] });
  assert.deepEqual(bandById(next, 'bees').cells, [[3, 0], [2, 0]]);
});

test('every path reachable gives a band is one canWalk and applyMove accept', () => {
  const s = makeState(['.....', '.T.S.', '..~..', '.....'], [
    { id: 'bees', type: 'bees', cells: [[1, 0], [0, 0]], maxLen: 2 },
    { id: 'ants', type: 'ants', cells: [[2, 0], [2, 1]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0], [4, 0]] },
    { id: 'saw-1', type: 'saw', cells: [[0, 3], [1, 3]] },
  ]);
  for (const id of ['bees', 'ants', 'harvester-0', 'saw-1']) {
    const band = bandById(s, id);
    for (const path of reachable(s, id).values()) {
      assert.equal(canWalk(s, band, path), true, `${id} ${JSON.stringify(path)}`);
      if (band.side === 'us') applyMove(s, { kind: 'move', band: id, path });
    }
  }
});

test('terrain still blocks bees: stones, water and holes', () => {
  const s = makeState(['.S.', '.~.', '.o.'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 1 },
  ]);
  const paths = reachable(s, 'bees');
  for (const k of ['1,0', '1,1', '1,2']) assert.equal(paths.has(k), false, k);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'bees', path: [[1, 0]] }), /cannot step/);
});

test('other bands do not pass through: ants are blocked by a band in the lane', () => {
  const s = makeState(['....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 4 },
    { id: 'bees', type: 'bees', cells: [[1, 0]] },
  ]);
  assert.deepEqual(keys(reachable(s, 'ants')), []);
  assert.throws(() => applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] }), /cannot step/);
});

test('bots do not pass through bees: a harvester behind a bee band walks round or waits', () => {
  // The harvester is boxed in by forest with the bees in its only gap.
  const s = makeState(['T.T', 'T.T', 'T.T'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'bees', type: 'bees', cells: [[1, 1]], maxLen: 1 },
  ]);
  assert.deepEqual(keys(reachable(s, 'harvester-0')), []);
  const plan = planBots(s)['harvester-0'];
  assert.deepEqual(plan.path, []);
  // And it strikes the bees, which it sees, from where it stands.
  assert.deepEqual(plan.strike, [1, 1]);
});

test('a bee passing over an objective or a pickup takes it, like any walker', () => {
  // The harvester stands on the seed pickup, which it does not take.
  const s = makeState(['.*P..'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 1 },
    { id: 'harvester-1', type: 'harvester', cells: [[1, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[4, 0]] },
  ]);
  const next = applyMove(s, { kind: 'move', band: 'bees', path: [[1, 0], [2, 0], [3, 0]] });
  assert.equal(next.objectives[0].captured, true);
  assert.equal(next.pickupsTaken, 1);
});

test('the solver walks bees through a bot, as the game does', () => {
  // One lane, the ants in it and done for the turn, the permit beyond: on
  // turn 1 only the bees can get there, through the ants. A harvester
  // walled off below keeps the field from counting as clear.
  const s = makeState(['...P', 'SSSS', '....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 1 },
    { id: 'ants', type: 'ants', cells: [[1, 0]], moved: true, acted: true },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
  ]);
  const lines = search(s, { turns: 1 });
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.equal(line.turns, 1);
    assert.ok(line.moves.some((m) => m.kind === 'move' && m.band === 'bees' && m.path.some((p) => p[0] === 1 && p[1] === 0)));
    let state = s;
    for (const move of line.moves) state = applyMove(state, move);
    assert.equal(state.outcome, 'won');
  }
});
