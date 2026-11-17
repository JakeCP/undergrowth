// Unit descriptions (play-feel spec, "Changed after Jake's playtest of the
// full build"): what each band is for, one plain sentence per action made
// from the action's real numbers, its movement traits, what a growth tier
// adds, and what the next recruit changes. Also "a" or "an".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND_TYPES, actionsFor, tierFor } from '../js/engine/units.js';
import { passesThrough } from '../js/engine/band.js';
import {
  article, withArticle, ROLES, roleLine, actionSentence, whereText, lineLength, traits, slipsThrough, bristleSentence,
  tierSteps, unitCard, statsLine, recruitPreview, recruitText, TIER_SOON,
  traitLines, SPEED_SCALE, ROLE_MAX_CHARS,
} from '../js/ui/unit-info.js';

test('a or an by the first sound of the word', () => {
  assert.equal(article('Owl'), 'an');
  assert.equal(article('owl'), 'an');
  assert.equal(article('Ant Colony'), 'an');
  assert.equal(article('Bear'), 'a');
  assert.equal(article('Badger'), 'a');
  assert.equal(article('Hedgehog'), 'a');
  assert.equal(article('Eagle'), 'an');
  assert.equal(article('Urchin'), 'an');
  assert.equal(article(''), 'a');
  assert.equal(withArticle('Owl'), 'an Owl');
  assert.equal(withArticle('Bear'), 'a Bear');
});

test('every band type says what it is for in one line', () => {
  for (const id of Object.keys(BAND_TYPES)) {
    const line = roleLine(id);
    assert.ok(line.length > 10, `${id} has a role line`);
    assert.ok(!line.includes('\n'), `${id}: one line`);
    assert.ok(/[.!]$/.test(line), `${id}: a full sentence`);
    assert.equal(line, ROLES[id]);
  }
  assert.equal(roleLine('nobody'), '');
});

test('where an action reaches, from its range', () => {
  const base = BAND_TYPES.ants.actions[0];
  assert.equal(whereText(base), 'next to it');
  assert.equal(whereText({ ...base, minRange: 2, maxRange: 3 }), '2 to 3 tiles away in a straight line');
  assert.equal(whereText({ ...base, minRange: 2, maxRange: 2 }), '2 tiles away in a straight line');
  assert.equal(whereText({ ...base, minRange: 1, maxRange: 2 }), 'up to 2 tiles away in a straight line');
});

test('the line length comes from the pattern name', () => {
  assert.equal(lineLength('line3'), 3);
  assert.equal(lineLength('line5'), 5);
  assert.equal(lineLength('single'), 1);
});

test('action sentences for every animal action', () => {
  const s = (type, id) => actionSentence(actionsFor(type, 99).find((a) => a.id === id));
  assert.equal(s('ants', 'bite'), 'Deals 1 damage to an enemy next to it.');
  assert.equal(
    s('ants', 'ram'),
    'Pushes an enemy next to it 1 tile away, with no damage. Pushed into water or a hole, a bot is gone.',
  );
  assert.equal(s('badger', 'dig'), 'Digs open ground, stubble or forest next to its head or its tail end into a hole, or breaks a dam there. Only fliers cross a hole.');
  assert.equal(s('beaver', 'build'), 'Builds a dam on water or a hole next to it, so bands can walk across.');
  assert.equal(s('bear', 'maul'), 'Deals 3 damage to an enemy next to it.');
  assert.equal(
    s('bear', 'shove'),
    'Deals 1 damage to an enemy next to it and pushes it 1 tile away. Pushed into water or a hole, a bot is gone.',
  );
  assert.equal(s('owl', 'strike'), 'Deals 2 damage to an enemy 2 to 3 tiles away in a straight line.');
  assert.equal(
    s('bees', 'sting'),
    'Deals 1 damage to every band in a line of 3 tiles, starting next to it. Your own bands too.',
  );
});

test('action sentences are made from the numbers, so they follow the rules', () => {
  for (const def of Object.values(BAND_TYPES)) {
    for (const action of actionsFor(def.id, def.maxLenCap)) {
      const text = actionSentence(action);
      assert.ok(text.length > 0, `${def.id} ${action.id}`);
      if (action.damage > 0) assert.ok(text.includes(`${action.damage} damage`), `${def.id} ${action.id}: damage`);
      if (action.push > 0) assert.ok(text.includes(`${action.push} tile`), `${def.id} ${action.id}: push`);
      if (action.maxRange > 1) assert.ok(text.includes(String(action.maxRange)), `${def.id} ${action.id}: range`);
      if (action.pattern !== 'single') assert.ok(text.includes(`line of ${lineLength(action.pattern)}`));
    }
  }
  const bite = BAND_TYPES.ants.actions[0];
  assert.equal(actionSentence({ ...bite, damage: 4 }), 'Deals 4 damage to an enemy next to it.');
  assert.equal(
    actionSentence({ ...bite, push: 2 }),
    'Deals 1 damage to an enemy next to it and pushes it 2 tiles away. Pushed into water or a hole, a bot is gone.',
  );
});

