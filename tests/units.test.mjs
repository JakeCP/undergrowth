import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_TYPES,
  STARTER_TYPES,
  TARGET_PRIORITY,
  tierFor,
  actionsFor,
  recruitCost,
} from '../js/engine/units.js';

test('STARTER_TYPES and TARGET_PRIORITY are exact', () => {
  assert.deepEqual(STARTER_TYPES, ['fox', 'hedgehog']);
  assert.deepEqual(TARGET_PRIORITY, ['hedgehog', 'owl', 'bear', 'fox', 'beaver', 'badger', 'bees', 'ants']);
});

test('fox and hedgehog are the starters, with the spec numbers', () => {
  assert.deepEqual(STARTER_TYPES, ['fox', 'hedgehog']);
  assert.equal(BAND_TYPES.fox.speed, 3);
  assert.equal(BAND_TYPES.hedgehog.bristle, 1);
  assert.equal(BAND_TYPES.fox.price, null);
  assert.equal(BAND_TYPES.beaver.price, 30);
  assert.equal(BAND_TYPES.badger.price, 30);
  assert.equal(TARGET_PRIORITY[0], 'hedgehog');
});

test('only the hedgehog has bristle', () => {
  for (const [id, t] of Object.entries(BAND_TYPES)) {
    if (id === 'hedgehog') continue;
    assert.equal(t.bristle, undefined, id);
  }
});

test('the fox never digs or builds', () => {
  const effects = actionsFor('fox', BAND_TYPES.fox.maxLenCap).map((a) => a.effect);
  assert.deepEqual(effects, ['attack']);
});

test('BAND_TYPES contains exactly the eleven types', () => {
  assert.deepEqual(
    Object.keys(BAND_TYPES).sort(),
    ['ants', 'badger', 'bear', 'beaver', 'bees', 'fox', 'harvester', 'hedgehog', 'owl', 'planter', 'saw'],
  );
});

test('every band type has every BandType field with the right shape', () => {
  for (const [id, t] of Object.entries(BAND_TYPES)) {
    assert.equal(t.id, id, id);
    assert.equal(typeof t.name, 'string', id);
    assert.ok(t.name.length > 0, id);
    assert.ok(t.side === 'us' || t.side === 'bots', id);
    assert.equal(typeof t.glyph, 'string', id);
    assert.ok(t.glyph.length > 0, id);
    assert.equal(typeof t.speed, 'number', id);
    assert.equal(typeof t.flies, 'boolean', id);
    assert.equal(typeof t.startLen, 'number', id);
    assert.equal(typeof t.maxLenCap, 'number', id);
    assert.ok(Array.isArray(t.actions), id);
    assert.ok(t.actions.length > 0, id);
    assert.ok(Array.isArray(t.tiers), id);
    assert.ok(t.price === null || typeof t.price === 'number', id);
    assert.equal(typeof t.recruitBase, 'number', id);
    // first tier
    assert.deepEqual(t.tiers[0], { minLen: 1, name: t.name, grants: [] }, id);
    // every action (base + grants) has every ActionDef field
    const allActions = [...t.actions, ...t.tiers.flatMap((tier) => tier.grants)];
    for (const a of allActions) {
      assert.equal(typeof a.id, 'string', `${id} action`);
      assert.equal(typeof a.label, 'string', `${id}/${a.id}`);
      assert.ok(a.label.length > 0, `${id}/${a.id}`);
      assert.ok(['attack', 'dig', 'build', 'mow', 'saw', 'pave'].includes(a.effect), `${id}/${a.id}`);
      assert.equal(typeof a.damage, 'number', `${id}/${a.id}`);
      assert.equal(typeof a.minRange, 'number', `${id}/${a.id}`);
      assert.equal(typeof a.maxRange, 'number', `${id}/${a.id}`);
      assert.ok(a.pattern === 'single' || a.pattern === 'line3', `${id}/${a.id}`);
      assert.equal(typeof a.push, 'number', `${id}/${a.id}`);
    }
    for (const tier of t.tiers) {
      assert.equal(typeof tier.minLen, 'number', id);
      assert.equal(typeof tier.name, 'string', id);
      assert.ok(Array.isArray(tier.grants), id);
    }
  }
});

