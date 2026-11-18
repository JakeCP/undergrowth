// The fox's Dash on the battle screen (fox-dash spec, "What the player
// sees"): the dash tiles beyond its walk in a softer, cooler wash, tapped
// straight away; a Dash button, key 2; the hover line; the log; the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { applyMove } from '../js/engine/battle.js';
import { key } from '../js/engine/grid.js';
import { selectionView, tapAction, selectionNote, dashPreview, numberChoice, tapLetsGo, DASH_ID, DASH_HOVER } from '../js/ui/battle-view.js';
import { focusInfo } from '../js/ui/battle-focus.js';
import { renderBoard } from '../js/ui/board.js';
import { setBoardPieces } from '../js/ui/pieces.js';
import { describeEvents } from '../js/ui/text.js';
import { unitCard } from '../js/ui/unit-info.js';
import { makeState } from './helpers.mjs';

installFakeDom();
setBoardPieces({});

const OPEN = ['........', '........', '........', '........', '........', '........', '........', '........'];
const ON = { rules: { foxDash: true } };

/** @param {object} [extra] @param {object[]} [more] */
function board(extra = ON, more = [{ id: 'saw-0', type: 'saw', cells: [[7, 7], [7, 6]] }]) {
  return makeState(OPEN, /** @type {any} */ ([{ id: 'fox', type: 'fox', cells: [[0, 0]], maxLen: 2 }, ...more]), /** @type {any} */ (extra));
}

test('a fresh fox under the rule: dash tiles beyond its walk, Bite and Dash, still tap-to-go', () => {
  const v = /** @type {any} */ (selectionView(board(), 'fox', null));
  assert.ok(v.dashes.size > 0);
  for (const k of v.dashes.keys()) assert.ok(!v.moves.has(k), `${k} is a walk tile too`);
  assert.deepEqual(v.options.map((/** @type {any} */ o) => o.id), ['bite', DASH_ID]);
  assert.equal(v.mode, 'direct');
  assert.equal(v.popup, false);
});

test('with the rule off the fox is as it was', () => {
  const v = /** @type {any} */ (selectionView(board({}), 'fox', null));
  assert.deepEqual(v.options.map((/** @type {any} */ o) => o.id), ['bite']);
  assert.equal(v.dashes.size, 0);
});

test('choosing Dash shows the dash tiles alone', () => {
  const s = board();
  const v = /** @type {any} */ (selectionView(s, 'fox', DASH_ID));
  assert.equal(v.actionId, DASH_ID);
  assert.equal(v.moves.size, 0);
  assert.equal(v.targets.length, 0);
  assert.ok(v.dashes.size > 0);
  assert.equal(selectionNote(s, v), 'Dash: tap a tile to run to');
});

test('a tap on a dash tile dashes there, by the shown path', () => {
  const v = /** @type {any} */ (selectionView(board(), 'fox', null));
  const [k, path] = [...v.dashes.entries()][0];
  const end = path[path.length - 1];
  assert.equal(key(end), k);
  assert.deepEqual(tapAction(v, end), { kind: 'move', band: 'fox', path, dash: true });
});

test('after a walk Dash is greyed and no dash tiles show', () => {
  const s = applyMove(board(), { kind: 'move', band: 'fox', path: [[0, 1]] });
  const v = /** @type {any} */ (selectionView(s, 'fox', null));
  assert.equal(v.dashes.size, 0);
  assert.deepEqual(v.options.find((/** @type {any} */ o) => o.id === DASH_ID), { id: DASH_ID, label: 'Dash', enabled: false, chosen: false });
});

test('undo: the state before a dash still offers the same dash tiles', () => {
  const s = board();
  const before = /** @type {any} */ (selectionView(s, 'fox', null));
  const path = [...before.dashes.values()][0];
  applyMove(s, { kind: 'move', band: 'fox', path, dash: true });
  const again = /** @type {any} */ (selectionView(s, 'fox', null));
  assert.deepEqual([...again.dashes.keys()], [...before.dashes.keys()]);
});

