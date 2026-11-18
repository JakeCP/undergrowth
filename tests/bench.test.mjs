import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PLAYERS, playBoring, deploymentsFor, benchLevel, assessLevel, verdictOf, cleanWins, loadLabLevels, loadAltLevels, benchPool, main } from '../scripts/bench.mjs';
import { LEVELS } from '../data/levels/index.js';

/** @typedef {import('../js/engine/types.js').Level} Level */

/**
 * @param {Partial<Level>} over
 * @returns {Level}
 */
function makeLevel(over) {
  return {
    id: 'test', name: 'Test', blurb: '', goal: 'clear', maxBands: 3, turnLimit: null,
    grid: ['D.......', '........'],
    bots: [{ type: 'harvester', cells: [[7, 1]] }],
    trapped: [], firstClearSeeds: 0, assumes: {},
    solution: { deploy: [], moves: [] },
    ...over,
  };
}

// Upper bound for the expanded deployment and walk-tie sweep. Removing a
// shortcut is progress; adding one requires a look at the round.
const KNOWN_CLEAN_WINS = [
  'o01:goal', 'o01:chase', 'o01:camp', 'o01:pack',
  'o02:goal', 'o02:chase', 'o02:guard', 'o02:camp', 'o02:pack',
  'l01:goal', 'l01:chase', 'l01:guard', 'l01:camp', 'l01:pack',
  'l02:chase', 'l02:guard', 'l02:camp', 'l02:pack',
  'l03:goal', 'l03:guard',
  'l04:goal', 'l04:chase', 'l04:pack',
  'l05:goal', 'l05:chase', 'l05:guard', 'l05:camp', 'l05:pack',
];

test('goal walks to the stake and wins; guard and camp do not apply without a den or a tree', () => {
  const level = makeLevel({ goal: 'capture', grid: ['D...K.S.', '......SS'], bots: [{ type: 'harvester', cells: [[7, 0]] }] });
  const deploy = [{ type: 'fox', at: [0, 0] }];
  assert.equal(playBoring(level, 'goal', deploy).outcome, 'won');
  assert.equal(playBoring(level, 'guard', deploy), null);
  assert.equal(playBoring(level, 'camp', deploy), null);
});

test('a band that can build dams the water in its way; one that cannot is stuck', () => {
  const level = makeLevel({ goal: 'capture', grid: ['D.~.K.S.', 'SS~...SS'], bots: [{ type: 'harvester', cells: [[7, 0]] }] });
  assert.equal(playBoring(level, 'goal', [{ type: 'beaver', at: [0, 0] }]).outcome, 'won');
  assert.notEqual(playBoring(level, 'goal', [{ type: 'fox', at: [0, 0] }]).outcome, 'won');
});

test('pack sends every band at one bot and kills it', () => {
  const level = makeLevel({ goal: 'clear', maxBands: 2, grid: ['D......', 'D......'], bots: [{ type: 'harvester', cells: [[6, 0], [6, 1]] }] });
  const run = playBoring(level, 'pack', [{ type: 'fox', at: [0, 0] }, { type: 'ants', at: [0, 1] }]);
  assert.equal(run.outcome, 'won');
});

test('a band with no attack beside a bot, and a band wiped mid-level, do not throw', () => {
  // A den and a tree, so that guard and camp play too.
  const level = makeLevel({ goal: 'clear', grid: ['D.......', 'H.....T.'], bots: [{ type: 'saw', cells: [[3, 0], [4, 0]] }] });
  for (const player of PLAYERS) {
    assert.doesNotThrow(() => playBoring(level, player, [{ type: 'beaver', at: [0, 0] }]), player);
    assert.doesNotThrow(() => playBoring(level, player, [{ type: 'bees', at: [0, 0] }]), player);
  }
});

test('roster picks are capped by the camp tiles, and never throw', () => {
  const level = makeLevel({ goal: 'capture', maxBands: 3, grid: ['D...K...', '........'], roster: ['fox', 'ants', 'badger'] });
  const deploys = deploymentsFor(level);
  assert.equal(deploys.every((d) => d.length === 1), true, 'one camp tile, so one band');
  assert.equal(deploys.length, 3);
  assert.doesNotThrow(() => benchLevel(level));
});

test('an unknown trial rule is refused', async () => {
  const lines = [];
  assert.equal(await main(['--rule', 'nonsense'], (l) => lines.push(l)), 2);
});

