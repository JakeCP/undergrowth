// Play-feel logic (Group 1): target previews and outcome badges, the
// selection view that decides between "tap does it" and the action
// pop-up, what a tap means, and where the pop-up goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  outcomeBadges, previewTargets, badgeLegend, selectionView, selectionNote, tapAction,
  placePopup, resultMessage,
} from '../js/ui/battle-view.js';
import { applyMove } from '../js/engine/battle.js';
import { makeState } from './helpers.mjs';

/** @typedef {import('../js/engine/types.js').Pos} Pos */

/**
 * @param {Pos[]} list
 * @returns {string[]}
 */
function keys(list) {
  return list.map((p) => `${p[0]},${p[1]}`).sort();
}

// --- previewTargets and outcomeBadges ---

test('previewTargets: a bite that wipes the band out is badged "wipe"', () => {
  // A second bot stays on the field, so the bite does not also win.
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[2, 2]] },
  ]);
  const previews = previewTargets(s, 'ants', 'bite');
  assert.equal(previews.length, 1);
  assert.deepEqual(previews[0].at, [1, 0]);
  assert.deepEqual(previews[0].badges, ['wipe']);
  assert.equal(previews[0].text, 'Harvester loses 1 and is wiped out');
  assert.equal(previews[0].ghost.bands.some((b) => b.id === 'harvester-0'), false);
});

test('previewTargets: a bite that only hurts has no badge', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  const previews = previewTargets(s, 'ants', 'bite');
  assert.deepEqual(previews.map((p) => p.badges), [[]]);
  assert.equal(previews[0].text, 'Harvester loses 1');
});

test('previewTargets: the ghost is exactly what applyMove gives, and the state is untouched', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  const before = structuredClone(s);
  const previews = previewTargets(s, 'ants', 'bite');
  assert.deepEqual(s, before);
  assert.deepEqual(
    previews[0].ghost,
    applyMove(s, { kind: 'act', band: 'ants', action: 'bite', target: [1, 0] }),
  );
});

test('previewTargets: one preview per legal target, in the engine order', () => {
  // A bot in the corner, so the field is not clear and nothing is won.
  const s = makeState(['...', '...', '...'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]] },
  ]);
  const previews = previewTargets(s, 'badger', 'dig');
  assert.deepEqual(previews.map((p) => p.at), [[1, 0], [2, 1], [1, 2], [0, 1]]);
  assert.deepEqual(previews.map((p) => p.badges), [[], [], [], []]);
  assert.equal(previews[0].text, 'A hole is dug');
});

test('previewTargets: unknown band or action gives no previews', () => {
  const s = makeState(['...'], [{ id: 'ants', type: 'ants', cells: [[0, 0]] }]);
  assert.deepEqual(previewTargets(s, 'nobody', 'bite'), []);
  assert.deepEqual(previewTargets(s, 'ants', 'dig'), []);
});

test('badges: a shove into water is "water", into a hole is "hole"', () => {
  const water = makeState(['..~', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  assert.deepEqual(previewTargets(water, 'bear', 'shove')[0].badges, ['water']);

  const hole = makeState(['..o', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  assert.deepEqual(previewTargets(hole, 'bear', 'shove')[0].badges, ['hole']);
});

test('badges: a ram with no damage still shows the fall', () => {
  const s = makeState(['..~'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 6 },
    { id: 'saw-0', type: 'saw', cells: [[1, 0]] },
  ]);
  assert.deepEqual(previewTargets(s, 'ants', 'ram')[0].badges, ['water']);
});

test('badges: a push that is blocked is "bump" (stones, the edge, another bot)', () => {
  const stones = makeState(['..S', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1], [0, 1]] },
  ]);
  assert.deepEqual(previewTargets(stones, 'bear', 'shove')[0].badges, ['bump']);

  const edge = makeState(['..', '..'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1], [0, 1]] },
  ]);
  assert.deepEqual(previewTargets(edge, 'bear', 'shove')[0].badges, ['bump']);

  const bot = makeState(['...', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1], [0, 1]] },
    { id: 'saw-1', type: 'saw', cells: [[2, 0], [2, 1]] },
  ]);
  assert.deepEqual(previewTargets(bot, 'bear', 'shove')[0].badges, ['bump']);
});