test('an enemy beside the fox: its bite targets and its dash tiles both show, each tap its own', () => {
  const s = board(ON, [{ id: 'saw-0', type: 'saw', cells: [[1, 0], [2, 0]] }]);
  const v = /** @type {any} */ (selectionView(s, 'fox', null));
  assert.equal(v.actionId, 'bite');
  assert.equal(v.targets.length, 1);
  assert.ok(v.dashes.size > 0);
  assert.equal(tapAction(v, [1, 0])?.kind, 'act');
  const end = [...v.dashes.values()][0].at(-1);
  assert.equal(/** @type {any} */ (tapAction(v, end))?.dash, true);
});

test('the focus panel lists 1 Bite and 2 Dash, and they can be chosen', () => {
  const s = board();
  const info = /** @type {any} */ (focusInfo(s, selectionView(s, 'fox', null)));
  assert.deepEqual(info.actions.map((/** @type {any} */ a) => [a.label, a.key]), [['Bite', '1'], ['Dash', '2']]);
  assert.equal(info.choosable, true);
  const dashing = /** @type {any} */ (focusInfo(s, selectionView(s, 'fox', DASH_ID)));
  assert.equal(dashing.hint, 'Dash: tap a tile to run to');
});

test('hovering a dash tile says what it costs, over a ghost of the run', () => {
  const s = board();
  const v = /** @type {any} */ (selectionView(s, 'fox', null));
  const end = [...v.dashes.values()][0].at(-1);
  const preview = /** @type {any} */ (dashPreview(s, v, end));
  assert.equal(preview.text, DASH_HOVER('Fox'));
  assert.equal(DASH_HOVER('Fox'), "Dash here: the fox can't bite this turn.");
  assert.deepEqual(preview.ghost.bands.find((/** @type {any} */ b) => b.id === 'fox').cells[0], end);
});

test('the board draws a dash tile in its own wash, with no outline', () => {
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), board(), { selected: 'fox', highlights: [], highlightKind: 'move', ghost: null, dashes: [[4, 1]] });
  const tiles = svg.findAll('data-highlight', 'dash');
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].attrs.stroke, undefined);
});

test('the log says the fox dashes', () => {
  const s = board();
  const n = applyMove(s, { kind: 'move', band: 'fox', path: [[1, 0], [2, 0], [3, 0], [4, 0]], dash: true });
  assert.deepEqual(describeEvents(n, n.events), ['Fox dashes']);
});

test('the unit card lists Dash under the rule, and only then', () => {
  const card = unitCard('fox', 2, { foxDash: true });
  assert.deepEqual(card.actions.map((a) => a.id), ['bite', 'dash']);
  assert.equal(card.actions[1].sentence, 'Runs up to 5 tiles instead of 3, but cannot bite that turn.');
  assert.deepEqual(unitCard('fox', 2).actions.map((a) => a.id), ['bite']);
  assert.deepEqual(unitCard('hedgehog', 2, { foxDash: true }).actions.map((a) => a.id), ['bite']);
});

test('key 2 chooses Dash, and pressing it again goes back to the usual view', () => {
  const s = board();
  assert.equal(numberChoice(selectionView(s, 'fox', null), 2), DASH_ID);
  assert.equal(numberChoice(selectionView(s, 'fox', DASH_ID), 2), DASH_ID, 'the repeat press toggles it off');
  // Key 1 on a Bite with nothing to bite does nothing.
  assert.equal(numberChoice(selectionView(s, 'fox', null), 1), null);
});

test('tapping the fox while Dash is chosen lets go of Dash', () => {
  const s = board();
  assert.equal(tapLetsGo(selectionView(s, 'fox', DASH_ID), 'fox'), true);
  assert.equal(tapLetsGo(selectionView(s, 'fox', null), 'fox'), false);
});
