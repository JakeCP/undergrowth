// What each band does, in words (play-feel spec, "Changed after Jake's
// playtest of the full build"). The deploy screen and the trading post
// both show it on a unit card (js/ui/unit-card.js).
//
// The one line on what a band is for is written by hand. Everything else
// is made from the band's definition in js/engine/units.js: each action's
// sentence from its real numbers (damage, range, line, push), the traits
// from its movement flags, the tiers from its growth table. So a change to
// the rules changes the words with it.
//
// Pure: no DOM.

/** @typedef {import('../engine/types.js').ActionDef} ActionDef */
/** @typedef {import('../engine/types.js').BandType} BandType */
/** @typedef {import('../engine/types.js').Side} Side */

import { BAND_TYPES, actionsFor, tierFor } from '../engine/units.js';

/** @typedef {{id: string, label: string, sentence: string}} ActionLine */
/** @typedef {{id: string, label: string, sentence: string, runIn: boolean}} TraitLine */
/** @typedef {{name: string, minLen: number, reached: boolean, gains: ActionLine[]}} TierStep */
/**
 * @typedef {object} UnitCard
 * @property {string} typeId
 * @property {string} name  the tier name at this length (Ants, Ant Colony, ...)
 * @property {string} glyph
 * @property {Side} side
 * @property {number} speed
 * @property {number} lengthNow  the band's maximum length today
 * @property {number} lengthMax  the most it can ever grow to
 * @property {string} role
 * @property {ActionLine[]} actions
 * @property {string[]} traits
 * @property {TraitLine[]} traitLines  the same traits, as labelled rows
 * @property {TierStep|null} next  the next growth tier, if there is one
 */
/** @typedef {TierStep & {recruitsLeft: number}} SoonStep */
/** @typedef {{from: number, to: number, maxed: boolean, becomes: TierStep|null, soon: SoonStep|null}} RecruitPreview */

/** What each band is for, in one short line: a nickname, then what it
 *  does. The card shows it in italic under the name, beside the portrait,
 *  so an animal's line is ROLE_MAX_CHARS or shorter. */
/** @type {Readonly<Record<string, string>>} */
export const ROLES = Object.freeze({
  fox: 'The quick one: darts in and bites.',
  hedgehog: 'The stubborn one: slow, sure and prickly.',
  ants: 'The workhorse: a long column to hold a lane.',
  badger: 'The digger: opens holes bots can\'t cross.',
  beaver: 'The builder: dams water and holes.',
  bear: 'The heavy hitter: mauls, and shoves.',
  owl: 'The scout: flies, and strikes from afar.',
  bees: 'The swarm: slips past, and stings a line.',
  harvester: 'A company machine that mows the forest and tears into dens.',
  saw: 'A fast company drone that hunts your bands and cuts dams.',
  planter: 'A company machine that paves the land over, tile by tile.',
  hunter: 'A faster, longer company drone that hunts your bands, cuts deep and cuts dams.',
  tower: 'A company tower that never moves, and shoots far down its row and column.',
  beacon: 'A company beacon that never moves, and fires three tiles down any line.',
  crane: 'A slow company crane that walks or swings, never both, and hits hard two tiles off.',
  coil: 'A long company machine, coiled round what it guards till a band comes near.',
});

/** An animal's role line is at most this long. */
export const ROLE_MAX_CHARS = 44;

/**
 * @param {string} typeId
 * @returns {string}
 */
export function roleLine(typeId) {
  return ROLES[typeId] ?? '';
}

/**
 * "a" or "an" before a word, by its first letter's sound. Good enough for
 * the game's animal names.
 * @param {string} word
 * @returns {'a'|'an'}
 */
