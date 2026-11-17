import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandById,
  occupantAt,
  canStep,
  stepBand,
  reachable,
  damageBand,
  pushBand,
} from '../js/engine/band.js';
import { makeState } from './helpers.mjs';

test('stepBand grows behind the leader up to maxLen', () => {
  const s = makeState(['....', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 4 },
  ]);
  let band = bandById(s, 'ants');
  for (const p of [[1, 0], [2, 0], [3, 0], [3, 1]]) {
    band = stepBand(band, p);
  }
  assert.deepEqual(band.cells, [[3, 1], [3, 0], [2, 0], [1, 0]]);
  assert.deepEqual(bandById(s, 'ants').cells, [[0, 0]]);
});

test('stepBand onto own body does not grow', () => {
  const s = makeState(['..'], [
    { id: 'ants', type: 'ants', cells: [[1, 0], [0, 0]] },
  ]);
  const band = stepBand(bandById(s, 'ants'), [0, 0]);
  assert.deepEqual(band.cells, [[0, 0], [1, 0]]);
});

test('regrowth', () => {
  const s = makeState(['........'], [
    { id: 'ants', type: 'ants', cells: [[3, 0], [2, 0], [1, 0], [0, 0]] },
  ]);
  damageBand(s, 'ants', 2);
  assert.equal(bandById(s, 'ants').cells.length, 2);
  let band = bandById(s, 'ants');
  band = stepBand(band, [4, 0]);
  band = stepBand(band, [5, 0]);
  assert.equal(band.cells.length, 4);
  band = stepBand(band, [6, 0]);
  assert.equal(band.cells.length, 4);
});

test('reachable respects terrain and other bands', () => {
  const s = makeState(['.T~.', '....', 'S...', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1]] },
  ]);
  assert.deepEqual([...reachable(s, 'ants').keys()].sort(), ['0,1', '1,0']);
});

test('reachable gives shortest paths within speed', () => {
  const grid = Array.from({ length: 8 }, () => '........');
  const s = makeState(grid, [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
  ]);
  const r = reachable(s, 'ants');
  assert.deepEqual(r.get('2,1'), [[1, 0], [2, 0], [2, 1]]);
  assert.equal(r.has('3,1'), false);
  assert.equal(r.has('0,0'), false);
});

test('reachable for bots avoids forest', () => {
  const s = makeState(['.T..', '....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 1]] },
  ]);
  assert.equal(reachable(s, 'harvester-0').has('1,0'), false);
});

test('damageBand wipes at zero', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[2, 0], [1, 0], [0, 0]] },
  ]);
  damageBand(s, 'ants', 5);
  assert.equal(bandById(s, 'ants'), undefined);
  assert.deepEqual(s.bands, []);
  assert.deepEqual(s.events, [
    { kind: 'damage', band: 'ants', amount: 5, wiped: true, cells: [[0, 0], [1, 0], [2, 0]] },
  ]);
});

test('push moves leader, body follows without growing', () => {
  const s = makeState(['....', '....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1], [3, 1]] },
  ]);
  const outcome = pushBand(s, 'harvester-0', 'W');
  assert.deepEqual(outcome, { kind: 'moved', band: 'harvester-0', to: [1, 1] });
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[1, 1], [2, 1]]);
  assert.deepEqual(s.events, [{ kind: 'push', outcome }]);
});

test('push into water: bot falls; owl does not', () => {
  const s = makeState(['.~'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
  ]);
  const outcome = pushBand(s, 'harvester-0', 'E');
  assert.deepEqual(outcome, { kind: 'falls', band: 'harvester-0', at: [1, 0] });
  assert.equal(bandById(s, 'harvester-0'), undefined);
  assert.deepEqual(s.events, [
    { kind: 'damage', band: 'harvester-0', amount: 1, wiped: true, cells: [[0, 0]] },
    { kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [1, 0] } },
  ]);

  const s2 = makeState(['.~'], [
    { id: 'owl', type: 'owl', cells: [[0, 0]] },
  ]);
  const outcome2 = pushBand(s2, 'owl', 'E');
  assert.deepEqual(outcome2, { kind: 'moved', band: 'owl', to: [1, 0] });
  assert.deepEqual(bandById(s2, 'owl').cells, [[1, 0]]);
});

test('push into stones bumps target only', () => {
  const s = makeState(['.S..', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [0, 1]] },
  ]);
  const outcome = pushBand(s, 'ants', 'E');
  assert.deepEqual(outcome, { kind: 'bumped', band: 'ants', other: null });
  assert.deepEqual(bandById(s, 'ants').cells, [[0, 0]]);
  assert.deepEqual(s.events, [
    { kind: 'damage', band: 'ants', amount: 1, wiped: false, cells: [[0, 1]] },
    { kind: 'push', outcome: { kind: 'bumped', band: 'ants', other: null } },
  ]);
});

