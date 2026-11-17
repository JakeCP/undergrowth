// The pure half of the animation player (look-and-motion spec, "Motion"):
// which element each animation step moves, with which keyframes, and when.
// The steps come from js/ui/anim-steps.js; the board drawing they play on
// is the state from before the move (Builder's call 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  motionTracks, soundCues, tileKindOf, createSequencer, CALLOUT_MS,
} from '../js/ui/motion.js';
import { animSteps, sequenceEnd, DURATION, FADE_MS } from '../js/ui/anim-steps.js';
import { TILE } from '../js/ui/look.js';
import { createBattle, applyMove } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { makeState, valleyProgress } from './helpers.mjs';
import { setBoardPieces } from '../js/ui/pieces.js';

// These check the code drawing's effects, which are what any piece whose
// picture is not listed falls back to; tests/piece-motion.test.mjs checks
// the pictures in motion.
setBoardPieces({});

// --- event builders, in the shapes of the engine contract ---

const move = (band, path) => ({ kind: 'move', band, path });
const action = (actor, actionId, from, target) => ({ kind: 'action', actor, actionId, from, target });
const damage = (band, cells, wiped = false) => ({ kind: 'damage', band, amount: cells.length, wiped, cells });
const terrain = (at, from, to, cause) => ({ kind: 'terrain', at, from, to, cause });
const push = (outcome) => ({ kind: 'push', outcome });
const plan = (band, p = null) => ({ kind: 'plan', band, plan: p });

/** The tracks for some events played on `before`. */
function tracksFor(before, events, opts = {}) {
  const steps = animSteps(events, { tileKind: tileKindOf(before), ...opts });
  return { steps, motion: motionTracks(steps, before, { reducedMotion: opts.reducedMotion === true }) };
}

const isToken = (t, band, index) => t.target.kind === 'token' && t.target.band === band && t.target.index === index;
const onBand = (t, band) => t.target.kind === 'band' && t.target.band === band;
const fxOf = (tracks, fx) => tracks.filter((t) => t.target.kind === 'fx' && t.target.fx === fx);

/** "translate(40px, 0px) ..." -> [40, 0] */
function shift(transform) {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(transform);
  assert.ok(m, `a translate in ${transform}`);
  return [Number(m[1]), Number(m[2])];
}
const first = (track) => track.keyframes[0];
const last = (track) => track.keyframes[track.keyframes.length - 1];

/** Every keyframe animates transform and opacity only. */
function assertCheap(tracks) {
  for (const track of tracks) {
    for (const frame of track.keyframes) {
      for (const prop of Object.keys(frame)) {
        assert.ok(['transform', 'opacity', 'offset', 'easing'].includes(prop), `${track.target.kind} animates ${prop}`);
      }
    }
  }
}

/** The during-tracks fit inside the sequence and start with their step. */
function assertTimed(motion, steps) {
  assert.equal(motion.end, sequenceEnd(steps));
  for (const track of motion.during) {
    const step = steps[track.step];
    assert.ok(step !== undefined, 'each track names its step');
    assert.ok(track.start >= step.start, `${track.target.kind} starts before its step`);
    assert.ok(track.start + track.duration <= motion.end + 1e-9, `${track.target.kind} runs past the end`);
    assert.ok(track.duration > 0);
  }
}

function boardWith(bands, grid = ['......', '......', '......', '......']) {
  return makeState(grid, bands);
}

// --- Move ---

