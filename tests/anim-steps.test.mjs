import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  animSteps, sequenceEnd, glideFrames, glideDuration,
  DURATION, IMPACT, POP_STAGGER_MS, FADE_MS, BOT_TURN_BUDGET_MS, SPEED_FACTOR,
  DEN_DAMAGED_TEXT, DEN_LOST_TEXT, SWEEP_STAGGER_MS,
} from '../js/ui/anim-steps.js';
import { stepBand } from '../js/engine/band.js';

// --- event builders, in the shapes of the engine contract ---

const move = (band, path) => ({ kind: 'move', band, path });
const action = (actor, actionId, from, target) => ({ kind: 'action', actor, actionId, from, target });
const damage = (band, cells, wiped = false) => ({ kind: 'damage', band, amount: cells.length, wiped, cells });
const terrain = (at, from, to, cause) => ({ kind: 'terrain', at, from, to, cause });
const push = (outcome) => ({ kind: 'push', outcome });
const plan = (band, p = null) => ({ kind: 'plan', band, plan: p });

const kinds = (steps) => steps.map((s) => s.kind);
const only = (steps, kind) => {
  const found = steps.filter((s) => s.kind === kind);
  assert.equal(found.length, 1, `expected exactly one ${kind} step, got ${found.length}`);
  return found[0];
};
const endOf = (step) => step.start + step.duration;

/** Every list must keep the engine's order and be well formed. */
function assertOrdered(steps, events) {
  let lastEvent = -1;
  let lastStart = 0;
  for (const step of steps) {
    assert.ok(Number.isInteger(step.event) && step.event >= 0 && step.event < events.length, 'event index in range');
    assert.ok(step.event >= lastEvent, `steps out of event order at ${step.kind}`);
    assert.ok(step.start >= lastStart, `${step.kind} starts before an earlier step`);
    assert.ok(step.start >= 0 && step.duration >= 0);
    assert.ok(step.band !== null || step.at !== null, `${step.kind} names neither a band nor a tile`);
    lastEvent = step.event;
    lastStart = step.start;
  }
}

// --- the Motion table, row by row ---

test('move: the head glides along the path', () => {
  const events = [move('ants', [[1, 0], [2, 0], [3, 0]])];
  const steps = animSteps(events);
  assert.deepEqual(steps, [{
    kind: 'glide', band: 'ants', at: null, path: [[1, 0], [2, 0], [3, 0]],
    start: 0, duration: glideDuration(3), event: 0,
  }]);
});

test('move: glides last roughly 150 to 400 ms whatever the distance', () => {
  for (let tiles = 1; tiles <= 8; tiles += 1) {
    const d = glideDuration(tiles);
    assert.ok(d >= 150 && d <= 400, `${tiles} tiles take ${d} ms`);
    if (tiles > 1) assert.ok(d >= glideDuration(tiles - 1), 'a longer walk is never quicker');
  }
});

test('every step duration in the table is roughly 150 to 400 ms', () => {
  for (const [kind, ms] of Object.entries(DURATION)) {
    assert.ok(ms >= 150 && ms <= 400, `${kind} lasts ${ms} ms`);
  }
});

test('bite: the attacker lunges, the target shakes on impact, lost tail tokens pop off', () => {
  const events = [
    action('ants', 'bite', [1, 1], [2, 1]),
    damage('harvester-0', [[4, 1], [3, 1]]),
  ];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['lunge', 'hit', 'pop', 'pop']);
  assertOrdered(steps, events);

  const lunge = steps[0];
  assert.equal(lunge.band, 'ants');
  assert.deepEqual(lunge.origin, [1, 1]);
  assert.deepEqual(lunge.at, [2, 1]);
  assert.equal(lunge.start, 0);
  assert.equal(lunge.duration, DURATION.lunge);

  const hit = steps[1];
  assert.equal(hit.band, 'harvester-0');
  assert.equal(hit.start, DURATION.lunge * IMPACT.lunge, 'the target reacts when the lunge lands');
  assert.ok(hit.start > lunge.start && hit.start < endOf(lunge));
  assert.equal(hit.duration, DURATION.hit);

  // One pop per lost cell, in removal order, slightly staggered.
  assert.deepEqual(steps[2].at, [4, 1]);
  assert.deepEqual(steps[3].at, [3, 1]);
  assert.equal(steps[2].band, 'harvester-0');
  assert.equal(steps[2].start, hit.start);
  assert.equal(steps[3].start, hit.start + POP_STAGGER_MS);
  assert.equal(steps[3].duration, DURATION.pop);
});

