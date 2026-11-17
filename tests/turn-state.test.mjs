// What each of the player's bands has left this turn (play-feel spec,
// "Changed after Jake's playtest"): ready, can still act, or done. One
// pure function of the battle state, used by the board marks, by the
// End turn question and by the End turn button's look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandTurnState, turnStates, endTurnAsks, endTurnReady, bandsWaiting, TURN_STATE_TEXT } from '../js/ui/turn-state.js';
import { createBattle, applyMove } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { makeState, valleyProgress } from './helpers.mjs';

const GRID = ['....', '....', '....'];

/** @param {import('./helpers.mjs').BandInput[]} bands @param {object} [extra] */
function state(bands, extra) {
  return makeState(GRID, bands, extra);
}

test('a band that has neither moved nor acted is ready', () => {
  const s = state([{ id: 'ants', type: 'ants', cells: [[0, 0]] }]);
  assert.equal(bandTurnState(s, s.bands[0]), 'ready');
});

test('a band that has acted is done', () => {
  const s = state([{ id: 'ants', type: 'ants', cells: [[0, 0]], moved: true, acted: true }]);
  assert.equal(bandTurnState(s, s.bands[0]), 'done');
});

test('a band that has moved can still act only while one of its actions has a target', () => {
  const near = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  assert.equal(bandTurnState(near, near.bands[0]), 'canAct', 'a bot to bite');
  const far = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
  ]);
  assert.equal(bandTurnState(far, far.bands[0]), 'done', 'nothing in reach of a bite');
});

test('any action with a target counts: a moved badger can still dig', () => {
  const s = state([{ id: 'badger', type: 'badger', cells: [[1, 1]], moved: true }]);
  assert.equal(bandTurnState(s, s.bands[0]), 'canAct');
  // Walled in by stones, with nothing to bite: done.
  const boxed = makeState(['SSS', 'S.S', 'SSS'], [{ id: 'badger', type: 'badger', cells: [[1, 1]], moved: true }]);
  assert.equal(bandTurnState(boxed, boxed.bands[0]), 'done');
});

test('bots, trapped bands and wiped bands have no turn state', () => {
  const s = state([
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 2]], trapped: true },
    { id: 'ants', type: 'ants', cells: [] },
  ]);
  for (const band of s.bands) assert.equal(bandTurnState(s, band), null, band.id);
});

test('turnStates maps every band of the player that is in play, and nothing once the battle is over', () => {
  const s = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'badger', type: 'badger', cells: [[1, 1]], moved: true },
    { id: 'beaver', type: 'beaver', cells: [[3, 0]], moved: true },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 2]], trapped: true },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
  ]);
  assert.deepEqual([...turnStates(s)], [['ants', 'ready'], ['badger', 'canAct'], ['beaver', 'done']]);
  assert.equal(turnStates({ ...s, outcome: 'won' }).size, 0);
  assert.equal(turnStates({ ...s, outcome: 'lost' }).size, 0);
});

test('End turn asks only when a band has done nothing at all this turn', () => {
  const untouched = state([{ id: 'ants', type: 'ants', cells: [[0, 0]] }]);
  assert.equal(endTurnAsks(untouched), true);

  // The playtest complaint: a band that moved but did not act never asks.
  const movedOnly = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  assert.equal(bandTurnState(movedOnly, movedOnly.bands[0]), 'canAct');
  assert.equal(endTurnAsks(movedOnly), false);

  const mixed = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true, acted: true },
    { id: 'badger', type: 'badger', cells: [[2, 2]] },
  ]);
  assert.equal(endTurnAsks(mixed), true, 'the badger has done nothing');

  const trappedOnly = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 2]], trapped: true },
  ]);
  assert.equal(endTurnAsks(trappedOnly), false, 'a trapped band never asks');
  assert.equal(endTurnAsks(state([])), false);
});

test('End turn looks ready whenever one tap ends the turn, and plain only while it would ask', () => {
  const allDone = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true, acted: true },
    { id: 'beaver', type: 'beaver', cells: [[3, 0]], moved: true },
  ]);
  assert.equal(endTurnReady(allDone), true);

  const oneReady = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true, acted: true },
    { id: 'beaver', type: 'beaver', cells: [[3, 0]] },
  ]);
  assert.equal(endTurnAsks(oneReady), true);
  assert.equal(endTurnReady(oneReady), false, 'a tap would ask first');

  // Changed after the full-build playtest: a band that can still act no
  // longer keeps the button plain, because one tap ends the turn.
  const oneCanAct = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]], moved: true, acted: true },
    { id: 'badger', type: 'badger', cells: [[1, 1]], moved: true },
  ]);
  assert.equal(endTurnAsks(oneCanAct), false);
  assert.equal(endTurnReady(oneCanAct), true);

  assert.equal(endTurnReady(state([])), true, 'nothing to ask about');
});

