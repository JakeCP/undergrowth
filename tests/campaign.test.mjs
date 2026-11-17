import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY,
  newProgress,
  migrate,
  loadProgress,
  saveProgress,
  applyVictory,
  BOT_SPEEDS,
  withSettings,
} from '../js/campaign/progress.js';
import { shopItems, buy } from '../js/campaign/shop.js';
import { BAND_TYPES } from '../js/engine/units.js';
import { unlockedLevels } from '../js/campaign/campaign.js';
import { CAMPAIGN_NODES, TRADING_POST, HOME_CAMP, REGIONS } from '../data/campaign.js';
import { stackRegions, toColumn } from '../js/ui/map-layout.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
  };
}

// A save as this version writes it, part way through the campaign: the
// fox and the hedgehog, and the three the story and the shop have added.
function validProgress() {
  return {
    version: 1,
    seeds: 10,
    bands: {
      fox: { maxLen: 2 },
      hedgehog: { maxLen: 2 },
      ants: { maxLen: 4 },
      badger: { maxLen: 3 },
      beaver: { maxLen: 3 },
    },
    cleared: {},
    seenIntro: false,
    seenHabitatTip: false,
    botSpeed: 'normal',
    soundOn: false,
    story: { seen: {} },
  };
}

// A save written before the settings fields existed, and before the fox,
// the hedgehog and the story.
function oldSave() {
  return {
    version: 1,
    seeds: 10,
    bands: { ants: { maxLen: 4 }, badger: { maxLen: 3 }, beaver: { maxLen: 3 } },
    cleared: { l01: true },
  };
}

// What `oldSave()` loads as, settings aside: the fox and the hedgehog
// added and nothing seen yet.
function oldSaveLoaded() {
  const old = oldSave();
  return {
    ...old,
    bands: { ...old.bands, fox: { maxLen: 2 }, hedgehog: { maxLen: 2 } },
    story: { seen: {} },
  };
}

// The campaign graph the opening act adds up to, written out so these
// tests do not wait on data/campaign.js.
const SEVEN_NODES = [
  { levelId: 'o01', x: 0, y: 0, unlocks: ['o02'] },
  { levelId: 'o02', x: 0, y: 0, unlocks: ['l01'] },
  { levelId: 'l01', x: 0, y: 0, unlocks: ['l02', 'l03'] },
  { levelId: 'l02', x: 0, y: 0, unlocks: ['l04'] },
  { levelId: 'l03', x: 0, y: 0, unlocks: ['l04'] },
  { levelId: 'l04', x: 0, y: 0, unlocks: ['l05'] },
  { levelId: 'l05', x: 0, y: 0, unlocks: [] },
];

// --- progress: basics ---

test('SAVE_KEY and newProgress are exact', () => {
  assert.equal(SAVE_KEY, 'undergrowth.save');
  assert.deepEqual(newProgress(), {
    version: 1,
    seeds: 0,
    bands: { fox: { maxLen: 2 }, hedgehog: { maxLen: 2 } },
    cleared: {},
    seenIntro: false,
    seenHabitatTip: false,
    botSpeed: 'normal',
    soundOn: false,
    story: { seen: {} },
  });
});

test('a new game has the fox and the hedgehog and nothing else', () => {
  const p = newProgress();
  assert.deepEqual(Object.keys(p.bands).sort(), ['fox', 'hedgehog']);
  assert.deepEqual(p.bands.fox, { maxLen: BAND_TYPES.fox.startLen });
  assert.deepEqual(p.bands.hedgehog, { maxLen: BAND_TYPES.hedgehog.startLen });
  assert.deepEqual(p.bands.fox, { maxLen: 2 });
  assert.deepEqual(p.bands.hedgehog, { maxLen: 2 });
  assert.equal(p.seeds, 0);
  assert.deepEqual(p.cleared, {});
  assert.deepEqual(p.story, { seen: {} });
});

test('newProgress returns independent objects', () => {
  const a = newProgress();
  a.bands.fox.maxLen = 4;
  a.cleared.x = true;
  a.story.seen.x = true;
  assert.equal(newProgress().bands.fox.maxLen, 2);
  assert.deepEqual(newProgress().cleared, {});
  assert.deepEqual(newProgress().story, { seen: {} });
});

