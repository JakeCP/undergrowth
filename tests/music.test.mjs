// Title music (js/ui/music.js): one looping track per screen, silent
// while the saved soundOn setting is off, faded in and out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackFor, createMusic } from '../js/ui/music.js';

const ASSETS = {
  bg: null, bgWide: null, cast: null, foreground: null,
  theme: 'assets/title/title-theme.mp3',
};

/** A fake HTMLAudioElement plus manual interval timers. */
function fakeAudio() {
  const audio = {
    src: '', loop: false, volume: 1, paused: true, plays: 0, pauses: 0,
    play() { audio.paused = false; audio.plays += 1; return Promise.resolve(); },
    pause() { audio.paused = true; audio.pauses += 1; },
  };
  /** @type {Map<number, () => void>} */
  const timers = new Map();
  let nextId = 1;
  const made = [];
  return {
    audio,
    made,
    createAudio: () => { made.push(audio); return audio; },
    setInterval: (fn) => { const id = nextId; nextId += 1; timers.set(id, fn); return id; },
    clearInterval: (id) => { timers.delete(id); },
    /** Run every live interval callback `n` times. */
    tick(n = 1) { for (let i = 0; i < n; i += 1) for (const fn of [...timers.values()]) fn(); },
    live: () => timers.size,
  };
}

function music(fake, opts = {}) {
  return createMusic({
    createAudio: fake.createAudio,
    setInterval: fake.setInterval,
    clearInterval: fake.clearInterval,
    fadeMs: 600,
    stepMs: 60,
    assets: ASSETS,
    ...opts,
  });
}

// --- which track belongs to which screen (pure) ---

test("trackFor: 'title' is the theme and every other screen is silent", () => {
  assert.equal(trackFor('title', ASSETS), 'assets/title/title-theme.mp3');
  for (const screen of ['map', 'battle', 'deploy', 'shop', 'result', '']) {
    assert.equal(trackFor(screen, ASSETS), null, screen);
  }
});

test('trackFor: with no theme file the title is silent too', () => {
  assert.equal(trackFor('title', { ...ASSETS, theme: null }), null);
});

// --- the player ---

test('music does not start while off, and makes no audio element', () => {
  const fake = fakeAudio();
  const m = music(fake);
  assert.equal(m.isOn(), false);
  m.play(trackFor('title', ASSETS));
  assert.equal(fake.made.length, 0, 'nothing created while off');
  assert.equal(fake.audio.plays, 0);
});

test('music starts when switched on, loops, and fades in', () => {
  const fake = fakeAudio();
  const m = music(fake);
  m.play('assets/title/title-theme.mp3');
  m.setOn(true);
  assert.equal(m.isOn(), true);
  assert.equal(fake.audio.src, 'assets/title/title-theme.mp3');
  assert.equal(fake.audio.loop, true);
  assert.equal(fake.audio.plays, 1);
  assert.equal(fake.audio.volume, 0, 'fade starts from silence');
  fake.tick(5);
  assert.ok(fake.audio.volume > 0 && fake.audio.volume < 1, 'halfway up');
  fake.tick(20);
  assert.ok(fake.audio.volume > 0.4, 'faded in to listening level');
  assert.equal(fake.live(), 0, 'fade timer stops at the top');
});

test('play while already on starts at once', () => {
  const fake = fakeAudio();
  const m = music(fake);
  m.setOn(true);
  m.play('assets/title/title-theme.mp3');
  assert.equal(fake.audio.plays, 1);
});

test('stop fades out and pauses; a later play starts again', () => {
  const fake = fakeAudio();
  const m = music(fake);
  m.setOn(true);
  m.play('assets/title/title-theme.mp3');
  fake.tick(20);
  m.stop();
  fake.tick(20);
  assert.equal(fake.audio.volume, 0, 'faded out');
  assert.equal(fake.audio.paused, true, 'paused');
  m.setOn(true);
  assert.equal(fake.audio.plays, 1, 'stop forgets the track: switching on does not restart it');
});

test('switching off silences the music; switching on brings the track back', () => {
  const fake = fakeAudio();
  const m = music(fake);
  m.setOn(true);
  m.play('assets/title/title-theme.mp3');
  fake.tick(20);
  m.setOn(false);
  fake.tick(20);
  assert.equal(fake.audio.paused, true);
  const plays = fake.audio.plays;
  m.setOn(true);
  assert.equal(fake.audio.plays, plays + 1, 'the pending track resumes');
});

test('music never throws when audio is unavailable or refused', () => {
  const m = createMusic({
    createAudio: () => { throw new Error('no audio'); },
    assets: ASSETS,
  });
  assert.doesNotThrow(() => { m.setOn(true); m.play('x.mp3'); m.stop(); m.setOn(false); });
  const refused = createMusic({
    createAudio: () => ({
      src: '', loop: false, volume: 1,
      play: () => Promise.reject(new Error('not allowed')),
      pause() {},
    }),
    assets: ASSETS,
  });
  assert.doesNotThrow(() => { refused.setOn(true); refused.play('x.mp3'); });
});

// --- the page hidden: the phone locked, another app in front ---

test('the music pauses at once when the page is hidden, and comes back when it is shown again', () => {
  const fake = fakeAudio();
  const m = music(fake);
  m.setOn(true);
  m.play('assets/title/title-theme.mp3');
  fake.tick(20);
  assert.equal(fake.audio.paused, false);
  m.setHidden(true);
  assert.equal(fake.audio.paused, true, 'no fade to wait for: timers are slowed in the background');
  assert.equal(fake.live(), 0, 'no fade left running');
  m.setHidden(false);
  assert.equal(fake.audio.paused, false, 'still on the title, sound still on: it resumes');
});

test('a hidden page starts no music, and a page shown again starts none that was stopped or switched off', () => {
  const fake = fakeAudio();
  const m = music(fake);
  m.setHidden(true);
  m.setOn(true);
  m.play('assets/title/title-theme.mp3');
  assert.equal(fake.made.length, 0, 'nothing starts while hidden');
  m.setHidden(false);
  assert.equal(fake.audio.plays, 1, 'it starts when the page is shown');

  // Left the title while hidden: nothing comes back.
  m.setHidden(true);
  m.stop();
  m.setHidden(false);
  assert.equal(fake.audio.plays, 1);
  assert.equal(fake.audio.paused, true);

  // Sound switched off: showing the page does not start it.
  const off = fakeAudio();
  const quiet = music(off);
  quiet.play('assets/title/title-theme.mp3');
  quiet.setHidden(true);
  quiet.setHidden(false);
  assert.equal(off.made.length, 0);
});
