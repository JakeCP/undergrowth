// Idea: the first lesson. The permit is up the far end of the forest
// corridor, five turns' march from camp, and a harvester is penned in the
// lane under the stone wall. It cannot walk through forest, so it mows its
// way down to the den in the south-east wood, one tree a turn, and its
// plan shows each tree and then the den: hit on the bots' fourth turn, gone
// on the fifth.
// Habitat: one den, with a boulder on its north side, so the harvester's
// way in is three trees deep, one more than before the playtest of the
// full build, which found the first level too hard. It teaches that an
// unengaged bot goes for the dens, that forest only slows a harvester
// down, and that a band in a bot's reach draws its strike: "you must
// engage in order to protect".
// Running straight for the permit with the ants alone wins on turn 5, but
// the den takes the harvester's strike on the bots' fourth turn and is won
// damaged: the warning that one more hit loses. The level test checks it.
// Answer with the ants alone, den untouched: one turn into the forest belt
// under the pen pulls the harvester's mow onto them, and then they run for
// the permit (six turns).
// Second approach: bring the badger too, bought in the shop with what o01
// and o02 paid (the story gives it only at l05). It walks along the south
// wood and steps into the trees by the harvester's lane, where the
// harvester strikes it instead of mowing on to the den, while the ants run
// the corridor without a detour (five turns, den untouched).
export default /** @type {import('../../js/engine/types.js').Level} */ ({
  id: 'l01',
  name: 'The Clearing Edge',
  blurb: 'A forged permit flaps on a fence post beyond the tree line, and a harvester is mowing its way toward the badgers\' den.',
  goal: 'capture',
  maxBands: 2,
  turnLimit: null,
  grid: [
    'TT....TP',
    'T*....TT',
    '..,...T.',
    '...SSSSS',
    '..;S....',
    '...TTTTT',
    '.TT..TST',
    'DD...THT',
  ],
  bots: [
    { type: 'harvester', cells: [[5, 4], [6, 4], [7, 4]] },
  ],
  trapped: [],
  // The den is the badgers' burrow (the story's).
  dens: { kind: 'burrow' },
  firstClearSeeds: 20,
  assumes: {},
  solution: {
    deploy: [
      { type: 'ants', at: [0, 7] },
    ],
    moves: [
      { kind: 'move', band: 'ants', path: [[0, 6], [0, 5], [1, 5]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[2, 5], [3, 5], [4, 5]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[3, 5], [2, 5], [2, 4]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[2, 3], [2, 2], [2, 1]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[2, 0], [3, 0], [4, 0]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[5, 0], [6, 0], [7, 0]] },
    ],
  },
  alternatives: [
    {
      deploy: [
        { type: 'ants', at: [0, 7] },
        { type: 'badger', at: [1, 7] },
      ],
      moves: [
        { kind: 'move', band: 'ants', path: [[0, 6], [0, 5], [0, 4]] },
        { kind: 'move', band: 'badger', path: [[1, 6], [2, 6]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[0, 3], [0, 2], [0, 1]] },
        { kind: 'move', band: 'badger', path: [[3, 6], [4, 6]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[1, 1], [2, 1], [3, 1]] },
        { kind: 'move', band: 'badger', path: [[4, 5]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[4, 1], [5, 1], [6, 1]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[6, 0], [7, 0]] },
      ],
    },
  ],
});