test('badges: a bump that finishes the band off is "wipe"', () => {
  const s = makeState(['..S', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1]] },
  ]);
  assert.deepEqual(previewTargets(s, 'bear', 'shove')[0].badges, ['wipe']);
});

test('badges: a plain push that just moves the band has no badge', () => {
  const s = makeState(['...', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1], [0, 1]] },
  ]);
  assert.deepEqual(previewTargets(s, 'bear', 'shove')[0].badges, []);
});

test('badges: hurting one of your own bands adds "own"', () => {
  const bump = makeState(['...', '...'], [
    { id: 'bear', type: 'bear', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [1, 1], [0, 1]] },
    { id: 'ants', type: 'ants', cells: [[2, 0], [2, 1]] },
  ]);
  assert.deepEqual(previewTargets(bump, 'bear', 'shove')[0].badges, ['bump', 'own']);

  const sting = makeState(['....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'badger', type: 'badger', cells: [[2, 0], [3, 0]] },
  ]);
  assert.deepEqual(previewTargets(sting, 'bees', 'sting')[0].badges, ['wipe', 'own']);

  const onlyOwn = makeState(['....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]] },
    { id: 'badger', type: 'badger', cells: [[1, 0], [2, 0]] },
  ]);
  assert.deepEqual(previewTargets(onlyOwn, 'bees', 'sting')[0].badges, ['own']);
});

test('outcomeBadges: event kinds it does not know are ignored', () => {
  const s = makeState(['...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0]] },
  ]);
  const after = applyMove(s, { kind: 'act', band: 'ants', action: 'bite', target: [1, 0] });
  const padded = /** @type {any} */ ({
    ...after,
    events: [
      { kind: 'action', actor: 'ants', actionId: 'bite', from: [0, 0], target: [1, 0] },
      ...after.events,
      { kind: 'plan', band: 'harvester-0', plan: null },
    ],
  });
  assert.deepEqual(outcomeBadges(s, padded), []);
});

test('badgeLegend: names each badge on show once, in a fixed order', () => {
  const s = makeState(['....', '....', '....'], [
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [0, 0]] },
    { id: 'saw-1', type: 'saw', cells: [[2, 1], [2, 0], [3, 0]] },
    { id: 'ants', type: 'ants', cells: [[3, 1], [3, 2]] },
  ]);
  // Shove north: off the board edge, a bump that finishes the harvester.
  // Shove east: the saw bumps into the ants and hurts them.
  const previews = previewTargets(s, 'bear', 'shove');
  assert.deepEqual(previews.map((p) => p.badges), [['wipe'], ['bump', 'own']]);
  assert.deepEqual(badgeLegend(previews), [
    { icon: 'wipe', text: 'wiped out' },
    { icon: 'bump', text: 'bumps' },
    { icon: 'own', text: 'hurts your own band' },
  ]);
  assert.deepEqual(badgeLegend([]), []);
  assert.deepEqual(badgeLegend(previewTargets(s, 'bear', 'maul')), [{ icon: 'wipe', text: 'wiped out' }]);
});

// --- selectionView ---

test('selectionView: a one-action band shows moves and targets together', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0]] },
  ]);
  const view = selectionView(s, 'ants', null);
  assert.ok(view);
  assert.equal(view.mode, 'direct');
  assert.equal(view.popup, false);
  assert.equal(view.actionId, 'bite');
  assert.deepEqual(view.targets.map((t) => t.at), [[1, 0]]);
  assert.ok(view.moves.size > 0);
  assert.equal(view.moves.has('1,0'), false);
});

