// Trial rules: a level may switch on an experimental rule. With no rules a
// level plays exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBattle, applyMove, withRules, TRIAL_RULE_IDS } from '../js/engine/battle.js';
import { bandById } from '../js/engine/band.js';
import { LEVELS } from '../data/levels/index.js';

/** @typedef {import('../js/engine/types.js').Level} Level */

/**
 * @param {Partial<Level>} over
 * @returns {Level}
 */
function makeLevel(over) {
  return {
    id: 'test', name: 'Test', blurb: '', goal: 'clear', maxBands: 3, turnLimit: null,
    grid: ['D.......', '........'],
    bots: [{ type: 'harvester', cells: [[7, 1]] }],
    trapped: [], firstClearSeeds: 0, assumes: {},
    solution: { deploy: [], moves: [] },
    ...over,
  };
}

/** @param {Record<string, number>} bands */
function progressWith(bands) {
  return {
    version: /** @type {const} */ (1), seeds: 0, cleared: {}, story: { seen: {} },
    bands: Object.fromEntries(Object.entries(bands).map(([type, maxLen]) => [type, { maxLen }])),
  };
}

test('with no rules a band out of camp is fresh, as today', () => {
  const s = createBattle(makeLevel({}), [{ type: 'ants', at: [0, 0] }], progressWith({ ants: 4 }));
  assert.deepEqual(s.rules, {});
  assert.equal(bandById(s, 'ants').fresh, true);
});

test('woodOnlyGrowth: a band is never fresh, so it grows only on forest', () => {
  const level = makeLevel({ grid: ['D..TT...', '........'], rules: { woodOnlyGrowth: true } });
  const s0 = createBattle(level, [{ type: 'ants', at: [0, 0] }], progressWith({ ants: 4 }));
  assert.equal(bandById(s0, 'ants').fresh, false);
  const s1 = applyMove(s0, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0], [3, 0]] });
  assert.equal(bandById(s1, 'ants').cells.length, 2, 'one segment, plus one for the one tree');
  assert.deepEqual(s1.rules, { woodOnlyGrowth: true }, 'the rules ride along through a move');
});

test('withRules merges, and never strips a rule the level file set', () => {
  const level = makeLevel({ rules: { woodOnlyGrowth: true } });
  assert.deepEqual(withRules(level, {}).rules, { woodOnlyGrowth: true });
  assert.deepEqual(withRules(level, { woodOnlyGrowth: false }).rules, { woodOnlyGrowth: true });
  assert.deepEqual(withRules(makeLevel({}), { woodOnlyGrowth: true }).rules, { woodOnlyGrowth: true });
  assert.deepEqual(withRules(makeLevel({}), {}).rules ?? {}, {});
  assert.notEqual(withRules(level, {}), level, 'a copy');
});

test('no campaign level sets a trial rule, a roster or a bench exception', () => {
  for (const level of LEVELS) {
    assert.equal(level.rules, undefined, level.id);
    assert.equal(level.roster, undefined, level.id);
    assert.equal(level.benchAllows, undefined, level.id);
  }
});

test('every trial rule id is a key the Rules type knows', () => {
  assert.deepEqual([...TRIAL_RULE_IDS], ['woodOnlyGrowth', 'snakeBodies', 'foxDash', 'beaverGnaw', 'bearShovesStones', 'badgerEarthworks']);
});
