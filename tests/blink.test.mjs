// Blinking (js/ui/blink.js): when the next blink falls, and the blinker
// that runs it on an injected clock; the blink-frame lookup in
// js/ui/portraits.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLINK_MS, BLINK_MIN_GAP, BLINK_MAX_GAP, BLINK_APART, nextBlinkAt, isClosed, createBlinker,
} from '../js/ui/blink.js';
import { blinkFor, portraitFor, speakerSpec } from '../js/ui/portraits.js';
import { PORTRAIT_LIST } from '../js/ui/portrait-list.js';
import { fakeClock } from './helpers.mjs';

test('a blink is about 120 ms, every 3 to 6 seconds', () => {
  assert.equal(BLINK_MS, 120);
  assert.equal(BLINK_MIN_GAP, 3000);
  assert.equal(BLINK_MAX_GAP, 6000);
  assert.equal(nextBlinkAt(1000, () => 0), 4000);
  assert.equal(nextBlinkAt(1000, () => 0.5), 5500);
  assert.ok(nextBlinkAt(1000, () => 0.999999) < 7000);
  assert.ok(isClosed(4000, 4000) && isClosed(4119, 4000));
  assert.ok(!isClosed(3999, 4000) && !isClosed(4120, 4000));
});

test('nextBlinkAt keeps clear of the other cut-out\'s blink, inside the 3-to-6-second window', () => {
  for (let other = 3000; other <= 6000; other += 50) {
    for (const r of [0, 0.1, 0.33, 0.5, 0.77, 0.99]) {
      const at = nextBlinkAt(0, () => r, [other]);
      assert.ok(at >= BLINK_MIN_GAP && at <= BLINK_MAX_GAP, `${at} in the window (other ${other}, r ${r})`);
      assert.ok(Math.abs(at - other) >= BLINK_APART, `${at} apart from ${other}`);
    }
  }
  // Nowhere near: as drawn.
  assert.equal(nextBlinkAt(0, () => 0.5, [10000]), 4500);
});

test('the blinker shuts the eyes for 120 ms, at irregular 3-to-6-second gaps', () => {
  const clock = fakeClock([0.1, 0.9, 0.4, 0.7, 0.2]);
  const blinker = createBlinker(clock);
  /** @type {Array<[number, boolean]>} */
  const seen = [];
  blinker.add('fox', (closed) => seen.push([clock.now(), closed]));
  assert.deepEqual(seen, [[0, false]], 'starts with the eyes open');
  clock.advance(60000);
  const shut = seen.filter(([, c]) => c).map(([t]) => t);
  const open = seen.slice(1).filter(([, c]) => !c).map(([t]) => t);
  assert.ok(shut.length >= 10, `${shut.length} blinks in a minute`);
  shut.forEach((t, i) => assert.equal(open[i] - t, BLINK_MS, 'shut for 120 ms'));
  const gaps = shut.slice(1).map((t, i) => t - (open[i]));
  for (const g of gaps) assert.ok(g >= BLINK_MIN_GAP && g <= BLINK_MAX_GAP, `gap ${g}`);
  assert.ok(new Set(gaps).size > 1, 'not a steady beat');
  blinker.stop();
  assert.equal(clock.pending(), 0, 'stopped: no timer left');
});

test('two cut-outs on one stage never blink in step', () => {
  // Randoms that would put them in step if nothing kept them apart.
  const clock = fakeClock([0.5]);
  const blinker = createBlinker(clock);
  /** @type {Record<string, boolean>} */
  const closed = { left: false, right: false };
  /** @type {Record<string, number[]>} */
  const starts = { left: [], right: [] };
  for (const side of ['left', 'right']) {
    blinker.add(side, (c) => {
      closed[side] = c;
      if (c) starts[side].push(clock.now());
      assert.ok(!(closed.left && closed.right), 'never both shut at once');
    });
  }
  clock.advance(120000);
  assert.ok(starts.left.length > 10 && starts.right.length > 10);
  for (const l of starts.left) {
    for (const r of starts.right) assert.ok(Math.abs(l - r) >= BLINK_APART, `${l} and ${r} too close`);
  }
});

test('removing a cut-out mid-blink opens its eyes; stop opens them all', () => {
  const clock = fakeClock([0]);
  const blinker = createBlinker(clock);
  /** @type {boolean[]} */
  const fox = [];
  blinker.add('fox', (c) => fox.push(c));
  clock.advance(3000 + 10);
  assert.equal(fox.at(-1), true, 'shut');
  blinker.remove('fox');
  assert.equal(fox.at(-1), false, 'opened as it stops');
  assert.equal(blinker.has('fox'), false);
  assert.equal(clock.pending(), 0);
  const length = fox.length;
  clock.advance(20000);
  assert.equal(fox.length, length, 'no more blinks');
});

// --- the lookup ---

test('blinkFor: a plain portrait with a blink frame blinks; a mood portrait, a stamp or a missing frame does not', () => {
  const present = ['fox', 'fox-blink', 'fox-happy', 'owl'];
  assert.equal(blinkFor(portraitFor('fox', undefined, present), present), 'assets/portraits/fox-blink.webp');
  assert.equal(blinkFor(portraitFor('fox', 'happy', present), present), null, 'a mood portrait never blinks');
  // A mood whose portrait is missing shows the plain portrait, which may blink.
  assert.equal(blinkFor(portraitFor('fox', 'sad', present), present), 'assets/portraits/fox-blink.webp');
  assert.equal(blinkFor(portraitFor('owl', undefined, present), present), null, 'no blink frame: no blink');
  assert.equal(blinkFor(portraitFor('bear', undefined, present), present), null, 'a stamp never blinks');
  assert.equal(blinkFor(null, present), null);
  assert.equal(blinkFor({ kind: 'image', href: 'assets/portraits/fox-blink.webp', alt: 'Fox' }, present), null);
});

test('blink is not a mood: asking for it gives the plain portrait', () => {
  assert.equal(/** @type {any} */ (portraitFor('fox', 'blink', ['fox', 'fox-blink'])).href, 'assets/portraits/fox.webp');
  assert.equal(/** @type {any} */ (speakerSpec('hazel', 'blink', ['shopkeeper', 'shopkeeper-blink']).portrait).href,
    'assets/portraits/shopkeeper.webp');
});

test('the shipped blink frames: every one has its plain portrait, and the fox, the hedgehog and Hazel blink', () => {
  const blinks = PORTRAIT_LIST.filter((id) => id.endsWith('-blink'));
  for (const id of blinks) assert.ok(PORTRAIT_LIST.includes(id.slice(0, -6)), `${id} has its plain portrait`);
  for (const who of ['fox', 'hedgehog', 'shopkeeper']) {
    assert.equal(blinkFor(portraitFor(who)), `assets/portraits/${who}-blink.webp`, who);
  }
  for (const mood of ['happy', 'sad', 'shrewd', 'greedy', 'surprised']) {
    assert.equal(blinkFor(portraitFor('shopkeeper', mood)), null, `Hazel ${mood} does not blink`);
  }
});