test('selectionView: beaver and owl are one-action bands too', () => {
  const beaver = selectionView(makeState(['.~.', '...'], [
    { id: 'beaver', type: 'beaver', cells: [[0, 0]] },
  ]), 'beaver', null);
  assert.ok(beaver);
  assert.equal(beaver.mode, 'direct');
  assert.deepEqual(beaver.targets.map((t) => t.at), [[1, 0]]);
  assert.equal(beaver.moves.has('1,0'), false);

  const owl = selectionView(makeState(['....', '....'], [
    { id: 'owl', type: 'owl', cells: [[0, 0]] },
    { id: 'saw-0', type: 'saw', cells: [[3, 0], [3, 1]] },
  ]), 'owl', null);
  assert.ok(owl);
  assert.equal(owl.mode, 'direct');
  assert.equal(owl.actionId, 'strike');
  assert.deepEqual(owl.targets.map((t) => t.at), [[3, 0]]);
});

test('selectionView: one action whose target is also a move tile needs the pop-up', () => {
  // A sting can aim at empty ground the bees could also walk to.
  const s = makeState(['...', '...', '...'], [
    { id: 'bees', type: 'bees', cells: [[1, 1]] },
  ]);
  const view = selectionView(s, 'bees', null);
  assert.ok(view);
  assert.equal(view.mode, 'menu');
  assert.equal(view.popup, true);
  assert.deepEqual(view.options, [{ id: 'sting', label: 'Sting', enabled: true, chosen: false }]);
  assert.equal(view.actionId, null);
  assert.deepEqual(view.targets, []);
  assert.ok(view.moves.size > 0);
});

test('selectionView: the same band once it has moved has no overlap, so no pop-up', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'bees', type: 'bees', cells: [[1, 1]], moved: true },
  ]);
  const view = selectionView(s, 'bees', null);
  assert.ok(view);
  assert.equal(view.mode, 'direct');
  assert.equal(view.popup, false);
  assert.equal(view.moves.size, 0);
  assert.equal(view.targets.length, 4);
});

test('selectionView: a band with two actions gets the pop-up', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
  ]);
  const view = selectionView(s, 'badger', null);
  assert.ok(view);
  assert.equal(view.mode, 'menu');
  assert.equal(view.popup, true);
  assert.deepEqual(view.options, [
    { id: 'dig', label: 'Dig', enabled: true, chosen: false },
    { id: 'bite', label: 'Bite', enabled: false, chosen: false },
  ]);
  assert.equal(view.actionId, null);
  assert.deepEqual(view.targets, []);
  assert.equal(view.moves.size > 0, true);
});

test('selectionView: Ant Colony must choose between bite and ram', () => {
  const s = makeState(['...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 6 },
    { id: 'saw-0', type: 'saw', cells: [[1, 0], [1, 1]] },
  ]);
  const view = selectionView(s, 'ants', null);
  assert.ok(view);
  assert.equal(view.mode, 'menu');
  assert.deepEqual(view.options.map((o) => o.id), ['bite', 'ram']);
  assert.equal(view.popup, true);
});

test('selectionView: no pop-up while no action has a target', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'bear', type: 'bear', cells: [[1, 1]] },
  ]);
  const view = selectionView(s, 'bear', null);
  assert.ok(view);
  assert.equal(view.mode, 'menu');
  assert.equal(view.popup, false);
  assert.deepEqual(view.options.map((o) => o.enabled), [false, false]);
  assert.ok(view.moves.size > 0);
});

test('selectionView: choosing an action swaps the move tiles for its targets', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1], [2, 2]] },
  ]);
  const dig = selectionView(s, 'badger', 'dig');
  assert.ok(dig);
  assert.equal(dig.actionId, 'dig');
  assert.equal(dig.moves.size, 0);
  assert.deepEqual(keys(dig.targets.map((t) => t.at)), ['0,1', '1,0', '1,2']);
  assert.deepEqual(dig.options.map((o) => o.chosen), [true, false]);

  const bite = selectionView(s, 'badger', 'bite');
  assert.ok(bite);
  assert.deepEqual(bite.targets.map((t) => t.at), [[2, 1]]);
  assert.deepEqual(bite.options.map((o) => o.chosen), [false, true]);
});

