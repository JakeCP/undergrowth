// The valley: l01 to l05, where the ants march for the first time and the
// beaver and the badger join (opening-act spec, "Story beats"). A first
// draft of every line, for Jake to rewrite.
//
// A recruit scene still plays for a player who bought that band in the
// shop; the band then gets one free recruit (js/story/story.js), so its
// lines read as well either way.
// The two pointed tiles are confirmed against the levels: l02's is the
// brook tile the beaver dams first in the recorded line, l05's the open
// ground beside the western harvester (tests/levels.test.mjs checks both).

/** @typedef {import('../../js/story/types.js').Scene} Scene */

/** @type {Scene[]} */
export const VALLEY = [
  {
    id: 'l01-start',
    when: 'start',
    level: 'l01',
    lines: [
      { who: 'ants', text: 'Our first march with you! Show us a machine and we will bite it.' },
      { who: 'fox', text: "There's one mowing toward the badgers' den. Let's find out how much it likes being bitten." },
    ],
  },
  {
    id: 'l02-beaver-joins',
    when: 'before',
    level: 'l02',
    gives: [{ kind: 'band', type: 'beaver' }],
    lines: [
      { who: 'narrator', text: 'At the bend in the brook, a beaver is hauling sticks up the bank.' },
      { who: 'beaver', text: "Stakes on the far bank, and machines behind them. I'll not have them on my brook." },
      { who: 'fox', text: "We're going over to pull those stakes up. It's just that none of us can swim it." },
      { who: 'beaver', text: 'Then you want a dam. I build dams. I am coming with you.' },
      { who: 'hedgehog', text: 'Good.' },
    ],
  },
  {
    id: 'l02-start',
    when: 'start',
    level: 'l02',
    if: { owns: ['beaver'] },
    lines: [
      { who: 'beaver', text: 'Too wide to wade. Give me this bit of the brook and I will give you a way across.', point: { kind: 'tile', at: [6, 3] } },
      { who: 'hedgehog', text: 'And watch the far bank. Something is moving over there.' },
    ],
  },
  {
    id: 'l03-start',
    when: 'start',
    level: 'l03',
    lines: [
      { who: 'fox', text: "A planter! It isn't cutting anything. It's just sitting on that permit as if it owns the place." },
      { who: 'hedgehog', text: 'It thinks it does. And there are dens on both sides of the wall.' },
    ],
  },
  {
    id: 'l04-start',
    when: 'start',
    level: 'l04',
    lines: [
      { who: 'fox', text: "There's a bear caught in a snare up in the corner! And every machine on the hill is heading for her." },
      { who: 'hedgehog', text: 'Then we get there first.' },
    ],
  },
  {
    id: 'l05-badger-joins',
    when: 'before',
    level: 'l05',
    gives: [{ kind: 'band', type: 'badger' }],
    lines: [
      { who: 'narrator', text: 'At the gate of the old stone yard, a badger sits on a heap of fresh earth.' },
      { who: 'badger', text: "Four of them in my yard. Four. They've paved over half my setts." },
      { who: 'fox', text: "We've come to clear them out. You look like someone who knows the ground here." },
      { who: 'badger', text: "Machines don't like holes. I dig holes. Lead on." },
      { who: 'hedgehog', text: 'Good.' },
    ],
  },
  {
    id: 'l05-start',
    when: 'start',
    level: 'l05',
    if: { owns: ['badger'] },
    lines: [
      { who: 'badger', text: 'Soft ground there, right by that western machine. I could have a pit open before it knew.', point: { kind: 'tile', at: [1, 4] } },
      { who: 'fox', mood: 'happy', text: 'A pit? In front of a machine? Oh, I want to see that.' },
    ],
  },
];
