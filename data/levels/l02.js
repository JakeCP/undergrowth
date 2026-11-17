// Idea: the brook runs right across the map and bends up at its east end,
// and both survey stakes are on the far bank, so the beaver has to dam a
// crossing. A saw-drone hunts the far bank and chews whoever comes over.
// Habitats: two dens, one on each bank. A saw walled off from every band
// waits at the wall, so while the brook keeps you apart it stands on the
// far bank where the crossing would come, and the far den is safe: the
// dam that lets you cross is also what lets the saw at you. On the home
// bank a harvester mows its way into the walled den in the south-west
// corner (hit on the third turn, gone on the fourth), the opposite way to
// the crossing. Somebody has to turn back for it, so ignoring the dens loses.
// The ants walk south into the harvester's reach to pull it off the
// walled den, while the beaver dams the east channel and crosses. The saw
// cuts the beaver down on the far bank (it is lost), but the stake it took
// stays taken; the ants follow over the dam, bite the saw, and walk the
// north bank to the second stake (seven turns, both dens untouched).
// Second approach: bring the badger as well, bought in the shop (the
// story gives it only at l05). It steps into the harvester's reach on the
// first turn, digs a hole beside it and leads it east, away from the den,
// which is never hit; the beaver is free to follow the ants over (six
// turns).
export default /** @type {import('../../js/engine/types.js').Level} */ ({
  id: 'l02',
  name: 'Where the Brook Bends',
  blurb: 'Survey stakes have sprouted on the far bank overnight, the brook is too wide for anyone without a dam, and both dens are in danger.',
  goal: 'capture',
  maxBands: 3,
  turnLimit: null,
  grid: [
    'K.T....K',
    '...TH..~',
    '......~~',
    '~~~~~~~.',
    '.....DDD',
    '.,*.....',
    'TT.....;',
    'HTT....T',
  ],
  bots: [
    { type: 'harvester', cells: [[3, 6], [4, 6], [5, 6]] },
    { type: 'saw', cells: [[0, 2], [0, 1]] },
  ],
  trapped: [],
  // A burrow in the far bank of the brook; the walled den in the south-west
  // corner wood is a bees' hollow log.
  dens: { kind: 'burrow', at: [{ at: [0, 7], kind: 'hive' }] },
  firstClearSeeds: 25,
  assumes: {},
  solution: {
    deploy: [
      { type: 'ants', at: [6, 4] },
      { type: 'beaver', at: [7, 4] },
    ],
    moves: [
      { kind: 'move', band: 'ants', path: [[6, 5], [6, 6], [6, 7]] },
      { kind: 'move', band: 'beaver', path: [[7, 3]] },
      { kind: 'act', band: 'beaver', action: 'build', target: [7, 2] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[7, 7]] },
      { kind: 'move', band: 'beaver', path: [[7, 2]] },
      { kind: 'act', band: 'beaver', action: 'build', target: [7, 1] },
      { kind: 'end' },
      { kind: 'move', band: 'beaver', path: [[7, 1], [7, 0]] },
      { kind: 'move', band: 'ants', path: [[7, 6], [7, 5], [7, 4]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[7, 3], [7, 2], [7, 1]] },
      { kind: 'act', band: 'ants', action: 'bite', target: [6, 1] },
      { kind: 'move', band: 'beaver', path: [[6, 0]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[7, 0], [6, 0]] },
      { kind: 'act', band: 'ants', action: 'bite', target: [6, 1] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[5, 0], [4, 0], [3, 0]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[2, 0], [1, 0], [0, 0]] },
    ],
  },
  alternatives: [
    {
      deploy: [
        { type: 'beaver', at: [6, 4] },
        { type: 'ants', at: [7, 4] },
        { type: 'badger', at: [5, 4] },
      ],
      moves: [
        { kind: 'act', band: 'beaver', action: 'build', target: [6, 3] },
        { kind: 'move', band: 'ants', path: [[7, 3], [6, 3]] },
        { kind: 'move', band: 'badger', path: [[4, 4], [3, 4]] },
        { kind: 'end' },
        { kind: 'move', band: 'beaver', path: [[5, 4]] },
        { kind: 'act', band: 'beaver', action: 'build', target: [5, 3] },
        { kind: 'move', band: 'ants', path: [[5, 3], [5, 2], [5, 1]] },
        { kind: 'move', band: 'badger', path: [[2, 4], [2, 5]] },
        { kind: 'end' },
        { kind: 'move', band: 'beaver', path: [[5, 3]] },
        { kind: 'move', band: 'ants', path: [[5, 0], [6, 0], [7, 0]] },
        { kind: 'move', band: 'badger', path: [[2, 6], [1, 6]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[6, 0], [5, 0], [4, 0]] },
        { kind: 'move', band: 'badger', path: [[2, 6], [2, 7]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[3, 0], [2, 0], [1, 0]] },
        { kind: 'move', band: 'badger', path: [[2, 6]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[0, 0]] },
      ],
    },
  ],
});
