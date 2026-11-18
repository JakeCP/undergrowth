// The earthworks trial rules on the battle screen: the new actions in the
// pop-up and the focus panel, what the log says, the cards, the board's
// drawing of earth banks and fords, and the animation of a falling bridge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { applyMove } from '../js/engine/battle.js';
import { selectionView } from '../js/ui/battle-view.js';
import { focusInfo } from '../js/ui/battle-focus.js';
import { renderBoard } from '../js/ui/board.js';
import { setBoardPieces } from '../js/ui/pieces.js';
import { describeEvents } from '../js/ui/text.js';
import { unitCard } from '../js/ui/unit-info.js';
import { animSteps } from '../js/ui/anim-steps.js';
import { soundForEvent } from '../js/ui/sound.js';
import { groundGrid } from '../js/ui/look.js';
import { makeState } from './helpers.mjs';

installFakeDom();
setBoardPieces({});

const RIVER = ['........', '~~====~~', '~~=~~~~~', '........'];

/**
 * @param {object[]} bands
 * @param {import('../js/engine/types.js').Rules} [rules]
 * @param {string[]} [grid]
 */
function board(bands, rules = { beaverGnaw: true }, grid = RIVER) {
  return makeState(grid, /** @type {any} */ (bands), { rules });
}

const beaver = { id: 'beaver', type: 'beaver', cells: [[2, 0], [1, 0], [0, 0]] };
const saw = { id: 'saw-0', type: 'saw', cells: [[4, 1], [4, 0]] };
const harvester = { id: 'harvester-1', type: 'harvester', cells: [[2, 3], [2, 2], [2, 1]] };

test('under beaverGnaw the beaver chooses between Build and Gnaw; without it, Build alone', () => {
  const s = board([beaver, saw]);
  const v = /** @type {any} */ (selectionView(s, 'beaver', null));
  assert.deepEqual(v.options.map((/** @type {any} */ o) => [o.id, o.label, o.enabled]), [['build', 'Build', false], ['gnaw', 'Gnaw', true]]);
  assert.equal(v.mode, 'menu');
  const info = /** @type {any} */ (focusInfo(s, v));
  assert.deepEqual(info.actions.map((/** @type {any} */ a) => [a.label, a.key]), [['Build', '1'], ['Gnaw', '2']]);
  const off = /** @type {any} */ (selectionView(board([beaver, saw], {}), 'beaver', null));
  assert.deepEqual(off.options.map((/** @type {any} */ o) => o.id), ['build']);
});

test('the Gnaw target says what falls, and badges the bot that drowns', () => {
  const s = board([beaver, saw]);
  const v = /** @type {any} */ (selectionView(s, 'beaver', 'gnaw'));
  assert.equal(v.targets.length, 1);
  const t = v.targets[0];
  assert.deepEqual(t.at, [2, 1]);
  assert.deepEqual(t.badges, ['water']);
  assert.match(t.text, /^Beaver gnaws through the bridge and it falls\. The dam gives way: Saw-drone is swept away/);
  // The whole bridge is marked, and the badge sits on the bot that drowns.
  assert.deepEqual(t.strikes.map((/** @type {any} */ st) => st.at.join(',')).sort(), ['2,1', '2,2', '3,1', '4,1', '5,1']);
  assert.deepEqual(t.strikes.find((/** @type {any} */ st) => st.at[0] === 4 && st.at[1] === 1).badges, ['water']);
  // A bridge is no line: no rule is drawn across it.
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, { selected: 'beaver', highlights: [], highlightKind: 'target', ghost: null, targets: v.targets });
  assert.equal(svg.findAll('data-highlight', 'line').length, 4);
  assert.equal(svg.findAll('data-line-rule').length, 0);
});

test('a shove at a stone marks the stone and where it lands, joined by the rule', () => {
  const s = board([{ id: 'bear', type: 'bear', cells: [[1, 1], [0, 1]] }], { bearShovesStones: true }, ['.S......', '..S.....', '.S......', '.~......']);
  const v = /** @type {any} */ (selectionView(s, 'bear', 'shove'));
  const east = v.targets.find((/** @type {any} */ t) => t.at[0] === 2 && t.at[1] === 1);
  assert.deepEqual(east.strikes.map((/** @type {any} */ st) => st.at), [[2, 1], [3, 1]]);
  assert.match(east.text, /^A stone is shoved/);
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, { selected: 'bear', highlights: [], highlightKind: 'target', ghost: null, targets: v.targets });
  assert.equal(svg.findAll('data-line-rule').length, 2);
});

test('the log: one line for the bridge, then who drowns and who is cut off', () => {
  const s = board([beaver, saw, harvester]);
  const after = applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] });
  assert.deepEqual(describeEvents(after, after.events), [
    'Beaver gnaws through the bridge and it falls',
    'The dam gives way: Saw-drone is swept away',
    'Harvester is cut off as the bridge falls and loses 2',
  ]);
});