// --- old saves ---

test('an old save keeps its bands and cleared levels and gains fox and hedgehog', () => {
  const old = { version: 1, seeds: 40, bands: { ants: { maxLen: 5 }, badger: { maxLen: 3 }, beaver: { maxLen: 3 } },
    cleared: { l01: true, l02: true, l03: true }, seenIntro: true, seenHabitatTip: true };
  const before = structuredClone(old);
  const p = migrate(old);
  assert.deepEqual(p.bands.ants, { maxLen: 5 });
  assert.deepEqual(p.bands.badger, { maxLen: 3 });
  assert.deepEqual(p.bands.beaver, { maxLen: 3 });
  assert.deepEqual(p.bands.fox, { maxLen: 2 });
  assert.deepEqual(p.bands.hedgehog, { maxLen: 2 });
  assert.deepEqual(Object.keys(p.bands).sort(), ['ants', 'badger', 'beaver', 'fox', 'hedgehog']);
  assert.equal(p.seeds, 40);
  assert.deepEqual(p.cleared, { l01: true, l02: true, l03: true });
  assert.equal(p.story.seen['intro-band'], true);   // from seenIntro
  assert.equal(p.story.seen['tip-den'], true);      // from seenHabitatTip
  assert.deepEqual(old, before, 'the raw save is not changed');
});

test('an old save with neither flag set has seen nothing', () => {
  assert.deepEqual(migrate(oldSave()).story, { seen: {} });
  assert.deepEqual(migrate({ ...oldSave(), seenIntro: true }).story, { seen: { 'intro-band': true } });
  assert.deepEqual(migrate({ ...oldSave(), seenHabitatTip: true }).story, { seen: { 'tip-den': true } });
});

test('the old flags add to a saved story and never take a scene away', () => {
  const p = migrate({ ...validProgress(), seenIntro: true, story: { seen: { 'o01-start': true, 'tip-den': true } } });
  assert.deepEqual(p.story.seen, { 'o01-start': true, 'tip-den': true, 'intro-band': true });
  // A flag still false does not unsee a scene the story has marked.
  const q = migrate({ ...validProgress(), seenHabitatTip: false, story: { seen: { 'tip-den': true } } });
  assert.equal(q.story.seen['tip-den'], true);
});

test('an old save that cleared l01 can still play l01 before clearing o02', () => {
  const p = migrate({ version: 1, seeds: 40, bands: { ants: { maxLen: 5 }, badger: { maxLen: 3 }, beaver: { maxLen: 3 } },
    cleared: { l01: true, l02: true, l03: true } });
  assert.deepEqual(unlockedLevels(p, SEVEN_NODES), new Set(['o01', 'l01', 'l02', 'l03', 'l04']));
});

test('a save without fox is no longer rejected; a save with a broken story field gets an empty one', () => {
  for (const missing of ['fox', 'hedgehog']) {
    const p = validProgress();
    p.seeds = 21;
    delete p.bands[missing];
    const out = migrate(p);
    assert.deepEqual(out.bands[missing], { maxLen: 2 }, missing);
    assert.equal(out.seeds, 21, missing);
    assert.deepEqual(out.bands.ants, { maxLen: 4 }, missing);
  }
  // Nor is a save without the old starters: the ants, badger and beaver
  // are no longer every save's.
  const bare = { version: 1, seeds: 5, bands: {}, cleared: { o01: true } };
  assert.deepEqual(migrate(bare).bands, { fox: { maxLen: 2 }, hedgehog: { maxLen: 2 } });
  assert.deepEqual(migrate(bare).cleared, { o01: true });
  for (const story of [null, 'seen', 3, [], { seen: null }, { seen: [] }, { seen: 'o01-start' }, {}]) {
    const out = migrate({ ...validProgress(), seeds: 17, story });
    assert.deepEqual(out.story, { seen: {} }, JSON.stringify(story));
    assert.equal(out.seeds, 17, 'the rest of the save is kept');
  }
  // A broken story field still takes the old flags.
  assert.deepEqual(migrate({ ...validProgress(), seenIntro: true, story: 'x' }).story, { seen: { 'intro-band': true } });
  // Only true and false are kept in `seen`; anything else is dropped on its own.
  const mixed = migrate({ ...validProgress(), story: { seen: { a: true, b: false, c: 'yes', d: 1, e: null } } });
  assert.deepEqual(mixed.story, { seen: { a: true, b: false } });
});

