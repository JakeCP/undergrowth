// Victory and defeat (look-and-motion spec, "Motion"): the step lists and
// their tracks are pure. Victory: the bands hop, cleared tiles regrow from
// stubble to grass in a wave, the seed reward counts up. Defeat dims the
// board and shows what was lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  victorySteps, victoryMotion, regrown, waveOrigin, defeatSummary, defeatSteps, countUp,
  ribbonFor, unfurlFrames, wordFrames,
  HOP_MS, COUNT_MS, WAVE_SPAN_MS, RIBBON_MS, COUNT_LEAD_MS,
} from '../js/ui/finale.js';
import { FADE_MS } from '../js/ui/anim-steps.js';
import { groundGrid } from '../js/ui/look.js';
import { makeState } from './helpers.mjs';

function won(extra = {}) {
  return makeState([
    '__..',
    '_T.H',
    '...#',
  ], [
    { id: 'ants', type: 'ants', cells: [[2, 0], [2, 1]], maxLen: 4 },
    { id: 'badger', type: 'badger', cells: [[0, 2]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
  ], { outcome: 'won', ...extra });
}

// --- the wave ---

test('waveOrigin: the captured objective, else the first band head, else the middle', () => {
  assert.deepEqual(waveOrigin(won({ events: [{ kind: 'capture', at: [3, 0] }] })), [3, 0]);
  assert.deepEqual(waveOrigin(won()), [2, 0]);
  const empty = won();
  empty.bands = [];
  assert.deepEqual(waveOrigin(empty), [1.5, 1]);
});

test('victorySteps: every band of ours hops, one after another; bots never do', () => {
  const steps = victorySteps(won());
  assert.deepEqual(steps.hops.map((h) => h.band), ['ants', 'badger']);
  assert.ok(steps.hops[1].start > steps.hops[0].start);
  assert.equal(steps.hops[0].duration, HOP_MS);
});

test('victorySteps: stubble regrows in a wave out from the origin, nearest first', () => {
  const steps = victorySteps(won({ events: [{ kind: 'capture', at: [3, 0] }] }));
  assert.deepEqual(steps.regrow.map((r) => r.at), [[1, 0], [0, 0], [0, 1]]);
  const starts = steps.regrow.map((r) => r.start);
  assert.ok(starts[0] < starts[1] && starts[1] < starts[2], `${starts}`);
  assert.ok(starts[2] - starts[0] <= WAVE_SPAN_MS, 'a big board still regrows in a short wave');
});

test('victorySteps: the wave fits its span on a big board, and tiles the same distance away go together', () => {
  const grid = Array.from({ length: 8 }, () => '________');
  const s = makeState(grid, [{ id: 'ants', type: 'ants', cells: [[0, 0]] }], { outcome: 'won' });
  const steps = victorySteps(s);
  assert.equal(steps.regrow.length, 64);
  const first = steps.regrow[0].start;
  const last = steps.regrow[steps.regrow.length - 1].start;
  assert.ok(last - first <= WAVE_SPAN_MS);
  const byKey = new Map(steps.regrow.map((r) => [r.at.join(','), r.start]));
  assert.equal(byKey.get('1,0'), byKey.get('0,1'));
});

test('victorySteps: the seed count starts with the hops and ends with the sequence or before', () => {
  const steps = victorySteps(won());
  assert.equal(steps.count.duration, COUNT_MS);
  assert.ok(steps.count.start + steps.count.duration <= steps.end);
  for (const r of steps.regrow) assert.ok(r.start + r.duration <= steps.end);
});

test('victorySteps: under reduced motion nothing hops, the tiles fade at once and the count is shown', () => {
  const steps = victorySteps(won(), { reducedMotion: true });
  assert.deepEqual(steps.hops, []);
  assert.ok(steps.regrow.every((r) => r.start === 0 && r.duration === FADE_MS));
  assert.equal(steps.count.duration, 0);
  assert.equal(steps.end, FADE_MS);
});

// --- the tracks ---

test('victoryMotion: hops move the band group; regrowth fades grass in over the stubble', () => {
  const state = won();
  const motion = victoryMotion(victorySteps(state), state);
  const hop = motion.during.find((t) => t.target.kind === 'band' && t.target.band === 'ants');
  assert.ok(hop);
  assert.equal(hop.fill, 'none');
  assert.equal(hop.keyframes[0].transform, 'translate(0px, 0px)');
  assert.ok(hop.keyframes.some((f) => /translate\(0px, -\d/.test(f.transform ?? '')), 'it leaves the ground');
  const grounds = groundGrid(regrown(state));
  const grass = motion.during.filter((t) => t.target.kind === 'fx' && t.target.fx === 'ground');
  assert.equal(grass.length, 3);
  for (const t of grass) {
    assert.equal(t.fill, 'both');
    assert.equal(t.keyframes[0].opacity, 0, 'hidden until its moment');
    const at = /** @type {any} */ (t.target).at;
    assert.equal(/** @type {any} */ (t.target).ground, grounds[at[1]][at[0]], 'the ground the swapped board draws');
  }
  const stubble = motion.during.filter((t) => t.target.kind === 'feature');
  assert.equal(stubble.length, 3);
  assert.ok(stubble.every((t) => t.fill === 'forwards' && t.keyframes[t.keyframes.length - 1].opacity === 0));
  assert.deepEqual(motion.after, []);
  assert.deepEqual(motion.detached, []);
  for (const t of motion.during) {
    for (const f of t.keyframes) {
      for (const k of Object.keys(f)) assert.ok(['offset', 'transform', 'opacity', 'easing'].includes(k), k);
    }
  }
});

test('victoryMotion: reduced motion only fades', () => {
  const state = won();
  const motion = victoryMotion(victorySteps(state, { reducedMotion: true }), state, { reducedMotion: true });
  assert.ok(motion.during.length > 0);
  assert.ok(motion.during.every((t) => t.keyframes.every((f) => f.transform === undefined)));
});

test('regrown: stubble becomes grass for the picture; the battle state is not touched', () => {
  const state = won();
  const pic = regrown(state);
  assert.equal(pic.tiles[0][0].kind, 'open');
  assert.equal(pic.tiles[0][0].variant, 'grass');
  assert.equal(pic.tiles[1][1].kind, 'forest');
  assert.equal(pic.tiles[2][3].kind, 'paving', 'paving stays: only cleared forest regrows');
  assert.equal(state.tiles[0][0].kind, 'stubble');
});

// --- defeat ---

test('defeatSummary: a lost den, by where it stood', () => {
  const before = makeState(['.H.', 'H..'], [{ id: 'ants', type: 'ants', cells: [[2, 1]] }]);
  const after = makeState(['._.', 'H..'], [{ id: 'ants', type: 'ants', cells: [[2, 1]] }], {
    outcome: 'lost', lostReason: 'habitat', habitatStart: 2,
  });
  const sum = defeatSummary(before, after);
  assert.equal(sum.reason, 'habitat');
  assert.equal(sum.text, 'A den was destroyed');
  assert.deepEqual(sum.lost, [[1, 0]]);
});

test('defeatSummary: every band wiped out, marked where each one fell', () => {
  const before = makeState(['....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [1, 0]] },
    { id: 'badger', type: 'badger', cells: [[3, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[2, 0]] },
  ]);
  const after = makeState(['....'], [{ id: 'saw-0', type: 'saw', cells: [[2, 0]] }], { outcome: 'lost', lostReason: 'wiped' });
  const sum = defeatSummary(before, after);
  assert.equal(sum.text, 'Every band was wiped out');
  assert.deepEqual(sum.lost, [[0, 0], [3, 0]]);
});

test('defeatSummary: out of turns marks nothing on the board', () => {
  const s = makeState(['..'], [{ id: 'ants', type: 'ants', cells: [[0, 0]] }], { outcome: 'lost', lostReason: 'turns', turn: 4, turnLimit: 3 });
  const sum = defeatSummary(s, s);
  assert.equal(sum.text, 'Out of turns');
  assert.deepEqual(sum.lost, []);
});

test('defeatSteps: the dim comes first, then the marks, then the words; reduced motion is quick', () => {
  const steps = defeatSteps({ reason: 'habitat', text: 'A den was destroyed', lost: [[1, 0]] });
  assert.equal(steps.dim.start, 0);
  assert.ok(steps.marks[0].start >= steps.dim.start);
  assert.deepEqual(steps.marks[0].at, [1, 0]);
  assert.ok(steps.banner.start >= steps.marks[0].start);
  const quick = defeatSteps({ reason: 'turns', text: 'Out of turns', lost: [] }, { reducedMotion: true });
  assert.equal(quick.dim.duration, FADE_MS);
  assert.equal(quick.banner.start, 0);
});

// --- the ribbon (the end of a battle on the kit's ribbon) ---

test('ribbonFor: a win unfurls the green ribbon, a loss the rust one; the board shouts', () => {
  assert.deepEqual(ribbonFor('won'), { tone: 'green', word: 'Victory' });
  assert.deepEqual(ribbonFor('won', { exclaim: true }), { tone: 'green', word: 'Victory!' });
  assert.deepEqual(ribbonFor('lost'), { tone: 'rust', word: 'Defeat' });
  assert.deepEqual(ribbonFor('lost', { exclaim: true }), { tone: 'rust', word: 'Defeat' });
});

test('the unfurl and the word: transform and opacity only, opening from a sliver to full length', () => {
  const frames = unfurlFrames();
  assert.match(frames[0].transform, /^scaleX\(0\.\d+\)$/);
  assert.equal(frames[0].opacity, 0);
  assert.equal(frames.at(-1).transform, 'scaleX(1)');
  assert.equal(frames.at(-1).opacity, 1);
  for (const k of [...frames, ...wordFrames()]) {
    for (const prop of Object.keys(k)) assert.ok(['offset', 'transform', 'opacity'].includes(prop), prop);
  }
});

test('victorySteps: the ribbon unfurls first and the seeds count once it is open; reduced motion has no unfurl', () => {
  const steps = victorySteps(won());
  assert.deepEqual(steps.ribbon, { start: 0, duration: RIBBON_MS });
  assert.equal(steps.count.start, COUNT_LEAD_MS);
  assert.ok(steps.count.start >= steps.ribbon.start + steps.ribbon.duration);
  assert.ok(steps.end >= steps.ribbon.duration);
  assert.deepEqual(victorySteps(won(), { reducedMotion: true }).ribbon, { start: 0, duration: 0 });
});

test('defeatSteps: the rust ribbon unfurls after the dim, the words come under it; reduced motion shows both at once', () => {
  const steps = defeatSteps({ reason: 'habitat', text: 'A den was destroyed', lost: [[1, 0]] });
  assert.equal(steps.banner.duration, RIBBON_MS);
  assert.ok(steps.banner.start > steps.dim.start);
  assert.ok(steps.words.start > steps.banner.start && steps.words.start < steps.banner.start + steps.banner.duration);
  const quick = defeatSteps({ reason: 'turns', text: 'Out of turns', lost: [] }, { reducedMotion: true });
  assert.deepEqual(quick.banner, { start: 0, duration: 0 });
  assert.equal(quick.words.start, 0);
});

// --- the seed count ---

test('countUp: from 0 to the reward over its time, never past it, never backwards', () => {
  assert.equal(countUp(40, 0, COUNT_MS), 0);
  assert.equal(countUp(40, COUNT_MS, COUNT_MS), 40);
  assert.equal(countUp(40, COUNT_MS * 3, COUNT_MS), 40);
  assert.equal(countUp(40, 100, 0), 40, 'no time: shown at once');
  let last = 0;
  for (let t = 0; t <= COUNT_MS; t += 25) {
    const v = countUp(40, t, COUNT_MS);
    assert.ok(v >= last && v <= 40 && Number.isInteger(v));
    last = v;
  }
});
