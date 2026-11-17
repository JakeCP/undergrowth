// The turn banner (play-feel spec, "Changed after Jake's playtest of the
// full build"). Pure: no DOM, no clock.
//
// A short flash over the top of the board at the start of each side's
// turn: "Turn 3 · Your turn", "Turn 3 · Bots' turn". It never takes a
// tap. The bots' banner is a step of their turn (js/ui/anim-steps.js,
// the `banner` option), so it counts inside their time budget and shrinks
// with it. Under reduced motion, or at instant bot speed, it is a plain
// line of text that shows and goes without moving.

/** @typedef {import('../engine/types.js').Side} Side */
/** @typedef {import('../campaign/progress.js').BotSpeed} BotSpeed */
/** @typedef {import('./motion.js').Frame} Frame */
/** @typedef {'flash'|'line'} BannerStyle */

/** How long the player's banner is on screen, in ms. */
export const BANNER_MS = 1100;

/** How long the plain line stays, in ms. */
export const BANNER_LINE_MS = 1400;

/**
 * @param {number} turn
 * @param {Side} side  whose turn starts
 * @returns {string}
 */
export function bannerText(turn, side) {
  return `Turn ${turn} · ${side === 'us' ? 'Your turn' : "Bots' turn"}`;
}

/**
 * The flash, or the plain line under reduced motion or instant bot speed.
 * @param {{speed?: BotSpeed, reducedMotion?: boolean}} options
 * @returns {BannerStyle}
 */
export function bannerStyle(options) {
  return options.reducedMotion === true || options.speed === 'instant' ? 'line' : 'flash';
}

/**
 * The flash's keyframes: in quickly with a small grow, a hold, then out.
 * Transform and opacity only.
 * @returns {Frame[]}
 */
export function bannerFrames() {
  return [
    { transform: 'translate(0px, -6px) scale(0.92)', opacity: 0 },
    { offset: 0.15, transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    { offset: 0.7, transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    { offset: 1, transform: 'translate(0px, -4px) scale(1)', opacity: 0 },
  ];
}
