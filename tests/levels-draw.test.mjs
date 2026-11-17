// Every level loads and draws on the battle screen (fake DOM): at the
// start of each turn of every recorded line, and at the win. The board
// has a tile per cell with its den feature, a head for every band, a
// plan line and strike mark for every bot that has a plan, and the goal
// line and den count match the level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { mountBattle } from '../js/ui/battle-view.js';
import { createBattle, applyMove } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { goalText } from '../js/ui/text.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

/** @param {import('../js/engine/types.js').Level} level */
function progressFor(level) {
  const p = valleyProgress();
  for (const [type, n] of Object.entries(level.assumes)) p.bands[type] = { maxLen: n };
  return p;
}

/**
 * Mounts the battle screen on `state` and checks what it draws.
 * @param {any} t
 * @param {import('../js/engine/types.js').Level} level
 * @param {import('../js/engine/types.js').BattleState} state
 * @param {string} where
 */
function checkDrawn(t, level, state, where) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level, state, onFinish() {}, onQuit() {},
  });
  t.mock.timers.reset();
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  assert.ok(svg, `${where}: the board is drawn`);

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = svg.querySelector(`[data-tile="${x},${y}"]`);
      assert.ok(tile, `${where}: tile ${x},${y}`);
      const kind = state.tiles[y][x].kind;
      if (kind === 'habitat' || kind === 'habitatDamaged') {
        const feature = svg.querySelector(`[data-tile="${x},${y}"] > [data-feature]`);
        assert.equal(feature.attrs['data-feature'], kind, `${where}: den at ${x},${y}`);
      }
    }
  }

  for (const band of state.bands) {
    if (band.cells.length === 0) continue;
    const head = svg.querySelector(`[data-band="${band.id}"] [data-head]`);
    assert.ok(head, `${where}: ${band.id} is drawn`);
    assert.equal(head.attrs['data-cell'], `${band.cells[0][0]},${band.cells[0][1]}`, `${where}: ${band.id} head`);
    if (band.side !== 'bots' || band.plan === null) continue;
    const plan = svg.querySelector(`[data-plan="${band.id}"]`);
    const draws = band.plan.path.length > 0 || band.plan.strike !== null;
    assert.equal(plan !== null, draws, `${where}: ${band.id} plan drawn when it walks or strikes`);
    if (band.plan.strike !== null) {
      const [x, y] = band.plan.strike;
      assert.ok(svg.querySelector(`[data-plan="${band.id}"] [data-strike="${x},${y}"]`), `${where}: ${band.id} strike mark`);
    }
  }

  const text = (cls) => root.all().find((n) => n.className === cls)?.text;
  assert.equal(text('battle-goal__text'), goalText(level), `${where}: goal line`);
  const dens = level.grid.join('').split('').filter((c) => c === 'H').length;
  const count = text('battle-goal__habitats');
  if (dens === 0) {
    assert.equal(count, '', `${where}: no den count`);
  } else {
    // The den icon, then the count.
    assert.match(count, new RegExp(`^ \\d+/${dens}$`), `${where}: den count`);
    const icon = root.all().find((n) => n.className === 'battle-goal__habitats').children[0];
    assert.equal(icon.getAttribute('alt'), 'Dens', `${where}: the den icon`);
  }
}

for (const level of LEVELS) {
  test(`${level.id}: every turn of every recorded line draws on the battle screen`, (t) => {
    const lines = [level.solution, ...(level.alternatives ?? [])];
    for (const [n, line] of lines.entries()) {
      let state = createBattle(level, line.deploy, progressFor(level));
      checkDrawn(t, level, state, `${level.id} line ${n} start`);
      for (const move of line.moves) {
        state = applyMove(state, move);
        if (move.kind === 'end') checkDrawn(t, level, state, `${level.id} line ${n} turn ${state.turn}`);
      }
      assert.equal(state.outcome, 'won');
      checkDrawn(t, level, state, `${level.id} line ${n} won`);
      const drawnPlans = state.bands.filter((b) => b.side === 'bots' && b.plan !== null
        && (b.plan.path.length > 0 || b.plan.strike !== null));
      assert.deepEqual(drawnPlans, [], 'a won battle has no plans to draw');
    }
  });
}
