// Scenes that belong to no one level: the trading post, the den rule and
// the first loss. A first draft of every line, for Jake to rewrite.

/** @typedef {import('../../js/story/types.js').Scene} Scene */

/** @type {Scene[]} */
export const COMMON = [
  {
    id: 'shop-first',
    when: 'shop',
    lines: [
      { who: 'hazel', text: 'Welcome to the trading post! Seeds buy recruits here, and I know the price of every one.' },
      { who: 'fox', text: 'Seeds? We pick those up everywhere. What can we get for them?' },
      { who: 'hazel', text: 'More of your own, to make a band longer. Or someone new to march with you, if you can pay.' },
      { who: 'hedgehog', text: "We'll look." },
    ],
  },
  {
    // The den rule for a player who never saw the fox convinced on o02,
    // where the hedgehog gives the same rule (an old save, say).
    id: 'tip-den',
    when: 'denMarked',
    if: { unseen: ['o02-convinced'] },
    lines: [
      { who: 'fox', mood: 'surprised', text: "That machine's aiming at a den!", point: { kind: 'den' } },
      { who: 'hedgehog', text: 'A den can take one hit. The second destroys it, and then this fight is lost.' },
    ],
  },
  {
    id: 'lost-first',
    when: 'lost',
    lines: [
      { who: 'hedgehog', mood: 'sad', text: 'We lost that one.' },
      { who: 'fox', text: 'Then we know more than we did. Shall we go again?' },
    ],
  },
];