test('selectionView: an action that is unknown or has no targets cannot be chosen', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
  ]);
  for (const chosen of ['bite', 'maul']) {
    const view = selectionView(s, 'badger', chosen);
    assert.ok(view);
    assert.equal(view.actionId, null);
    assert.ok(view.moves.size > 0);
    assert.deepEqual(view.targets, []);
  }
});

test('selectionView: avoid lists every target the pop-up offers, reach every move tile', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 1], [2, 2]] },
  ]);
  const idle = selectionView(s, 'badger', null);
  const chosen = selectionView(s, 'badger', 'bite');
  assert.ok(idle);
  assert.ok(chosen);
  assert.deepEqual(keys(idle.avoid), ['0,1', '1,0', '1,2', '2,1']);
  assert.deepEqual(keys(chosen.avoid), keys(idle.avoid));
  assert.deepEqual(keys(idle.reach), keys([...idle.moves.values()].map((p) => p[p.length - 1])));
  // The pop-up must not jump when an action is chosen, so reach stays.
  assert.deepEqual(keys(chosen.reach), keys(idle.reach));
});

test('selectionView: nothing for bots, trapped or acted bands, strangers, or a finished battle', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], acted: true },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 2]], trapped: true },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1]] },
  ]);
  assert.equal(selectionView(s, 'ants', null), null);
  assert.equal(selectionView(s, 'trapped-bear', null), null);
  assert.equal(selectionView(s, 'harvester-0', null), null);
  assert.equal(selectionView(s, 'nobody', null), null);

  const won = makeState(['...'], [{ id: 'ants', type: 'ants', cells: [[0, 0]] }], { outcome: 'won' });
  assert.equal(selectionView(won, 'ants', null), null);
});

// --- tapAction ---

test('tapAction: on a one-action band a tap on a target acts and a tap on a move tile moves', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0]] },
  ]);
  const view = selectionView(s, 'ants', null);
  assert.ok(view);
  assert.deepEqual(tapAction(view, [1, 0]), {
    kind: 'act', band: 'ants', action: 'bite', target: [1, 0],
  });
  assert.deepEqual(tapAction(view, [0, 2]), {
    kind: 'move', band: 'ants', path: [[0, 1], [0, 2]],
  });
  assert.equal(tapAction(view, [2, 2]), null);
  assert.equal(tapAction(view, [0, 0]), null);
});

test('tapAction: every move it returns is accepted by the engine', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0]] },
  ]);
  const view = selectionView(s, 'ants', null);
  assert.ok(view);
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      const move = tapAction(view, [x, y]);
      if (move !== null) assert.doesNotThrow(() => applyMove(s, move));
    }
  }
});

test('tapAction: with the pop-up open a shared tile moves until an action is chosen', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'badger', type: 'badger', cells: [[1, 1]] },
  ]);
  const idle = selectionView(s, 'badger', null);
  assert.ok(idle);
  assert.deepEqual(tapAction(idle, [1, 0]), { kind: 'move', band: 'badger', path: [[1, 0]] });

  const dig = selectionView(s, 'badger', 'dig');
  assert.ok(dig);
  assert.deepEqual(tapAction(dig, [1, 0]), {
    kind: 'act', band: 'badger', action: 'dig', target: [1, 0],
  });
  // Not a dig target, and move tiles are off while an action is chosen.
  assert.equal(tapAction(dig, [0, 0]), null);
});

// --- selectionNote ---

test('selectionNote: says who is selected, and what a tap on a target will do', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0], [0, 1]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0]] },
    { id: 'badger', type: 'badger', cells: [[2, 2]] },
  ]);
  const ants = selectionView(s, 'ants', null);
  assert.ok(ants);
  assert.equal(selectionNote(s, ants), 'Ants 2/4. Bite: tap a target');

  const badger = selectionView(s, 'badger', null);
  assert.ok(badger);
  assert.equal(selectionNote(s, badger), 'Badger 1/1');
  const digging = selectionView(s, 'badger', 'dig');
  assert.ok(digging);
  assert.equal(selectionNote(s, digging), 'Dig: tap a target');
});