test('move: the head glides tile to tile and the body tokens follow', () => {
  const before = boardWith([{ id: 'ants', type: 'ants', cells: [[2, 0], [1, 0], [0, 0]], maxLen: 3 }]);
  const { steps, motion } = tracksFor(before, [move('ants', [[3, 0], [4, 0]])]);
  assertTimed(motion, steps);
  assertCheap(motion.during);
  const glide = steps[0];
  for (const [index, endsAt] of [[0, [4, 0]], [1, [3, 0]], [2, [2, 0]]]) {
    const track = motion.during.find((t) => isToken(t, 'ants', index));
    assert.ok(track, `token ${index} moves`);
    assert.equal(track.start, glide.start);
    assert.equal(track.duration, glide.duration);
    assert.equal(track.fill, 'forwards', 'it stays where it walked to until the swap');
    assert.deepEqual(shift(first(track).transform), [0, 0], 'from where it is drawn');
    const drawn = before.bands[0].cells[index];
    assert.deepEqual(shift(last(track).transform), [(endsAt[0] - drawn[0]) * TILE, (endsAt[1] - drawn[1]) * TILE]);
    // One keyframe per tile walked: the tail passes through the head's old cells.
    assert.equal(track.keyframes.length, 3);
    assert.deepEqual(track.keyframes.map((k) => k.offset), [0, 0.5, 1]);
  }
  // The links stay at the old cell centres, so they are hidden.
  const links = motion.during.find((t) => t.target.kind === 'links' && t.target.band === 'ants');
  assert.ok(links);
  assert.equal(last(links).opacity, 0);
});

test('move: a short band grows a new token behind it, fading in where the tail was', () => {
  const before = boardWith([{ id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 4 }]);
  const { steps, motion } = tracksFor(before, [move('ants', [[1, 0], [2, 0], [3, 0]])]);
  assertTimed(motion, steps);
  assertCheap(motion.during);
  const grown = fxOf(motion.during, 'token');
  assert.equal(grown.length, 3, 'one new token per tile walked');
  for (const track of grown) {
    assert.equal(track.target.band, 'ants');
    assert.equal(track.target.side, 'us');
    assert.equal(first(track).opacity, 0, 'hidden until it appears');
    assert.equal(last(track).opacity, 1);
    assert.equal(track.fill, 'both');
  }
  // Each new token is drawn where it first appears and follows the band from there.
  const ids = new Set(grown.map((t) => t.target.id));
  assert.equal(ids.size, 3);
  const byStart = grown.map((t) => ({ at: t.target.at, end: shift(last(t).transform) }));
  assert.deepEqual(byStart.map((t) => [t.at[0] + t.end[0] / TILE, t.at[1] + t.end[1] / TILE]), [[2, 0], [1, 0], [0, 0]]);
});

test('move: a move that goes nowhere animates nothing', () => {
  const before = boardWith([{ id: 'ants', type: 'ants', cells: [[0, 0]] }]);
  const { motion } = tracksFor(before, [move('ants', [])]);
  assert.deepEqual(motion.during, []);
  assert.equal(motion.end, 0);
});

// --- Bite / attack ---

test('bite: the attacker lunges toward the target and back; the target shakes and flashes; lost tokens pop off', () => {
  const before = boardWith([
    { id: 'ants', type: 'ants', cells: [[1, 1], [0, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1], [3, 1], [4, 1]] },
  ]);
  const events = [action('ants', 'bite', [1, 1], [2, 1]), damage('harvester-0', [[4, 1], [3, 1]])];
  const { steps, motion } = tracksFor(before, events);
  assertTimed(motion, steps);
  assertCheap(motion.during);

  const lunge = motion.during.find((t) => isToken(t, 'ants', 0));
  assert.ok(lunge, 'the head lunges');
  assert.deepEqual(shift(first(lunge).transform), [0, 0]);
  assert.deepEqual(shift(last(lunge).transform), [0, 0], 'and comes back');
  const peak = lunge.keyframes.map((k) => shift(k.transform)).reduce((a, b) => (b[0] > a[0] ? b : a));
  assert.ok(peak[0] > 8 && peak[0] < TILE / 2 && peak[1] === 0, `toward the target, not onto it: ${peak}`);
  assert.equal(lunge.fill, 'none');

  const shake = motion.during.find((t) => onBand(t, 'harvester-0'));
  assert.ok(shake, 'the target band shakes');
  assert.ok(shake.keyframes.some((k) => k.opacity !== undefined && k.opacity < 1), 'and flashes');
  assert.equal(shake.fill, 'none');

  // The two tail tokens (cells 2 and 1) pop off and fade, and stay gone.
  for (const index of [2, 1]) {
    const pop = motion.during.find((t) => isToken(t, 'harvester-0', index));
    assert.ok(pop, `token ${index} pops`);
    assert.equal(last(pop).opacity, 0);
    assert.equal(pop.fill, 'forwards');
    assert.equal(pop.origin, 'center');
  }
  assert.equal(motion.during.find((t) => isToken(t, 'harvester-0', 0)), undefined, 'the head stays');
});

