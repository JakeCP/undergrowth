// Stakes call-outs (look-and-motion spec, "Motion"): which call-outs a
// move produces. Pure: the view adds the tracks to the move's motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newlyEngaged, lastTurnDue, isLastTurn, stakeTracks, LAST_TURN_TEXT, FLASH_MS,
} from '../js/ui/stakes.js';
import { DURATION } from '../js/ui/anim-steps.js';
import { makeState } from './helpers.mjs';

const ROW = ['........', '........'];

/** A harvester at 0,0 and the ants at `x`,0. Engaged from x <= 3 (it walks 2 and strikes the next tile). */
function withAnts(x, extra = {}) {
  return makeState(ROW, [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]], plan: { path: [[1, 0]], strike: [2, 0], actionId: 'mow' } },
    { id: 'ants', type: 'ants', cells: [[x, 0]] },
  ], extra);
}

// --- newlyEngaged ---

test('newlyEngaged: a bot engaged after the move and not before it', () => {
  assert.deepEqual(newlyEngaged(withAnts(7), withAnts(3)), ['harvester-0']);
});

test('newlyEngaged: nothing when it was engaged already, or is not engaged now', () => {
  assert.deepEqual(newlyEngaged(withAnts(3), withAnts(2)), []);
  assert.deepEqual(newlyEngaged(withAnts(7), withAnts(6)), []);
  assert.deepEqual(newlyEngaged(withAnts(3), withAnts(7)), [], 'leaving reach is not a flash');
});

test('newlyEngaged: a bot that is gone after the move, or animals, never count', () => {
  const gone = withAnts(3);
  gone.bands = gone.bands.filter((b) => b.side === 'us');
  assert.deepEqual(newlyEngaged(withAnts(7), gone), []);
});

test('newlyEngaged: nothing once the battle is over, as the bots then plan nothing', () => {
  const won = withAnts(3);
  won.outcome = 'won';
  assert.deepEqual(newlyEngaged(withAnts(7), won), []);
});

test('newlyEngaged: a saw-drone is always engaged, so it never becomes engaged', () => {
  const saw = (x) => makeState(ROW, [
    { id: 'saw-0', type: 'saw', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[x, 0]] },
  ]);
  assert.deepEqual(newlyEngaged(saw(7), saw(3)), []);
});

// --- Last turn ---

test('isLastTurn: only on a turn-limited level, on its last turn, while the battle is on', () => {
  assert.equal(isLastTurn(withAnts(7, { turn: 3, turnLimit: 3 })), true);
  assert.equal(isLastTurn(withAnts(7, { turn: 2, turnLimit: 3 })), false);
  assert.equal(isLastTurn(withAnts(7, { turn: 3, turnLimit: null })), false);
  assert.equal(isLastTurn(withAnts(7, { turn: 3, turnLimit: 3, outcome: 'won' })), false);
});

test('lastTurnDue: when the bots turn brings the last turn, and once only', () => {
  const two = withAnts(7, { turn: 2, turnLimit: 3 });
  const three = withAnts(7, { turn: 3, turnLimit: 3 });
  assert.equal(lastTurnDue(two, three), true);
  assert.equal(lastTurnDue(three, three), false, 'a move within the last turn says nothing');
  assert.equal(lastTurnDue(null, three), true, 'a battle that starts on its last turn says it at once');
  assert.equal(lastTurnDue(null, two), false);
});

// --- stakeTracks ---

test('stakeTracks: a newly engaged bot plan flashes once after the swap, after its fade-in', () => {
  const extra = stakeTracks(withAnts(7), withAnts(3), 300);
  assert.deepEqual(extra.detached, []);
  assert.equal(extra.after.length, 1);
  const [flash] = extra.after;
  assert.deepEqual(flash.target, { kind: 'plan', band: 'harvester-0' });
  assert.equal(flash.start, DURATION.plan, 'it waits for the new plan to fade in');
  assert.equal(flash.duration, FLASH_MS);
  assert.equal(flash.fill, 'none', 'it leaves the plan as it was');
  for (const frame of flash.keyframes) {
    assert.deepEqual(Object.keys(frame).filter((k) => k !== 'offset'), ['opacity']);
  }
  assert.equal(flash.keyframes[0].opacity, 1);
  assert.equal(flash.keyframes[flash.keyframes.length - 1].opacity, 1);
  assert.ok(flash.keyframes.some((f) => f.opacity < 0.5), 'it dips so it reads as a flash');
});

test('stakeTracks: "Last turn!" shows over the middle of the board when the sequence ends', () => {
  const extra = stakeTracks(withAnts(7, { turn: 2, turnLimit: 3 }), withAnts(7, { turn: 3, turnLimit: 3 }), 900);
  assert.deepEqual(extra.after, []);
  assert.equal(extra.detached.length, 1);
  const [call] = extra.detached;
  assert.deepEqual(call.target, { kind: 'callout', at: [3.5, 0.5], text: LAST_TURN_TEXT });
  assert.equal(call.start, 900);
  assert.equal(call.fill, 'both', 'hidden until its moment');
  assert.equal(call.keyframes[0].opacity, 0);
  assert.equal(LAST_TURN_TEXT, 'Last turn!');
});

test('stakeTracks: under reduced motion the call-out only fades', () => {
  const extra = stakeTracks(null, withAnts(7, { turn: 1, turnLimit: 1 }), 0, { reducedMotion: true });
  assert.equal(extra.detached.length, 1);
  assert.ok(extra.detached[0].keyframes.every((f) => f.transform === undefined));
});

test('stakeTracks: an ordinary move adds nothing', () => {
  assert.deepEqual(stakeTracks(withAnts(7), withAnts(6), 200), { after: [], detached: [] });
});
