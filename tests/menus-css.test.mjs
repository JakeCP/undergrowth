// css/menus.css: the menus' styles use the game's palette, are linked
// from the page, and lay the deploy panel over exactly half the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE } from '../js/ui/patterns.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = read('css/menus.css');

/** @param {string} hex */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

test('every colour in css/menus.css is from the game\'s palette', () => {
  const rootBlock = read('css/game.css').match(/:root\s*\{([^}]*)\}/);
  assert.ok(rootBlock);
  const allowed = new Set([
    ...Object.values(PALETTE),
    ...[...rootBlock[1].matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]),
  ].map((c) => c.toLowerCase()));
  const allowedRgb = new Set([...allowed].map(rgb));
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    assert.ok(allowed.has(m[0].toLowerCase()), `${m[0]} is not a palette colour`);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/g)) {
    assert.ok(allowedRgb.has(`${m[1]},${m[2]},${m[3]}`), `rgb(${m[1]}, ${m[2]}, ${m[3]}) is not a palette colour`);
  }
});

test('index.html links css/menus.css after the game\'s own styles', () => {
  const html = read('index.html');
  const game = html.indexOf('href="css/game.css"');
  const menus = html.indexOf('<link rel="stylesheet" href="css/menus.css">');
  assert.ok(game >= 0 && menus > game);
});

test('the deploy panel covers exactly one half of the board', () => {
  const rule = (sel) => css.match(new RegExp(`\\.deploy-panel--${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  for (const [half, size, edge] of [['top', 'height', 'top'], ['bottom', 'height', 'bottom'], ['left', 'width', 'left'], ['right', 'width', 'right']]) {
    const body = rule(half);
    assert.match(body, new RegExp(`${size}:\\s*50%`), `${half}: half the board`);
    assert.match(body, new RegExp(`${edge}:\\s*0`), `${half}: against its edge`);
  }
  assert.match(css, /\.deploy-panel\s*\{[^}]*position:\s*absolute/);
  // The card is the interface kit's parchment (css/ui.css; unit-card.js
  // gives it the class): solid paper, cream in code, in ink.
  const ui = read('css/ui.css');
  assert.match(read('js/ui/unit-card.js'), /`unit-card ui-panel--parchment/);
  assert.match(ui, /\.ui-panel--parchment\s*\{[^}]*color:\s*var\(--ink\);[^}]*background:\s*var\(--cream\)/, 'solid cream paper, in ink');
  assert.match(ui, /html\.has-kit-panel-parchment \.ui-panel--parchment\s*\{[^}]*border-image:\s*var\(--kit-panel-parchment\)[^;]*fill/, 'painted, its middle filled');
  assert.doesNotMatch(css, /\.deploy-panel\s*\{[^}]*background/, 'no translucent panel behind it');
  assert.match(css, /\.unit-card--compact\s*\{[^}]*max-height:\s*100%/, 'the card stays inside its half');
  assert.match(css, /\.deploy-panel__hide\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/, 'a thumb-sized hide button');
});

test('no portrait on a card is framed: no disc, no box, and a round crop is one round element', () => {
  // The board's frame (.board-wrap svg in game.css) must not reach a stamp on the card.
  assert.match(css, /\.unit-card \.unit-card__stamp\s*\{[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none/);
  const art = css.match(/\.unit-card__art\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.doesNotMatch(art, /border|background|box-shadow|border-radius/);
  const fig = css.match(/\.unit-card__figure\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.doesNotMatch(fig, /border|background|box-shadow|border-radius/);
  const head = css.match(/\.roster-btn__head\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(head, /border-radius:\s*50%/);
  assert.match(head, /background:/);
  assert.match(head, /border:/);
  assert.match(head, /overflow:\s*hidden/);
});

// The owner's screenshot: a scroll-bar track down the deploy card's
// right edge although its text fits. EB Garamond's letters are taller
// than the card's tight line height (its ascent and descent come to 1.31
// of its size, measured in Chrome), so each line's letters stand a
// fraction of a pixel below their line, and in the rows' scrolling box
// that fraction counted as overflow. The rows keep room at their foot
// for it, so only rows that truly do not fit scroll, on a thin bar.
const GARAMOND_HEIGHT = 1.31;
const LABEL_SCALE = 1.08;

/** @param {string} body @param {string} prop */
const px = (body, prop) => Number(body.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([\\d.]+)px`))?.[1] ?? NaN);

test('the deploy card\'s rows have room at their foot for the letters\' overhang, so text that fits never scrolls', () => {
  const card = css.match(/\.unit-card--compact\s*\{([^}]*)\}/)?.[1] ?? '';
  const roomy = css.match(/@container band-panel \(min-width: 400px\)\s*\{\s*\.unit-card--compact\s*\{([^}]*)\}/)?.[1] ?? '';
  const rows = css.match(/\.unit-card--compact \.unit-card__rows\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rows, /overflow-y:\s*auto/, 'the rows still scroll when they truly do not fit');
  const foot = px(rows, 'padding-bottom');
  assert.ok(foot > 0, 'the rows keep room at their foot');
  for (const body of [card, roomy]) {
    const size = px(body, 'font-size');
    const lineHeight = Number(body.match(/line-height:\s*([\d.]+)\s*;/)?.[1]);
    assert.ok(size > 0 && lineHeight > 0, 'the card sets its size and line height');
    // A row's label is a little larger than its text, on the same line.
    const overhang = ((GARAMOND_HEIGHT - lineHeight) / 2) * size * LABEL_SCALE;
    assert.ok(foot >= Math.ceil(overhang), `${foot}px holds the ${overhang.toFixed(2)}px overhang at ${size}px / ${lineHeight}`);
  }
  // The room came out of the card's own foot: the card is as tall as before.
  const cardFoot = Number(card.match(/padding:\s*0 10px (\d+)px/)?.[1]);
  assert.equal(cardFoot + foot, 6);
});

test('when the deploy card\'s rows do scroll, the bar is thin and in the card\'s ink, on no grey track', () => {
  const rows = css.match(/\.unit-card--compact \.unit-card__rows\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rows, /scrollbar-width:\s*thin/);
  assert.match(rows, /scrollbar-color:\s*rgba\(29, 38, 24, [\d.]+\) transparent/);
  assert.match(css, /\.unit-card--compact \.unit-card__rows::-webkit-scrollbar\s*\{[^}]*width:\s*6px/);
  assert.match(css, /\.unit-card--compact \.unit-card__rows::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent/);
  assert.match(css, /\.unit-card--compact \.unit-card__rows::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*rgba\(29, 38, 24/);
});
