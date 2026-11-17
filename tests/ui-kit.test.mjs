// The interface kit (css/ui.css, js/ui/ui-kit.js): one set of buttons,
// panels and ribbons for every screen, drawn from the painted pieces when
// they exist and in code when they do not; the action emblems beside
// action names; and no screen keeping a button or panel look of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { kitStyle, applyKit, emblemSrc, emblem, STYLED_PIECES, EMBLEM_ACTIONS, PRESSABLE } from '../js/ui/ui-kit.js';
import { UI_ASSETS } from '../js/ui/ui-assets.js';
import { keyListBox } from '../js/ui/keys.js';
import { keyList, KEY_LIST } from '../js/ui/battle-view.js';
import { renderUnitCard } from '../js/ui/unit-card.js';
import { unitCard } from '../js/ui/unit-info.js';
import { createBattle } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { valleyProgress } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = read('css/ui.css');

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // After a rule's end or a comment, so a selector list is taken whole.
  const m = css.match(new RegExp(`(?:\\}|\\*/)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `css/ui.css has a rule for ${selector}`);
  return m[1];
}

const ALL = Object.fromEntries([...STYLED_PIECES, ...EMBLEM_ACTIONS.map((a) => `action-${a}`)]
  .map((k) => [k, `assets/kit/${k}.webp`]));

// --- which pieces are painted (pure) ---

test('kitStyle: each painted piece in the list gives <html> a class and a variable; none gives nothing', () => {
  const full = kitStyle(ALL, 'https://example.test/game/');
  assert.deepEqual(full.classes, STYLED_PIECES.map((k) => `has-kit-${k}`));
  assert.equal(full.vars['--kit-button-primary'], 'url("https://example.test/game/assets/kit/button-primary.webp")');
  assert.equal(Object.keys(full.vars).length, STYLED_PIECES.length, 'the emblems are images, not variables');
  assert.deepEqual(kitStyle({}), { classes: [], vars: {} }, 'no pieces: every component keeps its code-drawn look');
  const one = kitStyle({ 'panel-wood': 'assets/kit/panel-wood.webp' });
  assert.deepEqual(one.classes, ['has-kit-panel-wood']);
  assert.equal(one.vars['--kit-panel-wood'], 'url("assets/kit/panel-wood.webp")');
});

test('applyKit sets the classes and variables on the page for what exists', () => {
  const root = new FakeEl('html');
  applyKit(/** @type {any} */ (root), { backdrop: 'assets/kit/backdrop.webp' }, 'https://example.test/');
  assert.ok(root.classList.contains('has-kit-backdrop'));
  assert.ok(!root.classList.contains('has-kit-button-primary'));
  assert.equal(root.style['--kit-backdrop'], 'url("https://example.test/assets/kit/backdrop.webp")');
});

test('the shipped kit has every piece the stylesheet draws from', () => {
  for (const key of STYLED_PIECES) assert.ok(UI_ASSETS[key], key);
});

// --- the stylesheet ---

test('every component has a code-drawn look, and a painted one under its has-kit class', () => {
  const pairs = [
    ['.ui-btn--primary', 'button-primary'],
    ['.ui-btn--secondary', 'button-secondary'],
    ['.ui-btn-round', 'button-round'],
    ['.ui-panel--parchment', 'panel-parchment'],
    ['.ui-panel--wood', 'panel-wood'],
    ['.ui-ribbon', 'ribbon-green'],
    ['.ui-ribbon--rust', 'ribbon-rust'],
  ];
  for (const [selector, piece] of pairs) {
    assert.match(rule(selector), /background:/, `${selector} is drawn in code`);
    assert.match(css, new RegExp(`html\\.has-kit-${piece} [^{]*\\{[^}]*`), `${selector} has a painted look`);
    assert.match(css, new RegExp(`var\\(--kit-${piece}\\)`), `${piece} is used`);
  }
  assert.match(css, /html\.has-kit-backdrop body/, 'the canopy behind every screen');
  assert.match(read('css/game.css'), /body\s*\{[^}]*background:\s*var\(--frame\)/, 'and the flat frame where there is none');
});

test('the painted pieces are cut so their ends keep their shape: slice insets as fractions of each piece', () => {
  assert.match(rule('html.has-kit-button-primary .ui-btn--primary'), /border-image-slice:\s*0 9\.33% fill/);
  assert.match(rule('html.has-kit-button-secondary .ui-btn--secondary'), /border-image-slice:\s*0 8\.89% fill/);
  assert.match(css, /border-image-width:\s*0 calc\(var\(--btn-h\) \* var\(--cap\)\)/, 'an end as wide as its own shape at the button\'s height');
  assert.match(rule('html.has-kit-ribbon-green .ui-ribbon--green,\nhtml.has-kit-ribbon-rust .ui-ribbon--rust'), /border-image-slice:\s*0 12\.5% fill/);
  assert.match(css, /var\(--kit-panel-wood\) 16% fill \/ var\(--edge\)/);
  assert.match(css, /var\(--kit-panel-parchment\) 6\.25% fill \/ var\(--edge\)/);
});

test('buttons react: a hover lift where there is a mouse, a press that moves and darkens, a dead look, motion only by transform', () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.ui-btn:hover/);
  const pressed = rule('.ui-btn:active:not(:disabled):not(.is-dead),\n.ui-btn-round:active:not(:disabled)');
  assert.match(pressed, /transform:\s*translateY\(2px\)/);
  assert.match(pressed, /--btn-bright:\s*0\.8/);
  const dead = rule('.ui-btn:disabled,\n.ui-btn.is-dead,\n.ui-btn-round:disabled');
  assert.match(dead, /--btn-grey/);
  assert.match(dead, /cursor:\s*default/);
  // The filter that greys a dead button greys its outline too: chosen
  // with the keys, it lets most of the hazard yellow of the ring back.
  const deadGrey = Number((dead.match(/--btn-grey:\s*([\d.]+)/) ?? [])[1]);
  const ringGrey = Number((rule('.ui-btn.is-dead:focus-visible').match(/--btn-grey:\s*([\d.]+)/) ?? [])[1]);
  assert.ok(ringGrey <= 0.3 && ringGrey < deadGrey, `a dead button's ring is not greyed away (${ringGrey})`);
  for (const m of css.matchAll(/transition:\s*([^;]+);/g)) {
    assert.match(m[1], /^(transform\b|none$)/, `only transform is animated: ${m[1]}`);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ui-btn,\s*\.ui-btn-round\s*\{\s*transition:\s*none/);
});

test('every tap target of the kit is at least 44px, and the keyboard ring stands clear of the painted rim', () => {
  assert.match(rule('.ui-btn'), /min-width:\s*44px/);
  assert.match(rule('.ui-btn'), /min-height:\s*var\(--btn-h\)/);
  for (const m of css.matchAll(/--btn-h:\s*(\d+)px/g)) assert.ok(Number(m[1]) >= 44, `${m[0]}`);
  assert.match(rule('.ui-btn-round'), /min-width:\s*44px;[^}]*min-height:\s*44px/);
  assert.match(rule('.ui-btn:focus-visible,\n.ui-btn-round:focus-visible'), /outline-offset:\s*3px/);
  assert.match(read('css/game.css'), /button:focus-visible,[^{]*\{\s*outline:\s*3px solid var\(--hazard\)/);
});

test('index.html loads the kit last, so screens keep only layout', () => {
  const html = read('index.html');
  const links = [...html.matchAll(/href="(css\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.at(-1), 'css/ui.css');
});

test('no screen keeps a button or panel look of its own', () => {
  const sheets = ['css/game.css', 'css/map.css', 'css/menus.css', 'css/scene.css', 'css/title.css'].map(read).join('\n');
  for (const old of [/\.btn-primary\b/, /\.btn-quiet\b/, /\.round-btn\b/, /(^|[\s,])\.btn\s*\{/m, /\.battle-bar button/, /\.action-popup button/, /\.battle-settings button/]) {
    assert.doesNotMatch(sheets, old, `${old}`);
  }
  const views = fs.readdirSync(path.join(ROOT, 'js/ui')).filter((f) => f.endsWith('.js'))
    .map((f) => read(`js/ui/${f}`)).join('\n');
  assert.doesNotMatch(views, /'btn btn-|'btn'|round-btn/, 'no view asks for the old classes');
  // The main button is the one that moves the game on.
  assert.match(read('js/ui/title-view.js'), /'title-start ui-btn ui-btn--primary/);
  assert.match(read('js/ui/map-view.js'), /march\.className = 'ui-btn ui-btn--primary'/);
  assert.match(read('js/ui/deploy-view.js'), /startBtn\.className = 'ui-btn ui-btn--primary'/);
  assert.match(read('js/ui/result-view.js'), /'ui-btn ui-btn--primary', 'Back to map'/);
  assert.match(read('js/ui/shop-view.js'), /item\.affordable \? 'ui-btn--primary' : 'ui-btn--secondary'/);
});

// --- the action emblems ---

test('emblemSrc: by action id, none for a bot\'s action or a missing picture', () => {
  for (const id of EMBLEM_ACTIONS) assert.equal(emblemSrc(id), `assets/kit/action-${id}.webp`, id);
  assert.equal(emblemSrc('mow'), null);
  assert.equal(emblemSrc('pave', { 'action-pave': 'x.webp' }), null, 'bots have none, whatever the list');
  assert.equal(emblemSrc('bite', {}), null, 'no file: the name alone');
});

test('emblem: a silent picture to set before the name', (t) => {
  installFakeDom({ canvas: true });
  t.after(() => { delete globalThis.document; });
  const img = emblem('dig');
  assert.ok(img);
  assert.equal(img.className, 'ui-emblem');
  assert.equal(img.getAttribute('alt'), '');
  assert.equal(img.getAttribute('aria-hidden'), 'true');
  assert.equal(emblem('dig', {}), null);
});

test('the unit card\'s action rows lead with the action\'s emblem; trait rows have none', (t) => {
  installFakeDom({ canvas: true });
  t.after(() => { delete globalThis.document; });
  const card = renderUnitCard(unitCard('hedgehog', 2));
  const rows = card.all().filter((n) => typeof n.className === 'string' && n.className.startsWith('unit-card__row '));
  const bite = rows.find((r) => r.dataset.action === 'bite');
  const label = bite.children[0];
  assert.equal(label.className, 'unit-card__label');
  assert.equal(label.children[0].className, 'ui-emblem');
  assert.equal(label.text, 'Bite');
  const trait = rows.find((r) => r.dataset.trait !== undefined);
  assert.equal(trait.all().filter((n) => n.className === 'ui-emblem').length, 0);
});

test('the key list names the actions 1 to 9 choose, each with its emblem', (t) => {
  installFakeDom({ canvas: true });
  t.after(() => { delete globalThis.document; });
  const level = LEVELS.find((l) => l.id === 'l05');
  const state = createBattle(level, level.solution.deploy, valleyProgress());
  const list = keyList(state, null);
  assert.equal(list.length, KEY_LIST.length);
  const line = list.find((e) => e.keys === '1 – 9');
  assert.deepEqual(line.actions.map((a) => a.id).sort(), ['bite', 'dig']);
  const box = keyListBox(list, { onClose() {} });
  assert.ok(box.className.split(' ').includes('ui-panel--wood'));
  const pictures = box.all().filter((n) => n.className === 'ui-emblem').map((n) => n.getAttribute('data-action'));
  assert.deepEqual(pictures.sort(), ['bite', 'dig']);
  const chosen = keyList(state, /** @type {any} */ ({ options: [{ id: 'dig', label: 'Dig' }, { id: 'bite', label: 'Bite' }] }));
  assert.deepEqual(chosen.find((e) => e.keys === '1 – 9').actions, [{ id: 'dig', label: '1 Dig' }, { id: 'bite', label: '2 Bite' }]);
});

test('the press sound: every kit button, and the deploy tray\'s wooden tokens, which the app listens for', () => {
  assert.deepEqual(PRESSABLE.split(/,\s*/), ['.ui-btn', '.ui-btn-round', '.deploy-token']);
  assert.match(read('js/app.js'), /closest\(PRESSABLE\)/);
  assert.match(read('js/ui/deploy-view.js'), /html\('button', 'roster-btn deploy-token'\)/, 'the tokens carry the class');
});
