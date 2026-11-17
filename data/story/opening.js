// The opening act: o01 and o02, where the fox and the hedgehog set out,
// argue about the machines, and the fox is convinced (opening-act spec,
// "Story beats"). A first draft of every line, for Jake to rewrite.
//
// Voices: the hedgehog is short and certain; the fox is curious and
// talkative, and after o02 turns that curiosity on stopping the machines.
// Order matters where two scenes share a moment: o02-convinced-late must
// come before o02-ants-join, so the fox is convinced before the ants join.

/** @typedef {import('../../js/story/types.js').Scene} Scene */

/** @type {Scene[]} */
export const OPENING = [
  {
    id: 'o01-before',
    when: 'before',
    level: 'o01',
    lines: [
      { who: 'narrator', text: 'Dawn in the valley. A strip of the meadow has been shaved down to the roots overnight.' },
      { who: 'hedgehog', text: 'Look at that. Cut flat. Every stem.' },
      { who: 'fox', text: "It's only grass! Someone's making hay, I expect. Though I've never seen hay made in the dark." },
      { who: 'hedgehog', text: "It isn't hay." },
      { who: 'fox', text: "There's a stake at the far end with a little orange flag on it. I want a closer look at that." },
      { who: 'hedgehog', text: "Then mind the machine. It shows you where it will cut. Don't be there." },
    ],
  },
  {
    id: 'intro-band',
    when: 'firstSelect',
    level: 'o01',
    lines: [
      { who: 'fox', text: "That's us! The head goes first and the rest of the family follows on behind.", point: { kind: 'band', type: 'fox' } },
      { who: 'hedgehog', text: 'Each of us in the line is health. The badge counts what is left.' },
      { who: 'fox', text: 'And anyone who drops back catches up on the march: one more for every tile we move, up to all of us.' },
    ],
  },
  {
    id: 'o01-won',
    when: 'won',
    level: 'o01',
    lines: [
      { who: 'fox', mood: 'happy', text: 'Got it! Look, there are numbers painted down the side, and an arrow. Somebody is measuring something.' },
      { who: 'hedgehog', text: 'Somebody is measuring us.' },
      { who: 'fox', text: "You think everything's about us. I'm keeping it. It'll look grand by the den." },
      // True whether the harvester was left mowing or bitten to scrap
      // (o01's second recorded line destroys it).
      { who: 'hedgehog', text: 'Keep it, then. That machine was not the last.' },
    ],
  },
  {
    id: 'o02-start',
    when: 'start',
    level: 'o02',
    lines: [
      { who: 'narrator', text: "The ants' hill stands in the next clearing, and a harvester is mowing its way toward it." },
      { who: 'hedgehog', text: "It's heading for the hill." },
      { who: 'fox', text: "It's heading for the grass. The hill just happens to be in the grass. Probably." },
    ],
  },
  {
    id: 'o02-convinced',
    when: 'denMarked',
    level: 'o02',
    lines: [
      { who: 'fox', mood: 'surprised', text: "It's turned! It isn't mowing the grass at all. It's going for the ant hill." },
      { who: 'hedgehog', mood: 'angry', text: "I told you. They don't stop at grass." },
      { who: 'fox', mood: 'surprised', text: "But there are thousands of ants in there. Doesn't it know?" },
      { who: 'hedgehog', mood: 'angry', text: "It knows. It doesn't care." },
      { who: 'fox', text: 'Then we stop it. Right now. How do we stop it?' },
      { who: 'hedgehog', text: 'A den can take one hit. The second destroys it, and then this fight is lost.', point: { kind: 'den' } },
    ],
  },
  {
    // For a player who drew the harvester off before it ever marked the
    // hill: the fox is never a believer without having been convinced.
    id: 'o02-convinced-late',
    when: 'won',
    level: 'o02',
    if: { unseen: ['o02-convinced'] },
    lines: [
      { who: 'fox', mood: 'surprised', text: 'Did you see where it was heading? Not the grass. Straight for the ant hill, the whole time.' },
      { who: 'hedgehog', mood: 'angry', text: 'I saw.' },
      { who: 'fox', text: "You were right. It wasn't hay. So what is it, and how do we stop the next one?" },
      { who: 'hedgehog', text: "Good. Now you're asking the right thing." },
    ],
  },
  {
    id: 'o02-ants-join',
    when: 'won',
    level: 'o02',
    gives: [{ kind: 'band', type: 'ants' }],
    lines: [
      { who: 'narrator', text: 'The ants pour out of the hill to see who saved it.' },
      { who: 'fox', mood: 'happy', text: 'Hello! Hello, all of you. Is everyone all right? Is everyone there?' },
      { who: 'ants', text: "Every one of us. We've seen those machines in the far fields. We're coming with you." },
      // o02 is won by destroying the harvester: "they" are the ones to come.
      { who: 'hedgehog', mood: 'happy', text: "Good. They can't mow all of us." },
      { who: 'fox', mood: 'happy', text: 'A whole army! Oh, this is going to be wonderful.' },
    ],
  },
];