test('the new bots\' strikes lunge toward a target however far off it is', () => {
  const steps = animSteps([action('tower-0', 'shoot', [0, 0], [5, 0])]);
  assert.equal(steps[0].kind, 'lunge');
  assert.equal(steps[0].band, 'tower-0');
  assert.deepEqual(steps[0].origin, [0, 0]);
  assert.deepEqual(steps[0].at, [5, 0]);
  for (const id of ['shoot', 'swing', 'squeeze']) {
    assert.deepEqual(kinds(animSteps([action('x', id, [0, 0], [2, 0])])), ['lunge'], id);
  }
});

test('every attack action lunges, and an unknown action does too', () => {
  for (const id of ['bite', 'maul', 'ram', 'shove', 'strike', 'sting', 'some-new-attack']) {
    const steps = animSteps([action('x', id, [0, 0], [1, 0])]);
    assert.deepEqual(kinds(steps), ['lunge'], id);
  }
});

test('a line attack shakes every band it hits at the same moment', () => {
  const events = [
    action('bees', 'sting', [0, 0], [1, 0]),
    damage('saw-0', [[1, 1]]),
    damage('harvester-0', [[2, 1]]),
  ];
  const steps = animSteps(events);
  assertOrdered(steps, events);
  const hits = steps.filter((s) => s.kind === 'hit');
  assert.deepEqual(hits.map((s) => s.band), ['saw-0', 'harvester-0']);
  assert.equal(hits[0].start, hits[1].start);
});

test('dig: a dirt burst, then the tile sinks into a hole', () => {
  const events = [action('badger', 'dig', [1, 1], [1, 2]), terrain([1, 2], 'open', 'hole', 'dig')];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['dirt', 'sink']);
  assertOrdered(steps, events);
  assert.equal(steps[0].band, 'badger');
  assert.deepEqual(steps[0].at, [1, 2]);
  assert.equal(steps[0].duration, DURATION.dirt);
  assert.equal(steps[1].band, null);
  assert.deepEqual(steps[1].at, [1, 2]);
  assert.equal(steps[1].from, 'open');
  assert.equal(steps[1].to, 'hole');
  assert.ok(steps[1].start > 0 && steps[1].start < endOf(steps[0]), 'the tile sinks while the dirt flies');
  assert.equal(steps[1].duration, DURATION.sink);
});

test('dig: digging forest also sinks the tile', () => {
  const steps = animSteps([action('badger', 'dig', [1, 1], [1, 2]), terrain([1, 2], 'forest', 'hole', 'dig')]);
  assert.deepEqual(kinds(steps), ['dirt', 'sink']);
});

test('build: a dam drops in', () => {
  const events = [action('beaver', 'build', [0, 0], [1, 0]), terrain([1, 0], 'water', 'dam', 'build')];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['drop']);
  assert.deepEqual(steps[0], {
    kind: 'drop', band: null, at: [1, 0], from: 'water', to: 'dam',
    start: 0, duration: DURATION.drop, event: 1,
  });
});

test('mow: a blade sweep, then the tree tips over into stubble', () => {
  const events = [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'forest', 'stubble', 'mow')];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['sweep', 'topple']);
  assertOrdered(steps, events);
  assert.equal(steps[0].band, 'harvester-0');
  assert.deepEqual(steps[0].at, [3, 2]);
  assert.deepEqual(steps[0].origin, [3, 3]);
  assert.equal(steps[1].from, 'forest');
  assert.equal(steps[1].to, 'stubble');
  assert.equal(steps[1].start, DURATION.sweep * IMPACT.sweep);
  assert.equal(steps[1].duration, DURATION.topple);
});

test('saw: a blade sweep at a band shakes it', () => {
  const events = [action('saw-0', 'saw', [3, 3], [3, 2]), damage('ants', [[3, 0], [3, 1]])];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['sweep', 'hit', 'pop', 'pop']);
  assert.equal(steps[1].band, 'ants');
});

