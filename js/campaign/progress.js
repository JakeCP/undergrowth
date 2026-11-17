/** @typedef {'normal'|'fast'|'instant'} BotSpeed */
/**
 * Optional saved settings. They were added after the first playable with
 * no version bump: a save without them is still valid, and `migrate`
 * fills in the defaults.
 * @typedef {{seenIntro?: boolean, seenHabitatTip?: boolean, botSpeed?: BotSpeed, soundOn?: boolean}} Settings
 */
/** @typedef {import('../engine/types.js').Progress & Settings} Progress */
/** @typedef {import('../engine/types.js').Reward} Reward */
/** @typedef {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void}} StorageLike */

import { BAND_TYPES, STARTER_TYPES } from '../engine/units.js';

export const SAVE_KEY = 'undergrowth.save';
export const BAD_SAVE_KEY = 'undergrowth.save.bad';

/** The bot turn speeds, slowest first. The first is the default. */
export const BOT_SPEEDS = /** @type {readonly BotSpeed[]} */ (Object.freeze(['normal', 'fast', 'instant']));

/** @type {Readonly<Required<Settings>>} */
export const DEFAULT_SETTINGS = Object.freeze({
  seenIntro: false,
  seenHabitatTip: false,
  botSpeed: 'normal',
  soundOn: false,
});

/**
 * The old saved flags that are now scenes, with the scene each one means
 * was seen. A save from before the story counts these as seen when the
 * flag is set.
 * @type {Readonly<Record<'seenIntro'|'seenHabitatTip', string>>}
 */
const FLAG_SCENES = Object.freeze({ seenIntro: 'intro-band', seenHabitatTip: 'tip-den' });

/**
 * Every band a player always has, at its starting size.
 * @returns {Record<string, {maxLen: number}>}
 */
function starterBands() {
  /** @type {Record<string, {maxLen: number}>} */
  const bands = {};
  for (const typeId of STARTER_TYPES) bands[typeId] = { maxLen: BAND_TYPES[typeId].startLen };
  return bands;
}

/**
 * A new game: the fox and the hedgehog, no seeds, nothing cleared or seen.
 * @returns {Progress}
 */
export function newProgress() {
  return {
    version: 1,
    seeds: 0,
    bands: starterBands(),
    cleared: {},
    ...DEFAULT_SETTINGS,
    story: { seen: {} },
  };
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * @param {unknown} v
 * @returns {v is BotSpeed}
 */
function isBotSpeed(v) {
  return BOT_SPEEDS.some((speed) => speed === v);
}

/**
 * The settings saved in `raw`, with the default for any that is missing
 * or not of the right type. A bad setting never costs the player the
 * rest of the save.
 * @param {Record<string, unknown>} raw
 * @returns {Required<Settings>}
 */
function settingsFrom(raw) {
  return {
    seenIntro: typeof raw.seenIntro === 'boolean' ? raw.seenIntro : DEFAULT_SETTINGS.seenIntro,
    seenHabitatTip: typeof raw.seenHabitatTip === 'boolean'
      ? raw.seenHabitatTip
      : DEFAULT_SETTINGS.seenHabitatTip,
    botSpeed: isBotSpeed(raw.botSpeed) ? raw.botSpeed : DEFAULT_SETTINGS.botSpeed,
    soundOn: typeof raw.soundOn === 'boolean' ? raw.soundOn : DEFAULT_SETTINGS.soundOn,
  };
}

/**
 * The scenes seen in `raw`: its `story.seen`, keeping only true and false
 * (a broken `story` counts as nothing seen, and never costs the rest of
 * the save), plus the scene behind each old flag that is set.
 * @param {Record<string, unknown>} raw
 * @returns {{seen: Record<string, boolean>}}
 */
function storyFrom(raw) {
  /** @type {Record<string, boolean>} */
  const seen = {};
  const story = raw.story;
  if (isPlainObject(story) && isPlainObject(story.seen)) {
    for (const [sceneId, value] of Object.entries(story.seen)) {
      if (typeof value === 'boolean') seen[sceneId] = value;
    }
  }
  for (const [flag, sceneId] of Object.entries(FLAG_SCENES)) {
    if (raw[flag] === true) seen[sceneId] = true;
  }
  return { seen };
}

/**
 * Band types whose largest size was lowered after saves already held
 * them, with the old largest size. A saved band between the new and the
 * old largest is cut to the new one; above the old it was never valid.
 * Bees went from 8 to 2 (2026-11-15).
 * @type {Readonly<Record<string, number>>}
 */
const LOWERED_CAPS = Object.freeze({ bees: 8 });

/**
 * `raw` with any band from LOWERED_CAPS cut to its type's present cap. A
 * copy when anything is cut; `raw` itself is never changed.
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
function cutLoweredCaps(raw) {
  if (!isPlainObject(raw.bands)) return raw;
  /** @type {Record<string, unknown>} */
  const bands = { ...raw.bands };
  let cut = false;
  for (const [typeId, oldCap] of Object.entries(LOWERED_CAPS)) {
    const band = bands[typeId];
    if (!isPlainObject(band)) continue;
    const maxLen = band.maxLen;
    const cap = BAND_TYPES[typeId].maxLenCap;
    if (typeof maxLen !== 'number' || !Number.isInteger(maxLen)) continue;
    if (maxLen <= cap || maxLen > oldCap) continue;
    bands[typeId] = { ...band, maxLen: cap };
    cut = true;
  }
  return cut ? { ...raw, bands } : raw;
}

