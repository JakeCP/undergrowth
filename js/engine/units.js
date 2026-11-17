/** @typedef {import('./types.js').ActionDef} ActionDef */
/** @typedef {import('./types.js').BandType} BandType */
/** @typedef {import('./types.js').Tier} Tier */

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
      { id: 'dig', label: 'Dig', effect: 'dig', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
      { id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
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
      { id: 'shove', label: 'Shove', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 1 },
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
    actions: [
      { id: 'saw', label: 'Saw', effect: 'saw', damage: 2, minRange: 1, maxRange: 1, pattern: 'single', push: 0 },
    ],
    tiers: [{ minLen: 1, name: 'Saw-drone', grants: [] }],
    price: null,
    recruitBase: 0,
    reach: 4,
    alwaysEngaged: true,
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
 * @param {string} typeId
 * @param {number} maxLen
 * @returns {ActionDef[]}
 */
export function actionsFor(typeId, maxLen) {
  const type = BAND_TYPES[typeId];
  /** @type {ActionDef[]} */
  const result = [...type.actions];
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
