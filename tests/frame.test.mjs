// The page frame and palette (look-and-motion spec, "Look"): a deep
// forest-green frame instead of cream paper, readable text on it, and the
// board's idle animations kept cheap and off under reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE } from '../js/ui/patterns.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'css/game.css'), 'utf8');

/** The custom properties set on :root. */
function rootVars() {
  const block = css.match(/:root\s*\{([^}]*)\}/);
  assert.ok(block, 'css/game.css has a :root block');
  /** @type {Record<string, string>} */
  const vars = {};
  for (const m of block[1].matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)) vars[m[1]] = m[2];
  return vars;
}

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The declarations of the first rule whose selector list is exactly `selector`.
 * @param {string} selector
 */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  assert.ok(m, `css/game.css has a rule for ${selector}`);
  return m[1];
}

test('the page is a deep forest-green frame, the same green as the board, not cream', () => {
  const vars = rootVars();
  assert.equal(vars.frame, PALETTE.FRAME);
  const body = rule('body');
  assert.match(body, /background:\s*var\(--frame\)/);
  assert.doesNotMatch(body, /#f4efe6/i);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`<meta name="theme-color" content="${PALETTE.FRAME}">`));
});

test('text on the frame and on the call-outs is readable (WCAG AA, 4.5:1 or better)', () => {
  const v = rootVars();
  const pairs = [
    ['page text on the frame', v.text, v.frame],
    ['the warning colour on the frame', v.warn, v.frame],
    ['button text', v.ink, v.cream],
    ['the den tip', v.ink, v.hazard],
  ];
  for (const [what, fg, bg] of pairs) {
    assert.ok(fg !== undefined && bg !== undefined, `${what}: both colours are :root variables`);
    assert.ok(contrast(fg, bg) >= 4.5, `${what}: ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
  }
  assert.match(rule('body'), /color:\s*var\(--text\)/);
  assert.match(rule('.battle-goal__habitats.is-down'), /color:\s*var\(--warn\)/);
});

test('the board labels are readable: cream on ink for the length badge', () => {
  assert.ok(contrast(PALETTE.CREAM, PALETTE.INK) >= 7);
  assert.ok(contrast(PALETTE.INK, PALETTE.HAZARD) >= 7, 'the engaged mark and plan lines');
});

test('the idle animations move only transform and opacity, and stop under reduced motion', () => {
  for (const name of ['ug-march', 'ug-ripple', 'ug-pulse', 'ug-smoke']) {
    const m = css.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert.ok(m, `@keyframes ${name}`);
    const props = [...m[1].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]);
    assert.ok(props.length > 0);
    for (const p of props) assert.ok(p === 'transform' || p === 'opacity', `${name} animates ${p}`);
  }
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(reduced, 'a reduced-motion block');
  for (const cls of ['.ug-wobble', '.ug-ripple', '.ug-pulse', '.ug-smoke']) {
    assert.ok(reduced[1].includes(cls), `${cls} stops`);
  }
  assert.match(reduced[1], /animation:\s*none/);
  assert.doesNotMatch(css, /filter:\s*blur/, 'no blur filters');
});

test('nothing over the board can cover Undo or End turn: the bar stacks above every overlay', () => {
  const z = (selector) => {
    const m = rule(selector).match(/z-index:\s*(\d+)/);
    assert.ok(m, `${selector} has a z-index`);
    return Number(m[1]);
  };
  const bar = z('.battle-bar');
  for (const overlay of ['.action-popup', '.board-callout', '.battle-settings', '.board-finale']) {
    assert.ok(z(overlay) < bar, `${overlay} stays under the bar`);
  }
});

test('the phone layout fits the screen: the board is the largest square the column leaves', () => {
  const block = css.match(/@supports \(container-type: size\) and \(height: 100dvh\) \{([\s\S]*?)\n\}/);
  assert.ok(block, 'a container-units block for the phone');
  assert.match(block[1], /@media \(max-width: 719px\)/);
  assert.match(block[1], /height:\s*calc\(100dvh - 16px\)/, 'the column is the screen height less the body padding');
  assert.match(block[1], /minmax\(240px, 1fr\)/, 'the board row takes what is left');
  assert.match(block[1], /container-type:\s*size/);
  assert.match(block[1], /width:\s*min\(100cqw, 100cqh - var\(--log-room\), 520px\)/, 'a square that fits both ways, with the message box under it');
  assert.match(rule('body'), /padding:\s*0 16px 16px/, 'the 16px the column height allows for');
});

test('every keyframe animation in every stylesheet moves only transform and opacity', () => {
  const dir = path.join(ROOT, 'css');
  let found = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.css'))) {
    const sheet = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of sheet.matchAll(/@keyframes ([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      found += 1;
      const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]);
      assert.ok(props.length > 0, `${file}: @keyframes ${m[1]} is empty`);
      for (const p of props) {
        assert.ok(p === 'transform' || p === 'opacity', `${file}: @keyframes ${m[1]} animates ${p}`);
      }
    }
  }
  assert.ok(found >= 6, 'the stylesheets were read');
});

test('the deploy board gives way on a short screen, so the roster and Start stay in view', () => {
  // The rebuilt deploy screen (css/menus.css) sizes its board from the
  // room its cell has, less the card's slot; game.css no longer does.
  const menus = fs.readFileSync(path.join(ROOT, 'css/menus.css'), 'utf8');
  assert.doesNotMatch(css, /\.deploy-screen \.board-wrap/, 'no old deploy rule left in game.css');
  assert.match(menus, /\.deploy-screen \.board-area\s*\{[^}]*container-type:\s*size/, 'the board\'s cell is measured');
  assert.match(menus, /\.deploy-screen \.board-wrap\s*\{[^}]*width:\s*min\(100cqw, 100cqh - var\(--slot-h\), 520px\)/,
    'the board is the largest square that leaves the card\'s room');
  assert.match(menus, /@supports \(height: 100dvh\) \{\s*@media \(max-width: 719px\) \{\s*\.deploy-screen \{[^}]*100dvh/,
    'a phone\'s screen is the dynamic height, so the tray and Start stay in view');
});