test('pave: a slab spreads over the tile', () => {
  const events = [action('planter-0', 'pave', [2, 2], [2, 3]), terrain([2, 3], 'stubble', 'paving', 'pave')];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['lunge', 'spread']);
  assert.deepEqual(steps[1].at, [2, 3]);
  assert.equal(steps[1].to, 'paving');
  assert.equal(steps[1].duration, DURATION.spread);
});

test('push: a pushed band slides to its new tile as the blow lands', () => {
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[4, 1]]),
    push({ kind: 'moved', band: 'harvester-0', to: [3, 1] }),
  ];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['lunge', 'hit', 'pop', 'slide']);
  assertOrdered(steps, events);
  const slide = steps[3];
  assert.equal(slide.band, 'harvester-0');
  assert.deepEqual(slide.at, [3, 1]);
  assert.equal(slide.start, steps[1].start, 'knocked back on impact');
  assert.equal(slide.duration, DURATION.slide);
});

test('push: a bump jolts the pushed band toward what blocked it', () => {
  const events = [
    action('ants', 'ram', [1, 1], [2, 1]),
    damage('harvester-0', [[4, 1]]),
    damage('saw-0', [[3, 2]]),
    push({ kind: 'bumped', band: 'harvester-0', other: 'saw-0' }),
  ];
  const steps = animSteps(events);
  assertOrdered(steps, events);
  const jolt = only(steps, 'jolt');
  assert.equal(jolt.band, 'harvester-0');
  assert.equal(jolt.other, 'saw-0');
  assert.deepEqual(jolt.dir, [1, 0], 'pushed away from the pusher');
  assert.equal(jolt.duration, DURATION.jolt);
  assert.deepEqual(steps.filter((s) => s.kind === 'hit').map((s) => s.band), ['harvester-0', 'saw-0']);
});

test('push: a bump against the board edge has no other band', () => {
  const events = [
    action('bear', 'shove', [1, 2], [1, 1]),
    damage('saw-0', [[1, 0]]),
    damage('saw-0', [[1, 0]]),
    push({ kind: 'bumped', band: 'saw-0', other: null }),
  ];
  const jolt = only(animSteps(events), 'jolt');
  assert.equal(jolt.other, null);
  assert.deepEqual(jolt.dir, [0, -1]);
});

test('push: falling into water slides in, then a splash ring as the band goes under', () => {
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[4, 1]]),
    damage('harvester-0', [[3, 1], [2, 1]], true),
    push({ kind: 'falls', band: 'harvester-0', at: [3, 1] }),
  ];
  const steps = animSteps(events, { tileKind: (at) => (at[0] === 3 && at[1] === 1 ? 'water' : 'open') });
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['lunge', 'hit', 'pop', 'slide', 'splash', 'fall']);
  const slide = only(steps, 'slide');
  const splash = only(steps, 'splash');
  const fall = only(steps, 'fall');
  assert.deepEqual(slide.at, [3, 1]);
  assert.equal(splash.band, null);
  assert.deepEqual(splash.at, [3, 1]);
  assert.equal(splash.start, endOf(slide));
  assert.equal(fall.band, 'harvester-0');
  assert.equal(fall.into, 'water');
  assert.equal(fall.start, endOf(slide));
  assert.equal(fall.event, 3);
});

test('push: falling into a hole drops and fades, with no splash and no scatter', () => {
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('saw-0', [[2, 2]]),
    damage('saw-0', [[2, 1]], true),
    push({ kind: 'falls', band: 'saw-0', at: [3, 1] }),
  ];
  const steps = animSteps(events, { tileKind: () => 'hole' });
  assert.deepEqual(kinds(steps), ['lunge', 'hit', 'pop', 'slide', 'fall']);
  assert.equal(only(steps, 'fall').into, 'hole');
  assert.equal(only(steps, 'fall').duration, DURATION.fall);
});

test('push: a fall with no terrain lookup still drops and fades', () => {
  const events = [
    damage('saw-0', [[2, 1]], true),
    push({ kind: 'falls', band: 'saw-0', at: [3, 1] }),
  ];
  assert.deepEqual(kinds(animSteps(events)), ['slide', 'fall']);
  assert.equal(only(animSteps(events), 'fall').into, 'hole');
});