test('band wiped: every token scatters and fades', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'saw-0', type: 'saw', cells: [[2, 1], [3, 1]] },
  ]);
  const { steps, motion } = tracksFor(before, [action('bear', 'maul', [1, 1], [2, 1]), damage('saw-0', [[3, 1], [2, 1]], true)]);
  assertTimed(motion, steps);
  const scattered = motion.during.filter((t) => t.target.kind === 'token' && t.target.band === 'saw-0');
  assert.equal(scattered.length, 2);
  const dirs = scattered.map((t) => shift(last(t).transform));
  assert.notDeepEqual(dirs[0], dirs[1], 'they fly apart');
  for (const t of scattered) assert.equal(last(t).opacity, 0);
});

// --- Dig, build, mow, pave ---

test('dig: a dirt burst, and the tile sinks into a hole', () => {
  const before = boardWith([{ id: 'badger', type: 'badger', cells: [[1, 1]] }]);
  const { steps, motion } = tracksFor(before, [action('badger', 'dig', [1, 1], [1, 2]), terrain([1, 2], 'open', 'hole', 'dig')]);
  assertTimed(motion, steps);
  assertCheap(motion.during);
  const dirt = fxOf(motion.during, 'dirt');
  assert.equal(dirt.length, 1);
  assert.deepEqual(dirt[0].target.at, [1, 2]);
  const sink = motion.during.find((t) => t.target.kind === 'feature');
  assert.deepEqual(sink.target.at, [1, 2]);
  assert.equal(last(sink).opacity, 0, 'the old ground feature sinks away');
  assert.equal(fxOf(motion.during, 'pit').length, 1, 'a pit opens');
  const ground = fxOf(motion.during, 'ground');
  assert.equal(ground.length, 1);
  assert.equal(ground[0].target.ground, 'hole', 'the new ground fades in under it');
});

test('build: planks drop in with a small bounce', () => {
  const before = boardWith([{ id: 'beaver', type: 'beaver', cells: [[0, 0]] }], ['.~', '..']);
  const { steps, motion } = tracksFor(before, [action('beaver', 'build', [0, 0], [1, 0]), terrain([1, 0], 'water', 'dam', 'build')]);
  assertTimed(motion, steps);
  const planks = fxOf(motion.during, 'planks');
  assert.equal(planks.length, 1);
  const ys = planks[0].keyframes.map((k) => shift(k.transform)[1]);
  assert.ok(ys[0] < 0, 'from above');
  assert.ok(ys.some((y) => y > 0), 'overshoots');
  assert.equal(ys[ys.length - 1], 0, 'and settles');
});

test('mow: a blade sweeps, the tree tips over, the tile turns to stubble', () => {
  const before = boardWith([{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }], ['....', '....', '...T', '....']);
  const { steps, motion } = tracksFor(before, [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'forest', 'stubble', 'mow')]);
  assertTimed(motion, steps);
  assertCheap(motion.during);
  assert.equal(fxOf(motion.during, 'blade').length, 1);
  const topple = motion.during.find((t) => t.target.kind === 'feature');
  assert.equal(topple.origin, 'bottom', 'tips over at its foot');
  assert.match(last(topple).transform, /rotate\(/);
  assert.equal(fxOf(motion.during, 'ground')[0].target.ground, 'stubble');
});

test('pave: a grey slab spreads over the tile', () => {
  const before = boardWith([{ id: 'planter-0', type: 'planter', cells: [[2, 2]] }]);
  const { steps, motion } = tracksFor(before, [action('planter-0', 'pave', [2, 2], [2, 3]), terrain([2, 3], 'stubble', 'paving', 'pave')]);
  assertTimed(motion, steps);
  const slab = fxOf(motion.during, 'ground');
  assert.equal(slab.length, 1);
  assert.equal(slab[0].target.ground, 'paving');
  assert.equal(slab[0].origin, 'left');
  assert.match(first(slab[0]).transform, /scale\(0, 1\)/);
  assert.match(last(slab[0]).transform, /scale\(1, 1\)/);
});

