// Blinking: a character standing as a cut-out in its plain portrait
// closes its eyes now and then. The blink frame (`<id>-blink`, made by
// scripts/portraits.mjs) holds only the closed eyes, lined up with the
// plain portrait; it is stacked over it and shown for BLINK_MS, every 3 to
// 6 seconds at an irregular interval. Two cut-outs on one stage never
// blink in step. Only a plain portrait blinks (blinkFor in
// js/ui/portraits.js): there is no closed-eyes frame for a mood.
//
// `nextBlinkAt` is the timing, pure; `createBlinker` runs it on a clock
// that can be injected, so it is tested without waiting.

/** How long the eyes stay shut, in ms. */
export const BLINK_MS = 120;
/** The shortest and longest wait between blinks, in ms. */
export const BLINK_MIN_GAP = 3000;
export const BLINK_MAX_GAP = 6000;
/** Two cut-outs on one stage blink at least this far apart, in ms. */
export const BLINK_APART = 600;

/**
 * @typedef {object} Clock
 * @property {() => number} now  ms
 * @property {() => number} random  in [0, 1)
 * @property {(fn: () => void, ms: number) => unknown} setTimer
 * @property {(timer: unknown) => void} clearTimer
 */

/**
 * The page's clock. Its timers do not keep Node running (the tests draw
 * screens with it).
 * @returns {Clock}
 */
export function realClock() {
  return {
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    random: Math.random,
    setTimer(fn, ms) {
      const timer = setTimeout(fn, ms);
      const handle = /** @type {{unref?: () => void}} */ (/** @type {unknown} */ (timer));
      if (typeof handle.unref === 'function') handle.unref();
      return timer;
    },
    clearTimer: (timer) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (timer)),
  };
}

/**
 * When to blink next, after a blink (or a start) at `after`: somewhere
 * from BLINK_MIN_GAP to BLINK_MAX_GAP later, drawn from `random`, and at
 * least BLINK_APART from each time in `others` (when another cut-out on
 * the same stage blinks next).
 * @param {number} after  ms
 * @param {() => number} random  in [0, 1)
 * @param {readonly number[]} [others]
 * @returns {number}
 */
export function nextBlinkAt(after, random, others = []) {
  const from = after + BLINK_MIN_GAP;
  const until = after + BLINK_MAX_GAP;
  const clash = (/** @type {number} */ t) => others.some((o) => Math.abs(t - o) < BLINK_APART);
  const wanted = from + random() * (until - from);
  if (!clash(wanted)) return wanted;
  // Step away from the clash, whichever way stays inside the window.
  const candidates = others.flatMap((o) => [o + BLINK_APART, o - BLINK_APART])
    .filter((t) => t >= from && t <= until && !clash(t))
    .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));
  return candidates[0] ?? wanted;
}

/**
 * Is a blink that starts at `at` showing at `now`?
 * @param {number} now
 * @param {number} at
 * @returns {boolean}
 */
export function isClosed(now, at) {
  return now >= at && now < at + BLINK_MS;
}

/**
 * @typedef {object} Blinker
 * @property {(key: string, show: (closed: boolean) => void) => void} add
 *   starts a cut-out blinking; `show(true)` shuts its eyes, `show(false)`
 *   opens them
 * @property {(key: string) => void} remove  stops one, eyes open
 * @property {() => void} stop  stops them all
 * @property {(key: string) => boolean} has
 */

/**
 * Blinks a stage's cut-outs, each on its own irregular beat and never two
 * at once.
 * @param {Clock} [clock]
 * @returns {Blinker}
 */
export function createBlinker(clock = realClock()) {
  /** @type {Map<string, {at: number, closed: boolean, show: (closed: boolean) => void}>} */
  const eyes = new Map();
  /** @type {unknown} */
  let timer = null;

  /** @param {string} key */
  const othersThan = (key) => [...eyes].filter(([k]) => k !== key).map(([, e]) => e.at);

  function wake() {
    if (timer !== null) clock.clearTimer(timer);
    timer = null;
    if (eyes.size === 0) return;
    let soonest = Infinity;
    for (const e of eyes.values()) soonest = Math.min(soonest, e.closed ? e.at + BLINK_MS : e.at);
    timer = clock.setTimer(tick, Math.max(0, soonest - clock.now()));
  }

  function tick() {
    timer = null;
    const now = clock.now();
    for (const [key, e] of eyes) {
      if (e.closed && now >= e.at + BLINK_MS) {
        e.closed = false;
        e.show(false);
        e.at = nextBlinkAt(now, clock.random, othersThan(key));
      } else if (!e.closed && now >= e.at) {
        e.closed = true;
        e.show(true);
      }
    }
    wake();
  }

  /** @param {string} key */
  function remove(key) {
    const e = eyes.get(key);
    if (e === undefined) return;
    eyes.delete(key);
    if (e.closed) e.show(false);
    wake();
  }

  return {
    add(key, show) {
      remove(key);
      eyes.set(key, { at: nextBlinkAt(clock.now(), clock.random, othersThan(key)), closed: false, show });
      show(false);
      wake();
    },
    remove,
    stop() {
      for (const key of [...eyes.keys()]) remove(key);
    },
    has: (key) => eyes.has(key),
  };
}

/**
 * Resolves once every image is decoded, so the first blink shows at once
 * and nothing flickers; rejects if one cannot be.
 * @param {readonly HTMLImageElement[]} images
 * @returns {Promise<void>}
 */
export function whenDecoded(images) {
  return Promise.all(images.map((img) => (typeof img.decode === 'function' ? img.decode() : undefined)))
    .then(() => undefined);
}

/**
 * Does the player ask for less motion? No blinking then.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  try {
    const match = globalThis.matchMedia;
    return typeof match === 'function' && match('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