test('a bot pushed at a habitat bumps and stays off it; an animal is pushed onto it', () => {
  for (const kind of ['habitat', 'habitatDamaged']) {
    const s = makeState(['.H.', '...'], [
      { id: 'harvester-0', type: 'harvester', cells: [[0, 0], [0, 1]] },
    ]);
    s.tiles[0][1].kind = /** @type {'habitat'|'habitatDamaged'} */ (kind);
    assert.deepEqual(pushBand(s, 'harvester-0', 'E'), { kind: 'bumped', band: 'harvester-0', other: null });
    assert.deepEqual(bandById(s, 'harvester-0').cells, [[0, 0]]);
    // A bump is not a strike: the habitat is as it was.
    assert.equal(s.tiles[0][1].kind, kind);

    const a = makeState(['.H.', '...'], [
      { id: 'ants', type: 'ants', cells: [[0, 0], [0, 1]] },
    ]);
    a.tiles[0][1].kind = /** @type {'habitat'|'habitatDamaged'} */ (kind);
    assert.deepEqual(pushBand(a, 'ants', 'E'), { kind: 'moved', band: 'ants', to: [1, 0] });
    assert.deepEqual(bandById(a, 'ants').cells, [[1, 0], [0, 0]]);
    assert.equal(a.tiles[0][1].kind, kind);
  }
});

test('push into another band bumps both', () => {
  const s = makeState(['....', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [0, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0]] },
  ]);
  const outcome = pushBand(s, 'ants', 'E');
  assert.deepEqual(outcome, { kind: 'bumped', band: 'ants', other: 'harvester-0' });
  assert.deepEqual(bandById(s, 'ants').cells, [[0, 0]]);
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[1, 0]]);
  assert.deepEqual(s.events, [
    { kind: 'damage', band: 'ants', amount: 1, wiped: false, cells: [[0, 1]] },
    { kind: 'damage', band: 'harvester-0', amount: 1, wiped: false, cells: [[2, 0]] },
    { kind: 'push', outcome: { kind: 'bumped', band: 'ants', other: 'harvester-0' } },
  ]);
});

test('push off board edge bumps', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0]] },
  ]);
  const outcome = pushBand(s, 'ants', 'W');
  assert.deepEqual(outcome, { kind: 'bumped', band: 'ants', other: null });
  assert.deepEqual(bandById(s, 'ants').cells, [[0, 0]]);
});

test('push onto objective does not capture', () => {
  const s = makeState(['.P'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
  ]);
  const outcome = pushBand(s, 'ants', 'E');
  assert.equal(outcome.kind, 'moved');
  assert.equal(s.objectives[0].captured, false);
});

test('push onto pickup does not collect', () => {
  const s = makeState(['.*'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
  ]);
  const outcome = pushBand(s, 'ants', 'E');
  assert.equal(outcome.kind, 'moved');
  assert.equal(s.pickups.length, 1);
});

test('trapped band can be pushed', () => {
  const s = makeState(['..', '..'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], trapped: true },
  ]);
  const outcome = pushBand(s, 'ants', 'S');
  assert.deepEqual(outcome, { kind: 'moved', band: 'ants', to: [0, 1] });
  assert.deepEqual(bandById(s, 'ants').cells, [[0, 1]]);
});

test('push back into own body', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[1, 0], [2, 0]] },
  ]);
  const outcome = pushBand(s, 'ants', 'E');
  assert.deepEqual(outcome, { kind: 'moved', band: 'ants', to: [2, 0] });
  assert.deepEqual(bandById(s, 'ants').cells, [[2, 0], [1, 0]]);
});

test('bandById, occupantAt and canStep', () => {
  const s = makeState(['.T~', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [0, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1]] },
  ]);
  const ants = bandById(s, 'ants');
  assert.equal(bandById(s, 'missing'), undefined);
  assert.equal(occupantAt(s, [0, 1]).id, 'ants');
  assert.equal(occupantAt(s, [1, 1]).id, 'harvester-0');
  assert.equal(occupantAt(s, [2, 1]), undefined);
  assert.equal(canStep(s, ants, [1, 0]), true);
  assert.equal(canStep(s, ants, [2, 0]), false);
  assert.equal(canStep(s, ants, [1, 1]), false);
  assert.equal(canStep(s, ants, [0, 1]), true);
  assert.equal(canStep(s, ants, [-1, 0]), false);
  assert.equal(canStep(s, ants, [0, -1]), false);
});

test('damage events list the removed tail cells, tail end first', () => {
  const s = makeState(['....'], [
    { id: 'ants', type: 'ants', cells: [[3, 0], [2, 0], [1, 0], [0, 0]] },
  ]);
  damageBand(s, 'ants', 2);
  assert.deepEqual(bandById(s, 'ants').cells, [[3, 0], [2, 0]]);
  assert.deepEqual(s.events, [
    { kind: 'damage', band: 'ants', amount: 2, wiped: false, cells: [[0, 0], [1, 0]] },
  ]);
  // The event's cells are copies, not the band's own arrays.
  const event = s.events[0];
  assert.ok(event.kind === 'damage');
  event.cells[0][0] = 9;
  assert.deepEqual(bandById(s, 'ants').cells, [[3, 0], [2, 0]]);
});