// --- Push ---

test('push: a slide moves the whole band one tile', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1], [2, 2]] },
  ]);
  const { steps, motion } = tracksFor(before, [action('bear', 'shove', [1, 1], [2, 1]), push({ kind: 'moved', band: 'harvester-0', to: [3, 1] })]);
  assertTimed(motion, steps);
  const head = motion.during.find((t) => isToken(t, 'harvester-0', 0));
  const tail = motion.during.find((t) => isToken(t, 'harvester-0', 1));
  assert.deepEqual(shift(last(head).transform), [TILE, 0]);
  assert.deepEqual(shift(last(tail).transform), [0, -TILE], 'the body follows the head');
});

test('push: a bump gives a jolt toward what blocked it', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
    { id: 'saw-0', type: 'saw', cells: [[3, 1]] },
  ]);
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[2, 1]], false),
    push({ kind: 'bumped', band: 'harvester-0', other: 'saw-0' }),
  ];
  const { steps, motion } = tracksFor(before, events);
  assertTimed(motion, steps);
  const jolt = motion.during.filter((t) => onBand(t, 'harvester-0')).find((t) => t.step === steps.findIndex((s) => s.kind === 'jolt'));
  assert.ok(jolt);
  const xs = jolt.keyframes.map((k) => shift(k.transform)[0]);
  assert.ok(Math.max(...xs) > 0 && xs[xs.length - 1] === 0, 'toward the blocker and back');
});

test('push: falling into water slides in, a splash ring, and the band drops and fades', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
  ], ['....', '...~', '....']);
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[2, 1]], true),
    push({ kind: 'falls', band: 'harvester-0', at: [3, 1] }),
  ];
  const { steps, motion } = tracksFor(before, events);
  assertTimed(motion, steps);
  assert.equal(fxOf(motion.during, 'ring').length, 1);
  const head = motion.during.filter((t) => isToken(t, 'harvester-0', 0));
  assert.equal(head.length, 2, 'slides, then falls');
  assert.deepEqual(shift(last(head[0]).transform), [TILE, 0]);
  assert.deepEqual(shift(first(head[1]).transform), [TILE, 0], 'falls from where it slid to');
  assert.equal(last(head[1]).opacity, 0);
});

test('push: falling into a hole drops and fades with no splash', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
  ], ['....', '...o', '....']);
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[2, 1]], true),
    push({ kind: 'falls', band: 'harvester-0', at: [3, 1] }),
  ];
  const { motion } = tracksFor(before, events);
  assert.equal(fxOf(motion.during, 'ring').length, 0);
  assert.ok(motion.during.some((t) => isToken(t, 'harvester-0', 0) && last(t).opacity === 0));
});

// --- Habitats ---

test('habitat damaged: a crack flash, and a "Den damaged!" call-out that outlives the swap', () => {
  const before = boardWith([{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }], ['....', '....', '...H', '....']);
  const { steps, motion } = tracksFor(before, [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'habitat', 'habitatDamaged', 'mow')]);
  assertTimed(motion, steps);
  assert.equal(fxOf(motion.during, 'flash').length, 1);
  const feature = motion.during.find((t) => t.target.kind === 'feature');
  assert.ok(feature.keyframes.filter((k) => k.opacity < 1).length >= 2, 'flashes');
  assert.equal(motion.detached.length, 1);
  const callout = motion.detached[0];
  assert.equal(callout.target.kind, 'callout');
  assert.equal(callout.target.text, 'Den damaged!');
  assert.deepEqual(callout.target.at, [3, 2]);
  assert.equal(callout.duration, CALLOUT_MS);
  assert.ok(CALLOUT_MS >= 1000, 'long enough to read');
  assertCheap(motion.detached);
});

test('habitat lost: the den crumbles', () => {
  const before = boardWith([{ id: 'planter-0', type: 'planter', cells: [[3, 3]] }], ['....', '....', '...H', '....']);
  const { motion } = tracksFor(before, [action('planter-0', 'pave', [3, 3], [3, 2]), terrain([3, 2], 'habitatDamaged', 'stubble', 'pave')]);
  const crumble = motion.during.find((t) => t.target.kind === 'feature');
  assert.equal(last(crumble).opacity, 0);
  assert.match(last(crumble).transform, /scale\(0\.\d+\)/);
  assert.equal(motion.detached[0].target.text, 'Den lost!');
});

