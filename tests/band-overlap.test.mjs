// "The ant seems to be able to land on enemy band parts" (Jake's playtest
// of l03, The Dry Stone Wall). Two properties, checked on l03's recorded
// lines and on seeded random games branching off them:
//
// - the engine: after every applied move no two bands share a tile;
// - the screen: once the board has settled, every token drawn is a live
//   cell of its band, every live cell is drawn once, and no tile carries
//   tokens of two bands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { mountBattle, selectionView, tapAction } from '../js/ui/battle-view.js';
import { createBattle, applyMove, parseGrid } from '../js/engine/battle.js';
import { occupantAt, reachable } from '../js/engine/band.js';
import { actionTargets } from '../js/engine/actions.js';
import { actionsFor } from '../js/engine/units.js';
import { LEVELS } from '../data/levels/index.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

/** @typedef {import('../js/engine/types.js').BattleState} BattleState */
/** @typedef {import('../js/engine/types.js').Move} Move */

const L03 = /** @type {import('../js/engine/types.js').Level} */ (LEVELS.find((l) => l.id === 'l03'));

let seed = 4242;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
/** @template T @param {T[]} a @returns {T} */
const pick = (a) => a[Math.floor(rnd() * a.length)];

/** Every band's cells, as "x,y" -> band id; throws on a shared tile. */
function cellOwners(/** @type {BattleState} */ s, /** @type {string} */ ctx) {
  /** @type {Map<string, string>} */
  const owners = new Map();
  for (const band of s.bands) {
    for (const cell of band.cells) {
      const k = `${cell[0]},${cell[1]}`;
      assert.ok(!owners.has(k), `${ctx}: ${band.id} and ${owners.get(k)} share ${k}`);
      owners.set(k, band.id);
    }
  }
  return owners;
}

/** @param {BattleState} s @returns {Move[]} */
function legalMoves(s) {
  /** @type {Move[]} */
  const out = [{ kind: 'end' }];
  for (const b of s.bands) {
    if (b.side !== 'us' || b.trapped) continue;
    if (!b.moved && !b.acted) {
      for (const path of reachable(s, b.id).values()) out.push({ kind: 'move', band: b.id, path });
    }
    if (!b.acted) {
      for (const a of actionsFor(b.type, b.maxLen)) {
        for (const target of actionTargets(s, b.id, a.id)) out.push({ kind: 'act', band: b.id, action: a.id, target });
      }
    }
  }
  return out;
}

/** The rosters l03 is played with: its recorded lines and the shop's bands. */
function rosters() {
  const lines = [L03.solution, ...(L03.alternatives ?? [])];
  const { deployTiles } = parseGrid(L03.grid);
  /** @type {Array<{deploy: import('../js/engine/types.js').Deployment[], moves: Move[]}>} */
  const out = lines.map((line) => ({ deploy: line.deploy, moves: line.moves }));
  const extra = [['ants', 'fox', 'hedgehog'], ['ants', 'bees', 'badger'], ['bear', 'owl', 'ants'], ['beaver', 'bees', 'fox']];
  for (const types of extra) {
    out.push({ deploy: types.map((type, i) => ({ type, at: deployTiles[i] })), moves: [] });
  }
  return out;
}

function progressFor() {
  const p = valleyProgress();
  p.bands.ants = { maxLen: 4 };
  p.bands.bees = { maxLen: 2 };
  p.bands.bear = { maxLen: 2 };
  p.bands.owl = { maxLen: 1 };
  return p;
}

