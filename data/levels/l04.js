// Idea: a race to the bear snared in the north-east corner, with the
// whole hill coming for it and the dens at once. The saw-drone hunts the
// nearest band, the snared bear included; two harvesters go for the dens. Every
// threat lands on the bots' second or third turn and the bear is four
// turns' march away, so the bands have to answer the bots on the way, not
// after.
// Habitats: two dens, one by each harvester. The corner den next to the
// bear is on the rescue route, where the northern harvester mows in toward
// it, so a band on the way can take that harvester's strike. The
// south-east den is behind two trees, off the route, and the southern
// harvester reaches it on the bots' second turn: somebody has to step
// into its reach and lead it away. Two dens are enough here; a third, out
// of both harvesters' way, never came under attack in the solver's games.
// Answer with the roster the story guarantees here (fox, hedgehog, ants):
// the fox, the fastest, runs for the bear up the west side and along the
// north wood. On the way it passes through the southern harvester's reach
// and then the northern one's, and each turns off its den to chase it;
// the ants follow a turn behind and take the next strikes, from the
// southern harvester and the saw. Neither den is touched, and the fox frees the bear (four turns).
// Second approach: the ants alone. They wait one turn by the camp so the
// southern harvester comes for them instead of its den, then cut through
// the middle with it and the saw behind them, and reach the bear as the
// northern harvester takes its second swing at the corner den (four turns).
// Third approach, the line this level was first built on: bring the
// badger from the shop. The ants run north up the west side and east
// along the top, drawing the northern harvester's mow onto their tail,
// while the badger steps into the southern harvester's reach and holds it
// for a turn: the south-east den takes only its warning hit before the
// bear is free (four turns).
export default /** @type {import('../../js/engine/types.js').Level} */ ({
  id: 'l04',
  name: 'The Snare Pit',
  blurb: 'A bear is snared in the north-east corner, and every bot on the hill is converging on it and on the dens.',
  goal: 'rescue',
  maxBands: 3,
  turnLimit: null,
  grid: [
    'TTTT.HTT',
    '....,...',
    'T....*..',
    '.....SSS',
    '........',
    '......;.',
    'D.......',
    'DD...THT',
  ],
  bots: [
    { type: 'saw', cells: [[7, 5], [7, 6]] },
    { type: 'harvester', cells: [[3, 2], [3, 3], [3, 4]] },
    { type: 'harvester', cells: [[4, 5], [4, 4], [5, 4]] },
  ],
  trapped: [
    { type: 'bear', cells: [[6, 1], [7, 1]] },
  ],
  // Both dens are bees' hollow logs, in the north wood by the bear and
  // behind the trees in the south-east.
  dens: { kind: 'hive' },
  firstClearSeeds: 35,
  assumes: {},
  solution: {
    deploy: [
      { type: 'ants', at: [0, 6] },
      { type: 'fox', at: [1, 7] },
    ],
    moves: [
      { kind: 'move', band: 'ants', path: [[1, 6]] },
      { kind: 'move', band: 'fox', path: [[2, 7], [3, 7], [4, 7]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[1, 5], [1, 4], [1, 3]] },
      { kind: 'move', band: 'fox', path: [[3, 7], [2, 7], [1, 7]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[1, 2], [2, 2], [3, 2]] },
      { kind: 'move', band: 'fox', path: [[2, 7], [3, 7]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[4, 2], [5, 2], [5, 1]] },
    ],
  },
  alternatives: [
    {
      deploy: [
        { type: 'ants', at: [1, 7] },
      ],
      moves: [
        { kind: 'move', band: 'ants', path: [[1, 6], [1, 5], [1, 4]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[1, 3]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[1, 2], [2, 2], [3, 2]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[4, 2], [5, 2], [5, 1]] },
      ],
    },
    {
      deploy: [
        { type: 'ants', at: [0, 6] },
        { type: 'badger', at: [1, 7] },
      ],
      moves: [
        { kind: 'move', band: 'ants', path: [[0, 5], [0, 4], [0, 3]] },
        { kind: 'move', band: 'badger', path: [[2, 7]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[0, 2], [1, 2], [2, 2]] },
        { kind: 'move', band: 'badger', path: [[2, 6], [2, 5]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[3, 2], [4, 2], [5, 2]] },
        { kind: 'move', band: 'badger', path: [[2, 4]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[5, 1]] },
      ],
    },
  ],
});
