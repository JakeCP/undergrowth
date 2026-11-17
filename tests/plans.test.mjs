import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, createBattle } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import {
  planDrawings, diffPlans, engagedBotIds, struckHabitats,
} from '../js/ui/plans.js';
import { makeState, valleyProgress } from './helpers.mjs';

// --- planDrawings ---

test('planDrawings: the line runs from the head along the path, then to the strike tile', () => {
  const s = makeState(['.....', '.....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0], [0, 1]], plan: { path: [[1, 0], [2, 0]], strike: [3, 0], actionId: 'mow' } },
  ]);
  const [d] = planDrawings(s);
  assert.equal(d.id, 'harvester-0');
  assert.deepEqual(d.line, [[0, 0], [1, 0], [2, 0]]);
  assert.deepEqual(d.strike, [3, 0]);
  assert.deepEqual(d.strikeFrom, [2, 0]);
});

test('planDrawings: a strike with no walk is struck from the head', () => {
  const s = makeState(['...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 0]], plan: { path: [], strike: [2, 0], actionId: 'saw' } },
  ]);
  const [d] = planDrawings(s);
  assert.deepEqual(d.line, [[1, 0]]);
  assert.deepEqual(d.strikeFrom, [1, 0]);
});

test('planDrawings: a walk with no strike has a line and no mark', () => {
  const s = makeState(['...'], [
    { id: 'planter-0', type: 'planter', cells: [[0, 0]], plan: { path: [[1, 0]], strike: null, actionId: null } },
  ]);
  const [d] = planDrawings(s);
  assert.deepEqual(d.line, [[0, 0], [1, 0]]);
  assert.equal(d.strike, null);
});

test('planDrawings: animals, bots with an empty or no plan, and off-board strikes draw nothing', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[1, 0]], plan: { path: [], strike: null, actionId: null } },
    { id: 'saw-1', type: 'saw', cells: [[2, 0]], plan: null },
  ]);
  assert.deepEqual(planDrawings(s), []);
  const off = makeState(['...'], [
    { id: 'saw-0', type: 'saw', cells: [[2, 0]], plan: { path: [], strike: [3, 0], actionId: 'saw' } },
  ]);
  assert.deepEqual(planDrawings(off), []);
});

test('planDrawings: the key is the same for the same drawing and changes when the head or plan does', () => {
  const plan = { path: [[1, 0]], strike: [2, 0], actionId: 'mow' };
  const a = makeState(['....'], [{ id: 'harvester-0', type: 'harvester', cells: [[0, 0]], plan }]);
  const b = makeState(['....'], [{ id: 'harvester-0', type: 'harvester', cells: [[0, 0]], plan }]);
  const moved = makeState(['....'], [{ id: 'harvester-0', type: 'harvester', cells: [[1, 0]], plan: { path: [], strike: [2, 0], actionId: 'mow' } }]);
  const other = makeState(['....'], [{ id: 'harvester-0', type: 'harvester', cells: [[0, 0]], plan: { path: [[1, 0]], strike: [1, 1], actionId: 'mow' } }]);
  assert.equal(planDrawings(a)[0].key, planDrawings(b)[0].key);
  assert.notEqual(planDrawings(a)[0].key, planDrawings(moved)[0].key);
  assert.notEqual(planDrawings(a)[0].key, planDrawings(other)[0].key);
});

// --- diffPlans ---

test('diffPlans: an unchanged plan is kept, a changed or new one drawn, a gone one dropped', () => {
  const drawn = new Map([['a', 'k1'], ['b', 'k2'], ['c', 'k3']]);
  const wanted = [{ id: 'a', key: 'k1' }, { id: 'b', key: 'k2-new' }, { id: 'd', key: 'k4' }];
  assert.deepEqual(diffPlans(drawn, wanted), { keep: ['a'], draw: ['b', 'd'], drop: ['b', 'c'] });
});

test('diffPlans: a re-plan that changes nothing redraws nothing', () => {
  // The ants are far from the harvester, which stands next to the den.
  const s = makeState(['D.........', '..........', '........H.'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'beaver', type: 'beaver', cells: [[0, 2]] },
    { id: 'harvester-0', type: 'harvester', cells: [[9, 2]] },
  ]);
  // Two moves, each re-planning every bot (one plan event each), that
  // leave the harvester's plan as it was.
  const before = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0]] });
  const after = applyMove(before, { kind: 'move', band: 'beaver', path: [[0, 1]] });
  assert.ok(after.events.some((e) => e.kind === 'plan' && e.band === 'harvester-0'));
  assert.deepEqual(after.bands[2].plan, { path: [], strike: [8, 2], actionId: 'mow' });
  const drawn = new Map(planDrawings(before).map((d) => [d.id, d.key]));
  const diff = diffPlans(drawn, planDrawings(after));
  assert.deepEqual(diff.draw, []);
  assert.deepEqual(diff.drop, []);
  assert.deepEqual(diff.keep, ['harvester-0']);
});