/**
 * @param {unknown} input
 * @returns {Progress|null} the validated progress with its settings
 *   defaulted (a copy; `input` is not changed), or null when rejected
 */
function validate(input) {
  if (!isPlainObject(input)) return null;
  const raw = cutLoweredCaps(input);
  if (raw.version !== 1) return null;
  if (typeof raw.seeds !== 'number' || !Number.isInteger(raw.seeds) || raw.seeds < 0) {
    return null;
  }
  if (!isPlainObject(raw.bands) || !isPlainObject(raw.cleared)) return null;
  const bands = raw.bands;
  const cleared = raw.cleared;
  for (const [typeId, band] of Object.entries(bands)) {
    const def = BAND_TYPES[typeId];
    if (def === undefined) return null;
    if (def.side !== 'us') return null;
    if (!isPlainObject(band)) return null;
    const maxLen = band.maxLen;
    if (
      typeof maxLen !== 'number' ||
      !Number.isInteger(maxLen) ||
      maxLen < def.startLen ||
      maxLen > def.maxLenCap
    ) {
      return null;
    }
  }
  for (const value of Object.values(cleared)) {
    if (typeof value !== 'boolean') return null;
  }
  // A save from before the fox and the hedgehog gains them; every band it
  // has is kept as it is.
  const withStarters = { ...starterBands(), .../** @type {Progress['bands']} */ (bands) };
  return {
    .../** @type {import('../engine/types.js').Progress} */ (raw),
    bands: structuredClone(withStarters),
    cleared: { .../** @type {Record<string, boolean>} */ (cleared) },
    ...settingsFrom(raw),
    story: storyFrom(raw),
  };
}

/**
 * A valid save comes back with every setting present (old saves get the
 * defaults), with the fox and the hedgehog, and with a `story.seen`;
 * anything else becomes fresh progress.
 * @param {unknown} raw
 * @returns {Progress}
 */
export function migrate(raw) {
  return validate(raw) ?? newProgress();
}

/**
 * @param {StorageLike} [storage]
 * @returns {Progress}
 */
export function loadProgress(storage) {
  /** @type {StorageLike} */
  let store;
  /** @type {string|null} */
  let item;
  try {
    store = storage ?? globalThis.localStorage;
    item = store.getItem(SAVE_KEY);
  } catch {
    return newProgress();
  }
  if (item === null) return newProgress();
  const raw = item;
  /** @type {Progress|null} */
  let validated = null;
  try {
    validated = validate(JSON.parse(raw));
  } catch {
    validated = null;
  }
  if (validated !== null) return validated;
  // Rejected save: keep the raw string so a later version can repair it.
  try {
    store.setItem(BAD_SAVE_KEY, raw);
  } catch {
    // Swallow: the backup must never break loading.
  }
  return newProgress();
}

/**
 * @param {Progress} p
 * @param {StorageLike} [storage]
 * @returns {void}
 */
export function saveProgress(p, storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    store.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    // Swallow: a failed save must never break the game.
  }
}

/**
 * The progress with some settings changed: only the settings named in
 * `patch`, and only to valid values (a bad value keeps the old one).
 * Anything else in `patch` is ignored. `p` is not changed.
 * @param {Progress} p
 * @param {Settings} patch
 * @returns {Progress}
 */
export function withSettings(p, patch) {
  /** @type {Record<string, unknown>} */
  const asked = { ...patch };
  /** @type {Record<string, unknown>} */
  const next = settingsFrom(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (p)));
  // settingsFrom gives back a value as it was only when it is valid.
  const valid = /** @type {Record<string, unknown>} */ (settingsFrom(asked));
  for (const name of Object.keys(next)) {
    if (Object.hasOwn(asked, name) && asked[name] === valid[name]) next[name] = valid[name];
  }
  return { ...p, .../** @type {Required<Settings>} */ (next) };
}

/**
 * @param {Progress} p
 * @param {string} levelId
 * @param {Reward} reward
 * @returns {Progress}
 */
export function applyVictory(p, levelId, reward) {
  const out = structuredClone(p);
  out.seeds += reward.total;
  out.cleared[levelId] = true;
  return out;
}
