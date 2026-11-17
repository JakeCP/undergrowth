import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUND_NAMES, RECIPES, soundForEvent, soundForOutcome, createSound,
} from '../js/ui/sound.js';

const action = (actionId) => ({ kind: 'action', actor: 'x', actionId, from: [0, 0], target: [1, 0] });
const terrain = (from, to, cause = 'x') => ({ kind: 'terrain', at: [1, 0], from, to, cause });
const falls = (cause) => ({
  kind: 'push',
  outcome: cause === undefined
    ? { kind: 'falls', band: 'saw-0', at: [2, 0] }
    : { kind: 'falls', band: 'saw-0', at: [2, 0], cause },
});

// --- which sound an event triggers (pure) ---

test('the six sounds are bite, dig, splash, mow, victory and the button press', () => {
  assert.deepEqual(SOUND_NAMES, ['bite', 'dig', 'splash', 'mow', 'victory', 'press']);
});

test('attacks bite', () => {
  for (const id of ['bite', 'maul', 'sting', 'strike', 'ram', 'shove']) {
    assert.equal(soundForEvent(action(id)), 'bite', id);
  }
});

test('digging digs, and mowing and sawing mow', () => {
  assert.equal(soundForEvent(action('dig')), 'dig');
  assert.equal(soundForEvent(action('mow')), 'mow');
  assert.equal(soundForEvent(action('saw')), 'mow');
});

test('actions with no sound of their own are silent', () => {
  assert.equal(soundForEvent(action('build')), null);
  assert.equal(soundForEvent(action('pave')), null);
  assert.equal(soundForEvent(action('some-new-action')), null);
  assert.equal(soundForEvent(action('toString')), null, 'no sound from an inherited property name');
});

test('a dam breaking into water splashes; other terrain changes are silent', () => {
  assert.equal(soundForEvent(terrain('dam', 'water', 'saw')), 'splash');
  assert.equal(soundForEvent(terrain('dam', 'hole', 'saw')), null);
  // The dig and mow sounds come from the action, so the tile change adds none.
  assert.equal(soundForEvent(terrain('open', 'hole', 'dig')), null);
  assert.equal(soundForEvent(terrain('forest', 'stubble', 'mow')), null);
  assert.equal(soundForEvent(terrain('water', 'dam', 'build')), null);
  assert.equal(soundForEvent(terrain('habitat', 'habitatDamaged', 'mow')), null);
});

test('a band pushed into water splashes; into a hole it does not', () => {
  const water = (at) => (at[0] === 2 && at[1] === 0 ? 'water' : 'open');
  assert.equal(soundForEvent(falls(), water), 'splash');
  assert.equal(soundForEvent(falls(), () => 'hole'), null);
  assert.equal(soundForEvent(falls(), () => undefined), null);
  assert.equal(soundForEvent(falls()), null, 'no terrain lookup, no guess');
});

test('a band that falls because its dam was cut adds no second splash', () => {
  assert.equal(soundForEvent(falls('terrain'), () => 'water'), null);
});

test('pushes that do not fall, and every other event, are silent', () => {
  const silent = [
    { kind: 'push', outcome: { kind: 'moved', band: 'saw-0', to: [2, 0] } },
    { kind: 'push', outcome: { kind: 'bumped', band: 'saw-0', other: null } },
    { kind: 'move', band: 'ants', path: [[1, 0]] },
    { kind: 'damage', band: 'ants', amount: 1, wiped: false, cells: [[0, 0]] },
    { kind: 'capture', at: [1, 0] },
    { kind: 'pickup', at: [1, 0] },
    { kind: 'freed', band: 'trapped-bear' },
    { kind: 'plan', band: 'saw-0', plan: null },
    { kind: 'something-new' },
  ];
  for (const event of silent) {
    assert.equal(soundForEvent(/** @type {any} */ (event), () => 'water'), null, event.kind);
  }
});

test('winning plays the victory sound; losing and an unfinished battle do not', () => {
  assert.equal(soundForOutcome('won'), 'victory');
  assert.equal(soundForOutcome('lost'), null);
  assert.equal(soundForOutcome(null), null);
});

// --- the recipes (data) ---

test('every sound has a short recipe of sane voices', () => {
  assert.deepEqual(Object.keys(RECIPES).sort(), [...SOUND_NAMES].sort());
  for (const name of SOUND_NAMES) {
    const voices = RECIPES[name];
    assert.ok(voices.length > 0, `${name} has no voices`);
    let length = 0;
    for (const voice of voices) {
      assert.ok(['sine', 'square', 'sawtooth', 'triangle', 'noise'].includes(voice.wave), `${name} wave`);
      assert.ok(voice.at >= 0, `${name} start`);
      assert.ok(voice.dur > 0.02 && voice.dur <= 1, `${name} voice length`);
      assert.ok(voice.from > 0 && voice.to > 0, `${name} frequencies must be positive to ramp`);
      assert.ok(voice.gain > 0 && voice.gain <= 1, `${name} gain`);
      length = Math.max(length, voice.at + voice.dur);
    }
    assert.ok(length <= (name === 'victory' ? 1 : 0.5), `${name} lasts ${length}s`);
  }
});

// --- the Web Audio part, against a fake context ---

function fakeParam() {
  const calls = [];
  return {
    calls,
    value: 0,
    setValueAtTime(v, t) { calls.push(['set', v, t]); },
    linearRampToValueAtTime(v, t) { calls.push(['linear', v, t]); },
    exponentialRampToValueAtTime(v, t) {
      if (!(v > 0)) throw new RangeError('exponential ramp to a non-positive value');
      calls.push(['exp', v, t]);
    },
  };
}