// --- engagedBotIds ---

test('engagedBotIds: a harvester in reach of a band is engaged, one far off is not; a saw always is', () => {
  const s = makeState(['..........'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[9, 0]] },
    { id: 'saw-2', type: 'saw', cells: [[8, 0]] },
  ]);
  assert.deepEqual(engagedBotIds(s), ['harvester-0', 'saw-2']);
});

test('engagedBotIds: none on a finished battle, as the bots then plan nothing', () => {
  for (const outcome of /** @type {const} */ (['won', 'lost'])) {
    const s = makeState(['..........'], [
      { id: 'ants', type: 'ants', cells: [[0, 0]] },
      { id: 'harvester-0', type: 'harvester', cells: [[3, 0]] },
      { id: 'saw-1', type: 'saw', cells: [[8, 0]] },
    ], { outcome });
    assert.deepEqual(engagedBotIds(s), [], outcome);
  }
});

// --- the dens the plans strike ---

test('struckHabitats: a plan that strikes a den marks it, intact or damaged', () => {
  const grid = ['....', '..H.', '....'];
  const aimed = makeState(grid, [
    { id: 'harvester-0', type: 'harvester', cells: [[3, 1]], plan: { path: [], strike: [2, 1], actionId: 'mow' } },
  ]);
  assert.deepEqual(struckHabitats(aimed), ['2,1']);
  aimed.tiles[1][2] = { kind: 'habitatDamaged', variant: null, under: null };
  assert.deepEqual(struckHabitats(aimed), ['2,1']);
  const elsewhere = makeState(grid, [
    { id: 'harvester-0', type: 'harvester', cells: [[3, 1]], plan: { path: [], strike: [3, 0], actionId: 'mow' } },
  ]);
  assert.deepEqual(struckHabitats(elsewhere), []);
});

// A strike on a band hits the band only (living-bots spec, section 6),
// so a den with a band on it is not what the plan strikes.

test('struckHabitats: a den with a band on it is shielded, so the plan does not strike it', () => {
  const s = makeState(['H...', '....'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]], maxLen: 3 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]], plan: { path: [], strike: [0, 0], actionId: 'mow' } },
  ]);
  assert.deepEqual(struckHabitats(s), []);
});

test('struckHabitats: a den whose band an earlier bot wipes out is struck by the next', () => {
  const s = makeState(['H...', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 4 },
    { id: 'saw-0', type: 'saw', cells: [[0, 1]], plan: { path: [], strike: [0, 0], actionId: 'saw' } },
    { id: 'harvester-1', type: 'harvester', cells: [[1, 0]], plan: { path: [], strike: [0, 0], actionId: 'mow' } },
  ]);
  assert.deepEqual(struckHabitats(s), ['0,0']);
});

test('struckHabitats: the walk comes first, then the strike, in level order', () => {
  const s = makeState(['H...', '....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0]], plan: { path: [[2, 0], [1, 0]], strike: [0, 0], actionId: 'mow' } },
  ]);
  assert.deepEqual(struckHabitats(s), ['0,0']);
  assert.equal(s.bands[0].cells[0][0], 3, 'the state passed in is not changed');
  assert.equal(s.tiles[0][0].kind, 'habitat');
});

test('struckHabitats: nothing is struck after a den is destroyed, because the turn stops', () => {
  const s = makeState(['H..H', '....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]], plan: { path: [], strike: [0, 0], actionId: 'mow' } },
    { id: 'harvester-1', type: 'harvester', cells: [[2, 0]], plan: { path: [], strike: [3, 0], actionId: 'mow' } },
  ]);
  s.tiles[0][0] = { kind: 'habitatDamaged', variant: null, under: null };
  assert.deepEqual(struckHabitats(s), ['0,0']);
});

test('struckHabitats: on every recorded line, the dens marked are the dens the bots turn strikes', () => {
  let ends = 0;
  let struck = 0;
  for (const level of LEVELS) {
    const progress = valleyProgress();
    for (const [type, n] of Object.entries(level.assumes)) progress.bands[type] = { maxLen: n };
    for (const line of [level.solution, ...(level.alternatives ?? [])]) {
      let state = createBattle(level, line.deploy, progress);
      for (const move of line.moves) {
        const next = applyMove(state, move);
        if (move.kind === 'end') {
          const hit = next.events
            .filter((e) => e.kind === 'terrain' && (e.from === 'habitat' || e.from === 'habitatDamaged'))
            .map((e) => `${e.at[0]},${e.at[1]}`);
          assert.deepEqual(struckHabitats(state), [...new Set(hit)], `${level.id} turn ${state.turn}`);
          ends += 1;
          struck += hit.length;
        }
        state = next;
      }
    }
  }
  assert.ok(ends > 0);
  assert.ok(struck > 0, 'some recorded line lets a den be struck');
});
