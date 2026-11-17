// Idea: a den must be protected, and getting inside a bot's reach pulls
// it off the den. The ants' hill stands in a clearing south of a wood, and
// the harvester has mown a strip along the north edge to the wood's
// nearest point. Its plan on the first turn is the one tree between it
// and the hill; once that is down, the plan is the hill itself.
// Habitat: one den, the ant hill. Left alone the harvester is through the
// wood on the bots' first turn, strikes the hill on the second and
// destroys it on the third, so doing nothing loses.
// The bands start too far off to reach the harvester on the first turn,
// whatever they do, so after the bots' first turn every player sees the
// hill marked: the moment the fox is convinced (o02-convinced). On the
// second turn there is time to answer it, and one warning hit to spare.
// The hedgehog is the one to hold it: a band on a den takes the strike
// instead, and every strike on the hedgehog costs the bot (bristle).
// Answer: the hedgehog walks onto the hill and the fox stands beside the
// gap in the wood. The harvester comes through and strikes the hedgehog,
// not the hill, and is hurt for it; the two bites finish it (three turns).
// Second approach: draw it off. The fox runs through the wood and out on
// the harvester's own side, inside its reach, and the harvester turns
// back to strike the fox; the hedgehog follows into the trees beside it,
// and with two bites and a strike on the hedgehog the harvester is done
// before it ever reaches the hill (three turns).
export default /** @type {import('../../js/engine/types.js').Level} */ ({
  id: 'o02',
  name: 'The Ant Hill',
  blurb: "The ants' hill stands in the next clearing, and a harvester is mowing its way through the wood toward it.",
  goal: 'clear',
  maxBands: 2,
  turnLimit: null,
  grid: [
    'TT......',
    'TT...___',
    'TTTTTTTT',
    'T.....T.',
    '.....H..',
    '.;......',
    'T......T',
    'T..DD..T',
  ],
  bots: [
    { type: 'harvester', cells: [[5, 1], [6, 1], [7, 1]] },
  ],
  trapped: [],
  // The den is the ants' hill (the story's).
  dens: { kind: 'anthill' },
  firstClearSeeds: 15,
  assumes: {},
  solution: {
    deploy: [
      { type: 'fox', at: [3, 7] },
      { type: 'hedgehog', at: [4, 7] },
    ],
    moves: [
      { kind: 'move', band: 'fox', path: [[3, 6], [3, 5], [3, 4]] },
      { kind: 'move', band: 'hedgehog', path: [[4, 6], [4, 5]] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[3, 3], [4, 3]] },
      { kind: 'move', band: 'hedgehog', path: [[5, 5], [5, 4]] },
      { kind: 'end' },
      { kind: 'act', band: 'fox', action: 'bite', target: [5, 3] },
      { kind: 'act', band: 'hedgehog', action: 'bite', target: [5, 3] },
    ],
  },
  alternatives: [
    {
      deploy: [
        { type: 'fox', at: [3, 7] },
        { type: 'hedgehog', at: [4, 7] },
      ],
      moves: [
        { kind: 'move', band: 'fox', path: [[3, 6], [3, 5], [3, 4]] },
        { kind: 'move', band: 'hedgehog', path: [[4, 6], [4, 5]] },
        { kind: 'end' },
        { kind: 'move', band: 'fox', path: [[3, 3], [3, 2], [3, 1]] },
        { kind: 'move', band: 'hedgehog', path: [[4, 4], [4, 3]] },
        { kind: 'end' },
        { kind: 'act', band: 'fox', action: 'bite', target: [4, 1] },
        { kind: 'move', band: 'hedgehog', path: [[4, 2]] },
        { kind: 'act', band: 'hedgehog', action: 'bite', target: [4, 1] },
        { kind: 'end' },
      ],
    },
  ],
});