test('the bots\' actions read too, for any later use', () => {
  assert.equal(actionSentence(BAND_TYPES.harvester.actions[0]), 'Mows a forest tile next to it to stubble, or deals 1 damage to a band there.');
  assert.equal(actionSentence(BAND_TYPES.saw.actions[0]), 'Deals 2 damage to a band next to it, or cuts a dam there.');
  assert.equal(actionSentence(BAND_TYPES.planter.actions[0]), 'Paves open ground or stubble next to it, or deals 1 damage to a band there.');
});

test('movement traits: flying, and slipping through other bands', () => {
  assert.deepEqual(traits('owl'), ['Flies over water and holes, and never falls in. Stones still block it.']);
  assert.deepEqual(traits('bees'), ['Slips through other bands, friend or bot, but must end its move on free ground.']);
  assert.deepEqual(traits('ants'), []);
  assert.deepEqual(traits('badger'), []);
  assert.deepEqual(traits('fox'), []);
});

test('bristle: the hedgehog\'s trait sentence, made from its number', () => {
  assert.deepEqual(traits('hedgehog'), ['A bot that strikes it takes 1 damage.']);
  assert.equal(bristleSentence(1), 'A bot that strikes it takes 1 damage.');
  assert.equal(bristleSentence(2), 'A bot that strikes it takes 2 damage.');
  assert.deepEqual(unitCard('hedgehog', 2).traits, ['A bot that strikes it takes 1 damage.']);
  for (const def of Object.values(BAND_TYPES)) {
    const has = traits(def.id).some((t) => t.startsWith('A bot that strikes it'));
    assert.equal(has, (def.bristle ?? 0) > 0, def.id);
  }
});

test('each trait is a labelled row, and the trait sentences are made from those rows', () => {
  assert.deepEqual(traitLines('owl'), [
    { id: 'flies', label: 'Flies', sentence: 'over water and holes, and never falls in. Stones still block it.', runIn: true },
  ]);
  assert.deepEqual(traitLines('bees'), [
    { id: 'slips', label: 'Slips through', sentence: 'other bands, friend or bot, but must end its move on free ground.', runIn: true },
  ]);
  assert.deepEqual(traitLines('hedgehog'), [
    { id: 'bristle', label: 'Bristle', sentence: 'A bot that strikes it takes 1 damage.', runIn: false },
  ]);
  assert.deepEqual(traitLines('fox'), []);
  assert.deepEqual(traitLines('nobody'), []);
  for (const def of Object.values(BAND_TYPES)) {
    assert.deepEqual(unitCard(def.id, def.startLen).traitLines, traitLines(def.id), def.id);
  }
});

test('every animal\'s role is one short line that fits beside its portrait', () => {
  for (const def of Object.values(BAND_TYPES)) {
    if (def.side !== 'us') continue;
    assert.ok(roleLine(def.id).length <= ROLE_MAX_CHARS, `${def.id}: "${roleLine(def.id)}" is short`);
  }
});

test('speed is drawn against the fastest band\'s speed', () => {
  const fastest = Math.max(...Object.values(BAND_TYPES).filter((d) => d.side === 'us').map((d) => d.speed));
  assert.equal(SPEED_SCALE, fastest);
});

test('the fox and the hedgehog say what they are for', () => {
  assert.ok(roleLine('fox').length > 10);
  assert.ok(roleLine('hedgehog').length > 10);
  assert.notEqual(roleLine('fox'), roleLine('hedgehog'));
});

test('slipping through: the type\'s passThrough flag, on animals only, as the engine has it', () => {
  assert.equal(slipsThrough(BAND_TYPES.bees), true);
  assert.equal(slipsThrough(BAND_TYPES.ants), false);
  assert.equal(slipsThrough({ ...BAND_TYPES.ants, passThrough: true }), true);
  assert.equal(slipsThrough({ ...BAND_TYPES.bees, passThrough: false }), false);
  assert.equal(slipsThrough({ ...BAND_TYPES.harvester, passThrough: true }), false, 'bots never slip through');
  // The card says what the engine does, for every band type.
  for (const def of Object.values(BAND_TYPES)) {
    assert.equal(slipsThrough(def), passesThrough(/** @type {any} */ ({ side: def.side, type: def.id })), def.id);
  }
});

