// Where the bees' new rules (living-bots spec §8) meet the battle screen
// and the unit card (play-feel spec, "Changed after Jake's playtest of the
// full build"): the move highlights offer the tiles bees reach only by
// slipping through another band, and the card's sting line is as long as
// the line the engine actually strikes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../js/engine/battle.js';
import { BAND_TYPES } from '../js/engine/units.js';
import { selectionView, tapAction } from '../js/ui/battle-view.js';
import { renderBoard } from '../js/ui/board.js';
import { unitCard, lineLength } from '../js/ui/unit-info.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';

installFakeDom();

const GRID = ['.....', '.....', '.....', '.....', '.....'];

/**
 * A wall of ants across the whole board between the walker on the left
 * and the open ground on the right, and a bot far off so the battle is on.
 * @param {'bees'|'badger'} walker
 */
function walled(walker) {
  return makeState(GRID, [
    { id: walker, type: walker, cells: [[0, 2]], maxLen: walker === 'bees' ? 2 : 1 },
    { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
    { id: 'harvester-0', type: 'harvester', cells: [[4, 4]] },
  ]);
}

const keys = (positions) => positions.map((p) => `${p[0]},${p[1]}`).sort();

test('bees: the move highlights include tiles beyond a band they slip through, and never a band\'s tile', () => {
  const s = walled('bees');
  const view = selectionView(s, 'bees', null);
  assert.ok(view !== null);
  const reach = keys(view.reach);
  // The bees grow to length 2 as they walk, so stopping just past the wall
  // would leave their body on the ants: only the tiles one further are free.
  assert.ok(reach.includes('3,2'), 'straight through the wall');
  assert.ok(reach.includes('2,1') && reach.includes('2,3'), 'through, then round the corner');
  assert.ok(!reach.includes('2,2'), 'not where the body would rest on the ants');
  for (const cell of s.bands.find((b) => b.id === 'ants').cells) {
    assert.ok(!reach.includes(`${cell[0]},${cell[1]}`), 'never stops on the ants');
  }
  // The board draws those tiles as move highlights.
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, {
    selected: 'bees',
    highlights: [...view.moves.values()].map((path) => path[path.length - 1]),
    highlightKind: 'move',
    ghost: null,
  });
  const drawn = svg.all().filter((n) => n.attrs?.['data-highlight'] === 'move')
    .map((n) => [Math.floor(Number(n.attrs.x) / 40), Math.floor(Number(n.attrs.y) / 40)]);
  assert.deepEqual(keys(drawn), reach, 'every reachable tile is drawn as a move, and nothing else');
  // A tap on such a tile walks the bees through the ants, and the engine takes it.
  const move = tapAction(view, [3, 2]);
  assert.ok(move !== null && move.kind === 'move');
  const next = applyMove(s, move);
  assert.deepEqual(next.bands.find((b) => b.id === 'bees').cells, [[3, 2], [2, 2]]);
});

test('a band without the flag is held by the same wall', () => {
  const s = walled('badger');
  const view = selectionView(s, 'badger', null);
  assert.ok(view !== null);
  assert.ok(keys(view.reach).every((k) => k.startsWith('0,')), 'stays left of the wall');
});

test('the card\'s sting line is as long as the line the engine strikes', () => {
  const sting = BAND_TYPES.bees.actions.find((a) => a.id === 'sting');
  assert.ok(sting !== undefined);
  const length = lineLength(sting.pattern);
  // A row of one-tile bots east of the bees, longer than any line.
  const bands = [{ id: 'bees', type: 'bees', cells: [[0, 0]], maxLen: 2 }];
  for (let x = 1; x < 7; x += 1) bands.push({ id: `harvester-${x}`, type: 'harvester', cells: [[x, 0]] });
  const s = makeState(['.......'], bands);
  const next = applyMove(s, { kind: 'act', band: 'bees', action: 'sting', target: [1, 0] });
  const struck = next.events.filter((e) => e.kind === 'damage').length;
  assert.equal(struck, length);
  const card = unitCard('bees', 1);
  const line = card.actions.find((a) => a.id === 'sting');
  assert.ok(line !== undefined);
  assert.match(line.sentence, new RegExp(`line of ${length} tiles`));
  assert.equal(card.lengthMax, BAND_TYPES.bees.maxLenCap);
  assert.ok(card.traits.some((t) => /through other bands/.test(t)), 'the card says bees slip through');
});