// [id, name, side, glyph, speed, flies, startLen, cap, price, recruitBase]
const TABLE = [
  ['fox', 'Fox', 'us', '🦊', 3, false, 2, 4, null, 15],
  ['hedgehog', 'Hedgehog', 'us', '🦔', 2, false, 2, 4, null, 15],
  ['ants', 'Ants', 'us', '🐜', 3, false, 4, 12, null, 10],
  ['badger', 'Badger', 'us', '🦡', 2, false, 3, 6, 30, 12],
  ['beaver', 'Beaver', 'us', '🦫', 2, false, 3, 6, 30, 12],
  ['bear', 'Bear', 'us', '🐾', 2, false, 2, 4, 60, 25],
  ['owl', 'Owl', 'us', '🦉', 4, true, 1, 2, 50, 30],
  ['bees', 'Bees', 'us', '🐝', 3, false, 1, 2, 30, 15],
  ['harvester', 'Harvester', 'bots', '🚜', 2, false, 3, 3, null, 0],
  ['saw', 'Saw-drone', 'bots', '🪚', 3, false, 2, 2, null, 0],
  ['planter', 'Planter-bot', 'bots', '🤖', 2, false, 3, 3, null, 0],
];

test('band type scalar fields match the brief table', () => {
  for (const [id, name, side, glyph, speed, flies, startLen, cap, price, recruitBase] of TABLE) {
    const t = BAND_TYPES[id];
    assert.equal(t.name, name, id);
    assert.equal(t.side, side, id);
    assert.equal(t.glyph, glyph, id);
    assert.equal(t.speed, speed, id);
    assert.equal(t.flies, flies, id);
    assert.equal(t.startLen, startLen, id);
    assert.equal(t.maxLenCap, cap, id);
    assert.equal(t.price, price, id);
    assert.equal(t.recruitBase, recruitBase, id);
  }
});

function action(typeId, actionId) {
  return actionsFor(typeId, BAND_TYPES[typeId].maxLenCap).find((a) => a.id === actionId);
}