test('the falling bridge crumbles and splashes on every tile, and the drowned bot falls in', () => {
  const s = board([beaver, saw]);
  const after = applyMove(s, { kind: 'act', band: 'beaver', action: 'gnaw', target: [2, 1] });
  const steps = animSteps(/** @type {any} */ (after.events), { tileKind: (at) => s.tiles[at[1]]?.[at[0]]?.kind });
  assert.equal(steps.filter((st) => st.kind === 'crumble').length, 5);
  assert.equal(steps.filter((st) => st.kind === 'splash').length, 5);
  const fall = steps.find((st) => st.kind === 'fall');
  assert.deepEqual(fall && [fall.band, fall.at], ['saw-0', [4, 1]]);
  const terrain = after.events.find((e) => e.kind === 'terrain');
  assert.equal(soundForEvent(/** @type {any} */ (terrain)), 'splash');
});

const YARD = ['.S......', '..S.....', '.S......', '.~......'];
const bear = { id: 'bear', type: 'bear', cells: [[1, 1], [0, 1]] };

test('the log for a shoved stone, onto ground and into water', () => {
  const s = board([bear], { bearShovesStones: true }, YARD);
  const rolled = applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [2, 1] });
  assert.deepEqual(describeEvents(rolled, rolled.events), ['A stone is shoved']);
  const ford = applyMove(s, { kind: 'act', band: 'bear', action: 'shove', target: [1, 2] });
  assert.deepEqual(describeEvents(ford, ford.events), ['A stone is shoved', 'The stone fills the water: a ford to walk on']);
  const steps = animSteps(/** @type {any} */ (ford.events));
  assert.ok(steps.some((st) => st.kind === 'splash' && st.at[0] === 1 && st.at[1] === 3));
});

test('the log for the badger filling a hole and digging away a bank', () => {
  const s = board([{ id: 'badger', type: 'badger', cells: [[1, 0], [0, 0]] }], { badgerEarthworks: true }, ['..B.....', '.o......']);
  const filled = applyMove(s, { kind: 'act', band: 'badger', action: 'fill', target: [1, 1] });
  assert.deepEqual(describeEvents(filled, filled.events), ['The hole is filled in']);
  const dug = applyMove(s, { kind: 'act', band: 'badger', action: 'dig', target: [2, 0] });
  assert.deepEqual(describeEvents(dug, dug.events), ['The earth bank is dug away']);
  const steps = animSteps(/** @type {any} */ (dug.events));
  assert.ok(steps.some((st) => st.kind === 'crumble'));
  assert.ok(steps.some((st) => st.kind === 'dirt'), 'the badger throws earth');
  const v = /** @type {any} */ (selectionView(s, 'badger', null));
  assert.deepEqual(v.options.map((/** @type {any} */ o) => o.id), ['dig', 'bite', 'fill']);
});

test('the cards say what the rules add, and only under them', () => {
  assert.deepEqual(unitCard('beaver', 3).actions.map((a) => a.id), ['build']);
  const beaverCard = unitCard('beaver', 3, { beaverGnaw: true });
  assert.deepEqual(beaverCard.actions.map((a) => a.id), ['build', 'gnaw']);
  assert.match(beaverCard.actions[1].sentence, /the whole bridge falls/);
  const badger = unitCard('badger', 3, { badgerEarthworks: true });
  assert.deepEqual(badger.actions.map((a) => a.id), ['dig', 'bite', 'fill']);
  assert.match(badger.actions[0].sentence, /levels an earth bank/);
  assert.match(badger.actions[2].sentence, /^Fills a hole next to it/);
  assert.doesNotMatch(unitCard('badger', 3).actions[0].sentence, /earth bank/);
  assert.match(unitCard('bear', 2, { bearShovesStones: true }).actions[1].sentence, /shoves stones too/);
  assert.doesNotMatch(unitCard('bear', 2).actions[1].sentence, /stones/);
});

test('the board draws an earth bank on grass and a ford over the water, with no outline', () => {
  const s = board([], {}, ['.B.F', '~~~~']);
  s.tiles[0][3] = { kind: 'ford', variant: null, under: 'hole' };
  s.tiles[1][1] = { kind: 'ford', variant: null, under: 'water' };
  const grounds = groundGrid(s);
  assert.equal(grounds[0][1], 'open');
  assert.equal(grounds[0][3], 'hole');
  assert.equal(grounds[1][1], 'water');
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, { selected: null, highlights: [], highlightKind: null, ghost: null });
  for (const [name, at] of [['earthbank', '1,0'], ['ford', '3,0'], ['ford', '1,1']]) {
    const tile = svg.children.find((c) => c.attrs['data-tile'] === at);
    const feature = tile?.children.find((c) => c.attrs['data-feature'] !== undefined);
    assert.equal(feature?.attrs['data-feature'], name, at);
    assert.ok((feature?.children.length ?? 0) > 3, `${at} draws something`);
    assert.ok(feature?.all().every((n) => n.attrs.stroke === undefined || n.attrs.fill === 'none'), `${at} has no outlined shape`);
  }
});