test('growth tiers: what each one adds, and whether it is reached', () => {
  assert.deepEqual(tierSteps('ants', 4), [
    {
      name: 'Ant Colony', minLen: 6, reached: false,
      gains: [{ id: 'ram', label: 'Ram', sentence: actionSentence(BAND_TYPES.ants.tiers[1].grants[0]) }],
    },
    { name: 'Supercolony', minLen: 9, reached: false, gains: [] },
  ]);
  assert.deepEqual(tierSteps('ants', 6).map((t) => t.reached), [true, false]);
  assert.deepEqual(tierSteps('badger', 3), []);
});

test('the card for a band: name, speed, length now and maximum, actions', () => {
  const card = unitCard('ants', 4);
  assert.equal(card.typeId, 'ants');
  assert.equal(card.name, 'Ants');
  assert.equal(card.glyph, BAND_TYPES.ants.glyph);
  assert.equal(card.side, 'us');
  assert.equal(card.speed, 3);
  assert.equal(card.lengthNow, 4);
  assert.equal(card.lengthMax, 12);
  assert.equal(card.role, ROLES.ants);
  assert.deepEqual(card.actions.map((a) => a.label), ['Bite']);
  assert.equal(card.actions[0].sentence, 'Deals 1 damage to an enemy next to it.');
  assert.deepEqual(card.traits, []);
  assert.deepEqual(card.next, { name: 'Ant Colony', minLen: 6, reached: false, gains: tierSteps('ants', 4)[0].gains });
  assert.equal(statsLine(card), 'Speed 3 · Length 4, up to 12');

  const colony = unitCard('ants', 6);
  assert.equal(colony.name, 'Ant Colony');
  assert.deepEqual(colony.actions.map((a) => a.label), ['Bite', 'Ram']);
  assert.equal(colony.next?.name, 'Supercolony');

  const top = unitCard('ants', 12);
  assert.equal(top.name, 'Supercolony');
  assert.equal(top.next, null);
  assert.equal(statsLine(top), 'Speed 3 · Length 12, full');
});

test('every animal\'s card matches the rules it is drawn from', () => {
  for (const def of Object.values(BAND_TYPES)) {
    if (def.side !== 'us') continue;
    for (let len = def.startLen; len <= def.maxLenCap; len += 1) {
      const card = unitCard(def.id, len);
      assert.equal(card.name, tierFor(def.id, len).name);
      assert.equal(card.speed, def.speed);
      assert.equal(card.lengthMax, def.maxLenCap);
      assert.deepEqual(card.actions.map((a) => a.id), actionsFor(def.id, len).map((a) => a.id));
    }
  }
});

test('the card clamps a length above the cap, as a cut-down save would', () => {
  const card = unitCard('owl', 5);
  assert.equal(card.lengthNow, BAND_TYPES.owl.maxLenCap);
});

test('the next recruit: length, and a new tier when it is close', () => {
  assert.deepEqual(recruitPreview('ants', 5), {
    from: 5, to: 6, maxed: false,
    becomes: { name: 'Ant Colony', minLen: 6, reached: false, gains: tierSteps('ants', 5)[0].gains },
    soon: null,
  });
  const four = recruitPreview('ants', 4);
  assert.equal(four.becomes, null);
  assert.equal(four.soon?.name, 'Ant Colony');
  assert.equal(four.soon?.recruitsLeft, 2);
  assert.ok(TIER_SOON >= 2);
  assert.equal(recruitPreview('badger', 3).soon, null);
  assert.equal(recruitPreview('ants', 12).maxed, true);

  assert.equal(recruitText(recruitPreview('ants', 4)), 'Next recruit: length 4 → 5. 2 more to Ant Colony, which learns Ram.');
  assert.equal(recruitText(recruitPreview('ants', 5)), 'Next recruit: length 5 → 6, and they become Ant Colony, which learns Ram.');
  assert.equal(recruitText(recruitPreview('ants', 8)), 'Next recruit: length 8 → 9, and they become Supercolony.');
  assert.equal(recruitText(recruitPreview('ants', 7)), 'Next recruit: length 7 → 8. 2 more to Supercolony.');
  assert.equal(recruitText(recruitPreview('badger', 3)), 'Next recruit: length 3 → 4.');
  assert.equal(recruitText(recruitPreview('ants', 12)), 'At full strength.');
});