function fakeContext() {
  const ctx = {
    currentTime: 10,
    sampleRate: 8000,
    state: 'running',
    destination: { name: 'destination' },
    resumed: 0,
    suspended: 0,
    nodes: [],
    started: [],
    connections: [],
    buffers: 0,
    resume() { ctx.resumed += 1; ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.suspended += 1; ctx.state = 'suspended'; return Promise.resolve(); },
    node(name, extra) {
      const n = {
        name,
        ...extra,
        connect(to) { ctx.connections.push([n, to]); return to; },
        start(t) { ctx.started.push([n, t]); },
        stop(t) { n.stoppedAt = t; },
      };
      ctx.nodes.push(n);
      return n;
    },
    createGain() { return ctx.node('gain', { gain: fakeParam() }); },
    createOscillator() { return ctx.node('osc', { type: 'sine', frequency: fakeParam() }); },
    createBiquadFilter() { return ctx.node('filter', { type: 'lowpass', frequency: fakeParam(), Q: fakeParam() }); },
    createBufferSource() { return ctx.node('noise', { buffer: null }); },
    createBuffer(channels, length, rate) {
      ctx.buffers += 1;
      const data = new Float32Array(length);
      return { channels, length, rate, getChannelData() { return data; } };
    },
  };
  return ctx;
}

test('sound is off until it is turned on, and makes no audio context while off', () => {
  let made = 0;
  const sound = createSound({ createContext: () => { made += 1; return fakeContext(); } });
  assert.equal(sound.isOn(), false);
  sound.play('bite');
  sound.play('victory');
  assert.equal(made, 0);
});

test('turning sound on makes one context, and play starts one source per voice', () => {
  let made = 0;
  const ctx = fakeContext();
  const sound = createSound({ createContext: () => { made += 1; return ctx; } });
  sound.setOn(true);
  assert.equal(sound.isOn(), true);
  sound.setOn(true);
  assert.equal(made, 1);

  for (const name of SOUND_NAMES) {
    ctx.started.length = 0;
    sound.play(name);
    assert.equal(ctx.started.length, RECIPES[name].length, name);
    for (const [node, at] of ctx.started) {
      assert.ok(node.name === 'osc' || node.name === 'noise');
      assert.ok(at >= ctx.currentTime, 'never scheduled in the past');
      assert.ok(node.stoppedAt > at, 'every source is stopped');
    }
  }
  assert.equal(made, 1);
  assert.ok(ctx.connections.some(([, to]) => to === ctx.destination), 'something reaches the speakers');
});

test('play follows the recipe: start times, lengths and waves', () => {
  const ctx = fakeContext();
  const sound = createSound({ createContext: () => ctx });
  sound.setOn(true);
  sound.play('victory');
  const voices = RECIPES.victory;
  assert.equal(ctx.started.length, voices.length);
  ctx.started.forEach(([node, at], i) => {
    assert.ok(Math.abs(at - (ctx.currentTime + voices[i].at)) < 1e-9);
    assert.ok(Math.abs(node.stoppedAt - (at + voices[i].dur)) < 1e-9);
    if (voices[i].wave !== 'noise') assert.equal(node.type, voices[i].wave);
  });
});

test('noise voices play a code-made buffer that is built once and has no silence in it', () => {
  const ctx = fakeContext();
  const sound = createSound({ createContext: () => ctx });
  sound.setOn(true);
  sound.play('splash');
  sound.play('splash');
  sound.play('dig');
  assert.equal(ctx.buffers, 1);
  const source = ctx.nodes.find((n) => n.name === 'noise');
  assert.ok(source.buffer !== null);
  const data = source.buffer.getChannelData();
  assert.ok(data.length >= ctx.sampleRate * 0.5);
  let min = 1;
  let max = -1;
  for (const v of data) { min = Math.min(min, v); max = Math.max(max, v); }
  assert.ok(min >= -1 && max <= 1 && min < -0.5 && max > 0.5, 'noise fills the range');
});

test('turning sound off again silences play', () => {
  const ctx = fakeContext();
  const sound = createSound({ createContext: () => ctx });
  sound.setOn(true);
  sound.setOn(false);
  assert.equal(sound.isOn(), false);
  sound.play('bite');
  assert.equal(ctx.started.length, 0);
});

test('a suspended context is resumed when a sound plays', () => {
  const ctx = fakeContext();
  ctx.state = 'suspended';
  const sound = createSound({ createContext: () => ctx });
  sound.setOn(true);
  const before = ctx.resumed;
  ctx.state = 'suspended';
  sound.play('dig');
  assert.ok(ctx.resumed > before);
  assert.equal(ctx.started.length, RECIPES.dig.length);
});

test('sound never throws: no Web Audio, a failing context, or an unknown name', () => {
  const none = createSound({ createContext: () => { throw new Error('no Web Audio'); } });
  assert.doesNotThrow(() => none.setOn(true));
  assert.doesNotThrow(() => none.play('bite'));

  const ctx = fakeContext();
  ctx.createOscillator = () => { throw new Error('boom'); };
  ctx.resume = () => Promise.reject(new Error('not allowed'));
  ctx.state = 'suspended';
  const broken = createSound({ createContext: () => ctx });
  assert.doesNotThrow(() => broken.setOn(true));
  assert.doesNotThrow(() => broken.play('bite'));
  assert.doesNotThrow(() => broken.play(/** @type {any} */ ('kazoo')));
  assert.doesNotThrow(() => broken.setOn(false));
});

test('with no Web Audio in the environment the default player stays quiet', () => {
  assert.equal(globalThis.AudioContext, undefined, 'node has no AudioContext');
  const sound = createSound();
  assert.doesNotThrow(() => sound.setOn(true));
  assert.doesNotThrow(() => sound.play('victory'));
});
