// Cross-track checks: the pure modules of the pieces track (animation
// steps, sounds) and the screen text read the events the engine track
// really emits, not only hand-written ones in the contract's shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../js/engine/battle.js';
import { animSteps, DEN_DAMAGED_TEXT, DEN_LOST_TEXT } from '../js/ui/anim-steps.js';
import { soundForEvent } from '../js/ui/sound.js';
import { describeEvents } from '../js/ui/text.js';
import { makeState } from './helpers.mjs';

function denLevel() {
  return makeState(['D...', '....', '..H.', '...P'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]], plan: { path: [], strike: [2, 2], actionId: 'mow' } },
  ]);
}

test('a real den strike animates as a crack and a call-out, then a crumble and a loss call-out', () => {
  const s1 = applyMove(denLevel(), { kind: 'end' });
  const first = animSteps(s1.events, { turn: 'bots' });
  assert.ok(first.some((step) => step.kind === 'sweep' && step.band === 'harvester-0'));
  assert.ok(first.some((step) => step.kind === 'crack'));
  assert.ok(first.some((step) => step.kind === 'callout' && step.text === DEN_DAMAGED_TEXT));

  const s2 = applyMove(s1, { kind: 'end' });
  assert.equal(s2.lostReason, 'habitat');
  const second = animSteps(s2.events, { turn: 'bots' });
  assert.ok(second.some((step) => step.kind === 'crumble'));
  assert.ok(second.some((step) => step.kind === 'callout' && step.text === DEN_LOST_TEXT));
});

test('real engine events: the bot strike sounds, plans animate, nothing throws', () => {
  const s1 = applyMove(denLevel(), { kind: 'end' });
  const sounds = s1.events.map((event) => soundForEvent(event, () => 'open'));
  assert.ok(sounds.includes('mow'));
  const steps = animSteps(s1.events, { turn: 'bots' });
  assert.ok(steps.some((step) => step.kind === 'plan' && step.band === 'harvester-0'));
  assert.doesNotThrow(() => describeEvents(s1, s1.events));
});

test('a real player bite lunges and its damage pops the lost tail cell', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0]] },
  ]);
  const after = applyMove(s, { kind: 'act', band: 'ants', action: 'bite', target: [1, 0] });
  const steps = animSteps(after.events);
  assert.ok(steps.some((step) => step.kind === 'lunge' && step.band === 'ants'));
  const pop = steps.find((step) => step.kind === 'pop');
  assert.ok(pop !== undefined);
  assert.deepEqual(pop.at, [2, 0]);
});