// --- Smaller events ---

test('a pickup lifts off and fades as the head passes; a capture pops', () => {
  const before = makeState(['.*.P'], [{ id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 1 }]);
  const events = [move('ants', [[1, 0], [2, 0], [3, 0]]), { kind: 'pickup', at: [1, 0] }, { kind: 'capture', at: [3, 0] }];
  const { steps, motion } = tracksFor(before, events);
  assertTimed(motion, steps);
  const pickup = motion.during.find((t) => t.target.kind === 'pickup');
  assert.deepEqual(pickup.target.at, [1, 0]);
  assert.equal(last(pickup).opacity, 0);
  const capture = motion.during.find((t) => t.target.kind === 'objective');
  assert.deepEqual(capture.target.at, [3, 0]);
  assert.ok(last(capture).opacity < 1 && last(capture).opacity > 0, 'it stays, faded, as a captured objective does');
});

test('plans: a changed plan fades out, and the new one fades in after the swap', () => {
  const p = { path: [[1, 1]], strike: [1, 2], actionId: 'mow' };
  const before = boardWith([
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 1 },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]], plan: p },
    { id: 'saw-0', type: 'saw', cells: [[4, 3]], plan: { path: [], strike: null, actionId: null } },
  ]);
  const events = [move('ants', [[1, 0]]), plan('harvester-0', { path: [[2, 1]], strike: [1, 1], actionId: 'mow' }), plan('saw-0', { path: [], strike: null, actionId: null })];
  const { steps, motion } = tracksFor(before, events);
  assertTimed(motion, steps);
  const out = motion.during.filter((t) => t.target.kind === 'plan');
  assert.deepEqual(out.map((t) => t.target.band), ['harvester-0'], 'an unchanged plan is left alone');
  assert.equal(last(out[0]).opacity, 0);
  const back = motion.after.filter((t) => t.target.kind === 'plan');
  assert.deepEqual(back.map((t) => t.target.band), ['harvester-0']);
  assert.equal(first(back[0]).opacity, 0);
  assert.equal(back[0].start, 0);
});

test('a freed band gives a little hop', () => {
  const before = boardWith([
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 1 },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 0]], trapped: true },
  ]);
  const { motion } = tracksFor(before, [move('ants', [[1, 0]]), { kind: 'freed', band: 'trapped-bear' }]);
  const hop = motion.during.find((t) => isToken(t, 'trapped-bear', 0));
  assert.ok(hop);
  assert.match(hop.keyframes[1].transform, /scale\(1\.\d+\)/);
});

// --- The bots' turn ---

test('bots turn: a bot walks, then lunges from where it walked to', () => {
  const before = boardWith([
    { id: 'ants', type: 'ants', cells: [[4, 0], [5, 0]] },
    { id: 'planter-0', type: 'planter', cells: [[0, 0]], maxLen: 1 },
  ]);
  const events = [move('planter-0', [[1, 0], [2, 0], [3, 0]]), action('planter-0', 'pave', [3, 0], [4, 0]), damage('ants', [[5, 0]])];
  const { steps, motion } = tracksFor(before, events, { turn: 'bots' });
  assertTimed(motion, steps);
  const head = motion.during.filter((t) => isToken(t, 'planter-0', 0));
  assert.equal(head.length, 2);
  const [walk, lunge] = head;
  assert.ok(walk.start + walk.duration <= lunge.start, 'the walk is seen before the strike');
  assert.deepEqual(shift(first(lunge).transform), [3 * TILE, 0], 'the lunge starts where the walk ended');
  assert.deepEqual(shift(last(lunge).transform), [3 * TILE, 0]);
});

