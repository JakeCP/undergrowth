// The thin Web Animations half of the player (js/ui/motion-player.js),
// against the fake DOM: each track lands on the element the board drew,
// effect elements are made where they belong, sounds play on cue, and the
// sequence ends (or is finished early) exactly once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBoard } from '../js/ui/board.js';
import { animSteps } from '../js/ui/anim-steps.js';
import { motionTracks, soundCues, tileKindOf, CALLOUT_MS } from '../js/ui/motion.js';
import { playMotion, playAfter } from '../js/ui/motion-player.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { setBoardPieces } from '../js/ui/pieces.js';

installFakeDom({ canvas: true });
// These check the code drawing's effects, which are what any piece whose
// picture is not listed falls back to; tests/piece-motion.test.mjs checks
// the pictures in motion.
setBoardPieces({});

const NO_VIEW = { selected: null, highlights: [], highlightKind: null, ghost: null };

function board(state) {
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), state, /** @type {any} */ (NO_VIEW));
  return svg;
}

function prepare(state, events, opts = {}) {
  const tileKind = tileKindOf(state);
  const steps = animSteps(events, { tileKind, ...opts });
  return { steps, motion: motionTracks(steps, state, opts), cues: soundCues(events, steps, tileKind) };
}

function fakeSound() {
  const played = [];
  return { played, play: (name) => played.push(name) };
}

const biteState = () => makeState(['......', '......', '......'], [
  { id: 'ants', type: 'ants', cells: [[1, 1], [0, 1]] },
  { id: 'harvester-0', type: 'harvester', cells: [[2, 1], [3, 1], [4, 1]] },
]);
const biteEvents = [
  { kind: 'action', actor: 'ants', actionId: 'bite', from: [1, 1], target: [2, 1] },
  { kind: 'damage', band: 'harvester-0', amount: 1, wiped: false, cells: [[4, 1]] },
];

test('each track animates the element the board drew for it, with its keyframes and timing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = biteState();
  const svg = board(state);
  const { motion } = prepare(state, biteEvents);
  const playing = playMotion(/** @type {any} */ (svg), null, motion, { onEnd: () => {} });
  assert.ok(playing);

  const head = svg.querySelector('[data-band="ants"] [data-token="0"]');
  assert.equal(head.attrs['data-head'], 'true');
  assert.equal(head.animations.length, 1, 'the lunge');
  const lunge = motion.during.find((tr) => tr.target.kind === 'token' && tr.target.band === 'ants');
  assert.deepEqual(head.animations[0].keyframes, lunge.keyframes);
  assert.deepEqual(head.animations[0].options, {
    delay: lunge.start, duration: lunge.duration, easing: lunge.easing, fill: lunge.fill,
  });

  const target = svg.querySelector('[data-band="harvester-0"]');
  assert.equal(target.animations.length, 1, 'the shake');
  const tail = svg.querySelector('[data-band="harvester-0"] [data-token="2"]');
  assert.equal(tail.animations.length, 1, 'the pop');
  assert.equal(tail.style.transformBox, 'fill-box');
  assert.equal(tail.style.transformOrigin, '50% 50%');
  assert.equal(svg.querySelector('[data-band="harvester-0"] [data-token="1"]').animations.length, 0);
});

test('the sequence ends once, at its end, and finish() ends it at once and cancels everything', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = biteState();
  const { motion } = prepare(state, biteEvents);

  let ended = 0;
  const svg = board(state);
  playMotion(/** @type {any} */ (svg), null, motion, { onEnd: () => { ended += 1; } });
  t.mock.timers.tick(motion.end - 1);
  assert.equal(ended, 0);
  t.mock.timers.tick(1);
  assert.equal(ended, 1);
  assert.ok(svg.all().flatMap((n) => n.animations).every((a) => a.cancelled), 'nothing is left running on the old drawing');

  let early = 0;
  const svg2 = board(state);
  const playing = playMotion(/** @type {any} */ (svg2), null, motion, { onEnd: () => { early += 1; } });
  t.mock.timers.tick(50);
  playing.finish();
  assert.equal(early, 1);
  playing.finish();
  t.mock.timers.tick(motion.end);
  assert.equal(early, 1, 'never twice');
  const anims = svg2.all().flatMap((n) => n.animations);
  assert.ok(anims.length > 0 && anims.every((a) => a.cancelled));
  assert.equal(svg2.querySelector('[data-layer="fx"]'), null, 'the effect layer is gone');
});