test('a dam cut from under a band: the dam breaks with a splash and the band goes under where it stands', () => {
  const events = [
    action('saw-0', 'saw', [2, 2], [2, 1]),
    damage('beaver', [[2, 0]]),
    terrain([2, 1], 'dam', 'water', 'saw'),
    damage('beaver', [[2, 1]], true),
    push({ kind: 'falls', band: 'beaver', at: [2, 1], cause: 'terrain' }),
  ];
  // The lookup describes the board before the move, when the tile was still a dam.
  const steps = animSteps(events, { tileKind: () => 'dam' });
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['sweep', 'hit', 'pop', 'crumble', 'splash', 'fall']);
  assert.equal(only(steps, 'crumble').from, 'dam');
  assert.equal(only(steps, 'splash').event, 2, 'the splash belongs to the dam breaking');
  const fall = only(steps, 'fall');
  assert.equal(fall.into, 'water', 'the terrain change earlier in the list is remembered');
  assert.deepEqual(fall.at, [2, 1]);
});

test('a dam cut over a hole breaks without a splash', () => {
  const steps = animSteps([terrain([2, 1], 'dam', 'hole', 'saw')]);
  assert.deepEqual(kinds(steps), ['crumble']);
});

test('habitat damaged: a crack flash and a call-out', () => {
  const events = [
    action('harvester-0', 'mow', [3, 3], [3, 2]),
    terrain([3, 2], 'habitat', 'habitatDamaged', 'mow'),
  ];
  const steps = animSteps(events);
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['sweep', 'crack', 'callout']);
  const crack = only(steps, 'crack');
  const callout = only(steps, 'callout');
  assert.deepEqual(crack.at, [3, 2]);
  assert.equal(crack.duration, DURATION.crack);
  assert.deepEqual(callout.at, [3, 2]);
  assert.equal(callout.text, DEN_DAMAGED_TEXT);
  assert.equal(callout.text, 'Den damaged!');
  assert.equal(callout.start, crack.start);
});

test('habitat lost: the habitat crumbles, with a call-out', () => {
  for (const from of ['habitatDamaged', 'habitat']) {
    const events = [
      action('planter-0', 'pave', [3, 3], [3, 2]),
      terrain([3, 2], from, 'stubble', 'pave'),
    ];
    const steps = animSteps(events);
    assert.deepEqual(kinds(steps), ['lunge', 'crumble', 'callout'], from);
    assert.equal(only(steps, 'crumble').duration, DURATION.crumble);
    assert.equal(only(steps, 'callout').text, DEN_LOST_TEXT);
  }
});

test('band wiped: its tokens scatter and fade, instead of popping one by one', () => {
  const events = [
    action('bear', 'maul', [1, 1], [2, 1]),
    damage('saw-0', [[3, 1], [2, 1]], true),
  ];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['lunge', 'scatter']);
  const scatter = steps[1];
  assert.equal(scatter.band, 'saw-0');
  assert.deepEqual(scatter.cells, [[3, 1], [2, 1]]);
  assert.equal(scatter.start, DURATION.lunge * IMPACT.lunge);
  assert.equal(scatter.duration, DURATION.scatter);
});

test('a terrain change the table does not name still swaps the tile', () => {
  const steps = animSteps([terrain([0, 0], 'paving', 'open', 'regrow')]);
  assert.deepEqual(steps, [{
    kind: 'swap', band: null, at: [0, 0], from: 'paving', to: 'open',
    start: 0, duration: DURATION.swap, event: 0,
  }]);
});

// --- the smaller events ---

test('pickups and captures happen as the head passes over them', () => {
  const events = [
    move('ants', [[1, 0], [2, 0], [3, 0]]),
    { kind: 'pickup', at: [1, 0] },
    { kind: 'capture', at: [3, 0] },
  ];
  const steps = animSteps(events);
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['glide', 'collect', 'collect']);
  const glide = steps[0];
  assert.equal(steps[1].what, 'pickup');
  assert.deepEqual(steps[1].at, [1, 0]);
  assert.equal(steps[1].start, glide.duration / 3);
  assert.equal(steps[2].what, 'capture');
  assert.equal(steps[2].start, glide.duration);
});

