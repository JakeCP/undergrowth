// Small levels with habitats, for the self-play invariant test and other
// engine tests. They are test data only: not shipped, not in the campaign.
// The five shipped levels gain their own habitats in the levels task.

/** @typedef {import('../../js/engine/types.js').Level} Level */

const base = {
  blurb: 'fixture',
  turnLimit: null,
  firstClearSeeds: 0,
  assumes: {},
  solution: { deploy: [], moves: [] },
};

/**
 * A walled-in den. The harvester has to mow its way in, the planter has
 * no den it can walk to until a lane is open, and the saw hunts.
 * @type {Level}
 */
export const WALLED = {
  ...base,
  id: 'fx-walled',
  name: 'Walled den',
  goal: 'capture',
  maxBands: 2,
  grid: [
    'D.....TT',
    'D....TTT',
    '.....THT',
    '.....TTT',
    '~~=~~...',
    '........',
    '.P....*.',
    '........',
  ],
  bots: [
    { type: 'harvester', cells: [[0, 7], [1, 7]] },
    { type: 'planter', cells: [[4, 7], [5, 7]] },
    { type: 'saw', cells: [[7, 7], [7, 6]] },
  ],
  trapped: [],
};

/**
 * A trapped bear a short march from the deploy tiles, one open den and
 * one walled den, and a hole.
 * @type {Level}
 */
export const SNARE = {
  ...base,
  id: 'fx-snare',
  name: 'Snare and dens',
  goal: 'rescue',
  maxBands: 3,
  grid: [
    'D.....TH',
    'D..TT.TT',
    'D.......',
    '....o...',
    '........',
    '........',
    '.H.TT...',
    '........',
  ],
  bots: [
    { type: 'saw', cells: [[7, 7], [7, 6]] },
    { type: 'harvester', cells: [[7, 4], [7, 5]] },
    { type: 'planter', cells: [[5, 7], [6, 7]] },
  ],
  trapped: [
    { type: 'bear', cells: [[2, 4], [2, 5], [3, 5], [3, 4]] },
  ],
};

/**
 * A small crowded board: two bots that can reach the same den, a dam and
 * a den half behind trees.
 * @type {Level}
 */
export const CROWDED = {
  ...base,
  id: 'fx-crowded',
  name: 'Crowded clearing',
  goal: 'clear',
  maxBands: 2,
  grid: [
    'D.H...',
    'D.....',
    '..TT..',
    '..TH..',
    '......',
    '=~....',
  ],
  bots: [
    { type: 'harvester', cells: [[5, 0], [5, 1]] },
    { type: 'planter', cells: [[5, 5], [4, 5]] },
  ],
  trapped: [],
};

/**
 * A paved road between the deploy tiles and the den, with a planter
 * coming up it: bands on paving are in its way.
 * @type {Level}
 */
export const PAVED = {
  ...base,
  id: 'fx-paved',
  name: 'Paved road',
  goal: 'capture',
  maxBands: 2,
  grid: [
    'D.###..',
    'D.###.P',
    '..###..',
    '.H###..',
    '..###..',
  ],
  bots: [
    { type: 'planter', cells: [[3, 4], [3, 3]] },
    { type: 'harvester', cells: [[6, 0], [6, 1]] },
  ],
  trapped: [],
};

/**
 * One small harvester by the camp and a permit and seeds far behind a
 * stone wall: bands often bite the bot down before they get there, which
 * wins the capture and sweeps the field.
 * @type {Level}
 */
export const LONE = {
  ...base,
  id: 'fx-lone',
  name: 'Lone harvester',
  goal: 'capture',
  maxBands: 2,
  grid: [
    'DD.*..',
    '......',
    '..H..T',
    'SSSSS.',
    '*.....',
    'P....*',
  ],
  bots: [
    { type: 'harvester', cells: [[2, 0]] },
  ],
  trapped: [],
};

/** @type {Level[]} */
export const HABITAT_LEVELS = [WALLED, SNARE, CROWDED, PAVED, LONE];

/**
 * The hedgehog's bristle: a one-cell harvester right by the camp, which
 * bristle destroys if it strikes the hedgehog, a saw-drone that hunts and
 * a planter that comes up the middle. Not in HABITAT_LEVELS: the self-play
 * test plays it with the hedgehog always deployed.
 * @type {Level}
 */
export const BRISTLE = {
  ...base,
  id: 'fx-bristle',
  name: 'Bristle',
  goal: 'capture',
  maxBands: 2,
  grid: [
    'D...T..',
    'D.H....',
    '....T.P',
    '.......',
    '..T...*',
  ],
  bots: [
    { type: 'harvester', cells: [[3, 0]] },
    { type: 'saw', cells: [[6, 3], [5, 3]] },
    { type: 'planter', cells: [[4, 4], [5, 4]] },
  ],
  trapped: [],
};
