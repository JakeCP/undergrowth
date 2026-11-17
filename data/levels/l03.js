// Idea: one gap in the dry stone wall, and the planter-bot sits on the
// permit beyond it. The planter is the den-breaker: it walks off the
// permit and paves its way up the east lane to the den inside the wall
// (hit on the bots' second turn, gone on the third). The saw-drone hunts
// on the home side and strikes any den it ends its walk beside: the west
// den is right on its road to the camp.
// Habitats: two dens, one each side of the wall, so the bands have to
// split. The east den teaches that a planter goes for a den before a band
// unless the band is closer, and that a band standing on a den takes the
// strike instead, so it has to be met head on; the west den, in the open
// by the camp, is the saw's if nobody stops it.
// A moat holds the saw: sealed away from every band it walks up to the
// wall nearest one and waits there; it no longer turns on a den instead.
// Answer with the roster the story guarantees here (fox, hedgehog, ants):
// the ants go straight at the saw and bite it twice before it can do more
// than strike them once, while the fox runs through the gap and stands on
// the east den, so the planter's first strike lands on the fox. The fox
// steps off to bite, the den takes its warning hit, and the ants come through
// the gap to finish the planter, the last bot, so the permit falls with
// it (four turns).
// Second approach: bring the beaver (from the shop, or from l02). The ants
// bite the saw down from the camp while the beaver walks through the gap
// and stands on the east den; then the ants follow and finish the
// planter (seven turns).
// Third approach: bring the badger from the shop. The ants bite the saw
// while the badger runs through the gap onto the east den; the ants
// follow along the north wood and the two bite the planter down (five
// turns).
export default /** @type {import('../../js/engine/types.js').Level} */ ({
  id: 'l03',
  name: 'The Dry Stone Wall',
  blurb: 'A planter-bot squats on the permit beyond the old wall, and the dens on both sides of it are in its way.',
  goal: 'capture',
  maxBands: 3,
  turnLimit: null,
  grid: [
    'TTT.TTTT',
    '..TTTT..',
    '..,.S..T',
    '..D.....',
    'H.*.S.H.',
    '....S.S.',
    '....SS.#',
    'DD..SS#P',
  ],
  bots: [
    { type: 'saw', cells: [[3, 5], [3, 6]] },
    { type: 'planter', cells: [[7, 7], [7, 6], [6, 6]] },
  ],
  trapped: [],
  // A nest in the dry stone wall on its east side; the west den, in the open
  // grass by the camp, is an ant hill.
  dens: { kind: 'nest', at: [{ at: [0, 4], kind: 'anthill' }] },
  firstClearSeeds: 30,
  assumes: {},
  solution: {
    deploy: [
      { type: 'fox', at: [2, 3] },
      { type: 'ants', at: [1, 7] },
    ],
    moves: [
      { kind: 'move', band: 'fox', path: [[3, 3], [4, 3]] },
      { kind: 'move', band: 'ants', path: [[1, 6], [1, 5], [2, 5]] },
      { kind: 'act', band: 'ants', action: 'bite', target: [3, 5] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[5, 3], [6, 3], [6, 4]] },
      { kind: 'move', band: 'ants', path: [[2, 4], [3, 4]] },
      { kind: 'act', band: 'ants', action: 'bite', target: [3, 5] },
      { kind: 'end' },
      { kind: 'move', band: 'fox', path: [[6, 3], [7, 3]] },
      { kind: 'act', band: 'fox', action: 'bite', target: [7, 4] },
      { kind: 'move', band: 'ants', path: [[3, 3], [4, 3]] },
      { kind: 'end' },
      { kind: 'act', band: 'fox', action: 'bite', target: [7, 4] },
      { kind: 'move', band: 'ants', path: [[5, 3], [5, 4], [6, 4]] },
      { kind: 'act', band: 'ants', action: 'bite', target: [7, 4] },
    ],
  },
  alternatives: [
    {
      deploy: [
        { type: 'ants', at: [1, 7] },
        { type: 'beaver', at: [2, 3] },
      ],
      moves: [
        { kind: 'move', band: 'ants', path: [[1, 6], [1, 5], [2, 5]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [3, 5] },
        { kind: 'move', band: 'beaver', path: [[3, 3], [4, 3]] },
        { kind: 'end' },
        { kind: 'act', band: 'ants', action: 'bite', target: [3, 5] },
        { kind: 'move', band: 'beaver', path: [[5, 3], [6, 3]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[2, 4]] },
        { kind: 'move', band: 'beaver', path: [[6, 4]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[2, 3], [3, 3], [4, 3]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[5, 3], [6, 3], [7, 3]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [7, 4] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[6, 3], [6, 4]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [7, 4] },
        { kind: 'end' },
        { kind: 'act', band: 'ants', action: 'bite', target: [7, 4] },
      ],
    },
    {
      deploy: [
        { type: 'ants', at: [1, 7] },
        { type: 'badger', at: [2, 3] },
      ],
      moves: [
        { kind: 'move', band: 'ants', path: [[1, 6], [1, 5], [2, 5]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [3, 5] },
        { kind: 'move', band: 'badger', path: [[3, 3]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[2, 4], [3, 4]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [3, 5] },
        { kind: 'move', band: 'badger', path: [[4, 3], [5, 3]] },
        { kind: 'end' },
        { kind: 'move', band: 'badger', path: [[6, 3], [6, 4]] },
        { kind: 'act', band: 'badger', action: 'bite', target: [7, 4] },
        { kind: 'move', band: 'ants', path: [[3, 3], [3, 2], [3, 1]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[4, 1], [5, 1], [6, 1]] },
        { kind: 'move', band: 'badger', path: [[6, 3]] },
        { kind: 'end' },
        { kind: 'move', band: 'ants', path: [[7, 1], [7, 2], [7, 3]] },
        { kind: 'act', band: 'ants', action: 'bite', target: [7, 4] },
        { kind: 'move', band: 'badger', path: [[6, 4]] },
        { kind: 'act', band: 'badger', action: 'bite', target: [7, 4] },
      ],
    },
  ],
});
