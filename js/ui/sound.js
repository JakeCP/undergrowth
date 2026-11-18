// Short sound effects made in code with Web Audio (look-and-motion spec,
// "Sound"). There are no audio files. Sound is off until the player turns
// it on; the save remembers the choice (`soundOn` in progress).
//
// The top half of this file is pure: which sound an engine event
// triggers, and each sound's recipe as data. The bottom half, the part
// that talks to Web Audio, is kept thin.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('./anim-steps.js').AnimEvent} AnimEvent */
/** @typedef {'bite'|'dig'|'splash'|'mow'|'victory'|'press'} SoundName */

/**
 * One layer of a sound. `wave` is an oscillator shape, or 'noise' for
 * filtered noise. The voice starts `at` seconds into the sound and lasts
 * `dur` seconds, at peak loudness `gain` (0 to 1). Its pitch (or, for
 * noise, the centre of its band-pass filter) slides from `from` to `to`, in Hz.
 * @typedef {{wave: 'sine'|'square'|'sawtooth'|'triangle'|'noise', at: number, dur: number, from: number, to: number, gain: number}} Voice
 */

/** @type {readonly SoundName[]} */
export const SOUND_NAMES = Object.freeze(['bite', 'dig', 'splash', 'mow', 'victory', 'press']);

/** @type {Readonly<Record<SoundName, readonly Voice[]>>} */
export const RECIPES = Object.freeze({
  // A quick snap with a small downward chirp.
  bite: [
    { wave: 'noise', at: 0, dur: 0.07, from: 2600, to: 900, gain: 0.5 },
    { wave: 'square', at: 0, dur: 0.09, from: 330, to: 140, gain: 0.22 },
  ],
  // A low thud with a gritty tail.
  dig: [
    { wave: 'sine', at: 0, dur: 0.15, from: 150, to: 55, gain: 0.7 },
    { wave: 'noise', at: 0.02, dur: 0.17, from: 900, to: 320, gain: 0.3 },
  ],
  // A wash of noise falling in pitch over a soft plop.
  splash: [
    { wave: 'noise', at: 0, dur: 0.34, from: 3200, to: 500, gain: 0.45 },
    { wave: 'sine', at: 0, dur: 0.13, from: 520, to: 170, gain: 0.3 },
  ],
  // A short engine buzz.
  mow: [
    { wave: 'sawtooth', at: 0, dur: 0.28, from: 96, to: 72, gain: 0.28 },
    { wave: 'noise', at: 0, dur: 0.28, from: 1900, to: 1200, gain: 0.16 },
  ],
  // A rising four-note call: C, E, G, C.
  victory: [
    { wave: 'triangle', at: 0, dur: 0.16, from: 523.25, to: 523.25, gain: 0.3 },
    { wave: 'triangle', at: 0.12, dur: 0.16, from: 659.25, to: 659.25, gain: 0.3 },
    { wave: 'triangle', at: 0.24, dur: 0.16, from: 783.99, to: 783.99, gain: 0.3 },
    { wave: 'triangle', at: 0.36, dur: 0.42, from: 1046.5, to: 1046.5, gain: 0.32 },
  ],
  // A button of the painted kit pressed in: a soft wooden tock.
  press: [
    { wave: 'triangle', at: 0, dur: 0.05, from: 620, to: 400, gain: 0.16 },
    { wave: 'noise', at: 0, dur: 0.03, from: 2400, to: 1500, gain: 0.08 },
  ],
});

/**
 * The sound of each action, by action id. Actions not listed are silent.
 * @type {ReadonlyMap<string, SoundName>}
 */
const ACTION_SOUNDS = new Map([
  ['bite', 'bite'],
  ['maul', 'bite'],
  ['sting', 'bite'],
  ['strike', 'bite'],
  ['ram', 'bite'],
  ['shove', 'bite'],
  ['dig', 'dig'],
  ['mow', 'mow'],
  ['saw', 'mow'],
  ['shoot', 'bite'],
  ['squeeze', 'bite'],
  ['swing', 'dig'],
]);

/**
 * Which sound, if any, an engine event triggers. Play it when the event's
 * first animation step starts.
 *
 * `tileKind` gives the terrain kind of a tile on the board before the
 * move; it is how a push into water is told from a push into a hole.
 * Without it a fall is silent.
 * @param {AnimEvent} event
 * @param {(at: Pos) => string|undefined} [tileKind]
 * @returns {SoundName|null}
 */
