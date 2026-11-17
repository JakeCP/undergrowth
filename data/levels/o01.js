// Idea: the very first lesson. A bot shows what it will do, and its reach
// is the thing to respect. The fox and the hedgehog want the survey stake
// in the far corner of the meadow; a harvester stands at the end of the
// strip it has mown, eating into a copse in the middle of the field, so
// its reach (two steps and a strike) covers the open ground between camp
// and stake. Its plan shows the next tree each turn, and only turns into a
// strike on a band when a band ends its turn inside that reach.
// No den: it is the first thing a new player sees, so there is nothing to
// lose but a few of the band, and the one idea is reach. The level cannot
// really be lost; its test checks the lesson instead.
// The layout teaches it with two roads. The straight one, across the
// meadow past the copse, walks into the reach and the fox is struck twice;
// out in the open it cannot mend between the strikes, so the second one
// finishes it (`naive`, recorded for the test, ends there). The other goes up the west wood and
// along the north wood: a harvester cannot stand in trees, so a band deep
// in the wood has no open tile beside it for the bot to strike from. The
// copse keeps the harvester busy in the middle for four turns; it would
// turn on the north wood on its fifth, after the stake has fallen.
// Answer: both walk up the west wood and along the north wood, the fox in
// front, and the fox takes the stake untouched (five turns).
// Second approach: stand and fight. The fox takes the wood road while the
// hedgehog walks up to the copse and into the harvester's reach on
// purpose: every strike on him costs the harvester a piece of itself
// (bristle), and two bites finish it, which wins the field (four turns).
export default /** @type {import('../../js/engine/types.js').Level} */ ({
  id: 'o01',
  name: 'The Mown Strip',
  blurb: 'A strip of the meadow has been mown flat overnight. The harvester that did it is still at work, and a survey stake stands in the far corner.',
  goal: 'capture',
  maxBands: 2,
  turnLimit: null,
  grid: [
    'TTTTT..K',
    'TTTTT...',
    'TT......',
    'TT......',
    'TT..TT__',
    'TT..TT._',
    '........',
    'DD......',
  ],
  bots: [
    { type: 'harvester', cells: [[6, 4], [7, 4], [7, 5]] },
  ],
  trapped: [],
  firstClearSeeds: 10,
  assumes: {},
  solution: {
    deploy: [
      { type: 'fox', at: [0, 7] },
      { type: 'hedgehog', at: [1, 7] },
    ],
    moves: [
      { kind: 'move', band: 'fox', path: [[0, 6], [0, 5], [0, 4]] },
      { kind: 'move', band: 'hedgehog', path: [[1, 6], [1, 5]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[0, 3], [0, 2], [0, 1]] },
      { kind: 'move', band: 'hedgehog', path: [[1, 4], [1, 3]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[0, 0], [1, 0], [2, 0]] },
      { kind: 'move', band: 'hedgehog', path: [[1, 2], [1, 1]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[3, 0], [4, 0], [5, 0]] },
      { kind: 'move', band: 'hedgehog', path: [[2, 1], [3, 1]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[6, 0], [7, 0]] },
    ],
  },
  // The straight walk at the stake, across the open meadow and through the
  // harvester's reach. It still gets there, but the fox is struck twice on
  // the way. Recorded for the test that the taught line costs nothing.
  naive: {
    deploy: [
      { type: 'fox', at: [0, 7] },
      { type: 'hedgehog', at: [1, 7] },
    ],
    moves: [
      { kind: 'move', band: 'fox', path: [[0, 6], [1, 6], [2, 6]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[2, 5], [3, 5], [3, 4]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[3, 3], [4, 3], [4, 2]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[5, 2], [5, 1], [6, 1]] },
      { kind: 'end' },
    ],
  },
  alternatives: [
    {
      deploy: [
        { type: 'fox', at: [0, 7] },
        { type: 'hedgehog', at: [1, 7] },
      ],
      moves: [
        { kind: 'move', band: 'fox', path: [[0, 6], [0, 5], [0, 4]] },
        { kind: 'move', band: 'hedgehog', path: [[1, 6], [2, 6]] },
        { kind: 'end' },
        { kind: 'move', band: 'fox', path: [[0, 3], [0, 2], [0, 1]] },
        { kind: 'move', band: 'hedgehog', path: [[3, 6], [4, 6]] },
        { kind: 'end' },
        { kind: 'move', band: 'fox', path: [[0, 0], [1, 0], [2, 0]] },
        { kind: 'move', band: 'hedgehog', path: [[4, 5], [5, 5]] },
        { kind: 'act', band: 'hedgehog', action: 'bite', target: [5, 4] },
        { kind: 'end' },
        { kind: 'act', band: 'hedgehog', action: 'bite', target: [5, 4] },
      ],
    },
  ],
});
