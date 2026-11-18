// The bench: five boring players that never read a bot's plan. A level one
// of them wins with every den whole is not finished.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PLAYERS, playBoring, deploymentsFor, benchLevel, cleanWins, loadLabLevels, main } from '../scripts/bench.mjs';
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

// Pinned on 2026-11-16. A new entry here is a regression (a boring player
// has found a way through a level with every den whole); a removed one is
// progress.
const EXPECTED_CLEAN_WINS = [
  'o01:goal', 'o01:chase', 'o01:pack',
  'o02:goal', 'o02:chase', 'o02:guard', 'o02:camp', 'o02:pack',
  'l01:chase', 'l01:guard', 'l01:camp', 'l01:pack',
  'l04:goal',
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
  assert.equal(await main(['o01', 'o02'], (l) => lines.push(l)), 0);
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

test('the campaign ratchet: exactly these levels are won clean by a boring player', () => {
  assert.deepEqual(cleanWins(LEVELS), EXPECTED_CLEAN_WINS);
});

test('the bench never reads a bot\'s plan', () => {
  const src = readFileSync(new URL('../scripts/bench.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.plan\b/);
});