test('sounds play on their cue, and not after the sequence was finished early', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = makeState(['....', '...~', '....'], [
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1]] },
  ]);
  const events = [
    { kind: 'action', actor: 'bear', actionId: 'shove', from: [1, 1], target: [2, 1] },
    { kind: 'damage', band: 'harvester-0', amount: 1, wiped: true, cells: [[2, 1]] },
    { kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [3, 1] } },
  ];
  const { motion, cues } = prepare(state, events);
  assert.deepEqual(cues.map((c) => c.name), ['bite', 'splash']);

  const sound = fakeSound();
  playMotion(/** @type {any} */ (board(state)), null, motion, { sound, cues, onEnd: () => {} });
  assert.deepEqual(sound.played, ['bite'], 'a cue at 0 plays at once, inside the tap');
  t.mock.timers.tick(cues[1].at);
  assert.deepEqual(sound.played, ['bite', 'splash']);

  const quiet = fakeSound();
  const playing = playMotion(/** @type {any} */ (board(state)), null, motion, { sound: quiet, cues, onEnd: () => {} });
  playing.finish();
  t.mock.timers.tick(motion.end);
  assert.deepEqual(quiet.played, ['bite']);
});

test('effect elements: new ground goes into its tile above the old ground, the rest on an effect layer on top', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = makeState(['....', '....', '....'], [{ id: 'badger', type: 'badger', cells: [[1, 1]] }]);
  const events = [
    { kind: 'action', actor: 'badger', actionId: 'dig', from: [1, 1], target: [1, 2] },
    { kind: 'terrain', at: [1, 2], from: 'open', to: 'hole', cause: 'dig' },
  ];
  const { motion } = prepare(state, events);
  const svg = board(state);
  playMotion(/** @type {any} */ (svg), null, motion, { onEnd: () => {} });

  const tile = svg.querySelector('[data-tile="1,2"]');
  const kids = tile.children.map((c) => c.attrs['data-ground'] ?? c.attrs['data-fx'] ?? c.attrs['data-feature'] ?? c.attrs['data-edge']);
  assert.equal(kids[0], 'open');
  assert.equal(kids[1], 'ground', 'the new ground sits right above the old');
  assert.equal(tile.children[1].attrs.fill, 'url(#ug-ground-hole)');
  assert.equal(tile.children[1].animations.length, 1);

  const layer = svg.querySelector('[data-layer="fx"]');
  assert.ok(layer);
  assert.equal(svg.children[svg.children.length - 1], layer, 'on top of everything');
  const fx = layer.children.map((c) => c.attrs['data-fx']);
  assert.deepEqual(fx.sort(), ['dirt', 'pit']);
  for (const c of layer.children) assert.equal(c.animations.length, 1);
  assert.equal(svg.querySelector('[data-tile="1,2"] > [data-feature]').animations.length, 1, 'the old feature sinks');
});

test('a band that grows as it marches gets new tokens inside its group, under the head', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = makeState(['......'], [{ id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 3 }]);
  const { motion } = prepare(state, [{ kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] }]);
  const svg = board(state);
  playMotion(/** @type {any} */ (svg), null, motion, { onEnd: () => {} });
  const band = svg.querySelector('[data-band="ants"]');
  const grown = band.children.filter((c) => c.attrs['data-fx'] === 'token');
  assert.equal(grown.length, 2);
  const head = band.children.findIndex((c) => c.attrs['data-head'] === 'true');
  for (const g of grown) {
    assert.ok(band.children.indexOf(g) < head, 'under the head');
    assert.equal(g.animations.length, 1);
    assert.equal(g.animations[0].options.fill, 'both');
  }
  assert.equal(svg.querySelector('[data-band="ants"] > [data-links]'), null, 'a band of one has no links yet');
});

