// The joins of the opening act (plan Task 8): the levels, the story and
// the campaign were built apart, so these tests walk a save through them
// the way js/app.js and the battle screen do. Scenes run through
// runScenes with a play() that only records, and the battle's moments
// come from battleSceneMoments, the helper the battle screen calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEVELS } from '../data/levels/index.js';
import { CAMPAIGN_NODES } from '../data/campaign.js';
import { SCENES } from '../data/story/index.js';
import { createBattle, applyMove, rewardFor } from '../js/engine/battle.js';
import { BAND_TYPES, STARTER_TYPES } from '../js/engine/units.js';
import { newProgress, applyVictory } from '../js/campaign/progress.js';
import { unlockedLevels } from '../js/campaign/campaign.js';
import { guaranteedRoster } from '../js/story/story.js';
import { runScenes } from '../js/story/run.js';
import { battleSceneMoments } from '../js/ui/battle-view.js';

/** @typedef {import('../js/engine/types.js').Progress} Progress */
/** @typedef {import('../js/engine/types.js').Level} Level */
/** @typedef {import('../js/engine/types.js').Solution} Solution */
/** @typedef {import('../js/story/types.js').Moment} Moment */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} id
 * @returns {Level}
 */
function levelOf(id) {
  const level = LEVELS.find((l) => l.id === id);
  assert.ok(level, id);
  return level;
}

/**
 * A save held in a variable, as app.js holds it, and a log of every scene
 * shown with the moment that asked for it.
 * @param {Progress} start
 */
function player(start) {
  let progress = start;
  /** @type {Array<{id: string, when: string}>} */
  const shown = [];
  /**
   * @param {Moment} moment
   * @returns {Promise<string[]>} the ids shown at this moment
   */
  const at = async (moment) => {
    const from = shown.length;
    await runScenes(moment, {
      scenes: SCENES,
      getProgress: () => progress,
      setProgress: (p) => { progress = p; },
      play: async (scene) => { shown.push({ id: scene.id, when: moment.when }); },
    });
    return shown.slice(from).map((s) => s.id);
  };
  return {
    at,
    shown,
    get progress() { return progress; },
    /** @param {Progress} p */
    set progress(p) { progress = p; },
  };
}

/**
 * Plays one level as the app does: its `before` scenes, then the battle
 * with the recorded line, asking for the battle's moments after each
 * move, then the victory and its `won` scenes.
 * @param {ReturnType<typeof player>} me
 * @param {Level} level
 * @param {Solution} line
 */
async function playLevel(me, level, line) {
  /** @type {Record<string, string[]>} */
  const by = { before: [], start: [], firstSelect: [], battle: [], won: [] };
  by.before = await me.at({ when: 'before', level: level.id });
  let state = createBattle(level, line.deploy, me.progress);
  for (const m of battleSceneMoments(level.id, { kind: 'start', state })) by.start.push(...await me.at(m));
  const ours = state.bands.find((b) => b.side === 'us');
  for (const m of battleSceneMoments(level.id, { kind: 'select', state, band: ours, asked: false })) {
    by.firstSelect.push(...await me.at(m));
  }
  for (const move of line.moves) {
    const before = state;
    state = applyMove(state, move);
    for (const m of battleSceneMoments(level.id, { kind: 'settled', before, after: state })) {
      by.battle.push(...await me.at(m));
    }
  }
  assert.equal(state.outcome, 'won', `${level.id} is won by its recorded line`);
  const reward = rewardFor(state, level, me.progress);
  me.progress = applyVictory(me.progress, level.id, reward);
  by.won = await me.at({ when: 'won', level: level.id });
  return by;
}

test('a new game: only o01 is open, with the fox and the hedgehog and nothing else', () => {
  const p = newProgress();
  assert.deepEqual([...unlockedLevels(p, CAMPAIGN_NODES)], ['o01']);
  assert.deepEqual(Object.keys(p.bands).sort(), ['fox', 'hedgehog']);
  assert.deepEqual([...STARTER_TYPES].sort(), ['fox', 'hedgehog']);
  assert.deepEqual(p.story, { seen: {} });
});

test('a new save walks through o01 and o02 by their recorded lines, sees each scene at its moment, and ends with the ants and l01 open', async () => {
  const me = player(newProgress());
  assert.deepEqual(await me.at({ when: 'map' }), [], 'nothing on the map yet');

  const o01 = await playLevel(me, levelOf('o01'), levelOf('o01').solution);
  assert.deepEqual(o01, {
    before: ['o01-before'],
    start: [],
    firstSelect: ['intro-band'],
    battle: [],
    won: ['o01-won'],
  });
  assert.deepEqual([...unlockedLevels(me.progress, CAMPAIGN_NODES)].sort(), ['o01', 'o02']);
  assert.equal(me.progress.bands.ants, undefined, 'no ants before o02 is won');

  const o02 = await playLevel(me, levelOf('o02'), levelOf('o02').solution);
  assert.deepEqual(o02, {
    before: [],
    start: ['o02-start'],
    firstSelect: [],
    battle: ['o02-convinced'],
    won: ['o02-ants-join'],
  }, 'convinced in play, so the late version and the den tip stay away');
  assert.equal(me.shown.find((s) => s.id === 'o02-convinced')?.when, 'denMarked');

  assert.deepEqual(me.progress.bands.ants, { maxLen: BAND_TYPES.ants.startLen });
  assert.ok(unlockedLevels(me.progress, CAMPAIGN_NODES).has('l01'));
  for (const type of guaranteedRoster('l01', CAMPAIGN_NODES, SCENES, STARTER_TYPES)) {
    assert.ok(me.progress.bands[type], `owns ${type}, which l01's roster counts on`);
  }
  assert.deepEqual(await me.at({ when: 'start', level: 'l01' }), ['l01-start']);
  assert.ok(me.shown.every((s) => s.id !== 'tip-den'), 'the den rule came from o02-convinced');
});

