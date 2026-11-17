// Bees' sting shows its whole line (play-feel spec, "Changed after Jake's
// playtest of the full build"). The engine stings three tiles in a line,
// starting at the tile next to the head and going away from it; the
// screen used to mark only that first tile. These tests pin what the
// engine hits and check the target highlight, the hover preview and the
// badges against it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../js/engine/battle.js';
import { occupantAt } from '../js/engine/band.js';
import { previewTargets, selectionView, tapAction, strikeArea } from '../js/ui/battle-view.js';
import { renderBoard } from '../js/ui/board.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';

installFakeDom();

const GRID7 = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];

/**
 * Bees with their head in the middle and their body going south, and a
 * one-tile harvester on every other tile, so every tile struck shows.
 */
function crowded() {
  const bands = [{ id: 'bees', type: 'bees', cells: [[3, 3], [3, 4]], maxLen: 2 }];
  let n = 0;
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      if (x === 3 && (y === 3 || y === 4)) continue;
      bands.push({ id: `harvester-${n}`, type: 'harvester', cells: [[x, y]] });
      n += 1;
    }
  }
  return makeState(GRID7, bands);
}

/** The bands the engine damages when the bees sting at `aim`. */
function struckBy(s, aim) {
  const next = applyMove(s, { kind: 'act', band: 'bees', action: 'sting', target: aim });
  return next.events.filter((e) => e.kind === 'damage').map((e) => e.band).sort();
}

test('the engine stings the aimed tile and the two beyond it, away from the head', () => {
  const s = crowded();
  const id = (x, y) => occupantAt(s, [x, y]).id;
  assert.deepEqual(struckBy(s, [3, 2]), [id(3, 2), id(3, 1), id(3, 0)].sort(), 'north');
  assert.deepEqual(struckBy(s, [4, 3]), [id(4, 3), id(5, 3), id(6, 3)].sort(), 'east');
  assert.deepEqual(struckBy(s, [2, 3]), [id(2, 3), id(1, 3), id(0, 3)].sort(), 'west');
  // South runs through the bees' own body, then on to the next tiles.
  assert.deepEqual(struckBy(s, [3, 4]), ['bees', id(3, 5), id(3, 6)].sort(), 'south');
});

test('strikeArea: the three tiles of the line, cut at the board edge; one tile for other actions', () => {
  const s = crowded();
  assert.deepEqual(strikeArea(s, 'bees', 'sting', [3, 2]), [[3, 2], [3, 1], [3, 0]]);
  assert.deepEqual(strikeArea(s, 'bees', 'sting', [4, 3]), [[4, 3], [5, 3], [6, 3]]);
  const edge = makeState(['....'], [{ id: 'bees', type: 'bees', cells: [[1, 0]] }]);
  assert.deepEqual(strikeArea(edge, 'bees', 'sting', [2, 0]), [[2, 0], [3, 0]]);
  assert.deepEqual(strikeArea(edge, 'bees', 'sting', [0, 0]), [[0, 0]]);
  const ants = makeState(['...'], [{ id: 'ants', type: 'ants', cells: [[0, 0]] }]);
  assert.deepEqual(strikeArea(ants, 'ants', 'bite', [1, 0]), [[1, 0]]);
});

test('every sting preview strikes exactly the tiles of the bands the engine hits', () => {
  const s = crowded();
  const previews = previewTargets(s, 'bees', 'sting');
  assert.equal(previews.length, 4);
  for (const preview of previews) {
    const tiles = preview.strikes.map((strike) => strike.at);
    assert.equal(tiles.length, 3, `the whole line for ${preview.at}`);
    assert.deepEqual(tiles[0], preview.at, 'starting at the aimed tile');
    const onLine = new Set(tiles.map((at) => occupantAt(s, at).id));
    assert.deepEqual([...onLine].sort(), struckBy(s, preview.at));
  }
});

test('a sting badge sits on the tile of the band it is about', () => {
  // The bot is two tiles away: the aimed tile itself is empty ground.
  const s = makeState(['.....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
    { id: 'badger', type: 'badger', cells: [[3, 0], [4, 0]] },
  ]);
  const [east] = previewTargets(s, 'bees', 'sting');
  assert.deepEqual(east.at, [1, 0]);
  assert.deepEqual(east.badges, ['wipe', 'own'], 'the key still lists both');
  assert.deepEqual(east.strikes, [
    { at: [1, 0], badges: [] },
    { at: [2, 0], badges: ['wipe'] },
    { at: [3, 0], badges: ['own'] },
  ]);
});