test('loadProgress always returns a story.seen object', () => {
  assert.deepEqual(loadProgress(fakeStorage()).story, { seen: {} });
  assert.deepEqual(loadProgress(fakeStorage({ [SAVE_KEY]: '{not json' })).story, { seen: {} });
  assert.deepEqual(loadProgress(fakeStorage({ [SAVE_KEY]: JSON.stringify(oldSave()) })).story, { seen: {} });
  const broken = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...validProgress(), story: 5 }) });
  assert.deepEqual(loadProgress(broken).story, { seen: {} });
  assert.equal(broken.map.has('undergrowth.save.bad'), false, 'a broken story field is not a bad save');
  const seen = { ...validProgress(), story: { seen: { 'o01-start': true } } };
  assert.deepEqual(loadProgress(fakeStorage({ [SAVE_KEY]: JSON.stringify(seen) })), seen);
});

// --- migrate ---

test('migrate returns a valid version 1 object as is', () => {
  const p = validProgress();
  assert.deepEqual(migrate(p), p);
});

test('migrate allows extra known band types in range', () => {
  const p = validProgress();
  p.bands.bear = { maxLen: 2 };
  assert.deepEqual(migrate(p), p);
});

test('migrate keeps a save without the ants, badger or beaver', () => {
  const p = validProgress();
  delete p.bands.beaver;
  assert.deepEqual(migrate(p), p);
  const p2 = validProgress();
  delete p2.bands.ants;
  assert.deepEqual(migrate(p2), p2);
});

test('migrate rejects array bands/cleared and non-plain objects', () => {
  const p = validProgress();
  assert.deepEqual(migrate({ ...p, bands: [] }), newProgress());
  assert.deepEqual(migrate({ ...p, cleared: [] }), newProgress());
  assert.deepEqual(migrate({ ...p, bands: null }), newProgress());
  assert.deepEqual(migrate({ ...p, cleared: null }), newProgress());
  assert.deepEqual(migrate(null), newProgress());
  assert.deepEqual(migrate(undefined), newProgress());
  assert.deepEqual(migrate('x'), newProgress());
  assert.deepEqual(migrate([]), newProgress());
});

test('migrate rejects non-boolean cleared values', () => {
  const p = validProgress();
  assert.deepEqual(migrate({ ...p, cleared: { a: 1 } }), newProgress());
  assert.deepEqual(migrate({ ...p, cleared: { a: 'true' } }), newProgress());
  assert.deepEqual(migrate({ ...p, cleared: { a: null } }), newProgress());
});

test('migrate rejects bad version, seeds, unknown band, out-of-range and non-integer maxLen', () => {
  const p = validProgress();
  assert.deepEqual(migrate({ ...p, version: 99 }), newProgress());
  assert.deepEqual(migrate({ ...p, seeds: -5 }), newProgress());
  assert.deepEqual(migrate({ ...p, seeds: 1.5 }), newProgress());
  assert.deepEqual(migrate({ ...p, seeds: '10' }), newProgress());
  assert.deepEqual(
    migrate({ ...p, bands: { ...p.bands, dragon: { maxLen: 2 } } }),
    newProgress(),
  );
  assert.deepEqual(
    migrate({ ...p, bands: { ...p.bands, ants: { maxLen: 3 } } }),
    newProgress(),
  );
  assert.deepEqual(
    migrate({ ...p, bands: { ...p.bands, ants: { maxLen: 13 } } }),
    newProgress(),
  );
  assert.deepEqual(
    migrate({ ...p, bands: { ...p.bands, ants: { maxLen: 4.5 } } }),
    newProgress(),
  );
  assert.deepEqual(
    migrate({ ...p, bands: { ...p.bands, ants: { maxLen: '4' } } }),
    newProgress(),
  );
});