test('selectionNote: a one-action band with nothing in reach is just named, by its tier', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'beaver', type: 'beaver', cells: [[1, 1]], maxLen: 3 },
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 6 },
  ]);
  const beaver = selectionView(s, 'beaver', null);
  assert.ok(beaver);
  assert.equal(selectionNote(s, beaver), 'Beaver 1/3');
  const colony = selectionView(s, 'ants', null);
  assert.ok(colony);
  assert.equal(selectionNote(s, colony), 'Ant Colony 1/6');
});

// --- placePopup ---

/**
 * @param {{x: number, y: number}} rect
 * @param {number} w
 * @param {number} h
 * @param {Pos} tile
 * @returns {boolean}
 */
function covers(rect, w, h, tile) {
  const eps = 1e-6;
  return rect.x < tile[0] + 1 - eps && rect.x + w > tile[0] + eps
    && rect.y < tile[1] + 1 - eps && rect.y + h > tile[1] + eps;
}

test('placePopup: with nothing in the way it sits centred above the head', () => {
  const p = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [], moves: [], w: 3, h: 1 });
  assert.equal(p.outside, false);
  assert.equal(p.side, 'N');
  assert.ok(Math.abs(p.x - 3) < 1e-9);
  assert.ok(p.y + 1 <= 4);
  assert.ok(p.y > 2.5);
});

test('placePopup: the arrow points at the head when the head is alongside', () => {
  const above = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [], moves: [], w: 3, h: 1 });
  assert.equal(above.side, 'N');
  assert.ok(above.arrow !== null && Math.abs(above.arrow - 1.5) < 1e-9);

  // Slid back onto the board at the left edge: the arrow follows the head.
  const edge = placePopup({ cols: 8, rows: 8, head: [0, 4], avoid: [], moves: [], w: 3, h: 1 });
  assert.equal(edge.side, 'N');
  assert.equal(edge.x, 0);
  assert.ok(edge.arrow !== null && Math.abs(edge.arrow - 0.5) < 1e-9);

  // In a corner the head is not alongside the pop-up, so no arrow.
  /** @type {Pos[]} */
  const avoid = [[4, 3], [5, 4], [4, 5], [3, 4]];
  const corner = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid, moves: [], w: 3, h: 1.4 });
  assert.equal(corner.arrow, null);

  const beside = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [[4, 3]], moves: [], w: 3, h: 1 });
  assert.equal(beside.side, 'E');
  assert.ok(beside.arrow !== null && Math.abs(beside.arrow - 0.5) < 1e-9);
});

test('placePopup: flips to another side when a target is in the way', () => {
  const p = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [[4, 3]], moves: [], w: 3, h: 1 });
  assert.equal(p.outside, false);
  assert.equal(p.side, 'E');
  assert.ok(p.x >= 5);
  assert.equal(covers(p, 3, 1, [4, 3]), false);
});

test('placePopup: with targets on all four sides it tucks into a corner', () => {
  /** @type {Pos[]} */
  const avoid = [[4, 3], [5, 4], [4, 5], [3, 4]];
  const p = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid, moves: [], w: 3, h: 1.4 });
  assert.equal(p.outside, false);
  for (const tile of [...avoid, /** @type {Pos} */ ([4, 4])]) {
    assert.equal(covers(p, 3, 1.4, tile), false);
  }
});

test('placePopup: among the sides that fit it covers the fewest move tiles', () => {
  // Everything above and beside the head is a move tile; below is clear.
  /** @type {Pos[]} */
  const moves = [];
  for (let y = 0; y <= 4; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (!(x === 4 && y === 4)) moves.push([x, y]);
    }
  }
  const p = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [], moves, w: 3, h: 1 });
  assert.equal(p.side, 'S');
  assert.ok(p.y >= 5);
  assert.equal(moves.some((tile) => covers(p, 3, 1, tile)), false);
});

test('placePopup: at the top edge it does not go above', () => {
  const p = placePopup({ cols: 8, rows: 8, head: [0, 0], avoid: [], moves: [], w: 3, h: 1 });
  assert.equal(p.outside, false);
  assert.notEqual(p.side, 'N');
  assert.ok(p.x >= 0 && p.y >= 0);
  assert.equal(covers(p, 3, 1, [0, 0]), false);
});

