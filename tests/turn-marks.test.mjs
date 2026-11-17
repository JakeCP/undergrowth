// The marks for what each band has left this turn, on the board and on
// the battle screen (play-feel spec, "Changed after Jake's playtest"; the
// look is in the look-and-motion spec): a bright ring for ready, a
// lighter mark for "can still act", a dimmed head for done; End turn asks
// only when a band has done nothing, and looks ready when all are done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { renderBoard } from '../js/ui/board.js';
import { mountBattle } from '../js/ui/battle-view.js';
import { renderDeploy } from '../js/ui/deploy-view.js';
import { createBattle, applyMove } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { BOT_TURN_BUDGET_MS } from '../js/ui/anim-steps.js';
import { makeState, valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const NO_VIEW = { selected: null, highlights: [], highlightKind: null, ghost: null };

/** @param {import('../js/engine/types.js').BattleState} state @param {object} [view] */
function draw(state, view = NO_VIEW) {
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), state, /** @type {any} */ (view));
  return svg;
}

/** @param {FakeEl} svg @param {string} id */
function band(svg, id) {
  return svg.querySelector(`[data-band="${id}"]`);
}

function marksBoard() {
  return makeState(['....', '....', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 4 },
    { id: 'badger', type: 'badger', cells: [[1, 1], [1, 2]], maxLen: 3, moved: true },
    { id: 'beaver', type: 'beaver', cells: [[3, 0]], maxLen: 3, moved: true },
    { id: 'trapped-bear', type: 'bear', cells: [[3, 2]], trapped: true },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 2]], plan: { path: [], strike: null, actionId: null } },
  ]);
}

test('each band of the player carries its turn state; bots and trapped bands carry none', () => {
  const svg = draw(marksBoard());
  assert.equal(band(svg, 'ants').attrs['data-turn'], 'ready');
  assert.equal(band(svg, 'badger').attrs['data-turn'], 'canAct');
  assert.equal(band(svg, 'beaver').attrs['data-turn'], 'done');
  assert.equal(band(svg, 'trapped-bear').attrs['data-turn'], undefined);
  assert.equal(band(svg, 'harvester-0').attrs['data-turn'], undefined);
});

test('ready is a bright ring round the head, can-still-act a lighter one, done a dimmed head', () => {
  const svg = draw(marksBoard());
  const ready = svg.querySelectorAll('[data-mark="ready"]');
  const canAct = svg.querySelectorAll('[data-mark="canAct"]');
  const done = svg.querySelectorAll('[data-mark="done"]');
  assert.equal(ready.length, 1);
  assert.equal(canAct.length, 1);
  assert.equal(done.length, 1);
  // Each mark is inside its own band's head, so it moves with the head.
  const headOf = (id) => band(svg, id).children.find((c) => c.attrs['data-head'] === 'true');
  assert.ok(headOf('ants').all().includes(ready[0]));
  assert.ok(headOf('badger').all().includes(canAct[0]));
  assert.ok(headOf('beaver').all().includes(done[0]));
  // The ready ring is a ring (no fill) and the can-act mark is clearly
  // less: a hairline, under half as wide. Neither is dashed: the dashed
  // ring is the trapped band's.
  const ring = ready[0].children[ready[0].children.length - 1];
  const light = canAct[0].children[canAct[0].children.length - 1];
  assert.equal(ring.attrs.fill, 'none');
  assert.equal(light.attrs.fill, 'none');
  assert.ok(Number(light.attrs['stroke-width']) * 2 <= Number(ring.attrs['stroke-width']));
  for (const node of [...ready[0].children, ...canAct[0].children]) {
    assert.equal(node.attrs['stroke-dasharray'], undefined, 'not dashed');
  }
  const trapped = band(svg, 'trapped-bear').all().filter((n) => n.attrs['stroke-dasharray'] !== undefined);
  assert.equal(trapped.length, 1, 'the trapped band keeps the only dashed ring');
});