test('migrate cuts a saved bee band longer than two down to two, and keeps the rest of the save', () => {
  const p = validProgress();
  p.seeds = 33;
  for (const old of [3, 4, 8]) {
    const raw = { ...p, bands: { ...p.bands, bees: { maxLen: old } } };
    const before = structuredClone(raw);
    const out = migrate(raw);
    assert.deepEqual(out.bands.bees, { maxLen: 2 }, `bees ${old}`);
    assert.deepEqual(out.bands.ants, p.bands.ants);
    assert.equal(out.seeds, 33);
    assert.deepEqual(raw, before, 'the raw save is not changed');
  }
  // Bees saved at a size they could have now are kept.
  for (const now of [1, 2]) {
    assert.deepEqual(migrate({ ...p, bands: { ...p.bands, bees: { maxLen: now } } }).bands.bees, { maxLen: now });
  }
  // Beyond the old cap of 8 the save was never valid, and still is not.
  assert.deepEqual(migrate({ ...p, bands: { ...p.bands, bees: { maxLen: 9 } } }), newProgress());
  assert.deepEqual(migrate({ ...p, bands: { ...p.bands, bees: { maxLen: 4.5 } } }), newProgress());
});

test('loadProgress cuts saved bees to two', () => {
  const p = validProgress();
  const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...p, bands: { ...p.bands, bees: { maxLen: 6 } } }) });
  assert.deepEqual(loadProgress(storage).bands.bees, { maxLen: 2 });
});

test('migrate rejects bot (non-us) band types even within their maxLen range', () => {
  const p = validProgress();
  // Bot ranges from units.js: saw 2..2, harvester 3..3, planter 3..3.
  for (const [type, maxLen] of [['saw', 2], ['harvester', 3], ['planter', 3]]) {
    assert.deepEqual(
      migrate({ ...p, bands: { ...p.bands, [type]: { maxLen } } }),
      newProgress(),
      type,
    );
  }
});

// --- settings (optional saved fields, no version bump) ---

test('migrate defaults the settings on a save written before they existed', () => {
  const old = oldSave();
  assert.deepEqual(migrate(old), {
    ...oldSaveLoaded(),
    seenIntro: false,
    seenHabitatTip: false,
    botSpeed: 'normal',
    soundOn: false,
  });
  // The old save object itself is left alone.
  assert.deepEqual(old, oldSave());
});

test('migrate keeps valid saved settings', () => {
  const p = { ...oldSave(), seenIntro: true, seenHabitatTip: true, botSpeed: 'instant', soundOn: true };
  assert.deepEqual(migrate(p), {
    ...oldSaveLoaded(), seenIntro: true, seenHabitatTip: true, botSpeed: 'instant', soundOn: true,
    story: { seen: { 'intro-band': true, 'tip-den': true } },
  });
  assert.equal(migrate({ ...oldSave(), botSpeed: 'fast' }).botSpeed, 'fast');
  assert.equal(migrate({ ...oldSave(), botSpeed: 'normal' }).botSpeed, 'normal');
});

test('migrate defaults each setting on its own', () => {
  const p = migrate({ ...oldSave(), soundOn: true });
  assert.equal(p.soundOn, true);
  assert.equal(p.seenIntro, false);
  assert.equal(p.seenHabitatTip, false);
  assert.equal(p.botSpeed, 'normal');
});

test('migrate replaces a bad setting with its default and keeps the rest of the save', () => {
  const bad = {
    ...oldSave(), seeds: 33, seenIntro: 'yes', seenHabitatTip: 1, botSpeed: 'warp', soundOn: null,
  };
  assert.deepEqual(migrate(bad), {
    ...oldSaveLoaded(),
    seeds: 33,
    seenIntro: false,
    seenHabitatTip: false,
    botSpeed: 'normal',
    soundOn: false,
  });
});

test('the save version is still 1', () => {
  assert.equal(newProgress().version, 1);
  assert.equal(migrate(oldSave()).version, 1);
});