test('placePopup: wherever the band is, a fitting pop-up stays on the board and off the head and targets', () => {
  for (const [w, h] of [[3.7, 1.5], [2, 1.2], [1.8, 2.7]]) {
    for (let hy = 0; hy < 8; hy += 1) {
      for (let hx = 0; hx < 8; hx += 1) {
        /** @type {Pos} */
        const head = [hx, hy];
        /** @type {Pos[]} */
        const avoid = [];
        for (let d = 1; d <= 3; d += 1) {
          for (const [dx, dy] of [[0, -d], [d, 0], [0, d], [-d, 0]]) {
            const x = hx + dx;
            const y = hy + dy;
            if (x >= 0 && x < 8 && y >= 0 && y < 8) avoid.push([x, y]);
          }
        }
        const p = placePopup({ cols: 8, rows: 8, head, avoid, moves: [], w, h });
        if (p.outside) continue;
        const where = `head ${hx},${hy} size ${w}x${h}`;
        assert.ok(p.x >= -1e-9 && p.x + w <= 8 + 1e-9, `on the board across: ${where}`);
        assert.ok(p.y >= -1e-9 && p.y + h <= 8 + 1e-9, `on the board down: ${where}`);
        assert.equal(covers(p, w, h, head), false, `off the head: ${where}`);
        for (const tile of avoid) {
          assert.equal(covers(p, w, h, tile), false, `off target ${tile}: ${where}`);
        }
      }
    }
  }
});

test('placePopup: an ordinary pop-up always finds a side on an 8 by 8 board', () => {
  for (let hy = 0; hy < 8; hy += 1) {
    for (let hx = 0; hx < 8; hx += 1) {
      /** @type {Pos[]} */
      const avoid = [];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const x = hx + dx;
        const y = hy + dy;
        if (x >= 0 && x < 8 && y >= 0 && y < 8) avoid.push([x, y]);
      }
      const p = placePopup({ cols: 8, rows: 8, head: [hx, hy], avoid, moves: [], w: 3.7, h: 1.5 });
      assert.equal(p.outside, false, `head ${hx},${hy}`);
    }
  }
});

test('placePopup: when no side fits it goes outside the board edge nearest the band', () => {
  const top = placePopup({ cols: 3, rows: 3, head: [1, 0], avoid: [], moves: [], w: 2.5, h: 2.5 });
  assert.equal(top.outside, true);
  assert.equal(top.side, 'N');
  assert.ok(top.y + 2.5 <= 0);
  assert.ok(top.x >= 0 && top.x + 2.5 <= 3);

  const bottom = placePopup({ cols: 3, rows: 3, head: [2, 2], avoid: [], moves: [], w: 2.5, h: 2.5 });
  assert.equal(bottom.outside, true);
  assert.equal(bottom.side, 'S');
  assert.ok(bottom.y >= 3);
  assert.ok(bottom.x >= 0 && bottom.x + 2.5 <= 3);
});

test('placePopup: a pop-up wider than the board is centred on it', () => {
  const p = placePopup({ cols: 3, rows: 3, head: [0, 0], avoid: [], moves: [], w: 4, h: 1 });
  assert.equal(p.outside, true);
  assert.ok(Math.abs(p.x - -0.5) < 1e-9);
});

test('placePopup: it never sits over a tile the band could move to', () => {
  // The reported case: a band next to a bot, move tiles all round it.
  /** @type {Pos[]} */
  const moves = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const d = Math.abs(x - 3) + Math.abs(y - 4);
      if (d > 0 && d <= 2 && !(x === 4 && y === 4)) moves.push([x, y]);
    }
  }
  const p = placePopup({ cols: 8, rows: 8, head: [3, 4], avoid: [[4, 4]], moves, w: 2.6, h: 1.2 });
  if (!p.outside) {
    for (const tile of [...moves, /** @type {Pos} */ ([4, 4]), /** @type {Pos} */ ([3, 4])]) {
      assert.equal(covers(p, 2.6, 1.2, tile), false, `covers ${tile}`);
    }
  }
});