test('call-outs go on the overlay, outlive the swap, and show at once when the turn is skipped', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = makeState(['....', '....', '...H', '....'], [{ id: 'harvester-0', type: 'harvester', cells: [[2, 3]] }]);
  const events = [
    { kind: 'move', band: 'harvester-0', path: [[3, 3]] },
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [3, 3], target: [3, 2] },
    { kind: 'terrain', at: [3, 2], from: 'habitat', to: 'habitatDamaged', cause: 'mow' },
  ];
  const { motion } = prepare(state, events, { turn: 'bots' });
  const overlay = new FakeEl('div');
  const svg = board(state);
  const playing = playMotion(/** @type {any} */ (svg), /** @type {any} */ (overlay), motion, { onEnd: () => {} });
  assert.equal(overlay.children.length, 1);
  const box = overlay.children[0];
  assert.equal(box.className, 'board-callout');
  assert.equal(box.style.left, '43.75%', 'the middle of column 3 of 8');
  assert.equal(box.style.top, '25%');
  const text = box.children[0];
  assert.equal(text.textContent, 'Den damaged!');
  const anim = text.animations[0];
  assert.equal(anim.options.duration, CALLOUT_MS);
  assert.ok(anim.options.delay > 0);

  playing.finish();
  assert.equal(anim.cancelled, false, 'it outlives the swap');
  assert.equal(anim.currentTime, anim.options.delay, 'and starts now');
  anim.onfinish();
  assert.equal(overlay.children.length, 0, 'and goes when it is done');
});

test('with nothing to play, nothing is set up: the call-outs and sounds still come', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = makeState(['....', '....', '...H', '....'], [{ id: 'harvester-0', type: 'harvester', cells: [[3, 3]] }]);
  const events = [
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [3, 3], target: [3, 2] },
    { kind: 'terrain', at: [3, 2], from: 'habitat', to: 'habitatDamaged', cause: 'mow' },
  ];
  const { motion, cues } = prepare(state, events, { turn: 'bots', speed: 'instant' });
  const overlay = new FakeEl('div');
  const sound = fakeSound();
  let ended = 0;
  const playing = playMotion(/** @type {any} */ (board(state)), /** @type {any} */ (overlay), motion, { sound, cues, onEnd: () => { ended += 1; } });
  assert.equal(playing, null);
  assert.equal(ended, 0, 'the caller swaps at once itself');
  assert.equal(overlay.children.length, 1);
  assert.deepEqual(sound.played, ['mow']);
});

test('without the Web Animations API nothing plays and nothing breaks', () => {
  const state = biteState();
  const svg = board(state);
  svg.animate = undefined;
  const { motion } = prepare(state, biteEvents);
  assert.equal(playMotion(/** @type {any} */ (svg), null, motion, { onEnd: () => {} }), null);
  assert.equal(svg.querySelector('[data-layer="fx"]'), null);
});

test('after the swap, what changed fades back in on the new drawing', () => {
  const state = makeState(['......'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0]], plan: { path: [[2, 0]], strike: [1, 0], actionId: 'mow' } },
  ]);
  const svg = board(state);
  const plan = svg.querySelector('[data-plan="harvester-0"]');
  assert.ok(plan);
  playAfter(/** @type {any} */ (svg), [{
    target: { kind: 'plan', band: 'harvester-0' }, keyframes: [{ opacity: 0 }, { offset: 1, opacity: 1 }],
    start: 0, duration: 150, easing: 'ease-out', fill: 'none', origin: null, step: 0,
  }, {
    target: { kind: 'band', band: 'gone' }, keyframes: [{ opacity: 0 }, { offset: 1, opacity: 1 }],
    start: 0, duration: 150, easing: 'ease-out', fill: 'none', origin: null, step: 0,
  }]);
  assert.equal(plan.animations.length, 1);
  assert.equal(plan.animations[0].options.duration, 150);
});