test('loadProgress loads an old save with default settings and writes no .bad copy', () => {
  const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(oldSave()) });
  const p = loadProgress(storage);
  assert.equal(p.seeds, 10);
  assert.deepEqual(p.cleared, { l01: true });
  assert.deepEqual(p.bands, oldSaveLoaded().bands);
  assert.equal(p.seenIntro, false);
  assert.equal(p.seenHabitatTip, false);
  assert.equal(p.botSpeed, 'normal');
  assert.equal(p.soundOn, false);
  assert.equal(storage.map.has('undergrowth.save.bad'), false);
});

test('settings survive a save and load round trip', () => {
  const storage = fakeStorage();
  // The two old flags set mean their scenes were seen, so a save as the
  // game writes it has both.
  const p = {
    ...newProgress(), seenIntro: true, seenHabitatTip: true, botSpeed: 'fast', soundOn: true,
    story: { seen: { 'intro-band': true, 'tip-den': true } },
  };
  saveProgress(p, storage);
  assert.deepEqual(loadProgress(storage), p);
});

test('settings survive a victory and a purchase', () => {
  const p = { ...validProgress(), seeds: 100, seenIntro: true, botSpeed: 'instant', soundOn: true };
  const reward = { pickups: 0, objectives: 0, forest: 0, firstClear: 0, total: 5 };
  const won = applyVictory(p, 'l01', reward);
  assert.equal(won.seenIntro, true);
  assert.equal(won.botSpeed, 'instant');
  assert.equal(won.soundOn, true);
  const bought = buy(won, 'recruit:ants');
  assert.equal(bought.seenIntro, true);
  assert.equal(bought.botSpeed, 'instant');
  assert.equal(bought.soundOn, true);
});

test('BOT_SPEEDS lists the three speeds, normal first', () => {
  assert.deepEqual(BOT_SPEEDS, ['normal', 'fast', 'instant']);
});

// --- load / save ---

test('loadProgress with a storage whose getItem throws returns newProgress()', () => {
  const storage = {
    getItem() { throw new Error('boom'); },
    setItem() {},
  };
  assert.deepEqual(loadProgress(storage), newProgress());
});

test("loadProgress with '{not json' returns newProgress()", () => {
  const storage = fakeStorage({ [SAVE_KEY]: '{not json' });
  assert.deepEqual(loadProgress(storage), newProgress());
});

test('loadProgress with {version: 99} returns newProgress()', () => {
  const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify({ version: 99 }) });
  assert.deepEqual(loadProgress(storage), newProgress());
});

test('loadProgress with {version:1, seeds:-5, …} returns newProgress()', () => {
  const bad = { ...validProgress(), seeds: -5 };
  const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(bad) });
  assert.deepEqual(loadProgress(storage), newProgress());
});

test('loadProgress with no saved item returns newProgress()', () => {
  assert.deepEqual(loadProgress(fakeStorage()), newProgress());
});

test('saveProgress with a setItem that throws does not throw', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('boom'); },
  };
  assert.doesNotThrow(() => saveProgress(newProgress(), storage));
});

test('loadProgress copies unparseable raw save to undergrowth.save.bad', () => {
  const storage = fakeStorage({ [SAVE_KEY]: '{not json' });
  assert.deepEqual(loadProgress(storage), newProgress());
  assert.equal(storage.map.get('undergrowth.save.bad'), '{not json');
  // Original item is left in place.
  assert.equal(storage.map.get(SAVE_KEY), '{not json');
});

test('loadProgress copies migrate-rejected raw save to undergrowth.save.bad', () => {
  const raw = JSON.stringify({ version: 99 });
  const storage = fakeStorage({ [SAVE_KEY]: raw });
  assert.deepEqual(loadProgress(storage), newProgress());
  assert.equal(storage.map.get('undergrowth.save.bad'), raw);
});

test('loadProgress copies a save rejected for a bot band to undergrowth.save.bad', () => {
  const bad = validProgress();
  bad.bands.saw = { maxLen: 2 };
  const raw = JSON.stringify(bad);
  const storage = fakeStorage({ [SAVE_KEY]: raw });
  assert.deepEqual(loadProgress(storage), newProgress());
  assert.equal(storage.map.get('undergrowth.save.bad'), raw);
});