test('damageBand with non-positive amount does nothing', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[1, 0], [0, 0]] },
  ]);
  damageBand(s, 'ants', 0);
  damageBand(s, 'ants', -1);
  assert.deepEqual(bandById(s, 'ants').cells, [[1, 0], [0, 0]]);
  assert.deepEqual(s.events, []);
});

test('makeState defaults and deep-copied cells', () => {
  const cells = [[0, 0]];
  const s = makeState(['.T', 'P*'], [
    { id: 'harvester-0', type: 'harvester', cells },
  ]);
  assert.equal(s.levelId, 'test');
  assert.equal(s.goal, 'capture');
  assert.equal(s.turn, 1);
  assert.equal(s.turnLimit, null);
  assert.equal(s.forestStart, 1);
  assert.equal(s.habitatStart, 0);
  assert.equal(s.pickupsTaken, 0);
  assert.equal(s.outcome, null);
  assert.equal(s.lostReason, null);
  assert.deepEqual(s.events, []);
  assert.deepEqual(s.objectives, [{ at: [0, 1], kind: 'permit', captured: false }]);
  assert.deepEqual(s.pickups, [[1, 1]]);
  const band = bandById(s, 'harvester-0');
  assert.equal(band.side, 'bots');
  assert.equal(band.maxLen, 1);
  assert.equal(band.moved, false);
  assert.equal(band.acted, false);
  assert.equal(band.trapped, false);
  assert.equal(band.plan, null);
  cells[0][0] = 9;
  assert.deepEqual(band.cells, [[0, 0]]);
});

test('stepBand onto own body keeps full length', () => {
  const s = makeState(['.....', '.....', '.....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]], maxLen: 5 },
  ]);
  const before = bandById(s, 'ants');
  const band = stepBand(before, [0, 1]);
  assert.equal(band.cells.length, before.cells.length);
  assert.deepEqual(band.cells, [[0, 1], [0, 0], [1, 0], [1, 1], [0, 2]]);
});

test('canStep onto any own body cell', () => {
  const s = makeState(['.....', '.....', '.....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]], maxLen: 5 },
  ]);
  const ants = bandById(s, 'ants');
  assert.equal(canStep(s, ants, [0, 1]), true);
  assert.equal(canStep(s, ants, [1, 1]), true);
  assert.equal(canStep(s, ants, [1, 0]), true);
  assert.equal(canStep(s, ants, [0, 2]), true);
});

test('reachable includes own middle and the tail cell', () => {
  const trapped = makeState(['.....', '.....', '.....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]], maxLen: 5 },
  ]);
  assert.deepEqual(reachable(trapped, 'ants').get('0,1'), [[0, 1]]);
  assert.deepEqual(reachable(trapped, 'ants').get('1,0'), [[1, 0]]);

  const loop = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 1], [0, 0], [1, 0], [1, 1]] },
  ]);
  assert.deepEqual(reachable(loop, 'ants').get('1,1'), [[1, 1]]);
});

test('push into own middle moves and keeps full length', () => {
  const s = makeState(['.....', '.....', '.....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]], maxLen: 5 },
  ]);
  const outcome = pushBand(s, 'ants', 'S');
  assert.deepEqual(outcome, { kind: 'moved', band: 'ants', to: [0, 1] });
  assert.deepEqual(bandById(s, 'ants').cells, [[0, 1], [0, 0], [1, 0], [1, 1], [0, 2]]);
});

test('push onto own neck moves and keeps full length', () => {
  const s = makeState(['....', '....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0], [3, 0]] },
  ]);
  const outcome = pushBand(s, 'harvester-0', 'E');
  assert.deepEqual(outcome, { kind: 'moved', band: 'harvester-0', to: [2, 0] });
  assert.deepEqual(bandById(s, 'harvester-0').cells, [[2, 0], [1, 0], [3, 0]]);
});

test('push onto own tail moves and stays contiguous', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 1], [0, 0], [1, 0], [1, 1]] },
  ]);
  const outcome = pushBand(s, 'ants', 'E');
  assert.deepEqual(outcome, { kind: 'moved', band: 'ants', to: [1, 1] });
  assert.deepEqual(bandById(s, 'ants').cells, [[1, 1], [0, 1], [0, 0], [1, 0]]);
});

test('pushBand on a missing band throws and emits nothing', () => {
  const s = makeState(['..'], []);
  assert.throws(() => pushBand(s, 'ghost', 'E'), /no such band "ghost"/);
  assert.deepEqual(s.events, []);
});