test('the sweep after the last bot falls plays once its scatter is over, one item after another', () => {
  // The engine's clear-the-field win: the killing blow, then every pickup,
  // objective and trapped band left on the field, with no walk behind them.
  const events = [
    action('bees', 'sting', [0, 0], [1, 0]),
    damage('harvester-0', [[1, 0]], true),
    { kind: 'pickup', at: [5, 5] },
    { kind: 'capture', at: [6, 1] },
    { kind: 'freed', band: 'trapped-bear' },
  ];
  const steps = animSteps(events);
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['lunge', 'scatter', 'collect', 'collect', 'freed']);
  const scatter = only(steps, 'scatter');
  const sweep = steps.slice(2);
  assert.equal(sweep[0].start, endOf(scatter));
  assert.equal(sweep[1].start, endOf(scatter) + SWEEP_STAGGER_MS);
  assert.equal(sweep[2].start, endOf(scatter) + 2 * SWEEP_STAGGER_MS);
  assert.deepEqual(sweep.map((s) => s.what ?? s.band), ['pickup', 'capture', 'trapped-bear']);
});

test('a freed band reacts when the move that freed it ends', () => {
  const events = [move('ants', [[1, 0]]), { kind: 'freed', band: 'trapped-bear' }];
  const steps = animSteps(events);
  assert.deepEqual(kinds(steps), ['glide', 'freed']);
  assert.equal(steps[1].band, 'trapped-bear');
  assert.equal(steps[1].start, endOf(steps[0]));
});

test('plans are redrawn together once everything else is over', () => {
  const p = { path: [[1, 1]], strike: [1, 2], actionId: 'mow' };
  const events = [move('ants', [[1, 0], [2, 0]]), plan('harvester-0', p), plan('saw-0'), plan('planter-0')];
  const steps = animSteps(events);
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['glide', 'plan', 'plan', 'plan']);
  assert.deepEqual(steps.slice(1).map((s) => s.band), ['harvester-0', 'saw-0', 'planter-0']);
  assert.deepEqual(steps[1].plan, p);
  assert.equal(steps[2].plan, null);
  for (const step of steps.slice(1)) {
    assert.equal(step.start, endOf(steps[0]));
    assert.equal(step.duration, DURATION.plan);
  }
});

test('unknown events and empty lists make no steps', () => {
  assert.deepEqual(animSteps([]), []);
  assert.deepEqual(animSteps(/** @type {any} */ ([{ kind: 'something-new' }])), []);
  assert.deepEqual(animSteps([move('ants', [])]), [], 'a move that goes nowhere');
  assert.equal(sequenceEnd([]), 0);
});

test('animSteps does not change the events, and its steps do not share their arrays', () => {
  const events = [
    move('ants', [[1, 0], [2, 0]]),
    action('ants', 'bite', [2, 0], [3, 0]),
    damage('saw-0', [[4, 0]]),
  ];
  const before = structuredClone(events);
  const steps = animSteps(events);
  steps[0].path[0][0] = 99;
  steps[1].at[0] = 99;
  steps[3].at[0] = 99;
  assert.deepEqual(events, before);
});

// --- order ---

test('steps keep the engine order across a whole player move and action', () => {
  const events = [
    move('ants', [[1, 0], [2, 0]]),
    { kind: 'pickup', at: [2, 0] },
    { kind: 'freed', band: 'trapped-bear' },
    plan('harvester-0'),
  ];
  assertOrdered(animSteps(events), events);
  const act = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[4, 1], [3, 1]]),
    push({ kind: 'bumped', band: 'harvester-0', other: 'saw-0' }),
    damage('saw-0', [[5, 5]]),
    plan('harvester-0'),
    plan('saw-0'),
  ];
  assertOrdered(animSteps(act), act);
});

test('a band never starts a second move of its body before the first is over', () => {
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    push({ kind: 'moved', band: 'saw-0', to: [3, 1] }),
    push({ kind: 'moved', band: 'saw-0', to: [4, 1] }),
  ];
  const slides = animSteps(events).filter((s) => s.kind === 'slide');
  assert.equal(slides.length, 2);
  assert.equal(slides[1].start, endOf(slides[0]));
});

// --- the bots' turn ---

/** A bot that walks `tiles` tiles and strikes a band. */
function botBeat(id, tiles, row) {
  const path = [];
  for (let i = 1; i <= tiles; i += 1) path.push([i, row]);
  return [
    move(id, path),
    action(id, 'mow', [tiles, row], [tiles + 1, row]),
    damage('ants', [[7, row]]),
  ];
}