test('loadProgress writes no .bad copy for a missing or valid save', () => {
  const empty = fakeStorage();
  assert.deepEqual(loadProgress(empty), newProgress());
  assert.equal(empty.map.has('undergrowth.save.bad'), false);

  // A valid save that happens to equal fresh progress is still valid.
  const freshRaw = JSON.stringify(newProgress());
  const freshStore = fakeStorage({ [SAVE_KEY]: freshRaw });
  assert.deepEqual(loadProgress(freshStore), newProgress());
  assert.equal(freshStore.map.has('undergrowth.save.bad'), false);

  const good = fakeStorage({ [SAVE_KEY]: JSON.stringify(validProgress()) });
  assert.deepEqual(loadProgress(good), validProgress());
  assert.equal(good.map.has('undergrowth.save.bad'), false);
});

test('loadProgress still returns fresh progress when writing the .bad copy throws', () => {
  const storage = {
    getItem(k) { return k === SAVE_KEY ? '{not json' : null; },
    setItem() { throw new Error('boom'); },
  };
  assert.doesNotThrow(() => loadProgress(storage));
  assert.deepEqual(loadProgress(storage), newProgress());
});

test('a round trip through a fake storage preserves the progress', () => {
  const storage = fakeStorage();
  const p = validProgress();
  p.seeds = 42;
  p.bands.bear = { maxLen: 3 };
  p.cleared = { level1: true };
  saveProgress(p, storage);
  assert.equal(storage.map.get(SAVE_KEY), JSON.stringify(p));
  assert.deepEqual(loadProgress(storage), p);
});

// --- applyVictory ---

test('applyVictory adds reward total and marks cleared, without mutating input', () => {
  const p = newProgress();
  const before = structuredClone(p);
  const reward = { pickups: 1, objectives: 2, forest: 3, firstClear: 4, total: 10 };
  const out = applyVictory(p, 'level1', reward);
  assert.deepEqual(p, before);
  assert.notEqual(out, p);
  assert.equal(out.seeds, 10);
  assert.deepEqual(out.cleared, { level1: true });
  assert.deepEqual(out.bands, before.bands);
  assert.equal(out.version, 1);
});

// --- shop ---

// A save with the ants, the badger and the beaver as well, and no seeds.
function withValley() {
  return { ...validProgress(), seeds: 0 };
}

test('shopItems ordering: owned recruits first, then types, each in BAND_TYPES order', () => {
  assert.deepEqual(
    shopItems(newProgress()).map((i) => i.id),
    ['recruit:fox', 'recruit:hedgehog', 'type:badger', 'type:beaver', 'type:bear', 'type:owl', 'type:bees'],
  );
  assert.deepEqual(
    shopItems(withValley()).map((i) => i.id),
    ['recruit:fox', 'recruit:hedgehog', 'recruit:ants', 'recruit:badger', 'recruit:beaver',
      'type:bear', 'type:owl', 'type:bees'],
  );
});

test('the shop sells the beaver and the badger from the start, and never the ants, fox or hedgehog', () => {
  const p = newProgress();
  p.seeds = 30;
  const items = shopItems(p);
  for (const type of ['beaver', 'badger']) {
    const item = items.find((i) => i.id === `type:${type}`);
    assert.ok(item, type);
    assert.equal(item.price, 30, type);
    assert.equal(item.affordable, true, type);
    assert.equal(item.available, true, type);
    assert.deepEqual(buy(p, `type:${type}`).bands[type], { maxLen: 3 }, type);
  }
  // Not even to a save without them.
  const none = { ...newProgress(), seeds: 1000, bands: {} };
  for (const progress of [p, none, withValley()]) {
    const ids = shopItems(progress).map((i) => i.id);
    for (const type of ['ants', 'fox', 'hedgehog']) {
      assert.ok(!ids.includes(`type:${type}`), `type:${type}`);
      assert.throws(() => buy({ ...progress, seeds: 1000 }, `type:${type}`), Error, type);
    }
  }
  // The fox and the hedgehog grow by recruits, like any band.
  const fox = items.find((i) => i.id === 'recruit:fox');
  assert.equal(fox.label, '+1 Fox (2 → 3)');
  assert.equal(fox.price, 15);
  assert.deepEqual(buy(p, 'recruit:fox').bands.fox, { maxLen: 3 });
});