test('a single-tile action strikes only its target, with its badges there', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  const [bite] = previewTargets(s, 'ants', 'bite');
  assert.deepEqual(bite.strikes, [{ at: [1, 0], badges: bite.badges }]);
});

test('a tap anywhere on a line stings along it', () => {
  const s = crowded();
  const view = selectionView(s, 'bees', 'sting');
  assert.ok(view);
  assert.equal(view.actionId, 'sting');
  assert.deepEqual(tapAction(view, [3, 0]), { kind: 'act', band: 'bees', action: 'sting', target: [3, 2] });
  assert.deepEqual(tapAction(view, [6, 3]), { kind: 'act', band: 'bees', action: 'sting', target: [4, 3] });
  assert.deepEqual(tapAction(view, [3, 2]), { kind: 'act', band: 'bees', action: 'sting', target: [3, 2] });
  assert.equal(tapAction(view, [0, 0]), null, 'off every line');
});

test('a move tile beyond the aimed tile still moves the band when both show at once', () => {
  // Direct mode by hand: one move tile on the line, past the aimed tile.
  const s = makeState(['....'], [{ id: 'bees', type: 'bees', cells: [[0, 0]], moved: true }]);
  const view = selectionView(s, 'bees', null);
  assert.ok(view);
  const path = [[1, 0], [2, 0]];
  const withMove = { ...view, moves: new Map([['2,0', path]]) };
  assert.deepEqual(tapAction(withMove, [2, 0]), { kind: 'move', band: 'bees', path });
  assert.equal(tapAction(withMove, [3, 0]).kind, 'act');
});

test('the board draws the whole line of each aim, and each badge on its own tile', () => {
  const s = makeState(['.....', '.....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]], moved: true },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0]] },
  ]);
  const view = selectionView(s, 'bees', null);
  assert.ok(view);
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, {
    selected: 'bees', highlights: [], highlightKind: 'move', ghost: null,
    targets: view.targets.map((t) => ({ at: t.at, badges: t.badges, strikes: t.strikes })),
  });
  const aims = svg.findAll('data-target').map((n) => n.attrs['data-target']).sort();
  assert.deepEqual(aims, ['0,1', '1,0'], 'the tappable aimed tiles');
  const line = svg.findAll('data-highlight', 'line').map((n) => n.attrs['data-line']).sort();
  assert.deepEqual(line, ['2,0', '3,0'], 'the rest of the east line; south runs off the board');
  const badges = svg.findAll('data-badge').map((n) => `${n.attrs['data-badge']} ${n.attrs['data-at']}`);
  assert.deepEqual(badges, ['wipe 2,0'], 'on the harvester, not on the empty tile in front of it');
});

test('the action pop-up keeps clear of the whole line, not only the aimed tiles', () => {
  const s = makeState(GRID7, [{ id: 'bees', type: 'bees', cells: [[3, 3]] }]);
  const view = selectionView(s, 'bees', null);
  assert.ok(view);
  const avoid = new Set(view.avoid.map((p) => `${p[0]},${p[1]}`));
  for (const tile of ['3,2', '3,1', '3,0', '4,3', '5,3', '6,3', '3,4', '3,5', '3,6', '2,3', '1,3', '0,3']) {
    assert.ok(avoid.has(tile), tile);
  }
  assert.equal(avoid.size, 12);
});

// --- a line over one of the player's own bands ---
//
// A tap on another band has always picked that band (play-feel spec,
// "tapping empty ground, or another band, closes it or switches the
// selection"). A sting's line reaches three tiles out, so it often lies
// over a friend; a tap on that friend must still pick it, not sting it.

/** Bees that have moved (so the lines show at once), with the ants down the east line. */
function overFriend() {
  return makeState(Array(8).fill('........'), [
    { id: 'bees', type: 'bees', cells: [[1, 1]], maxLen: 2, moved: true },
    { id: 'ants', type: 'ants', cells: [[3, 1], [4, 1]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 4]] },
    { id: 'harvester-1', type: 'harvester', cells: [[7, 7]] },
  ]);
}

test('a tap on one of the player\'s own bands further down a line is no sting', () => {
  const s = overFriend();
  const view = selectionView(s, 'bees', null);
  assert.ok(view);
  assert.equal(view.actionId, 'sting', 'the lines show at once for bees that have moved');
  assert.equal(tapAction(view, [3, 1]), null, 'the ants, two tiles down the east line');
  // The aimed tile itself still stings, and so does a bot further down a line.
  assert.deepEqual(tapAction(view, [2, 1]), { kind: 'act', band: 'bees', action: 'sting', target: [2, 1] });
  assert.deepEqual(tapAction(view, [1, 4]), { kind: 'act', band: 'bees', action: 'sting', target: [1, 2] });
});
