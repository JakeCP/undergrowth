// A sting's line often lies over one of the player's own bands. On the
// mounted battle screen a tap on that band still picks it (play-feel spec:
// "tapping empty ground, or another band, closes it or switches the
// selection"); it does not sting it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBattle } from '../js/ui/battle-view.js';
import { LEVELS } from '../data/levels/index.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';

installFakeDom({ canvas: true });

/** Bees that have moved (so the lines show at once), with the ants down the east line. */
function overFriend() {
  return makeState(Array(8).fill('........'), [
    { id: 'bees', type: 'bees', cells: [[1, 1]], maxLen: 2, moved: true },
    { id: 'ants', type: 'ants', cells: [[3, 1], [4, 1]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 4]] },
    { id: 'harvester-1', type: 'harvester', cells: [[7, 7]] },
  ]);
}

function mount(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level: LEVELS.find((l) => l.id === 'l01'), state: overFriend(), onFinish() {}, onQuit() {},
  });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  return {
    svg,
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    undo: () => root.all().find((n) => n.tag === 'button' && n.textContent === 'Undo'),
    selected: () => svg.querySelector('[data-selected]'),
  };
}

test('tapping a friend on the sting line picks it, and nobody is stung', (t) => {
  const ui = mount(t);
  ui.tap(1, 1);
  assert.ok(ui.svg.findAll('data-line').some((n) => n.attrs['data-line'] === '3,1'), 'the east line lies over the ants');
  ui.tap(3, 1);
  assert.equal(ui.undo().disabled, true, 'nothing was done: there is nothing to undo');
  assert.ok(ui.svg.findAll('data-highlight', 'move').length > 0, 'the ants are picked: their move tiles show');
  assert.equal(ui.svg.findAll('data-line').length, 0, 'and the sting lines are gone');
  t.mock.timers.tick(5_000);
});

test('tapping a bot further down a line still stings along it', (t) => {
  const ui = mount(t);
  ui.tap(1, 1);
  ui.tap(1, 4);
  assert.equal(ui.undo().disabled, false, 'the sting was done');
  t.mock.timers.tick(5_000);
});