export function soundForEvent(event, tileKind) {
  if (event.kind === 'action') {
    return ACTION_SOUNDS.get(event.actionId) ?? null;
  }
  if (event.kind === 'terrain') {
    return event.from === 'dam' && event.to === 'water' ? 'splash' : null;
  }
  if (event.kind === 'push') {
    const outcome = event.outcome;
    if (outcome.kind !== 'falls') return null;
    // A fall caused by the ground giving way follows the terrain event
    // that already made the splash.
    if (outcome.cause === 'terrain') return null;
    if (tileKind === undefined) return null;
    return tileKind(outcome.at) === 'water' ? 'splash' : null;
  }
  return null;
}

/**
 * The sound for the end of a battle: victory when it is won.
 * @param {'won'|'lost'|null} outcome
 * @returns {SoundName|null}
 */
export function soundForOutcome(outcome) {
  return outcome === 'won' ? 'victory' : null;
}

// --- Web Audio ---

const MASTER_GAIN = 0.5;
const ATTACK_S = 0.006;
const SILENCE = 0.0001;
const NOISE_SECONDS = 1;

/**
 * @returns {AudioContext}
 */
function defaultContext() {
  const g = /** @type {{AudioContext?: typeof AudioContext, webkitAudioContext?: typeof AudioContext}} */ (
    /** @type {unknown} */ (globalThis)
  );
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (Ctor === undefined) throw new Error('Web Audio is not available');
  return new Ctor();
}

/**
 * One second of white noise from a fixed seed, so it is the same every time.
 * @param {AudioContext} ctx
 * @returns {AudioBuffer}
 */
function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6e2b1;
  for (let i = 0; i < data.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  return buffer;
}

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} out
 * @param {AudioBuffer} noise
 * @param {Voice} voice
 * @param {number} t0
 * @returns {void}
 */
function playVoice(ctx, out, noise, voice, t0) {
  const start = t0 + voice.at;
  const stop = start + voice.dur;
  const level = ctx.createGain();
  level.gain.setValueAtTime(SILENCE, start);
  level.gain.exponentialRampToValueAtTime(voice.gain, start + ATTACK_S);
  level.gain.exponentialRampToValueAtTime(SILENCE, stop);
  level.connect(out);
  if (voice.wave === 'noise') {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(voice.from, start);
    filter.frequency.exponentialRampToValueAtTime(voice.to, stop);
    source.connect(filter);
    filter.connect(level);
    source.start(start);
    source.stop(stop);
  } else {
    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(voice.from, start);
    osc.frequency.exponentialRampToValueAtTime(voice.to, stop);
    osc.connect(level);
    osc.start(start);
    osc.stop(stop);
  }
}

/**
 * @typedef {object} Sound
 * @property {() => boolean} isOn
 * @property {(on: boolean) => void} setOn turn sound on or off. Call it
 *   from a tap when turning on, so the browser lets audio start.
 * @property {(name: SoundName) => void} play does nothing while off
 */

/**
 * The sound player. It starts off and makes no audio context until it is
 * first turned on. Nothing here ever throws: a browser without Web Audio,
 * or one that refuses to start audio, just stays silent.
 * @param {{createContext?: () => AudioContext}} [options]
 * @returns {Sound}
 */
export function createSound(options = {}) {
  const createContext = options.createContext ?? defaultContext;
  let on = false;
  /** @type {{ctx: AudioContext, out: AudioNode, noise: AudioBuffer}|null} */
  let audio = null;

  /**
   * @param {AudioContext} ctx
   * @returns {void}
   */
  const wake = (ctx) => {
    if (ctx.state !== 'suspended') return;
    try {
      const resumed = ctx.resume();
      if (resumed !== undefined) resumed.catch(() => {});
    } catch {
      // Stay silent.
    }
  };

  return {
    isOn() {
      return on;
    },
    setOn(next) {
      on = next;
      if (!on) return;
      try {
        if (audio === null) {
          const ctx = createContext();
          const out = ctx.createGain();
          out.gain.value = MASTER_GAIN;
          out.connect(ctx.destination);
          audio = { ctx, out, noise: noiseBuffer(ctx) };
        }
        wake(audio.ctx);
      } catch {
        audio = null;
      }
    },
    play(name) {
      if (!on || audio === null) return;
      const voices = Object.hasOwn(RECIPES, name) ? RECIPES[name] : undefined;
      if (voices === undefined) return;
      try {
        wake(audio.ctx);
        const t0 = audio.ctx.currentTime;
        for (const voice of voices) playVoice(audio.ctx, audio.out, audio.noise, voice, t0);
      } catch {
        // Stay silent.
      }
    },
  };
}
