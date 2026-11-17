import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleState, VALLEY_STATES, COMPANY, NEW_TITLE_STATE } from '../js/ui/title-state.js';
import { newProgress } from '../js/campaign/progress.js';
import { LEVELS } from '../data/levels/index.js';

/**
 * A save with these levels cleared and these extra bands.
 * @param {Record<string, boolean>} cleared
 * @param {string[]} [bands]
 */
function save(cleared, bands = []) {
  const p = newProgress();
  p.cleared = cleared;
  for (const id of bands) p.bands[id] = { maxLen: 1 };
  return p;
}

test('titleState: a new game is the freshly cut valley and the two starters alone', () => {
  assert.deepEqual(titleState(newProgress(), LEVELS), { valley: 'cut', company: [] });
  assert.deepEqual(NEW_TITLE_STATE, { valley: 'cut', company: [] });
});

test('titleState: the valley is mending once a level is cleared, regrown when every level is', () => {
  assert.equal(titleState(save({ o01: true }), LEVELS).valley, 'mending');
  const all = Object.fromEntries(LEVELS.map((l) => [l.id, true]));
  assert.equal(titleState(save(all), LEVELS).valley, 'regrown');
  const allButOne = { ...all, [LEVELS[LEVELS.length - 1].id]: false };
  assert.equal(titleState(save(allButOne), LEVELS).valley, 'mending');
});

test('titleState: only real levels really cleared count', () => {
  assert.equal(titleState(save({ zz9: true }), LEVELS).valley, 'cut', 'not a level');
  assert.equal(titleState(save({ o01: false }), LEVELS).valley, 'cut', 'not cleared');
  assert.equal(titleState(save({ o01: true }), []).valley, 'cut', 'no levels at all');
});

test('titleState: the company is the owned bands beyond the starters, in a fixed order', () => {
  const state = titleState(save({}, ['bear', 'ants', 'wombat']), LEVELS);
  assert.deepEqual(state.company, ['ants', 'bear']);
  assert.deepEqual(titleState(save({}, [...COMPANY].reverse()), LEVELS).company, [...COMPANY]);
});

test('the valley states and the company are the ones the art is painted for', () => {
  assert.deepEqual([...VALLEY_STATES], ['cut', 'mending', 'regrown']);
  assert.deepEqual([...COMPANY], ['ants', 'bees', 'beaver', 'badger', 'owl', 'bear']);
});