export function article(word) {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

/**
 * @param {string} word
 * @returns {string}
 */
export function withArticle(word) {
  return `${article(word)} ${word}`;
}

/**
 * @param {number} n
 * @param {string} one
 * @param {string} many
 * @returns {string}
 */
function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Where an action reaches. Every action aims along one of the four
 * directions (js/engine/actions.js), except a shot with `dirs: 8`, which
 * may also aim along a diagonal (js/engine/lanes.js).
 * @param {ActionDef} action
 * @returns {string}
 */
export function whereText(action) {
  const { minRange: min, maxRange: max } = action;
  if (max <= 1) return 'next to it';
  const line = action.dirs === 8 ? 'in a straight line or a diagonal' : 'in a straight line';
  if (min === max) return `${count(max, 'tile', 'tiles')} away ${line}`;
  if (min <= 1) return `up to ${count(max, 'tile', 'tiles')} away ${line}`;
  return `${min} to ${max} tiles away ${line}`;
}

/**
 * How many tiles a pattern hits: 'line3' is 3, 'single' is 1.
 * @param {string} pattern
 * @returns {number}
 */
export function lineLength(pattern) {
  const m = /^line(\d+)$/.exec(pattern);
  return m === null ? 1 : Number(m[1]);
}

const PUSH_RESULT = 'Pushed into water or a hole, a bot is gone.';

/**
 * One plain sentence (or two) for what an action does, from its numbers.
 * @param {ActionDef} action
 * @returns {string}
 */
export function actionSentence(action) {
  const where = whereText(action);
  const damage = `${action.damage} damage`;
  switch (action.effect) {
    case 'dig': {
      const from = action.fromTail === true ? `${where === 'next to it' ? 'next to its head or its tail end' : where}` : where;
      return `Digs open ground, stubble or forest ${from} into a hole, or breaks a dam there. Only fliers cross a hole.`;
    }
    case 'build':
      return `Builds a dam on water or a hole ${where}, so bands can walk across.`;
    case 'mow':
      return `Mows a forest tile ${where} to stubble, or deals ${damage} to a band there.`;
    case 'saw':
      return `Deals ${damage} to a band ${where}, or cuts a dam there.`;
    case 'pave':
      return `Paves open ground or stubble ${where}, or deals ${damage} to a band there.`;
    case 'crush':
      return `Deals ${damage} to a band ${where}. It never harms dens, dams or ground.`;
    case 'shot': {
      const verb = action.id === 'swing' ? 'Swings at' : 'Shoots';
      return `${verb} a band ${where} for ${damage}. Trees, stones, dens and bodies in the way stop the shot.`;
    }
    default:
      break;
  }
  // attack
  if (action.pattern !== 'single') {
    const start = action.minRange <= 1 ? 'starting next to it' : `starting ${count(action.minRange, 'tile', 'tiles')} away`;
    return `Deals ${damage} to every band in a line of ${lineLength(action.pattern)} tiles, ${start}. Your own bands too.`;
  }
  const push = count(action.push, 'tile', 'tiles');
  if (action.push > 0 && action.damage === 0) {
    return `Pushes an enemy ${where} ${push} away, with no damage. ${PUSH_RESULT}`;
  }
  if (action.push > 0) {
    return `Deals ${damage} to an enemy ${where} and pushes it ${push} away. ${PUSH_RESULT}`;
  }
  return `Deals ${damage} to an enemy ${where}.`;
}

/**
 * @param {ActionDef} action
 * @returns {ActionLine}
 */
function actionLine(action) {
  return { id: action.id, label: action.label, sentence: actionSentence(action) };
}

/**
 * Bees slip through other bands (living-bots spec, section 8): the type's
 * `passThrough` flag, which the engine honours for animal bands only
 * (`passesThrough` in js/engine/band.js). Bots never do.
 * @param {BandType} def
 * @returns {boolean}
 */
export function slipsThrough(def) {
  return def.side === 'us' && def.passThrough === true;
}

/**
 * The bristle trait in words, from its number (js/engine/actions.js: a
 * bot whose strike hits the band takes this much damage).
 * @param {number} amount
 * @returns {string}
 */
export function bristleSentence(amount) {
  return `A bot that strikes it takes ${amount} damage.`;
}

/**
 * How a band moves, beyond its speed, and what else is special about it,
 * as labelled rows. A run-in row reads as one sentence with its label
 * ("Flies over water ..."); the others stand apart ("Bristle: A bot that
 * ...").
 * @param {string} typeId
 * @returns {TraitLine[]}
 */
export function traitLines(typeId) {
  const def = BAND_TYPES[typeId];
  if (def === undefined) return [];
  /** @type {TraitLine[]} */
  const out = [];
  if (def.flies) {
    out.push({ id: 'flies', label: 'Flies', sentence: 'over water and holes, and never falls in. Stones still block it.', runIn: true });
  }
  if (slipsThrough(def)) {
    out.push({ id: 'slips', label: 'Slips through', sentence: 'other bands, friend or bot, but must end its move on free ground.', runIn: true });
  }
  if ((def.bristle ?? 0) > 0) {
    out.push({ id: 'bristle', label: 'Bristle', sentence: bristleSentence(def.bristle ?? 0), runIn: false });
  }
  return out;
}

/**
 * The traits as plain sentences.
 * @param {string} typeId
 * @returns {string[]}
 */
export function traits(typeId) {
  return traitLines(typeId).map((t) => (t.runIn ? `${t.label} ${t.sentence}` : t.sentence));
}

/**
 * The growth tiers above the first, and what each one adds.
 * @param {string} typeId
 * @param {number} maxLen
 * @returns {TierStep[]}
 */
export function tierSteps(typeId, maxLen) {
  const def = BAND_TYPES[typeId];
  if (def === undefined) return [];
  return def.tiers.slice(1).map((tier) => ({
    name: tier.name,
    minLen: tier.minLen,
    reached: tier.minLen <= maxLen,
    gains: tier.grants.map(actionLine),
  }));
}

/**
 * Everything a unit card shows for a band type at this maximum length.
 * @param {string} typeId
 * @param {number} maxLen
 * @returns {UnitCard}
 */
export function unitCard(typeId, maxLen) {
  const def = BAND_TYPES[typeId];
  const len = Math.min(maxLen, def.maxLenCap);
  return {
    typeId,
    name: tierFor(typeId, len).name,
    glyph: def.glyph,
    side: def.side,
    speed: def.speed,
    lengthNow: len,
    lengthMax: def.maxLenCap,
    role: roleLine(typeId),
    actions: actionsFor(typeId, len).map(actionLine),
    traits: traits(typeId),
    traitLines: traitLines(typeId),
    next: tierSteps(typeId, len).find((t) => !t.reached) ?? null,
  };
}

/**
 * "Speed 3 · Length 4, up to 12".
 * @param {UnitCard} card
 * @returns {string}
 */
export function statsLine(card) {
  const growth = card.lengthNow >= card.lengthMax ? 'full' : `up to ${card.lengthMax}`;
  return `Speed ${card.speed} · Length ${card.lengthNow}, ${growth}`;
}

/** The fastest animal's speed: the card draws a band's speed out of this. */
export const SPEED_SCALE = Math.max(
  ...Object.values(BAND_TYPES).filter((def) => def.side === 'us').map((def) => def.speed),
);

/** A tier this many recruits away, or fewer, counts as close. */
export const TIER_SOON = 3;

/**
 * What the next recruit changes: one more length, and a new tier when it
 * reaches one or is close to one.
 * @param {string} typeId
 * @param {number} maxLen
 * @returns {RecruitPreview}
 */
export function recruitPreview(typeId, maxLen) {
  const def = BAND_TYPES[typeId];
  const from = Math.min(maxLen, def.maxLenCap);
  const maxed = from >= def.maxLenCap;
  const ahead = tierSteps(typeId, from).filter((t) => !t.reached);
  const becomes = !maxed ? ahead.find((t) => t.minLen === from + 1) ?? null : null;
  const near = !maxed && becomes === null ? ahead[0] : undefined;
  const soon = near !== undefined && near.minLen - from <= TIER_SOON && near.minLen <= def.maxLenCap
    ? { ...near, recruitsLeft: near.minLen - from }
    : null;
  return { from, to: maxed ? from : from + 1, maxed, becomes, soon };
}

/**
 * @param {TierStep} step
 * @returns {string}
 */
function tierGain(step) {
  if (step.gains.length === 0) return step.name;
  return `${step.name}, which learns ${step.gains.map((g) => g.label).join(' and ')}`;
}

/**
 * The next recruit in words.
 * @param {RecruitPreview} p
 * @returns {string}
 */
export function recruitText(p) {
  if (p.maxed) return 'At full strength.';
  const base = `Next recruit: length ${p.from} → ${p.to}`;
  if (p.becomes !== null) return `${base}, and they become ${tierGain(p.becomes)}.`;
  if (p.soon !== null) return `${base}. ${p.soon.recruitsLeft} more to ${tierGain(p.soon)}.`;
  return `${base}.`;
}