test('every level solution animates move by move, the bots turns inside the budget', () => {
  for (const level of LEVELS) {
    const progress = valleyProgress();
    for (const [type, maxLen] of Object.entries(level.assumes)) progress.bands[type] = { maxLen };
    let state = createBattle(level, level.solution.deploy, progress);
    for (const m of level.solution.moves) {
      const before = state;
      state = applyMove(state, m);
      const turn = m.kind === 'end' ? 'bots' : 'player';
      const { steps, motion } = tracksFor(before, state.events, { turn });
      assertTimed(motion, steps);
      assertCheap([...motion.during, ...motion.after, ...motion.detached]);
      if (turn === 'bots') assert.ok(motion.end <= 1500, `${level.id}: ${motion.end} ms`);
      if (state.outcome !== null) break;
    }
    assert.equal(state.outcome, 'won', level.id);
  }
});

test('bot speed instant: nothing plays, the result shows at once, call-outs still show', () => {
  const before = boardWith([{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }], ['....', '....', '...H', '....']);
  const events = [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'habitat', 'habitatDamaged', 'mow')];
  const { motion } = tracksFor(before, events, { turn: 'bots', speed: 'instant' });
  assert.equal(motion.end, 0);
  assert.deepEqual(motion.during, []);
  assert.deepEqual(motion.after, []);
  assert.equal(motion.detached.length, 1);
});

// --- Reduced motion ---

test('reduced motion: quick fades only, and what changed fades back in after the swap', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1], [2, 2]] },
  ]);
  const events = [action('bear', 'shove', [1, 1], [2, 1]), damage('harvester-0', [[2, 2]]), push({ kind: 'moved', band: 'harvester-0', to: [3, 1] })];
  const { steps, motion } = tracksFor(before, events, { reducedMotion: true });
  assertTimed(motion, steps);
  assert.equal(motion.end, FADE_MS);
  for (const track of [...motion.during, ...motion.after]) {
    for (const frame of track.keyframes) assert.equal(frame.transform, undefined, 'nothing moves');
  }
  assert.ok(motion.during.some((t) => onBand(t, 'harvester-0')));
  assert.ok(motion.after.some((t) => onBand(t, 'harvester-0') && t.duration === FADE_MS));
});

test('reduced motion: call-outs fade in place, with no movement', () => {
  const before = boardWith([{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }], ['....', '....', '...H', '....']);
  const { motion } = tracksFor(before, [action('harvester-0', 'mow', [3, 3], [3, 2]), terrain([3, 2], 'habitat', 'habitatDamaged', 'mow')], { reducedMotion: true });
  for (const frame of motion.detached[0].keyframes) assert.equal(frame.transform, undefined);
});

test('motionTracks does not change the state or the steps', () => {
  const before = boardWith([{ id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 3 }]);
  const steps = animSteps([move('ants', [[1, 0], [2, 0]])]);
  const s1 = structuredClone(before);
  const s2 = structuredClone(steps);
  motionTracks(steps, before);
  assert.deepEqual(before, s1);
  assert.deepEqual(steps, s2);
});

// --- Sound cues ---

test('sound cues: each sound plays when its event first animates', () => {
  const before = boardWith([
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
    { id: 'bear', type: 'bear', cells: [[1, 2]] },
  ]);
  const events = [action('badger', 'dig', [1, 1], [1, 0]), terrain([1, 0], 'open', 'hole', 'dig')];
  const steps = animSteps(events);
  assert.deepEqual(soundCues(events, steps, tileKindOf(before)), [{ at: 0, name: 'dig' }]);
});

test('sound cues: a push into water splashes when the band reaches the water', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
  ], ['....', '...~', '....']);
  const events = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[2, 1]], true),
    push({ kind: 'falls', band: 'harvester-0', at: [3, 1] }),
  ];
  const steps = animSteps(events, { tileKind: tileKindOf(before) });
  const cues = soundCues(events, steps, tileKindOf(before));
  assert.deepEqual(cues.map((c) => c.name), ['bite', 'splash']);
  const splash = steps.find((s) => s.kind === 'splash');
  assert.equal(cues[1].at, splash.start);
});

test('sound cues: the same sound at the same moment plays once (instant bot turns)', () => {
  const events = [];
  for (let i = 0; i < 4; i += 1) events.push(action(`harvester-${i}`, 'mow', [i, 0], [i, 1]));
  const steps = animSteps(events, { turn: 'bots', speed: 'instant' });
  assert.deepEqual(soundCues(events, steps, () => 'open'), [{ at: 0, name: 'mow' }]);
});

