// The solver searches the earthworks actions (js/engine/works.js) as it
// searches any action, a recorded line holding them replays, and each
// prints as a plain `act` move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, replay, formatSolution, stateKey } from '../scripts/solve.mjs';
import { makeState } from './helpers.mjs';

/** @typedef {import('../js/engine/types.js').Level} Level */
/** @typedef {import('../js/engine/types.js').Move} Move */

/**
 * @param {Partial<Level>} over
 * @returns {Level}
 */
function level(over) {
  return /** @type {Level} */ ({
    id: 'test-works', name: 'Test', blurb: '', goal: 'capture', maxBands: 1, turnLimit: null,
    grid: [], bots: [{ type: 'harvester', cells: [[7, 1]] }],
    trapped: [], firstClearSeeds: 0, assumes: {},
    solution: { deploy: [], moves: [] },
    ...over,
  });
}

// The stake lies past what only the rule's action clears; stones close the
// row below, so there is no way round.
const CASES = /** @type {const} */ ([
  { rule: 'bearShovesStones', type: 'bear', action: 'shove', grid: ['D.S~K...', 'SSSSSS..'] },
  { rule: 'badgerEarthworks', type: 'badger', action: 'dig', grid: ['D.BK....', 'SSSSSS..'] },
  { rule: 'badgerEarthworks', type: 'badger', action: 'fill', grid: ['D.oK....', 'SSSSSS..'] },
]);

for (const c of CASES) {
  test(`${c.rule}: the solver wins with ${c.type}'s ${c.action}, and finds nothing without the rule`, () => {
    const deploy = [{ type: c.type, at: /** @type {[number, number]} */ ([0, 0]) }];
    const on = level({ grid: [...c.grid], rules: { [c.rule]: true } });
    const line = solve(on, deploy, { turns: 4 });
    assert.ok(line !== null);
    assert.ok(line.moves.some((m) => m.kind === 'act' && m.band === c.type && m.action === c.action), JSON.stringify(line.moves));
    assert.equal(solve(level({ grid: [...c.grid] }), deploy, { turns: 4 }), null);
  });
}

// The harvester has nothing to go for, so it waits at the far end; the
// beaver draws it onto the bridge, steps off, and brings the bridge down.
const RIVER = level({
  goal: 'clear',
  grid: ['~~~~~~~~', 'D.=====.', '~~~~~~~~'],
  bots: [{ type: 'harvester', cells: [[7, 1], [6, 1]] }],
  rules: { beaverGnaw: true },
});
const RIVER_DEPLOY = [{ type: 'beaver', at: /** @type {[number, number]} */ ([0, 1]) }];

test('beaverGnaw: the solver drowns the harvester by gnawing the bridge, and cannot win without it', () => {
  const line = solve(RIVER, RIVER_DEPLOY, { turns: 4 });
  assert.ok(line !== null);
  const last = line.moves[line.moves.length - 1];
  assert.deepEqual(last.kind === 'act' && [last.action, last.target], ['gnaw', [2, 1]]);
  assert.equal(solve({ ...RIVER, rules: {} }, RIVER_DEPLOY, { turns: 4 }), null);
});

/** @type {Move[]} */
const GNAW_LINE = [
  { kind: 'move', band: 'beaver', path: [[1, 1], [2, 1]] },
  { kind: 'end' },
  { kind: 'move', band: 'beaver', path: [[3, 1], [4, 1]] },
  { kind: 'end' },
  { kind: 'move', band: 'beaver', path: [[3, 1], [2, 1]] },
  { kind: 'end' },
  { kind: 'move', band: 'beaver', path: [[1, 1]] },
  { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] },
];

test('a recorded gnaw line replays to a win, and is no line without the rule', () => {
  const { state, error } = replay(RIVER, RIVER_DEPLOY, GNAW_LINE);
  assert.equal(error, null);
  assert.equal(state.outcome, 'won');
  const off = replay({ ...RIVER, rules: {} }, RIVER_DEPLOY, GNAW_LINE);
  assert.match(off.error ?? '', /cannot use action "gnaw"/);
});

test('a printed line records each earthworks action as an act move', () => {
  const text = formatSolution(RIVER_DEPLOY, [
    { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] },
    { kind: 'act', band: 'bear', action: 'shove', target: [2, 0] },
    { kind: 'act', band: 'badger', action: 'fill', target: [2, 0] },
    { kind: 'act', band: 'badger', action: 'dig', target: [2, 0] },
  ]);
  assert.match(text, /\{ kind: 'act', band: 'beaver', action: 'gnaw', target: \[2, 1\] \},/);
  assert.match(text, /\{ kind: 'act', band: 'bear', action: 'shove', target: \[2, 0\] \},/);
  assert.match(text, /\{ kind: 'act', band: 'badger', action: 'fill', target: \[2, 0\] \},/);
});

test('the search tells a ford over water from one over a hole, and a bank from open ground', () => {
  const a = makeState(['F.B'], []);
  const b = makeState(['F.B'], []);
  b.tiles[0][0] = { kind: 'ford', variant: null, under: 'hole' };
  const c = makeState(['F..'], []);
  assert.notEqual(stateKey(a), stateKey(b));
  assert.notEqual(stateKey(a), stateKey(c));
});