test('bots turn: each bot walks, then strikes, and the next bot waits its turn', () => {
  const events = [
    ...botBeat('harvester-0', 2, 0),
    ...botBeat('saw-0', 2, 1),
    plan('harvester-0'),
    plan('saw-0'),
  ];
  const steps = animSteps(events, { turn: 'bots' });
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['glide', 'sweep', 'hit', 'pop', 'glide', 'sweep', 'hit', 'pop', 'plan', 'plan']);
  const [walkA, strikeA, , popA, walkB, strikeB] = steps;
  assert.equal(walkA.start, 0);
  assert.equal(strikeA.start, endOf(walkA), 'a bot strikes when its walk is over');
  assert.equal(walkB.start, Math.max(endOf(strikeA), endOf(popA)), 'the next bot starts when the first is done');
  assert.equal(strikeB.start, endOf(walkB));
  assert.ok(sequenceEnd(steps) <= BOT_TURN_BUDGET_MS);
});

test('bots turn: a short turn is not stretched to fill the budget', () => {
  const events = botBeat('harvester-0', 2, 0);
  const asBots = animSteps(events, { turn: 'bots' });
  assert.deepEqual(asBots, animSteps(events, { turn: 'player' }));
  assert.ok(sequenceEnd(asBots) < BOT_TURN_BUDGET_MS);
});

test('bots turn: fits the budget however many bots there are', () => {
  assert.equal(BOT_TURN_BUDGET_MS, 1500);
  for (const count of [3, 5, 8, 12]) {
    const events = [];
    for (let i = 0; i < count; i += 1) events.push(...botBeat(`harvester-${i}`, 3, i));
    for (let i = 0; i < count; i += 1) events.push(plan(`harvester-${i}`));
    const natural = animSteps(events, { turn: 'player' });
    assert.ok(sequenceEnd(natural) > BOT_TURN_BUDGET_MS, 'the test needs a turn that is too long');

    const steps = animSteps(events, { turn: 'bots' });
    assertOrdered(steps, events);
    assert.equal(steps.length, natural.length, 'no step is dropped to save time');
    assert.equal(sequenceEnd(steps), BOT_TURN_BUDGET_MS, `${count} bots`);
    for (const step of steps) {
      assert.ok(Number.isInteger(step.start) && Number.isInteger(step.duration));
      assert.ok(endOf(step) <= BOT_TURN_BUDGET_MS);
    }
    // Step times shrink; each bot's walk is still seen before its strike.
    for (let i = 0; i < count; i += 1) {
      const walk = steps.find((s) => s.kind === 'glide' && s.band === `harvester-${i}`);
      const strike = steps.find((s) => s.kind === 'sweep' && s.band === `harvester-${i}`);
      assert.ok(walk.duration > 0 && strike.duration > 0);
      assert.ok(endOf(walk) <= strike.start, `bot ${i} strikes before its walk is over`);
      if (i > 0) {
        const before = steps.find((s) => s.kind === 'sweep' && s.band === `harvester-${i - 1}`);
        assert.ok(before.start < walk.start, 'bots go in the engine order');
      }
    }
  }
});

test('bots turn: a bot with nothing to do takes no time', () => {
  const acting = [...botBeat('harvester-0', 2, 0), ...botBeat('planter-0', 2, 2)];
  // saw-0 sits between them in level order, with no move and no action: it emits only its plan.
  const withIdle = [...acting, plan('harvester-0'), plan('saw-0'), plan('planter-0')];
  const withoutIdle = [...acting, plan('harvester-0'), plan('planter-0')];
  const a = animSteps(withIdle, { turn: 'bots' });
  const b = animSteps(withoutIdle, { turn: 'bots' });
  assert.equal(sequenceEnd(a), sequenceEnd(b));
  const second = a.find((s) => s.kind === 'glide' && s.band === 'planter-0');
  const firstDone = Math.max(...a.filter((s) => s.event < 3).map(endOf));
  assert.equal(second.start, firstDone, 'no gap is left for the idle bot');
});