test('the bench runs with the campaign alone', async () => {
  const lines = [];
  assert.equal(await main(['o01', 'o02'], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.includes('Shortcut:')));
  assert.equal(lines.some((l) => l.startsWith('o01')), true);
});

test('missing test levels are none; broken ones are an error', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-lab-'));
  const file = (/** @type {string} */ name, /** @type {string} */ text) => {
    writeFileSync(path.join(dir, name), text);
    return pathToFileURL(path.join(dir, name));
  };
  try {
    assert.deepEqual(await loadLabLevels(pathToFileURL(path.join(dir, 'absent.js'))), []);
    assert.deepEqual(await loadLabLevels(file('empty.js', 'export const LAB_LEVELS = [];\n')), []);
    await assert.rejects(loadLabLevels(file('syntax.js', 'export const LAB_LEVELS = [;\n')), SyntaxError);
    await assert.rejects(loadLabLevels(file('import.js', "import t from './t01.js';\nexport const LAB_LEVELS = [t];\n")), { code: 'ERR_MODULE_NOT_FOUND' });
    await assert.rejects(loadLabLevels(file('throws.js', "throw new Error('bad level');\n")), /bad level/);
    await assert.rejects(loadLabLevels(file('named.js', 'export const LEVELS = [];\n')), /no LAB_LEVELS array/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing alt levels are none; a module without ALT_LEVELS is an error', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-alt-'));
  const file = (/** @type {string} */ name, /** @type {string} */ text) => {
    writeFileSync(path.join(dir, name), text);
    return pathToFileURL(path.join(dir, name));
  };
  try {
    assert.deepEqual(await loadAltLevels(pathToFileURL(path.join(dir, 'absent.js'))), []);
    assert.deepEqual(await loadAltLevels(file('empty.js', 'export const ALT_LEVELS = [];\n')), []);
    await assert.rejects(loadAltLevels(file('named.js', 'export const LAB_LEVELS = [];\n')), /no ALT_LEVELS array/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('benchPool: the campaign, the test levels, then the alt levels; --lab and --alt pick those sets; sandboxes never', () => {
  const lvl = (/** @type {string} */ id, over = {}) => makeLevel({ id, ...over });
  const sets = { campaign: [lvl('l01')], lab: [lvl('t01'), lvl('s01', { sandbox: true })], alt: [lvl('a01'), lvl('a02')] };
  const ids = (/** @type {Level[]} */ levels) => levels.map((l) => l.id);
  assert.deepEqual(ids(benchPool(sets)), ['l01', 't01', 'a01', 'a02']);
  assert.deepEqual(ids(benchPool(sets, { labOnly: true })), ['t01']);
  assert.deepEqual(ids(benchPool(sets, { altOnly: true })), ['a01', 'a02']);
  assert.deepEqual(ids(benchPool(sets, { labOnly: true, altOnly: true })), ['t01', 'a01', 'a02']);
  assert.deepEqual(ids(benchPool({ campaign: sets.campaign, lab: [], alt: [] })), ['l01'], 'the public build: the campaign alone');
});

test('the campaign gains no new clean shortcuts', () => {
  assert.deepEqual(cleanWins(LEVELS).filter((win) => !KNOWN_CLEAN_WINS.includes(win)), []);
});

test('the bench never reads a bot\'s plan', () => {
  const src = readFileSync(new URL('../scripts/bench.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.plan\b/);
});

// The fox's dash (trial rule foxDash): a boring player with nothing to
// bite dashes when a dash tile is strictly nearer its goals.
test('under foxDash the goal player dashes to a stake five tiles off and wins a turn sooner', () => {
  const level = makeLevel({ goal: 'capture', grid: ['D....K..', 'SSSSSS..'], bots: [{ type: 'harvester', cells: [[7, 1]] }] });
  const deploy = [{ type: 'fox', at: [0, 0] }];
  assert.equal(playBoring(level, 'goal', deploy).turn, 2);
  const run = playBoring({ ...level, rules: { foxDash: true } }, 'goal', deploy);
  assert.equal(run.outcome, 'won');
  assert.equal(run.turn, 1);
});

test('the sweep tries swapped starting tiles and uses the story roster in the campaign', () => {
  const deploys = deploymentsFor(LEVELS[0]);
  assert.equal(deploys.length, 8); // Four solo starts and two assignments in both orders.
  assert.ok(deploys.some((d) => d.length === 1 && d[0].type === 'hedgehog'));
  for (const x of [0, 1]) {
    assert.ok(deploys.some((d) => d.length === 2 && d[0].type === 'fox' && d[0].at[0] === x));
  }
});

const bridge = makeLevel({
  goal: 'capture', roster: ['beaver'], grid: ['DoKSS', 'SSSS.'],
  bots: [{ type: 'harvester', cells: [[4, 1]] }],
  solution: {
    deploy: [{ type: 'beaver', at: [0, 0] }],
    moves: [
      { kind: 'act', band: 'beaver', action: 'build', target: [1, 0] },
      { kind: 'end' },
      { kind: 'move', band: 'beaver', path: [[1, 0], [2, 0]] },
    ],
  },
});

test('a safe bridge puzzle with a caged enemy shows no tactical cost, and still passes: the count never decides', () => {
  const result = assessLevel(bridge);
  assert.equal(result.witness.turn, 2);
  assert.deepEqual(result.witness.choices, []);
  assert.deepEqual(result.shortcuts, []);
  assert.equal(result.pass, true);
});

test('unfinished, stale, unavailable and post-victory recordings cannot certify a win', () => {
  const { deploy, moves } = bridge.solution;
  for (const solution of [
    { deploy, moves: moves.slice(0, 1) },
    { deploy, moves: moves.slice(2) },
    { deploy: [{ type: 'beaver', at: [2, 0] }], moves },
    { deploy: [{ type: 'owl', at: [0, 0] }], moves: [] },
    { deploy, moves: [...moves, { kind: 'end' }] },
  ]) {
    const result = assessLevel({ ...bridge, solution });
    assert.equal(result.witness, null);
    assert.equal(result.pass, false);
  }
  const fallback = assessLevel({ ...bridge, solution: { deploy, moves: [] }, alternatives: [bridge.solution] });
  assert.equal(fallback.witness.line, 2);
});

test('a repeated position is settled but an exhausted simulation budget is inconclusive', () => {
  const level = makeLevel({
    goal: 'capture', roster: ['fox'],
    grid: [`D${'.'.repeat(300)}KS.`],
    bots: [{ type: 'harvester', cells: [[303, 0]] }],
  });
  const result = assessLevel(level);
  assert.equal(result.runs.idle.reason, 'cycle');
  assert.ok(result.capped.includes('goal'));
  assert.equal(result.pass, false);
});

// The verdict: Jake's rule from the 2026-11-16 review is that a level a
// simple player wins with every den whole is not finished. A win with a
// den damaged is a warning to look at, not a failure. The count of
// consequential turns is shown to the designer but never decides.
const won = (clean) => ({ outcome: 'won', reason: null, turn: 3, clean, deploy: [], reverseTies: false });
const lost = { outcome: 'lost', reason: 'wiped', turn: 3, clean: true, deploy: [], reverseTies: false };
const proven = { line: 1, turn: 4, choices: [] };

test('verdictOf: a verified win and no simple-player win passes, even with no consequential turn shown', () => {
  assert.deepEqual(verdictOf(proven, { goal: lost, chase: lost, idle: lost }), { pass: true, shortcuts: [], warnings: [], capped: [] });
});

test('verdictOf: a simple player winning with every den whole fails the round', () => {
  const v = verdictOf(proven, { goal: won(true), chase: lost });
  assert.deepEqual([v.pass, v.shortcuts, v.warnings], [false, ['goal'], []]);
});

test('verdictOf: a simple player winning with a den damaged is a warning, and the round still passes', () => {
  const v = verdictOf(proven, { goal: won(false), chase: lost });
  assert.deepEqual([v.pass, v.shortcuts, v.warnings], [true, [], ['goal']]);
});

test('verdictOf: no verified win, or a run left unresolved at the turn cap, fails the round', () => {
  assert.equal(verdictOf(null, { goal: lost }).pass, false);
  const capped = { outcome: 'unfinished', reason: 'turn cap', turn: 100, clean: true, deploy: [], reverseTies: false };
  assert.deepEqual(verdictOf(proven, { goal: capped }), { pass: false, shortcuts: [], warnings: [], capped: ['goal'] });
});
