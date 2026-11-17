// Looping music, one track per screen, played with an
// HTMLAudioElement and faded in and out. For now only the title
// screen has a track; every other screen is silent.
//
// Browsers only allow audio after a user gesture, so the player does
// nothing while off: `play` while off only remembers the track, and
// it starts when `setOn(true)` is called from inside a tap (the first
// tap of the session, wired in js/app.js, or the sound toggle). The
// on/off state follows the saved `soundOn` setting — the same one the
// sound effects in js/ui/sound.js follow; there is no music setting.
//
// `trackFor` is pure. The player below it is kept thin and never
// throws: a browser without audio, or one that refuses to start it,
// just stays silent.

import { TITLE_ASSETS } from './title-assets.js';

/** @typedef {import('./title-view.js').TitleAssets} TitleAssets */

/**
 * The track for a screen, as a path relative to index.html, or null
 * for a silent screen (and for the title when no theme file exists).
 * @param {string} screen
 * @param {TitleAssets} [assets] the artwork that exists; by default
 *   the generated list in js/ui/title-assets.js
 * @returns {string|null}
 */
export function trackFor(screen, assets = TITLE_ASSETS) {
  return screen === 'title' ? assets.theme : null;
}

/** Listening level the fade-in settles at (the file's own level is hot). */
export const MUSIC_VOLUME = 0.5;
/** Fade-in and fade-out length, in ms. */
export const FADE_MS = 600;

/**
 * The part of an HTMLAudioElement the player uses.
 * @typedef {{src: string, loop: boolean, volume: number,
 *   play: () => unknown, pause: () => void}} AudioLike
 */

/**
 * @typedef {object} Music
 * @property {(trackId: string|null) => void} play loop this track
 *   (null: silence). While off it is only remembered, to start on the
 *   first tap that switches the music on.
 * @property {() => void} stop fade out and forget the track
 * @property {(on: boolean) => void} setOn follow the saved sound
 *   setting. Call it from a tap when turning on, so the browser lets
 *   audio start at once.
 * @property {() => boolean} isOn
 * @property {(hidden: boolean) => void} setHidden the page was hidden
 *   (the phone locked, another app in front) or shown again. Hidden,
 *   the music pauses at once and nothing starts; shown, the track comes
 *   back if it is still wanted and the sound is still on.
 */

/**
 * @returns {AudioLike}
 */
function defaultAudio() {
  return new Audio();
}

/**
 * The music player. It starts off and makes no audio element until a
 * track first plays while on.
 * @param {{createAudio?: () => AudioLike, fadeMs?: number, stepMs?: number,
 *   setInterval?: (fn: () => void, ms: number) => unknown,
 *   clearInterval?: (id: unknown) => void, assets?: TitleAssets}} [options]
 * @returns {Music}
 */
export function createMusic(options = {}) {
  const createAudio = options.createAudio ?? defaultAudio;
  const fadeMs = options.fadeMs ?? FADE_MS;
  const stepMs = options.stepMs ?? 50;
  const every = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clear = options.clearInterval ?? ((id) => clearInterval(/** @type {any} */ (id)));

  let on = false;
  /** The page is hidden: nothing plays, whatever else is set. */
  let hidden = false;
  /** @type {string|null} The track to play while on. */
  let pending = null;
  /** @type {AudioLike|null} */
  let audio = null;
  /** @type {string|null} The track loaded in `audio`. */
  let loaded = null;
  /** @type {unknown} */
  let fadeTimer = null;

  const stopFade = () => {
    if (fadeTimer !== null) {
      clear(fadeTimer);
      fadeTimer = null;
    }
  };

  /**
   * @param {number} target
   * @param {(() => void)|null} [onDone]
   * @returns {void}
   */
  const fadeTo = (target, onDone = null) => {
    stopFade();
    if (audio === null) {
      onDone?.();
      return;
    }
    const from = audio.volume;
    const steps = Math.max(1, Math.round(fadeMs / stepMs));
    let step = 0;
    fadeTimer = every(() => {
      step += 1;
      if (audio !== null) {
        audio.volume = Math.min(1, Math.max(0, from + ((target - from) * step) / steps));
      }
      if (step >= steps) {
        stopFade();
        onDone?.();
      }
    }, stepMs);
  };

  const fadeOutAndPause = () => {
    fadeTo(0, () => {
      try {
        audio?.pause();
      } catch {
        // Stay silent.
      }
    });
  };

  /** Start (or resume) the pending track. Only ever called while on. */
  const startPending = () => {
    if (pending === null || hidden) return;
    try {
      if (audio === null) audio = createAudio();
      if (loaded !== pending) {
        audio.src = pending;
        audio.loop = true;
        audio.volume = 0;
        loaded = pending;
      }
      const started = audio.play();
      const p = /** @type {{catch?: (fn: () => void) => void}|undefined} */ (started);
      p?.catch?.(() => {});
      fadeTo(MUSIC_VOLUME);
    } catch {
      // No audio, or the browser refused: stay silent.
    }
  };

  return {
    play(trackId) {
      pending = trackId;
      if (pending === null) {
        fadeOutAndPause();
        return;
      }
      if (!on) return;
      startPending();
    },
    stop() {
      pending = null;
      fadeOutAndPause();
    },
    setOn(next) {
      on = next;
      if (on) startPending();
      else fadeOutAndPause();
    },
    isOn() {
      return on;
    },
    setHidden(next) {
      hidden = next;
      if (hidden) {
        // No fade: a background page's timers are slowed or stopped,
        // and a looping track must not play on behind another app.
        stopFade();
        try {
          if (audio !== null) {
            audio.pause();
            audio.volume = 0;
          }
        } catch {
          // Stay silent.
        }
      } else if (on) {
        startPending();
      }
    },
  };
}