test('l03: no two bands ever share a tile, on the recorded lines and off them', () => {
  let checked = 0;
  for (const line of rosters()) {
    // Branch off every point of the line with a few random games.
    for (let at = 0; at <= line.moves.length; at += 1) {
      for (let game = 0; game < 6; game += 1) {
        let s = createBattle(L03, line.deploy, progressFor());
        cellOwners(s, 'start');
        for (const move of line.moves.slice(0, at)) {
          s = applyMove(s, move);
          cellOwners(s, `line move ${JSON.stringify(move)}`);
        }
        for (let n = 0; n < 40 && s.outcome === null; n += 1) {
          const moves = legalMoves(s);
          const move = rnd() < 0.15 ? moves[0] : pick(moves);
          s = applyMove(s, move);
          cellOwners(s, `random ${JSON.stringify(move)}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 1000, `${checked} moves checked`);
});

// --- the screen ---

/**
 * Mounts l03 and drives it by taps and button clicks only, with a mirror
 * state kept by applyMove alongside.
 */
function mountL03(t, deploy, botSpeed = 'normal') {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = /** @type {any} */ (globalThis.document);
  doc.activeElement = null;
  const root = new FakeEl('div');
  const state = createBattle(L03, deploy, progressFor());
  mountBattle(/** @type {any} */ (root), {
    level: L03, state, onFinish() {}, onQuit() {}, botSpeed,
  });
  const svg = root.all().find((n) => n.tag === 'svg' && n.parent !== null && n.parent.className === 'board-wrap');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  const popupButton = (label) => root.all().find((n) => n.tag === 'button' && n.parent !== null && n.parent.className === 'action-popup' && n.textContent.startsWith(label));
  const tap = (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' });
  const settle = () => t.mock.timers.tick(20000);
  return { root, svg, state, button, popupButton, tap, settle };
}

/**
 * The tokens on the board, by band: band id -> "x,y" of each token in
 * token order. Ghosts and effects are not band tokens.
 */
function drawnTokens(svg) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const g of svg.findAll('data-band')) {
    const cells = g.findAll('data-token').sort((a, b) => Number(a.attrs['data-token']) - Number(b.attrs['data-token']));
    out.set(g.attrs['data-band'], cells.map((c) => c.attrs['data-cell']));
  }
  return out;
}

function checkBoard(svg, /** @type {BattleState} */ s, ctx) {
  const drawn = drawnTokens(svg);
  /** @type {Map<string, string>} */
  const onTile = new Map();
  for (const [id, cells] of drawn) {
    for (const k of cells) {
      assert.ok(!onTile.has(k), `${ctx}: ${id} and ${onTile.get(k)} are both drawn on ${k}`);
      onTile.set(k, id);
    }
  }
  for (const band of s.bands) {
    assert.deepEqual(drawn.get(band.id), band.cells.map((c) => `${c[0]},${c[1]}`), `${ctx}: ${band.id} drawn as it stands`);
  }
  assert.equal(drawn.size, s.bands.length, `${ctx}: a band drawn that is not on the field`);
  assert.equal(svg.findAll('data-fx').length, 0, `${ctx}: an effect left on the board`);
}

/**
 * A tile no band stands on where a tap does nothing for `bandId`, with no
 * action chosen or any of its actions chosen: tapping it lets go of the band.
 * @returns {[number, number]|null}
 */
function neutralTile(/** @type {BattleState} */ s, /** @type {string} */ bandId) {
  const b = s.bands.find((x) => x.id === bandId);
  if (b === undefined) return null;
  const views = [null, ...actionsFor(b.type, b.maxLen).map((a) => a.id)]
    .map((a) => selectionView(s, bandId, a))
    .filter((v) => v !== null);
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      /** @type {[number, number]} */
      const p = [x, y];
      if (occupantAt(s, p) !== undefined) continue;
      if (views.every((v) => tapAction(v, p) === null)) return p;
    }
  }
  return null;
}

/**
 * Performs one move through the screen, as a player would.
 * @returns {boolean} false when the screen did not take it
 */
function playMove(ui, /** @type {BattleState} */ s, /** @type {Move} */ move) {
  if (move.kind === 'end') {
    ui.button('End turn').dispatch('click');
    if (ui.button('End turn? Tap again') !== undefined) ui.button('End turn').dispatch('click');
    return true;
  }
  const band = s.bands.find((b) => b.id === move.band);
  // Select the band afresh: tap empty ground first, then its head. The
  // head may be a tile the band selected now would act on (the aimed tile
  // of a sting stings a friend), so the ground is a tile where no move or
  // action of that band would happen, whichever action it has chosen.
  const head = band.cells[0];
  const selectedNow = ui.svg.find('data-selected');
  const selectedId = selectedNow === undefined ? null : selectedNow.parent.parent.attrs['data-band'];
  if (selectedId !== band.id) {
    if (selectedId !== null) {
      const ground = neutralTile(s, selectedId);
      if (ground !== null) ui.tap(ground[0], ground[1]);
    }
    ui.tap(head[0], head[1]);
  }
  if (move.kind === 'move') {
    const end = move.path[move.path.length - 1];
    // A chosen action hides the move tiles: let go of it first.
    const view = selectionView(s, band.id, null);
    if (view === null) return false;
    const chosen = view.mode === 'menu'
      ? ui.root.all().find((n) => n.tag === 'button' && n.attrs['aria-pressed'] === 'true')
      : undefined;
    if (chosen !== undefined) chosen.dispatch('click');
    ui.tap(end[0], end[1]);
    return true;
  }
  const view = selectionView(s, band.id, move.action);
  if (view === null) return false;
  if (view.mode === 'menu') {
    const label = view.options.find((o) => o.id === move.action).label;
    const btn = ui.popupButton(label);
    if (btn === undefined) return false;
    if (btn.attrs['aria-pressed'] !== 'true') btn.dispatch('click');
  }
  ui.tap(move.target[0], move.target[1]);
  return true;
}

test('l03 on screen: once settled, the board draws every band exactly where it stands', (t) => {
  let checked = 0;
  for (const line of rosters()) {
    for (let game = 0; game < 3; game += 1) {
      const ui = mountL03(t, line.deploy, /** @type {const} */ (['normal', 'fast', 'instant'])[game]);
      let s = ui.state;
      /** This turn's states, for Undo. @type {BattleState[]} */
      const turn = [];
      checkBoard(ui.svg, s, 'start');
      /** @type {Move[]} */
      const plan = [...line.moves];
      for (let n = 0; n < 45 && s.outcome === null; n += 1) {
        const scripted = plan.shift();
        const moves = legalMoves(s);
        // Keep to the recorded line for a while, then wander off it.
        const move = scripted !== undefined && rnd() < 0.8 ? scripted : rnd() < 0.15 ? moves[0] : pick(moves);
        if (turn.length > 0 && rnd() < 0.12) {
          // Undo, at once or after the animation has settled.
          if (rnd() < 0.5) ui.settle();
          ui.button('Undo').dispatch('click');
          ui.settle();
          s = /** @type {BattleState} */ (turn.pop());
          plan.length = 0;
          checkBoard(ui.svg, s, `undo ${n}`);
          continue;
        }
        const next = applyMove(s, move);
        if (!playMove(ui, s, move)) continue;
        // Sometimes the next tap comes mid-animation.
        if (rnd() < 0.7) ui.settle();
        else t.mock.timers.tick(60);
        if (move.kind === 'end') turn.length = 0;
        else turn.push(s);
        ui.settle();
        s = next;
        checkBoard(ui.svg, s, `${line.deploy.map((d) => d.type).join('+')} move ${n} ${JSON.stringify(move)}`);
        checked += 1;
        if (move !== scripted) plan.length = 0;
      }
      t.mock.timers.reset();
    }
  }
  assert.ok(checked > 100, `${checked} moves checked`);
});