test('base actions match the brief', () => {
  assert.deepEqual(action('ants', 'bite'), {
    id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
  for (const id of ['fox', 'hedgehog']) {
    assert.deepEqual(BAND_TYPES[id].actions.map((a) => a.id), ['bite'], id);
    assert.deepEqual(action(id, 'bite'), {
      id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
    }, id);
  }
  assert.deepEqual(BAND_TYPES.badger.actions.map((a) => a.id), ['dig', 'bite']);
  assert.deepEqual(action('badger', 'dig'), {
    id: 'dig', label: 'Dig', effect: 'dig', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
  assert.deepEqual(action('badger', 'bite'), {
    id: 'bite', label: 'Bite', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
  assert.deepEqual(BAND_TYPES.beaver.actions.map((a) => a.id), ['build']);
  assert.deepEqual(action('beaver', 'build'), {
    id: 'build', label: 'Build', effect: 'build', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
  assert.deepEqual(BAND_TYPES.bear.actions.map((a) => a.id), ['maul', 'shove']);
  assert.deepEqual(action('bear', 'maul'), {
    id: 'maul', label: 'Maul', effect: 'attack', damage: 3, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
  assert.deepEqual(action('bear', 'shove'), {
    id: 'shove', label: 'Shove', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 1,
  });
  assert.deepEqual(action('owl', 'strike'), {
    id: 'strike', label: 'Strike', effect: 'attack', damage: 2, minRange: 2, maxRange: 3, pattern: 'single', push: 0,
  });
  assert.deepEqual(action('bees', 'sting'), {
    id: 'sting', label: 'Sting', effect: 'attack', damage: 1, minRange: 1, maxRange: 1, pattern: 'line3', push: 0,
  });
  assert.deepEqual(action('harvester', 'mow'), {
    id: 'mow', label: 'Mow', effect: 'mow', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
  assert.deepEqual(action('saw', 'saw'), {
    id: 'saw', label: 'Saw', effect: 'saw', damage: 2, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
  assert.deepEqual(action('planter', 'pave'), {
    id: 'pave', label: 'Pave', effect: 'pave', damage: 1, minRange: 1, maxRange: 1, pattern: 'single', push: 0,
  });
});

test('ants tiers and ram grant', () => {
  assert.equal(BAND_TYPES.ants.tiers.length, 3);
  assert.deepEqual(BAND_TYPES.ants.tiers[0], { minLen: 1, name: 'Ants', grants: [] });
  assert.equal(BAND_TYPES.ants.tiers[1].minLen, 6);
  assert.equal(BAND_TYPES.ants.tiers[1].name, 'Ant Colony');
  assert.deepEqual(BAND_TYPES.ants.tiers[2], { minLen: 9, name: 'Supercolony', grants: [] });
  assert.deepEqual(BAND_TYPES.ants.tiers[1].grants, [{
    id: 'ram', label: 'Ram', effect: 'attack', damage: 0, minRange: 1, maxRange: 1, pattern: 'single', push: 1,
  }]);
  // other types have only the first tier
  for (const id of Object.keys(BAND_TYPES)) {
    if (id !== 'ants') assert.equal(BAND_TYPES[id].tiers.length, 1, id);
  }
});

test('tierFor returns the highest reached tier', () => {
  assert.equal(tierFor('ants', 1).name, 'Ants');
  assert.equal(tierFor('ants', 5).name, 'Ants');
  assert.equal(tierFor('ants', 6).name, 'Ant Colony');
  assert.equal(tierFor('ants', 8).name, 'Ant Colony');
  assert.equal(tierFor('ants', 9).name, 'Supercolony');
  assert.equal(tierFor('ants', 12).name, 'Supercolony');
  assert.equal(tierFor('bear', 2).name, 'Bear');
  assert.equal(tierFor('owl', 1).name, 'Owl');
});

test('actionsFor appends grants of every reached tier after base actions', () => {
  assert.equal(actionsFor('ants', 5).some((a) => a.id === 'ram'), false);
  assert.equal(actionsFor('ants', 6).some((a) => a.id === 'ram'), true);
  assert.deepEqual(actionsFor('ants', 4).map((a) => a.id), ['bite']);
  assert.deepEqual(actionsFor('ants', 6).map((a) => a.id), ['bite', 'ram']);
  assert.deepEqual(actionsFor('ants', 9).map((a) => a.id), ['bite', 'ram']);
  assert.deepEqual(actionsFor('badger', 3).map((a) => a.id), ['dig', 'bite']);
  assert.deepEqual(actionsFor('beaver', 3).map((a) => a.id), ['build']);
});

test('actionsFor does not mutate the type actions', () => {
  const before = BAND_TYPES.ants.actions.length;
  const result = actionsFor('ants', 9);
  result.pop();
  assert.equal(BAND_TYPES.ants.actions.length, before);
  assert.deepEqual(actionsFor('ants', 9).map((a) => a.id), ['bite', 'ram']);
});

test('recruitCost is recruitBase + 5 per length above startLen', () => {
  assert.equal(recruitCost('ants', 4), 10);
  assert.equal(recruitCost('ants', 6), 20);
  assert.equal(recruitCost('ants', 5), 15);
  assert.equal(recruitCost('badger', 3), 12);
  assert.equal(recruitCost('badger', 4), 17);
  assert.equal(recruitCost('bear', 2), 25);
  assert.equal(recruitCost('bear', 4), 35);
  assert.equal(recruitCost('owl', 1), 30);
  assert.equal(recruitCost('owl', 2), 35);
  assert.equal(recruitCost('harvester', 3), 0);
});