test('placePopup: with move tiles everywhere near the band it goes off the board', () => {
  /** @type {Pos[]} */
  const moves = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (!(x === 4 && y === 4)) moves.push([x, y]);
    }
  }
  const p = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [], moves, w: 3, h: 1 });
  assert.equal(p.outside, true);
});

test('placePopup: when the usual places are taken it finds a clear spot near the head', () => {
  // A ring of move tiles one step out leaves the eight usual places
  // covered, but there is clear ground two steps out.
  /** @type {Pos[]} */
  const moves = [[4, 3], [5, 4], [4, 5], [3, 4], [3, 3], [5, 3], [3, 5], [5, 5]];
  const p = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [], moves, w: 2, h: 1 });
  assert.equal(p.outside, false);
  for (const tile of [...moves, /** @type {Pos} */ ([4, 4])]) assert.equal(covers(p, 2, 1, tile), false, `covers ${tile}`);
  const apart = Math.max(0, p.y - 5, 4 - (p.y + 1), p.x - 5, 4 - (p.x + 2));
  assert.ok(apart <= 1.5, 'stays near the band');
});

test('placePopup: among places that fit it prefers to leave other bands uncovered', () => {
  const plain = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [], moves: [], w: 3, h: 1 });
  assert.equal(plain.side, 'N');
  const p = placePopup({ cols: 8, rows: 8, head: [4, 4], avoid: [], moves: [], soft: [[4, 3]], w: 3, h: 1 });
  assert.equal(covers(p, 3, 1, [4, 3]), false);
});

test('placePopup: a random field never puts it over the head, a target or a move tile', () => {
  let seed = 99;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let onBoard = 0;
  for (let n = 0; n < 400; n += 1) {
    /** @type {Pos} */
    const head = [Math.floor(rnd() * 8), Math.floor(rnd() * 8)];
    /** @type {Pos[]} */
    const avoid = [];
    /** @type {Pos[]} */
    const moves = [];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if (x === head[0] && y === head[1]) continue;
        const r = rnd();
        if (r < 0.08) avoid.push([x, y]);
        else if (r < 0.3) moves.push([x, y]);
      }
    }
    const w = 1.5 + rnd() * 2;
    const h = 1 + rnd() * 0.6;
    const p = placePopup({ cols: 8, rows: 8, head, avoid, moves, w, h });
    if (p.outside) continue;
    onBoard += 1;
    assert.ok(p.x >= -1e-9 && p.x + w <= 8 + 1e-9 && p.y >= -1e-9 && p.y + h <= 8 + 1e-9);
    for (const tile of [head, ...avoid, ...moves]) assert.equal(covers(p, w, h, tile), false, `case ${n}: covers ${tile}`);
  }
  assert.ok(onBoard > 50, `${onBoard} placed on the board`);
});

// --- resultMessage ---

test('resultMessage: the sentences for the move, repeats merged', () => {
  const s = makeState(['....'], [
    { id: 'bees', type: 'bees', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'saw-1', type: 'saw', cells: [[2, 0], [3, 0]] },
  ]);
  const next = applyMove(s, { kind: 'act', band: 'bees', action: 'sting', target: [1, 0] });
  assert.equal(resultMessage(next), 'Harvester loses 1 and is wiped out. Saw-drone loses 1');
});

test('resultMessage: empty for a plain move, and it ends with the verdict when the battle is over', () => {
  // A bot out at the far end, so a plain move does not clear the field.
  const s = makeState(['..P..', '.....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[4, 1]] },
  ]);
  const stepped = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0]] });
  assert.equal(resultMessage(stepped), '');

  const captured = applyMove(s, { kind: 'move', band: 'ants', path: [[1, 0], [2, 0]] });
  assert.equal(captured.outcome, 'won');
  assert.equal(resultMessage(captured), 'The permit is captured. You won');

  const lost = /** @type {import('../js/engine/types.js').BattleState} */ ({
    ...stepped, outcome: 'lost', events: [],
  });
  assert.equal(resultMessage(lost), 'You lost');
});