test('bots turn: a bot that only strikes, or only walks, still plays', () => {
  const events = [
    action('harvester-0', 'mow', [1, 1], [1, 2]),
    terrain([1, 2], 'forest', 'stubble', 'mow'),
    move('saw-0', [[4, 4], [4, 5]]),
  ];
  const steps = animSteps(events, { turn: 'bots' });
  assertOrdered(steps, events);
  assert.deepEqual(kinds(steps), ['sweep', 'topple', 'glide']);
  assert.equal(steps[2].start, Math.max(endOf(steps[0]), endOf(steps[1])));
});

test('bot speed: fast halves every time and the budget', () => {
  assert.equal(SPEED_FACTOR.normal, 1);
  assert.equal(SPEED_FACTOR.fast, 0.5);
  const events = botBeat('harvester-0', 2, 0);
  const normal = animSteps(events, { turn: 'bots', speed: 'normal' });
  const fast = animSteps(events, { turn: 'bots', speed: 'fast' });
  assert.deepEqual(kinds(fast), kinds(normal));
  assert.equal(sequenceEnd(fast), Math.round(sequenceEnd(normal) / 2));

  const long = [];
  for (let i = 0; i < 8; i += 1) long.push(...botBeat(`harvester-${i}`, 3, i));
  assert.equal(sequenceEnd(animSteps(long, { turn: 'bots', speed: 'fast' })), BOT_TURN_BUDGET_MS / 2);
  assertOrdered(animSteps(long, { turn: 'bots', speed: 'fast' }), long);
});

test('bot speed: the default is normal', () => {
  const events = botBeat('harvester-0', 2, 0);
  assert.deepEqual(animSteps(events, { turn: 'bots' }), animSteps(events, { turn: 'bots', speed: 'normal' }));
});

test('bot speed: instant shows the result at once, keeping the call-outs', () => {
  const events = [
    ...botBeat('saw-0', 3, 0),
    move('harvester-0', [[1, 3], [2, 3]]),
    action('harvester-0', 'mow', [2, 3], [3, 3]),
    terrain([3, 3], 'habitat', 'habitatDamaged', 'mow'),
    plan('saw-0'),
    plan('harvester-0'),
  ];
  const steps = animSteps(events, { turn: 'bots', speed: 'instant' });
  assertOrdered(steps, events);
  assert.equal(sequenceEnd(steps), 0);
  for (const step of steps) {
    assert.equal(step.start, 0);
    assert.equal(step.duration, 0);
    assert.ok(step.kind === 'fade' || step.kind === 'callout', step.kind);
  }
  assert.equal(only(steps, 'callout').text, DEN_DAMAGED_TEXT);
});

test('bot speed applies to the bots turn only: player animations keep their pace', () => {
  const events = [action('ants', 'bite', [1, 1], [2, 1]), damage('saw-0', [[3, 1]])];
  const plain = animSteps(events);
  assert.deepEqual(animSteps(events, { turn: 'player', speed: 'instant' }), plain);
  assert.deepEqual(animSteps(events, { turn: 'player', speed: 'fast' }), plain);
  assert.deepEqual(animSteps(events, { speed: 'fast' }), plain, 'the turn defaults to the player');
});

// --- reduced motion ---

test('reduced motion: a player action collapses to quick fades of what changed', () => {
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[4, 1]]),
    push({ kind: 'moved', band: 'harvester-0', to: [3, 1] }),
    plan('harvester-0'),
  ];
  const steps = animSteps(events, { reducedMotion: true });
  assert.deepEqual(steps, [
    { kind: 'fade', band: 'harvester-0', at: null, start: 0, duration: FADE_MS, event: 1 },
  ]);
  assert.ok(FADE_MS > 0 && FADE_MS <= 150, 'a quick fade');
});

test('reduced motion: moves, terrain and pickups fade; nothing glides, lunges or shakes', () => {
  const events = [
    move('badger', [[1, 0], [2, 0]]),
    { kind: 'pickup', at: [2, 0] },
    action('badger', 'dig', [2, 0], [3, 0]),
    terrain([3, 0], 'open', 'hole', 'dig'),
  ];
  const steps = animSteps(events, { reducedMotion: true });
  assertOrdered(steps, events);
  assert.deepEqual(steps, [
    { kind: 'fade', band: 'badger', at: null, start: 0, duration: FADE_MS, event: 0 },
    { kind: 'fade', band: null, at: [2, 0], start: 0, duration: FADE_MS, event: 1 },
    { kind: 'fade', band: null, at: [3, 0], start: 0, duration: FADE_MS, event: 3 },
  ]);
});

