// Idea: clear the stone yard. The wall down the middle has no gap a bot
// can use, only one tree at the forest gate, so the saw-drone and the
// planter have no way to any band or den and idle about the yard. The two
// harvesters mow: the western one toward the den in the north-west
// corner, the eastern one up through the thicket toward the pair of nests
// in the north-east (both hit on the bots' third turn). A grown Ant
// Colony can ram, so the answers are terrain and pushing.
// Habitats: three dens, one behind each harvester's trees. They teach
// that forest only slows a harvester, and that a band in reach is struck
// instead: the ants standing in the forest gate pull the eastern
// harvester off the nests and bring the whole yard queueing up at the
// gate, where it can only come at them one at a time.
// The badger digs a fresh pit beside the western harvester and the ants
// ram it in; then the ants hold the gate and ram the bot at the front of
// the queue back into the one behind it (a blocked push bumps both), and
// the bands bite down what is left (nine turns).
// Second approach: no pit. The ants and the badger bite the western
// harvester down from both sides, then hold the gate the same way (nine
// turns).
export default /** @type {import('../../js/engine/types.js').Level} */ ({
  id: 'l05',
  name: 'The Stone Yard',
  blurb: 'Four bots are mustered in the old stone yard at the head of the valley, and two of them are already mowing toward the dens.',
  goal: 'clear',
  maxBands: 3,
  turnLimit: null,
  grid: [
    'TTT.STTH',
    'HTT.STTH',
    'TT.oS.TT',
    '....S...',
    '....T.#.',
    'D...S..;',
    'DD..S...',
    'T...S...',
  ],
  bots: [
    { type: 'harvester', cells: [[2, 2], [2, 3], [1, 3]] },
    { type: 'harvester', cells: [[5, 2], [5, 3], [5, 4]] },
    { type: 'saw', cells: [[5, 6], [5, 7]] },
    { type: 'planter', cells: [[6, 5], [6, 4], [7, 4]] },
  ],
  trapped: [],
  // The pair of nests in the north-east (the design note's); the den in the
  // north-west corner wood is a burrow.
  dens: { kind: 'nest', at: [{ at: [0, 1], kind: 'burrow' }] },
  firstClearSeeds: 40,
  assumes: { ants: 6 },
  solution: {
    deploy: [
      { type: 'ants', at: [0, 5] },
      { type: 'badger', at: [1, 6] },
    ],
    moves: [
      { kind: 'move', band: 'ants', path: [[0, 4], [1, 4], [2, 4]] },
      { kind: 'act', band: 'ants', action: 'bite', target: [2, 3] },
      { kind: 'move', band: 'badger', path: [[2, 6], [3, 6]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[3, 4], [4, 4]] },
      { kind: 'move', band: 'badger', path: [[3, 5], [2, 5]] },
      { kind: 'end' },
      { kind: 'move', band: 'badger', path: [[1, 5], [1, 4]] },
      { kind: 'act', band: 'badger', action: 'dig', target: [1, 3] },
      { kind: 'move', band: 'ants', path: [[3, 4], [3, 3]] },
      { kind: 'act', band: 'ants', action: 'ram', target: [2, 3] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[3, 4], [4, 4]] },
      { kind: 'act', band: 'ants', action: 'ram', target: [5, 4] },
      { kind: 'end' },
      { kind: 'act', band: 'ants', action: 'ram', target: [5, 4] },
      { kind: 'move', band: 'badger', path: [[2, 4]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[3, 4], [3, 3]] },
      { kind: 'move', band: 'badger', path: [[2, 5], [1, 5]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[3, 4], [4, 4]] },
      { kind: 'act', band: 'ants', action: 'ram', target: [5, 4] },
      { kind: 'end' },
      { kind: 'act', band: 'ants', action: 'bite', target: [5, 4] },
      { kind: 'move', band: 'badger', path: [[1, 4], [2, 4]] },
      { kind: 'end' },
      { kind: 'move', band: 'badger', path: [[3, 4], [4, 4]] },
      { kind: 'act', band: 'badger', action: 'bite', target: [5, 4] },
    ],
  },
  alternatives: [
    {
      deploy: [
        { type: 'ants', at: [1, 6] },
        { type: 'badger', at: [0, 5] },
      ],
      moves: [
        { kind: 'move', band: 'ants', path: [[1, 5], [2, 5]] },
        { kind: 'move', band: 'badger', path: [[0, 4], [0, 3]] },
        { kind: 'act', band: 'badger', action: 'bite', target: [1, 3] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[2, 4], [3, 4], [4, 4]] },
        { kind: 'move', band: 'badger', path: [[0, 2], [1, 2]] },
        { kind: 'act', band: 'badger', action: 'bite', target: [2, 2] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[3, 4], [3, 3]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [2, 3] },
        { kind: 'act', band: 'badger', action: 'bite', target: [1, 3] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[3, 4], [4, 4]] },
        { kind: 'act', band: 'ants', action: 'ram', target: [5, 4] },
        { kind: 'move', band: 'badger', path: [[1, 1]] },
        { kind: 'end' },
        { kind: 'act', band: 'ants', action: 'ram', target: [5, 4] },
        { kind: 'end' },
        { kind: 'act', band: 'ants', action: 'ram', target: [5, 4] },
        { kind: 'end' },
        { kind: 'move', band: 'badger', path: [[1, 0]] },
        { kind: 'move', band: 'ants', path: [[3, 4], [3, 5], [2, 5]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[2, 4], [3, 4], [4, 4]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [5, 4] },
        { kind: 'end' },
        { kind: 'act', band: 'ants', action: 'bite', target: [5, 4] },
      ],
    },
  ],
});