test('every recorded o02 line convinces the fox exactly once, in play or at the win', async () => {
  const o02 = levelOf('o02');
  for (const line of [o02.solution, ...(o02.alternatives ?? [])]) {
    const me = player(newProgress());
    await playLevel(me, levelOf('o01'), levelOf('o01').solution);
    await playLevel(me, o02, line);
    const ids = me.shown.map((s) => s.id);
    const convinced = ids.filter((id) => id === 'o02-convinced' || id === 'o02-convinced-late');
    assert.equal(convinced.length, 1, ids.join(', '));
    assert.ok(!ids.includes('tip-den'));
    assert.ok(me.progress.bands.ants);
  }
});

/**
 * A save past l01 with the given bands, as the levels' rosters assume.
 * @param {Record<string, {maxLen: number}>} extra
 * @returns {Progress}
 */
function pastL01(extra = {}) {
  const p = newProgress();
  return {
    ...p,
    bands: { ...p.bands, ants: { maxLen: BAND_TYPES.ants.startLen }, ...extra },
    cleared: { o01: true, o02: true, l01: true, l03: true, l04: true },
    story: { seen: { 'intro-band': true, 'o01-before': true, 'o02-convinced': true, 'o02-ants-join': true } },
  };
}

for (const [levelId, type, joins, starts] of /** @type {const} */ ([
  ['l02', 'beaver', 'l02-beaver-joins', 'l02-start'],
  ['l05', 'badger', 'l05-badger-joins', 'l05-start'],
])) {
  test(`choosing ${levelId} gives the ${type} before the deploy screen, and it can be deployed`, async () => {
    const me = player(pastL01());
    assert.equal(me.progress.bands[type], undefined);
    assert.deepEqual(await me.at({ when: 'before', level: levelId }), [joins]);
    assert.deepEqual(me.progress.bands[type], { maxLen: BAND_TYPES[type].startLen });
    // The deploy screen opens on this progress: a battle with the band in it starts.
    const level = levelOf(levelId);
    const state = createBattle(level, [{ type, at: level.solution.deploy.find((d) => d.type === type)?.at ?? level.solution.deploy[0].at }], me.progress);
    assert.ok(state.bands.some((b) => b.type === type));
    assert.deepEqual(await me.at({ when: 'start', level: levelId }), [starts]);
    assert.deepEqual(await me.at({ when: 'before', level: levelId }), [], 'once only');
  });

  test(`choosing ${levelId} with the ${type} already bought gives it one recruit instead`, async () => {
    const me = player(pastL01({ [type]: { maxLen: 3 } }));
    const seeds = me.progress.seeds;
    assert.deepEqual(await me.at({ when: 'before', level: levelId }), [joins]);
    assert.deepEqual(me.progress.bands[type], { maxLen: 4 });
    assert.equal(me.progress.seeds, seeds);
    assert.deepEqual(await me.at({ when: 'start', level: levelId }), [starts]);
  });

  test(`choosing ${levelId} with the ${type} at its largest gives 10 seeds`, async () => {
    const cap = BAND_TYPES[type].maxLenCap;
    const me = player(pastL01({ [type]: { maxLen: cap } }));
    const seeds = me.progress.seeds;
    await me.at({ when: 'before', level: levelId });
    assert.deepEqual(me.progress.bands[type], { maxLen: cap });
    assert.equal(me.progress.seeds, seeds + 10);
  });
}

test('every pointed band in a level scene is one the player surely has there', () => {
  for (const scene of SCENES) {
    if (scene.level === undefined) continue;
    const roster = guaranteedRoster(scene.level, CAMPAIGN_NODES, SCENES, STARTER_TYPES);
    for (const line of scene.lines) {
      if (line.point?.kind === 'band') assert.ok(roster.includes(line.point.type), `${scene.id} points at ${line.point.type}`);
    }
  }
});

test('the old intro card and den tip are gone: only the save migration reads their flags', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'js/ui/intro.js')), false);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /intro\.js/);
  /** @param {string} dir @returns {string[]} */
  const files = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? files(rel) : /\.(js|css|html)$/.test(e.name) ? [rel] : [];
  });
  for (const rel of [...files('js'), ...files('data'), ...files('css'), 'index.html']) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (rel !== 'js/campaign/progress.js') {
      assert.doesNotMatch(text, /seenIntro|seenHabitatTip|onIntroSeen|onHabitatTipSeen/, rel);
    }
    assert.doesNotMatch(text, /board-intro|board-tip|HABITAT_TIP|habitatTipDue/, rel);
  }
});
