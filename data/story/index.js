// Every scene in the game, in the order dueScenes reads them. Where two
// scenes share a moment, the earlier one plays first, and a later scene
// is checked as though the earlier ones had played: so o02-convinced must
// stay ahead of tip-den, which waits on it being unseen.

/** @typedef {import('../../js/story/types.js').Scene} Scene */

import { OPENING } from './opening.js';
import { VALLEY } from './valley.js';
import { COMMON } from './common.js';

/** @type {Scene[]} */
export const SCENES = [...OPENING, ...VALLEY, ...COMMON];
