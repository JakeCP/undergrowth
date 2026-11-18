/** @typedef {import('./types.js').ActionDef} ActionDef */
/** @typedef {import('./types.js').BandType} BandType */
/** @typedef {import('./types.js').Tier} Tier */
/** @typedef {import('./types.js').Rules} Rules */

/** @type {ActionDef} */
const ram = {
  id: 'ram',
  label: 'Ram',
  effect: 'attack',
  damage: 0,
  minRange: 1,
  maxRange: 1,
  pattern: 'single',
  push: 1,
};

// The saw-drone's cut.
/** @type {ActionDef} */
const sawCut = { id: 'saw', label: 'Saw', effect: 'saw', damage: 2, minRange: 1, maxRange: 1, pattern: 'single', push: 0 };

// The Hunter's cut: the saw's, with the same id (so it sounds and moves as
// the saw), but deeper. Three takes a three-long band, or all but the head
// of the ants, in one strike, so no lone band outlasts it in a plain fight.
/** @type {ActionDef} */
const hunterCut = { ...sawCut, damage: 3 };

/** @type {Record<string, BandType>} */
export const BAND_TYPES = {
  // The two the story is built around: every new game starts with them.
  fox: {
    id: 'fox',
    name: 'Fox',
    side: 'us',
    glyph: '🦊',
    speed: 3,
    flies: false,
    startLen: 2,
    maxLenCap: 4,
    actions: [
      { id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Fox', grants: [] }],
    price: null,
    recruitBase: 15,
    // Under the trial rule foxDash, the steps a dash adds to its walk, in
    // place of its bite (js/engine/dash.js).
    dash: 2,
  },
  hedgehog: {
    id: 'hedgehog',
    name: 'Hedgehog',
    side: 'us',
    glyph: '🦔',
    speed: 2,
    flies: false,
    startLen: 2,
    maxLenCap: 4,
    actions: [
      { id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Hedgehog', grants: [] }],
    price: null,
    recruitBase: 15,
    // A bot that strikes the hedgehog takes this much damage.
    bristle: 1,
  },
  ants: {
    id: 'ants',
    name: 'Ants',
    side: 'us',
    glyph: '🐜',
    speed: 3,
    flies: false,
    startLen: 4,
    maxLenCap: 12,
    actions: [
      { id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
    ],
    tiers: [
      { minLen: 1, name: 'Ants', grants: [] },
      { minLen: 6, name: 'Ant Colony', grants: [ram] },
      { minLen: 9, name: 'Supercolony', grants: [] },
    ],
    price: null,
    recruitBase: 10,
  },
  badger: {
    id: 'badger',
    name: 'Badger',
    side: 'us',
    glyph: '🦡',
    speed: 2,
    flies: false,
    startLen: 3,
    maxLenCap: 6,
    actions: [
      // From its tail end as well as its head: it can shut the door it has just come through.
      { id: 'dig', label: 'Dig', effect: 'dig', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 0, fromTail: true },
      { id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
      // Under the trial rule badgerEarthworks only (js/engine/works.js).
      { id: 'fill', label: 'Fill', effect: 'fill', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 0, rule: 'badgerEarthworks' },
    ],
    tiers: [{ minLen: 1, name: 'Badger', grants: [] }],
    price: 30,
    recruitBase: 12,
  },
  beaver: {
    id: 'beaver',
    name: 'Beaver',
    side: 'us',
    glyph: '🦫',
    speed: 2,
    flies: false,
    startLen: 3,
    maxLenCap: 6,
    actions: [
      { id: 'build', label: 'Build', effect: 'build', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
      // Under the trial rule beaverGnaw only: the whole bridge falls (js/engine/works.js).
      { id: 'gnaw', label: 'Gnaw', effect: 'gnaw', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 0, rule: 'beaverGnaw' },
    ],
    tiers: [{ minLen: 1, name: 'Beaver', grants: [] }],
    price: 30,
    recruitBase: 12,
  },
  bear: {
    id: 'bear',
    name: 'Bear',
    side: 'us',
    glyph: '🐾',
    speed: 2,
    flies: false,
    startLen: 2,
    maxLenCap: 4,
    actions: [
      { id: 'maul', label: 'Maul', effect: 'attack', damage: 3, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
      // Under the trial rule bearShovesStones it shoves stones too (js/engine/works.js).
      { id: 'shove', label: 'Shove', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 1, movesStones: true },
    ],
    tiers: [{ minLen: 1, name: 'Bear', grants: [] }],
    price: 60,
    recruitBase: 25,
  },
  owl: {
    id: 'owl',
    name: 'Owl',
    side: 'us',
    glyph: '🦉',
    speed: 4,
    flies: true,
    startLen: 1,
    maxLenCap: 2,
    actions: [
      { id: 'strike', label: 'Strike', effect: 'attack', damage: 2, minRange: 2, maxRange: 3, pattern: 'single', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Owl', grants: [] }],
    price: 50,
    recruitBase: 30,
  },
  bees: {
    id: 'bees',
    name: 'Bees',
    side: 'us',
    glyph: '🐝',
    speed: 3,
    flies: false,
    // Small and slippery: at most two long, bought at one and grown once.
    startLen: 1,
    maxLenCap: 2,
    actions: [
      { id: 'sting', label: 'Sting', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'line3', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Bees', grants: [] }],
    price: 30,
    recruitBase: 15,
    passThrough: true,
  },
  harvester: {
    id: 'harvester',
    name: 'Harvester',
    side: 'bots',
    glyph: '🚜',
    speed: 2,
    flies: false,
    startLen: 3,
    maxLenCap: 3,
    actions: [
      { id: 'mow', label: 'Mow', effect: 'mow', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Harvester', grants: [] }],
    price: null,
    recruitBase: 0,
    reach: 3,
    mind: 'harvester',
  },
  saw: {
    id: 'saw',
    name: 'Saw-drone',
    side: 'bots',
    glyph: '🪚',
    speed: 3,
    flies: false,
    startLen: 2,
    maxLenCap: 2,
    actions: [sawCut],
    tiers: [{ minLen: 1, name: 'Saw-drone', grants: [] }],
    price: null,
    recruitBase: 0,
    reach: 4,
    alwaysEngaged: true,
    mind: 'hunter',
  },
  planter: {
    id: 'planter',
    name: 'Planter-bot',
    side: 'bots',
    glyph: '🤖',
    speed: 2,
    flies: false,
    startLen: 3,
    maxLenCap: 3,
    actions: [
      { id: 'pave', label: 'Pave', effect: 'pave', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Planter-bot', grants: [] }],
    price: null,
    recruitBase: 0,
    reach: 3,
    mind: 'planter',
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    side: 'bots',
    glyph: '🛸',
    speed: 4,
    flies: false,
    startLen: 4,
    maxLenCap: 4,
    actions: [hunterCut],
    tiers: [{ minLen: 1, name: 'Hunter', grants: [] }],
    price: null,
    recruitBase: 0,
    reach: 5,
    alwaysEngaged: true,
    mind: 'hunter',
    regrows: false,
  },
  // It never moves; it shoots down any row or column it can see along (see lanes.js).
  tower: {
    id: 'tower',
    name: 'Watchtower',
    side: 'bots',
    glyph: '🗼',
    speed: 0,
    flies: false,
    startLen: 1,
    maxLenCap: 1,
    actions: [
      { id: 'shoot', label: 'Shoot', effect: 'shot', damage: 2, minRange: 1, maxRange: 6, pattern: 'single', push: 0, dirs: 4 },
    ],
    tiers: [{ minLen: 1, name: 'Watchtower', grants: [] }],
    price: null,
    recruitBase: 0,
    mind: 'sentry',
    regrows: false,
  },
  beacon: {
    id: 'beacon',
    name: 'Beacon',
    side: 'bots',
    glyph: '🚨',
    speed: 0,
    flies: false,
    startLen: 1,
    maxLenCap: 1,
    actions: [
      { id: 'shoot', label: 'Shoot', effect: 'shot', damage: 2, minRange: 1, maxRange: 3, pattern: 'single', push: 0, dirs: 8 },
    ],
    tiers: [{ minLen: 1, name: 'Beacon', grants: [] }],
    price: null,
    recruitBase: 0,
    mind: 'sentry',
    regrows: false,
  },
  // Slow, and it strikes only exactly two tiles off along a row or column,
  // so it keeps that distance rather than walking up beside a band.
  crane: {
    id: 'crane',
    name: 'Crane',
    side: 'bots',
    glyph: '🏗️',
    speed: 1,
    flies: false,
    startLen: 3,
    maxLenCap: 3,
    actions: [
      { id: 'swing', label: 'Swing', effect: 'shot', damage: 3, minRange: 2, maxRange: 2, pattern: 'single', push: 0, dirs: 4 },
    ],
    tiers: [{ minLen: 1, name: 'Crane', grants: [] }],
    price: null,
    recruitBase: 0,
    mind: 'stalker',
    regrows: false,
  },
  // Long and fast, and its squeeze takes two: enough to wipe a fox or a
  // hedgehog at its starting size. A level wraps it round what it guards,
  // setting its length by listing its cells; it lies still until a band
  // comes in reach.
  coil: {
    id: 'coil',
    name: 'Coil',
    side: 'bots',
    glyph: '⛓️',
    speed: 4,
    flies: false,
    startLen: 9,
    maxLenCap: 16,
    actions: [
      { id: 'squeeze', label: 'Squeeze', effect: 'crush', damage: 2, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Coil', grants: [] }],
    price: null,
    recruitBase: 0,
    reach: 5,
    mind: 'coil',
    regrows: false,
  },
};

/** @type {string[]} */
export const STARTER_TYPES = ['fox', 'hedgehog'];

/** @type {string[]} */
export const TARGET_PRIORITY = ['hedgehog', 'owl', 'bear', 'fox', 'beaver', 'badger', 'bees', 'ants'];

/**
 * @param {string} typeId
 * @param {number} maxLen
 * @returns {Tier}
 */
export function tierFor(typeId, maxLen) {
  const type = BAND_TYPES[typeId];
  let result = type.tiers[0];
  for (const tier of type.tiers) {
    if (tier.minLen <= maxLen) result = tier;
  }
  return result;
}

/**
 * The actions a band of this type has at this length, in order. An action
 * that names a trial `rule` is there only when `rules` has it on, so with
 * no rules every band has exactly the actions it always had.
 * @param {string} typeId
 * @param {number} maxLen
 * @param {Rules} [rules]
 * @returns {ActionDef[]}
 */
export function actionsFor(typeId, maxLen, rules = {}) {
  const type = BAND_TYPES[typeId];
  /** @type {ActionDef[]} */
  const result = type.actions.filter((a) => a.rule === undefined || rules[a.rule] === true);
  for (const tier of type.tiers) {
    if (tier.minLen <= maxLen) result.push(...tier.grants);
  }
  return result;
}

/**
 * @param {string} typeId
 * @param {number} currentMaxLen
 * @returns {number}
 */
export function recruitCost(typeId, currentMaxLen) {
  const type = BAND_TYPES[typeId];
  return type.recruitBase + 5 * (currentMaxLen - type.startLen);
}