test('reduced motion: the bots turn shows its result at once', () => {
  const events = [];
  for (let i = 0; i < 6; i += 1) events.push(...botBeat(`harvester-${i}`, 3, i));
  events.push(
    action('planter-0', 'pave', [5, 6], [5, 7]),
    terrain([5, 7], 'habitatDamaged', 'stubble', 'pave'),
  );
  const steps = animSteps(events, { turn: 'bots', reducedMotion: true });
  assertOrdered(steps, events);
  assert.equal(sequenceEnd(steps), FADE_MS);
  for (const step of steps) {
    assert.equal(step.start, 0);
    assert.equal(step.duration, FADE_MS);
    assert.ok(step.kind === 'fade' || step.kind === 'callout', step.kind);
  }
  // One fade per band or tile that changed, however many events touched it.
  const fades = steps.filter((s) => s.kind === 'fade');
  assert.equal(fades.filter((s) => s.band === 'ants').length, 1);
  assert.equal(fades.filter((s) => s.band === 'harvester-0').length, 1);
  assert.equal(fades.filter((s) => s.at !== null && s.at[0] === 5 && s.at[1] === 7).length, 1);
  assert.equal(only(steps, 'callout').text, DEN_LOST_TEXT);
});

test('reduced motion with instant bot speed has no duration at all', () => {
  const steps = animSteps(botBeat('saw-0', 2, 0), { turn: 'bots', speed: 'instant', reducedMotion: true });
  assert.equal(sequenceEnd(steps), 0);
});

// --- sequenceEnd ---

test('sequenceEnd is when the last step ends, not when the last step in the list ends', () => {
  const events = [
    action('bear', 'maul', [1, 1], [2, 1]),
    damage('saw-0', [[3, 1], [2, 1]], true),
    plan('saw-0'),
  ];
  const steps = animSteps(events);
  assert.equal(sequenceEnd(steps), Math.max(...steps.map(endOf)));
});

// --- glideFrames: the body tokens follow the head ---

test('glideFrames: one frame per tile walked, starting from where the band stands', () => {
  const frames = glideFrames([[2, 0], [1, 0], [0, 0]], 3, [[3, 0], [4, 0]]);
  assert.deepEqual(frames, [
    [[2, 0], [1, 0], [0, 0]],
    [[3, 0], [2, 0], [1, 0]],
    [[4, 0], [3, 0], [2, 0]],
  ]);
});

test('glideFrames: a short band grows a token behind it each step, up to its maximum', () => {
  const frames = glideFrames([[0, 0]], 3, [[1, 0], [2, 0], [3, 0]]);
  assert.deepEqual(frames, [
    [[0, 0]],
    [[1, 0], [0, 0]],
    [[2, 0], [1, 0], [0, 0]],
    [[3, 0], [2, 0], [1, 0]],
  ]);
});

test('glideFrames: matches the engine, step for step, including a step onto its own body', () => {
  /** @type {[number, number][]} */
  const cells = [[1, 0], [0, 0], [0, 1], [1, 1]];
  /** @type {[number, number][]} */
  const path = [[1, 1], [2, 1], [2, 0], [1, 0]];
  for (const maxLen of [4, 6]) {
    const frames = glideFrames(cells, maxLen, path);
    assert.equal(frames.length, path.length + 1);
    let band = /** @type {any} */ ({ id: 'b', type: 'ants', side: 'us', cells, maxLen, plan: null });
    for (let i = 0; i < path.length; i += 1) {
      band = stepBand(band, path[i]);
      assert.deepEqual(frames[i + 1], band.cells, `step ${i} at maxLen ${maxLen}`);
    }
  }
});

test('glideFrames: does not change or share its inputs', () => {
  /** @type {[number, number][]} */
  const cells = [[1, 0], [0, 0]];
  const frames = glideFrames(cells, 2, [[2, 0]]);
  frames[0][0][0] = 99;
  frames[1][1][0] = 99;
  assert.deepEqual(cells, [[1, 0], [0, 0]]);
});