test('shopItems labels and fields for types', () => {
  const p = newProgress();
  p.seeds = 100;
  const items = shopItems(p);
  const bear = items.find((i) => i.id === 'type:bear');
  assert.deepEqual(bear, {
    id: 'type:bear',
    kind: 'type',
    type: 'bear',
    label: 'Recruit a Bear band',
    price: 60,
    affordable: true,
    available: true,
  });
  const owl = items.find((i) => i.id === 'type:owl');
  assert.equal(owl.label, 'Recruit an Owl band');
  assert.equal(owl.price, 50);
});

test('shopItems recruit labels, including becomes Ant Colony for ants 5 -> 6', () => {
  const p = withValley();
  let ants = shopItems(p).find((i) => i.id === 'recruit:ants');
  assert.equal(ants.label, '+1 Ants (4 → 5)');
  assert.equal(ants.kind, 'recruit');
  assert.equal(ants.type, 'ants');
  assert.equal(ants.price, 10);
  assert.equal(ants.available, true);

  p.bands.ants.maxLen = 5;
  ants = shopItems(p).find((i) => i.id === 'recruit:ants');
  assert.equal(ants.label, '+1 Ants (5 → 6) — becomes Ant Colony');
  assert.equal(ants.price, 15);
});

test('shopItems affordable reflects seeds', () => {
  const p = withValley(); // 0 seeds
  for (const item of shopItems(p)) assert.equal(item.affordable, false, item.id);
  p.seeds = 10;
  const items = shopItems(p);
  assert.equal(items.find((i) => i.id === 'recruit:ants').affordable, true);
  assert.equal(items.find((i) => i.id === 'type:bear').affordable, false);
});

test('recruit at cap is unavailable but still listed', () => {
  const p = withValley();
  p.bands.ants.maxLen = 12;
  p.seeds = 1000;
  const ants = shopItems(p).find((i) => i.id === 'recruit:ants');
  assert.ok(ants);
  assert.equal(ants.available, false);
  assert.equal(ants.label, '+1 Ants (12 → 13)');
});

test('shopItems omits type items for owned types and lists their recruit in owned order', () => {
  const p = withValley();
  p.bands.bear = { maxLen: 2 };
  const items = shopItems(p);
  assert.deepEqual(
    items.map((i) => i.id),
    ['recruit:fox', 'recruit:hedgehog', 'recruit:ants', 'recruit:badger', 'recruit:beaver', 'recruit:bear',
      'type:owl', 'type:bees'],
  );
});

test('buy: buying the bear deducts 60 and adds bear: {maxLen: 2}, without mutating input', () => {
  const p = newProgress();
  p.seeds = 100;
  const before = structuredClone(p);
  const out = buy(p, 'type:bear');
  assert.deepEqual(p, before);
  assert.notEqual(out, p);
  assert.equal(out.seeds, 40);
  assert.deepEqual(out.bands.bear, { maxLen: 2 });
});

test('buy: buying with too few seeds throws', () => {
  const p = newProgress();
  p.seeds = 59;
  assert.throws(() => buy(p, 'type:bear'), Error);
  assert.throws(() => buy(withValley(), 'recruit:ants'), Error);
});

test('buy: a recruit increases maxLen by 1 and deducts price, without mutating input', () => {
  const p = withValley();
  p.seeds = 100;
  const before = structuredClone(p);
  const out = buy(p, 'recruit:ants');
  assert.deepEqual(p, before);
  assert.equal(out.bands.ants.maxLen, 5);
  assert.equal(out.seeds, 90); // recruitCost('ants', 4) = 10
});

test('buy: unknown item and unavailable recruit at cap throw', () => {
  const p = withValley();
  p.seeds = 1000;
  assert.throws(() => buy(p, 'type:dragon'), Error);
  assert.throws(() => buy(p, 'nonsense'), Error);
  assert.throws(() => buy(p, 'recruit:bear'), Error); // not owned
  p.bands.ants.maxLen = 12;
  assert.throws(() => buy(p, 'recruit:ants'), Error);
});

