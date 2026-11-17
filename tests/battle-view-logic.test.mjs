import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextSelection, inputAllowed, coalesceSentences, endTurnNeedsConfirm, resultMessage,
} from '../js/ui/battle-view.js';
import { describeIntent } from '../js/ui/text.js';
import { createBattle, applyMove } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { makeState, valleyProgress } from './helpers.mjs';

// --- nextSelection ---

test('nextSelection: tapping own unacted band selects it', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0]] },
  ]);
  assert.deepEqual(nextSelection(s, null, [0, 0]), { selected: 'ants', info: null });
});

test('nextSelection: tapping a body cell of own unacted band selects it', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0]] },
  ]);
  assert.deepEqual(nextSelection(s, null, [1, 0]), { selected: 'ants', info: null });
});

test('nextSelection: tapping an acted own band keeps the current selection', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0]], acted: true },
    { id: 'badger', type: 'badger', cells: [[2, 2]] },
  ]);
  assert.deepEqual(nextSelection(s, 'badger', [0, 0]), { selected: 'badger', info: 'Ants 2/2' });
  assert.deepEqual(nextSelection(s, null, [0, 0]), { selected: null, info: 'Ants 2/2' });
});

test('nextSelection: tapping a bot shows its plan and clears selection', () => {
  const s = makeState(['.T.', '...', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1], [1, 2]], plan: { path: [], strike: [1, 0], actionId: 'mow' } },
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
  ]);
  const bot = s.bands[0];
  assert.deepEqual(nextSelection(s, 'ants', [1, 1]), {
    selected: null,
    info: 'Harvester will mow the forest to the north',
  });
  assert.equal(describeIntent(s, bot), 'Harvester will mow the forest to the north');
});

test('nextSelection: tapping empty ground clears selection and info', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
  ]);
  assert.deepEqual(nextSelection(s, 'ants', [2, 2]), { selected: null, info: null });
});

test('nextSelection: with outcome set it returns nothing', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]], plan: null },
  ], { outcome: 'won' });
  assert.deepEqual(nextSelection(s, null, [0, 0]), { selected: null, info: null });
  assert.deepEqual(nextSelection(s, null, [2, 2]), { selected: null, info: null });
});

// --- inputAllowed ---

test('inputAllowed: true only when no outcome and not busy', () => {
  const open = makeState(['...', '...', '...'], []);
  const won = makeState(['...', '...', '...'], [], { outcome: 'won' });
  const lost = makeState(['...', '...', '...'], [], { outcome: 'lost' });
  assert.equal(inputAllowed(open, false), true);
  assert.equal(inputAllowed(open, true), false);
  assert.equal(inputAllowed(won, false), false);
  assert.equal(inputAllowed(lost, true), false);
});

// --- coalesceSentences ---

test('coalesceSentences: merges repeated sentences with a count', () => {
  assert.deepEqual(
    coalesceSentences(['Forest is mown to stubble', 'Forest is mown to stubble', 'Ants lose 2']),
    ['Forest is mown to stubble ×2', 'Ants lose 2'],
  );
});

test('coalesceSentences: counts non-consecutive repeats, keeps first-occurrence order', () => {
  assert.deepEqual(coalesceSentences(['A', 'B', 'A', 'A', 'B']), ['A ×3', 'B ×2']);
});

test('coalesceSentences: leaves unique sentences and the empty list unchanged', () => {
  assert.deepEqual(coalesceSentences(['A', 'B']), ['A', 'B']);
  assert.deepEqual(coalesceSentences([]), []);
});

test('coalesceSentences: does not mutate its input', () => {
  const input = ['A', 'A'];
  coalesceSentences(input);
  assert.deepEqual(input, ['A', 'A']);
});

// --- endTurnNeedsConfirm ---

// The rule changed after Jake's playtest of the play-feel branch (play-feel
// spec): End turn asks only when a band has done nothing at all this
// turn. A band that moved but did not act no longer asks.
test('endTurnNeedsConfirm: true only when an own band has neither moved nor acted', () => {
  const unused = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
  ]);
  assert.equal(endTurnNeedsConfirm(unused), true);

  const movedOnly = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true },
  ]);
  assert.equal(endTurnNeedsConfirm(movedOnly), false);

  const actedOnly = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], acted: true },
  ]);
  assert.equal(endTurnNeedsConfirm(actedOnly), false);

  const oneLeft = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true },
    { id: 'badger', type: 'badger', cells: [[2, 2]] },
  ]);
  assert.equal(endTurnNeedsConfirm(oneLeft), true, 'the badger has done nothing');
});

test('endTurnNeedsConfirm: false when every own band has acted', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true, acted: true },
    { id: 'badger', type: 'badger', cells: [[2, 2]], moved: true, acted: true },
  ]);
  assert.equal(endTurnNeedsConfirm(s), false);
});

test('endTurnNeedsConfirm: trapped own bands and bots do not count', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true, acted: true },
    { id: 'bear', type: 'bear', cells: [[1, 1]], trapped: true },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]], plan: null },
  ]);
  assert.equal(endTurnNeedsConfirm(s), false);
});

test('endTurnNeedsConfirm: false with no bands', () => {
  assert.equal(endTurnNeedsConfirm(makeState(['...'], [])), false);
});

// --- l01 solution replay ---

test('l01 solution replay ends in a win', () => {
  const level = LEVELS.find((l) => l.id === 'l01');
  const progress = valleyProgress();
  for (const [type, maxLen] of Object.entries(level.assumes)) {
    progress.bands[type] = { maxLen };
  }
  let state = createBattle(level, level.solution.deploy, progress);
  for (const move of level.solution.moves) {
    state = applyMove(state, move);
  }
  assert.equal(state.outcome, 'won');
});

// --- the verdict names a den loss ---

test('resultMessage: a battle lost with a den ends with why', () => {
  const s = makeState(['D...', '....', '..H.', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
    { id: 'planter-1', type: 'planter', cells: [[2, 3]] },
  ]);
  const lost = applyMove(s, { kind: 'end' });
  assert.equal(
    resultMessage(lost),
    "The harvester tears into the den. Den damaged — one more hit and it's gone. "
      + 'The planter-bot tears into the den. The den is lost. You lost: a den was destroyed',
  );
});