test('the marks never hide the length badge or the selection, and add no filter or transform', () => {
  const s = marksBoard();
  for (const id of ['ants', 'badger', 'beaver']) {
    const svg = draw(s, { ...NO_VIEW, selected: id });
    const head = band(svg, id).children.find((c) => c.attrs['data-head'] === 'true');
    const order = head.children;
    const mark = order.findIndex((c) => c.attrs['data-mark'] !== undefined);
    const badge = order.findIndex((c) => c.attrs['data-length'] !== undefined);
    const selected = order.findIndex((c) => c.attrs['data-selected'] !== undefined);
    assert.ok(mark >= 0 && badge >= 0 && selected >= 0, id);
    assert.ok(badge > mark, `${id}: the length badge is drawn over the mark`);
    const node = order[mark];
    for (const n of [node, ...node.all()]) {
      assert.equal(n.attrs.filter, undefined);
      assert.equal(n.attrs.transform, undefined);
    }
    if (order[mark].attrs['data-mark'] === 'done') {
      // The dimming covers the disc and the glyph only.
      const disc = order.findIndex((c) => c.attrs['data-disc'] !== undefined);
      const glyph = order.findIndex((c) => c.attrs['data-glyph'] !== undefined);
      assert.ok(mark > disc && mark > glyph, 'over the disc and the glyph');
    } else {
      assert.ok(selected > mark, `${id}: the selection ring is drawn over the mark`);
    }
  }
});

test('a finished battle, the hover ghost and the deploy screen show no turn marks', () => {
  const s = marksBoard();
  const over = draw({ ...s, outcome: 'won' });
  assert.equal(over.querySelectorAll('[data-mark]').length, 0);

  const ghostState = structuredClone(s);
  ghostState.bands[0].cells = [[0, 1]];
  const hover = draw(s, { ...NO_VIEW, ghost: ghostState });
  const ghost = hover.querySelector('[data-ghost-band="ants"]');
  assert.ok(ghost, 'the ghost is drawn');
  assert.equal(ghost.all().filter((n) => n.attrs['data-mark'] !== undefined).length, 0);

  const root = new FakeEl('div');
  const level = LEVELS.find((l) => l.id === 'l01');
  renderDeploy(/** @type {any} */ (root), { level, progress: valleyProgress(), onStart() {}, onBack() {} });
  const roster = root.all().filter((n) => n.tag === 'button' && typeof n.className === 'string' && n.className.includes('roster-btn'));
  roster[0].dispatch('click');
  const svg = root.all().find((n) => n.tag === 'svg');
  const [dx, dy] = level.solution.deploy[0].at;
  svg.dispatch('pointerup', { clientX: dx * 40 + 20, clientY: dy * 40 + 20, pointerType: 'touch' });
  assert.ok(svg.querySelector('[data-band]'), 'a band is placed');
  assert.equal(svg.querySelectorAll('[data-mark]').length, 0);
});

// --- the battle screen ---

const L01 = LEVELS.find((l) => l.id === 'l01');
const FIRST = /** @type {{kind: 'move', band: string, path: [number, number][]}} */ (L01.solution.moves[0]);
const [AX, AY] = L01.solution.deploy[0].at;
const [BX, BY] = FIRST.path[FIRST.path.length - 1];

function mount(t, extra = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeEl('div');
  mountBattle(/** @type {any} */ (root), {
    level: L01, state: createBattle(L01, L01.solution.deploy, valleyProgress()), onFinish() {}, onQuit() {}, ...extra,
  });
  const svg = root.all().find((n) => n.tag === 'svg');
  const button = (label) => root.all().find((n) => n.tag === 'button' && n.textContent.startsWith(label));
  return {
    root,
    svg,
    button,
    click: (label) => button(label).dispatch('click'),
    tap: (x, y) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
    turnText: () => root.all().find((n) => typeof n.className === 'string' && n.className.startsWith('turn-label')).textContent,
  };
}