test('a band that can neither move nor act is done, so a boxed-in band never makes End turn ask', () => {
  const boxed = makeState(['SSS', 'S.S', 'SSS'], [{ id: 'ants', type: 'ants', cells: [[1, 1]] }]);
  assert.equal(bandTurnState(boxed, boxed.bands[0]), 'done');
  assert.equal(endTurnAsks(boxed), false);
  assert.equal(endTurnReady(boxed), true);

  // Hemmed in by its own friends, with nothing to bite: done as well.
  const hemmed = makeState(['S.S', '...', 'SSS'], [
    { id: 'ants', type: 'ants', cells: [[1, 1]] },
    { id: 'badger', type: 'badger', cells: [[1, 0]], moved: true, acted: true },
    { id: 'beaver', type: 'beaver', cells: [[0, 1]], moved: true, acted: true },
    { id: 'bear', type: 'bear', cells: [[2, 1]], moved: true, acted: true },
  ]);
  assert.equal(bandTurnState(hemmed, hemmed.bands[0]), 'done');

  // Boxed in but with a bot to bite: it still has something to do.
  const biting = makeState(['SSS', 'S..', 'SSS'], [
    { id: 'ants', type: 'ants', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
  ]);
  assert.equal(bandTurnState(biting, biting.bands[0]), 'ready');

  // Free to walk but with nothing to act on: still ready, it can move.
  const open = state([{ id: 'ants', type: 'ants', cells: [[0, 0]] }]);
  assert.equal(bandTurnState(open, open.bands[0]), 'ready');
});

test('on a real level: every band starts ready, a march leaves it done or able to act, and a new turn makes it ready again', () => {
  const level = LEVELS.find((l) => l.id === 'l01');
  let s = createBattle(level, level.solution.deploy, valleyProgress());
  assert.deepEqual([...turnStates(s).values()], level.solution.deploy.map(() => 'ready'));
  assert.equal(endTurnAsks(s), true);
  s = applyMove(s, level.solution.moves[0]);
  assert.equal(turnStates(s).get('ants'), 'done', 'moved, with nothing to bite');
  assert.equal(endTurnAsks(s), false);
  assert.equal(endTurnReady(s), true);
  s = applyMove(s, { kind: 'end' });
  assert.equal(turnStates(s).get('ants'), 'ready');
});

test('a freed band has had its turn: it is done until the next turn', () => {
  const level = LEVELS.find((l) => l.id === 'l04');
  let s = createBattle(level, level.solution.deploy, valleyProgress());
  for (const move of level.solution.moves.slice(0, -1)) s = applyMove(s, move);
  const before = s.bands.find((b) => b.id === 'trapped-bear');
  assert.equal(bandTurnState(s, before), null, 'still snared');
  // Free it on a copy with the battle left open, to read the mark.
  const freed = structuredClone(s);
  const bear = freed.bands.find((b) => b.id === 'trapped-bear');
  bear.trapped = false;
  bear.moved = true;
  bear.acted = true;
  assert.equal(bandTurnState(freed, bear), 'done');
});

test('bandsWaiting counts the bands that have done nothing yet, the ones End turn asks about', () => {
  const s = state([
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'fox', type: 'fox', cells: [[0, 2]] },
    { id: 'badger', type: 'badger', cells: [[3, 0]], moved: true, acted: true },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
  ]);
  assert.equal(bandsWaiting(s), 2, 'the ants and the fox; not the badger, not the bot');
  assert.equal(endTurnAsks(s), true);
  const moved = { ...s, bands: s.bands.map((b) => (b.side === 'us' ? { ...b, moved: true, acted: true } : b)) };
  assert.equal(bandsWaiting(moved), 0);
  assert.equal(endTurnAsks(moved), false);
  assert.equal(bandsWaiting({ ...s, outcome: /** @type {const} */ ('won') }), 0, 'none once it is over');
});

test('TURN_STATE_TEXT says each turn state in a few words', () => {
  assert.deepEqual(Object.keys(TURN_STATE_TEXT).sort(), ['canAct', 'done', 'ready']);
  for (const text of Object.values(TURN_STATE_TEXT)) assert.ok(text.length > 0 && text.length <= 28, text);
});
