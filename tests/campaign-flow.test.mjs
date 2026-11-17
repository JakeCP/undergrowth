import test from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS } from '../data/levels/index.js';
import { CAMPAIGN_NODES } from '../data/campaign.js';
import { createBattle, applyMove, rewardFor } from '../js/engine/battle.js';
import {
  newProgress,
  loadProgress,
  saveProgress,
  applyVictory,
} from '../js/campaign/progress.js';
import { shopItems, buy } from '../js/campaign/shop.js';
import { unlockedLevels } from '../js/campaign/campaign.js';
import { valleyProgress } from './helpers.mjs';

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
  };
}

// l01 by id: the opening levels come before it.
function winL01(progress) {
  const level = LEVELS.find((l) => l.id === 'l01');
  assert.ok(level);
  let state = createBattle(level, level.solution.deploy, progress);
  for (const move of level.solution.moves) state = applyMove(state, move);
  return { level, state };
}

test('win l01 -> reward -> applyVictory -> save -> reload unlocks l02/l03', () => {
  const storage = fakeStorage();
  const progress = valleyProgress();
  const { level, state } = winL01(progress);
  assert.equal(state.outcome, 'won');
  const reward = rewardFor(state, level, progress);
  assert.ok(reward.total > 0);
  const won = applyVictory(progress, level.id, reward);
  saveProgress(won, storage);
  const loaded = loadProgress(storage);
  assert.equal(loaded.cleared.l01, true);
  assert.equal(loaded.seeds, reward.total);
  const unlocked = unlockedLevels(loaded, CAMPAIGN_NODES);
  assert.ok(unlocked.has('l01'));
  assert.ok(unlocked.has('l02'));
  assert.ok(unlocked.has('l03'));
});

test('buy recruit:ants -> save -> reload keeps seeds and maxLen', () => {
  const storage = fakeStorage();
  const progress = valleyProgress();
  progress.seeds = 100;
  const item = shopItems(progress).find((i) => i.id === 'recruit:ants');
  assert.ok(item);
  const beforeLen = progress.bands.ants.maxLen;
  const after = buy(progress, 'recruit:ants');
  saveProgress(after, storage);
  const loaded = loadProgress(storage);
  assert.equal(loaded.seeds, 100 - item.price);
  assert.equal(loaded.bands.ants.maxLen, beforeLen + 1);
});

test('replaying l01 after clear gives no first-clear bonus', () => {
  const progress = valleyProgress();
  const { level, state } = winL01(progress);
  assert.equal(state.outcome, 'won');
  const reward1 = rewardFor(state, level, progress);
  const cleared = applyVictory(progress, level.id, reward1);
  const reward2 = rewardFor(state, level, cleared);
  assert.equal(reward2.firstClear, 0);
  assert.equal(reward2.total, reward1.total - level.firstClearSeeds);
});

test('a new game saved and reloaded is the same new game: the fox, the hedgehog and nothing seen', () => {
  const storage = fakeStorage();
  saveProgress(newProgress(), storage);
  const loaded = loadProgress(storage);
  assert.deepEqual(loaded, newProgress());
  assert.deepEqual(Object.keys(loaded.bands).sort(), ['fox', 'hedgehog']);
  assert.equal(storage.map.has('undergrowth.save.bad'), false);
});
