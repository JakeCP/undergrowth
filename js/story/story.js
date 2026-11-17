// Which scenes are due, what they give, and which bands the story has
// surely given by a level (opening-act spec, "The scene system" and
// "Winnable with what the story has given you"). Pure: no DOM, no
// randomness, no clock. Nothing here changes the progress passed in.

/** @typedef {import('./types.js').Scene} Scene */
/** @typedef {import('./types.js').Moment} Moment */
/** @typedef {import('./types.js').Cond} Cond */
/** @typedef {import('./types.js').Gift} Gift */
/** @typedef {import('./types.js').StoryProgress} StoryProgress */
/** @typedef {import('../campaign/campaign.js').CampaignNode} CampaignNode */

import { BAND_TYPES } from '../engine/units.js';

/** The seeds a recruit gift becomes when its band is already at its largest. */
export const FULL_BAND_SEEDS = 10;

/**
 * @param {StoryProgress} progress
 * @param {string} sceneId
 * @returns {boolean}
 */
export function hasSeen(progress, sceneId) {
  return progress.story?.seen?.[sceneId] === true;
}

/**
 * @param {Cond|undefined} cond
 * @param {StoryProgress} progress
 * @returns {boolean}
 */
function holds(cond, progress) {
  if (cond === undefined) return true;
  const owned = (/** @type {string} */ type) => progress.bands[type] !== undefined;
  const seen = (/** @type {string} */ id) => hasSeen(progress, id);
  return (cond.owns ?? []).every(owned)
    && !(cond.lacks ?? []).some(owned)
    && (cond.seen ?? []).every(seen)
    && !(cond.unseen ?? []).some(seen);
}

/**
 * Whether a scene fits a moment, leaving the save aside.
 * @param {Scene} scene
 * @param {Moment} moment
 * @returns {boolean}
 */
function fits(scene, moment) {
  if (scene.when !== moment.when) return false;
  if (scene.level !== undefined && scene.level !== moment.level) return false;
  if (scene.turn !== undefined && scene.turn !== moment.turn) return false;
  return true;
}

/**
 * The scenes due at this moment, in data order. A scene is due when its
 * `when`, `level` (if it names one) and `turn` (if it names one) match,
 * its `if` holds, and it is unseen or repeats. Each scene is checked as
 * though the due scenes before it had already been applied, so a scene
 * that waits on another being unseen is not due alongside it, and a scene
 * that needs a band can follow the one that gives it.
 * @param {Scene[]} scenes
 * @param {Moment} moment
 * @param {StoryProgress} progress
 * @returns {Scene[]}
 */
export function dueScenes(scenes, moment, progress) {
  /** @type {Scene[]} */
  const out = [];
  let p = progress;
  for (const scene of scenes) {
    if (!fits(scene, moment)) continue;
    if (!scene.repeat && hasSeen(p, scene.id)) continue;
    if (!holds(scene.if, p)) continue;
    out.push(scene);
    p = applyScene(p, scene);
  }
  return out;
}

/**
 * Applies one gift to `out` in place.
 * @param {StoryProgress} out
 * @param {Gift} gift
 * @returns {void}
 */
function give(out, gift) {
  if (gift.kind === 'seeds') {
    out.seeds += gift.amount;
    return;
  }
  const def = BAND_TYPES[gift.type];
  if (def === undefined || def.side !== 'us') throw new Error(`a scene cannot give "${gift.type}"`);
  const owned = out.bands[gift.type];
  if (owned === undefined) {
    // A recruit for a band not owned gives the band, so it is not lost.
    out.bands[gift.type] = { maxLen: def.startLen };
  } else if (owned.maxLen < def.maxLenCap) {
    owned.maxLen += 1;
  } else {
    out.seeds += FULL_BAND_SEEDS;
  }
}

/**
 * The progress after a scene: the scene marked seen and its gifts given.
 * A `band` gift for a band already owned becomes one recruit, and a
 * recruit for a band at its largest size becomes 10 seeds, so a gift is
 * never lost and never pushes a band past its cap. A scene already seen
 * gives nothing again unless it repeats. `progress` is not changed.
 * @template {StoryProgress} P
 * @param {P} progress
 * @param {Scene} scene
 * @returns {P}
 */
export function applyScene(progress, scene) {
  const again = hasSeen(progress, scene.id) && !scene.repeat;
  const out = structuredClone(progress);
  out.story = { seen: { ...(progress.story?.seen ?? {}), [scene.id]: true } };
  if (!again) for (const gift of scene.gives ?? []) give(out, gift);
  return out;
}

/**
 * The levels every route from the first node to `levelId` passes through,
 * `levelId` itself left out. A level is on every route when, without it,
 * `levelId` cannot be reached.
 * @param {string} levelId
 * @param {CampaignNode[]} nodes
 * @returns {Set<string>}
 */
function onEveryRoute(levelId, nodes) {
  /** @type {Set<string>} */
  const out = new Set();
  const start = nodes[0].levelId;
  if (levelId === start) return out;
  const next = new Map(nodes.map((n) => [n.levelId, n.unlocks]));
  for (const node of nodes) {
    const without = node.levelId;
    if (without === levelId) continue;
    if (without === start) {
      out.add(without);
      continue;
    }
    /** @type {Set<string>} */
    const reached = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const at = /** @type {string} */ (queue.shift());
      for (const to of next.get(at) ?? []) {
        if (to === without || reached.has(to)) continue;
        reached.add(to);
        queue.push(to);
      }
    }
    if (!reached.has(levelId)) out.add(without);
  }
  return out;
}

/**
 * The bands the story has surely given by the time the player can play
 * `levelId`, whichever route they took: the starters, then (in data
 * order) every band given by a `before` scene on a level every route
 * passes through, this level included, or by a `won` scene on a level
 * every route passes through before it. A scene with no `level` counts
 * wherever its moment must have come. A scene with an `if` is not sure to
 * play, so it does not count; nor does a recruit or seeds gift.
 * @param {string} levelId
 * @param {CampaignNode[]} nodes  the campaign graph; the first node is where it starts
 * @param {Scene[]} scenes
 * @param {string[]} starters
 * @returns {string[]}
 */
export function guaranteedRoster(levelId, nodes, scenes, starters) {
  if (!nodes.some((n) => n.levelId === levelId)) {
    throw new Error(`level "${levelId}" is not in the campaign`);
  }
  const before = onEveryRoute(levelId, nodes);
  const isStart = nodes[0].levelId === levelId;
  const out = [...starters];
  for (const scene of scenes) {
    if (scene.if !== undefined) continue;
    let sure = false;
    if (scene.when === 'before') {
      sure = scene.level === undefined || scene.level === levelId || before.has(scene.level);
    } else if (scene.when === 'won') {
      // Every level but the first is unlocked by winning another.
      sure = scene.level === undefined ? !isStart : before.has(scene.level);
    }
    if (!sure) continue;
    for (const gift of scene.gives ?? []) {
      if (gift.kind === 'band' && !out.includes(gift.type)) out.push(gift.type);
    }
  }
  return out;
}