// --- campaign ---

test('unlockedLevels: nodes A->[B, C] with A cleared gives {A, B, C}', () => {
  const nodes = [
    { levelId: 'A', x: 0, y: 0, unlocks: ['B', 'C'] },
    { levelId: 'B', x: 1, y: 0, unlocks: [] },
    { levelId: 'C', x: 2, y: 0, unlocks: [] },
  ];
  const p = newProgress();
  p.cleared = { A: true };
  assert.deepEqual(unlockedLevels(p, nodes), new Set(['A', 'B', 'C']));
});

test('unlockedLevels counts every cleared level as unlocked, even one its route has not reached', () => {
  const p = newProgress();
  p.cleared = { l02: true };
  // l02 is reached through o01, o02 and l01, none of them cleared here.
  assert.deepEqual(unlockedLevels(p, SEVEN_NODES), new Set(['o01', 'l02', 'l04']));
  // A cleared id that is not on the map is not a level to unlock.
  p.cleared = { gone: true };
  assert.deepEqual(unlockedLevels(p, SEVEN_NODES), new Set(['o01']));
  // A level saved as not cleared stays shut.
  p.cleared = { o01: false };
  assert.deepEqual(unlockedLevels(p, SEVEN_NODES), new Set(['o01']));
});

test('unlockedLevels: first node always unlocked, empty nodes gives empty set', () => {
  const nodes = [
    { levelId: 'A', x: 0, y: 0, unlocks: ['B'] },
    { levelId: 'B', x: 1, y: 0, unlocks: [] },
  ];
  assert.deepEqual(unlockedLevels(newProgress(), nodes), new Set(['A']));
  assert.deepEqual(unlockedLevels(newProgress(), []), new Set());
});

// --- map layout (M8) ---

// map-view.js positions each 44px button with left/top as x%/y% of the
// map wrap, centred via translate(-50%, -50%). The SVG is viewBox
// "0 0 100 100" at width:100%, height:auto, so the wrap is square:
// at 288px wide it is also 288px tall.
test('campaign map: all place centres are >= 44px apart on a 360px-wide column', () => {
  const stack = stackRegions(REGIONS);
  const px = 360 / 100; // the column is 100 units across
  const points = [
    ...CAMPAIGN_NODES.map((n) => ({ id: n.levelId, ...toColumn(stack, n) })),
    { id: 'trading-post', ...toColumn(stack, TRADING_POST) },
    { id: 'home', ...toColumn(stack, HOME_CAMP) },
  ];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) * px;
      assert.ok(d >= 44, `${points[i].id} to ${points[j].id} is ${d.toFixed(1)}px (< 44)`);
    }
  }
});

test('campaign map: the trading post 44px button fits inside the 360px column', () => {
  const stack = stackRegions(REGIONS);
  const px = 360 / 100;
  const half = 22; // 44px button, centred on the point
  const p = toColumn(stack, TRADING_POST);
  assert.ok(p.x * px - half >= 0 && p.x * px + half <= 360, `x ${p.x * px}`);
  assert.ok(p.y * px - half >= 0 && p.y * px + half <= stack.height * px, `y ${p.y * px}`);
});

test('withSettings changes only the settings it is given, and only to valid values', () => {
  const p = { ...newProgress(), seeds: 12 };
  const next = withSettings(p, { botSpeed: 'fast', soundOn: true });
  assert.equal(next.botSpeed, 'fast');
  assert.equal(next.soundOn, true);
  assert.equal(next.seeds, 12);
  assert.equal(next.seenIntro, false);
  assert.equal(p.botSpeed, 'normal', 'the old progress is left alone');
  const bad = withSettings(next, /** @type {any} */ ({ botSpeed: 'warp', soundOn: 'loud', seeds: 999 }));
  assert.equal(bad.botSpeed, 'fast', 'a bad value keeps the old one');
  assert.equal(bad.soundOn, true);
  assert.equal(bad.seeds, 12, 'only settings can change');
  assert.equal(withSettings(p, { seenIntro: true }).seenIntro, true);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(next))), next, 'and it still saves and loads');
});