test('tileKindOf reads the board before the move, and nothing off the board', () => {
  const s = makeState(['.~', 'oT'], []);
  const kind = tileKindOf(s);
  assert.equal(kind([1, 0]), 'water');
  assert.equal(kind([0, 1]), 'hole');
  assert.equal(kind([5, 5]), undefined);
  assert.equal(kind([-1, 0]), undefined);
});

// --- The sequencer: who waits on what ---

/** A fake player: `start` gives it the done callback; `finish` records the call. */
function fakePlay() {
  const log = [];
  let done = null;
  return {
    log,
    end: () => done?.(),
    start: (d) => {
      done = d;
      return { finish: () => { log.push('finish'); d(); } };
    },
  };
}

test('sequencer: a tap during a player animation finishes it at once and then counts', () => {
  const seq = createSequencer();
  const play = fakePlay();
  const settled = [];
  seq.run('player', play.start, () => settled.push('player'));
  assert.equal(seq.kind(), 'player');
  assert.equal(seq.tap(), true, 'the tap goes on to count');
  assert.deepEqual(play.log, ['finish']);
  assert.deepEqual(settled, ['player'], 'the final state is shown before the tap is handled');
  assert.equal(seq.kind(), null);
});

test('sequencer: a tap during the bots turn jumps to its end and does nothing else', () => {
  const seq = createSequencer();
  const play = fakePlay();
  const settled = [];
  seq.run('bots', play.start, () => settled.push('bots'));
  assert.equal(seq.tap(), false, 'the tap is used up');
  assert.deepEqual(settled, ['bots']);
  assert.equal(seq.kind(), null);
  assert.equal(seq.tap(), true, 'the next tap is ordinary input');
});

test('sequencer: settles exactly once, whether it ends or is finished', () => {
  const seq = createSequencer();
  const play = fakePlay();
  let count = 0;
  seq.run('player', play.start, () => { count += 1; });
  play.end();
  play.end();
  seq.finish();
  assert.equal(count, 1);
  assert.equal(seq.kind(), null);
});

test('sequencer: a new sequence settles the running one first (Undo never waits)', () => {
  const seq = createSequencer();
  const a = fakePlay();
  const b = fakePlay();
  const order = [];
  seq.run('player', a.start, () => order.push('a'));
  seq.run('player', b.start, () => order.push('b'));
  assert.deepEqual(order, ['a']);
  assert.equal(seq.kind(), 'player');
  seq.finish();
  assert.deepEqual(order, ['a', 'b']);
});

test('sequencer: nothing to play settles at once', () => {
  const seq = createSequencer();
  let settled = false;
  seq.run('bots', () => null, () => { settled = true; });
  assert.equal(settled, true);
  assert.equal(seq.kind(), null);
});

test('sequencer: a player that finishes without calling back still settles', () => {
  const seq = createSequencer();
  let settled = 0;
  seq.run('player', () => ({ finish() {} }), () => { settled += 1; });
  seq.finish();
  assert.equal(settled, 1);
});

test('the callout lasts longer than any one step', () => {
  assert.ok(CALLOUT_MS > DURATION.callout);
});

test('every effect element is hidden until its moment: it starts at opacity 0', () => {
  const before = boardWith([
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'badger', type: 'badger', cells: [[0, 3]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
  ], ['......', '...~..', '......', '......']);
  const pushIn = [
    action('bear', 'shove', [1, 1], [2, 1]),
    damage('harvester-0', [[2, 1]], true),
    push({ kind: 'falls', band: 'harvester-0', at: [3, 1] }),
  ];
  const dig = [action('badger', 'dig', [0, 3], [1, 3]), terrain([1, 3], 'open', 'hole', 'dig')];
  for (const events of [pushIn, dig]) {
    const { motion } = tracksFor(before, events);
    const fx = motion.during.filter((t) => t.target.kind === 'fx');
    assert.ok(fx.length > 0);
    for (const track of fx) {
      assert.equal(track.fill, 'both');
      assert.equal(first(track).opacity, 0, `${track.target.fx} shows before it starts`);
    }
  }
});