test('End turn asks once while a band has done nothing at all', (t) => {
  const ui = mount(t);
  assert.equal(band(ui.svg, 'ants').attrs['data-turn'], 'ready');
  assert.ok(!ui.button('End turn').className.split(' ').includes('is-ready'), 'plain: a tap asks first');
  ui.click('End turn');
  assert.equal(ui.button('End turn').textContent, 'End turn? Tap again');
  assert.ok(ui.button('End turn').className.split(' ').includes('is-ready'), 'green: the next tap ends the turn');
  assert.equal(ui.turnText(), 'Turn 1');
  ui.click('End turn');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.equal(ui.turnText(), 'Turn 2');
});

test('End turn does not ask once every band has moved: one tap ends the turn', (t) => {
  const ui = mount(t);
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.equal(band(ui.svg, 'ants').attrs['data-turn'], 'done', 'moved, with nothing to bite');
  ui.click('End turn');
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  assert.equal(ui.turnText(), 'Turn 2', 'one tap was enough');
  assert.equal(band(ui.svg, 'ants').attrs['data-turn'], 'ready', 'a new turn');
});

test('the End turn button is plain while a band is ready and primary once every band is done', (t) => {
  const ui = mount(t);
  const isReady = () => ui.button('End turn').className.split(' ').includes('is-ready');
  assert.equal(isReady(), false, 'the ants have not moved');
  ui.tap(AX, AY);
  ui.tap(BX, BY);
  assert.equal(isReady(), true, 'at once, without waiting for the glide');
  ui.click('Undo');
  assert.equal(isReady(), false, 'Undo makes the ants ready again');
});

test('Continue keeps the primary look after the battle', (t) => {
  let s = createBattle(L01, L01.solution.deploy, valleyProgress());
  for (const move of L01.solution.moves.slice(0, -1)) s = applyMove(s, move);
  const last = /** @type {{kind: 'move', band: string, path: [number, number][]}} */ (L01.solution.moves[L01.solution.moves.length - 1]);
  const ui = mount(t, { state: s });
  const [hx, hy] = s.bands.find((b) => b.id === last.band).cells[0];
  const [tx, ty] = last.path[last.path.length - 1];
  ui.tap(hx, hy);
  ui.tap(tx, ty);
  t.mock.timers.tick(BOT_TURN_BUDGET_MS);
  const btn = ui.button('Continue');
  assert.ok(btn, 'the battle is won');
  assert.ok(btn.className.split(' ').includes('is-ready'));
});

// Since the interface kit, End turn is one of the kit's buttons (css/ui.css)
// in each state: the plain wood while a tap would ask first, the green
// main button when one tap ends the turn, and the green with hazard words
// and a hazard glow while it asks.
test('the stylesheet: only a ready End turn button takes the primary colours', () => {
  const css = fs.readFileSync(new URL('../css/game.css', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../js/ui/battle-view.js', import.meta.url), 'utf8');
  assert.match(view, /'end-btn ui-btn ui-btn--secondary'/, 'plain wood by default: a tap asks first');
  assert.match(view, /'end-btn is-ready ui-btn ui-btn--primary'/, 'the main button when ready');
  assert.match(view, /'end-btn is-ready is-asking ui-btn ui-btn--primary'/);
  const asking = css.match(/\.battle-bar \.end-btn\.is-asking\s*\{([^}]*)\}/);
  assert.ok(asking, 'a rule for the asking look');
  assert.match(asking[1], /color:\s*var\(--hazard\)/);
  const glow = css.match(/\.battle-bar \.end-btn\.is-asking::after\s*\{([^}]*)\}/);
  assert.ok(glow, 'a hazard glow round it while it asks');
  assert.match(glow[1], /var\(--hazard\)/);
  assert.doesNotMatch(css, /\.battle-bar button\.end-btn/, 'no End turn look of its own any more');
});
