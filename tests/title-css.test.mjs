// css/title.css: the paintings hold still, the valley and the archway
// sit in boxes of their own shape by the rule js/ui/title-scene.js
// tests (coverBox), and the cast stand inside the archway's box, so
// they keep their feet on the painted root whatever the window's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCH_RATIO, FOCUS_X, FOCUS_Y } from '../js/ui/title-scene.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'css/title.css'), 'utf8');

/**
 * Every rule body whose selector list includes `selector` exactly.
 * @param {string} selector
 * @returns {string[]}
 */
function rules(selector) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
    if (sels.includes(selector)) out.push(m[2]);
  }
  return out;
}

/**
 * The number a custom property is set to in the rules for `selector`.
 * @param {string} selector
 * @param {string} prop
 * @returns {number}
 */
function custom(selector, prop) {
  const m = rules(selector).join('\n').match(new RegExp(`${prop}\\s*:\\s*([0-9.]+)\\s*;`));
  assert.ok(m, `${selector} sets ${prop} to a number`);
  return Number(m[1]);
}

/** Every @keyframes block: its name and its body. */
function keyframes() {
  const out = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) out.push({ name: m[1], body: m[2] });
  return out;
}

test('title.css: the paintings and the cast do not drift or zoom', () => {
  assert.doesNotMatch(css, /@keyframes title-(scene|planted)-drift/);
  for (const sel of ['.title-valley', '.title-valley-img', '.title-arch', '.title-arch-img', '.title-cast']) {
    const body = rules(sel).join('\n');
    assert.doesNotMatch(body, /animation[^;]*infinite/, `${sel} has no looping animation`);
  }
  const cast = rules('.title-cast').join('\n');
  assert.ok(cast.length > 0, 'there is a .title-cast rule');
  assert.doesNotMatch(cast, /animation\s*:/, 'the cast have no animation at all');
  assert.doesNotMatch(cast, /transform\s*:/, 'nor a transform');
});

test('title.css: the valley and the archway are boxes of the painting\'s shape, sized by coverBox\'s rule', () => {
  const box = rules('.title-valley')[0];
  assert.equal(rules('.title-arch')[0], box, 'one rule sizes both');
  for (const prop of ['width', 'aspect-ratio', 'bottom', 'left']) {
    const decl = (body) => body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+);`))?.[1];
    assert.equal(decl(rules('.title-mist')[0]), decl(box), `the mist lies in the valley's box: ${prop}`);
  }
  assert.match(box, /--box-w\s*:\s*max\(100cqw,\s*calc\(100cqh \* var\(--ratio\)\)\)/);
  assert.match(box, /width\s*:\s*var\(--box-w\)/);
  assert.match(box, /aspect-ratio\s*:\s*var\(--ratio\)/);
  assert.match(box, /--box-h\s*:\s*calc\(var\(--box-w\) \/ var\(--ratio\)\)/);
  assert.match(box, /bottom\s*:\s*calc\(\(100cqh - var\(--box-h\)\) \* var\(--focus-y\)\)/);
  assert.match(box, /left\s*:\s*calc\(\(100cqw - var\(--box-w\)\) \* var\(--focus-x\)\)/);
  assert.match(rules('.title-screen').join('\n'), /container-type\s*:\s*size/);
});

test('title.css: the shapes and the crops are the ones title-scene.js places the cast by', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  assert.ok(near(custom(".title-screen [data-shape='wide']", '--ratio'), ARCH_RATIO.wide));
  assert.ok(near(custom(".title-screen [data-shape='tall']", '--ratio'), ARCH_RATIO.tall));
  assert.ok(near(custom(".title-screen [data-shape='wide']", '--focus-x'), FOCUS_X.wide));
  assert.ok(near(custom(".title-screen [data-shape='tall']", '--focus-x'), FOCUS_X.tall));
  assert.ok(near(custom(".title-screen [data-shape='wide']", '--focus-y'), FOCUS_Y.wide));
  assert.ok(near(custom(".title-screen [data-shape='tall']", '--focus-y'), FOCUS_Y.tall));
});

test('title.css: the cast are placed inside the archway, their height following their own shape', () => {
  const cast = rules('.title-cast').join('\n');
  assert.match(cast, /position\s*:\s*absolute/);
  assert.match(cast, /height\s*:\s*auto/);
  assert.doesNotMatch(cast, /\b(left|bottom|width)\s*:/, 'the spot comes from title-scene.js, inline');
});

test('title.css: the title screen clips rather than hides its overflow', () => {
  // The ferns hang past the bottom edge. With overflow: hidden the
  // screen is still scrollable, and focusing Begin on load scrolled it
  // up, lifting the whole scene off the bottom.
  const body = rules('.title-screen').join('\n');
  assert.match(body, /overflow\s*:\s*clip/);
});

test('title.css: Begin is at least 44px tall', () => {
  const m = rules('.title-start').join('\n').match(/min-height\s*:\s*(\d+)px/);
  assert.ok(m && Number(m[1]) >= 44, 'a thumb can find it');
});

test('title.css: under the wordmark the typed name is clipped away, not removed', () => {
  const body = rules('.title-name.has-wordmark .title-name-text').join('\n');
  assert.match(body, /clip-path\s*:\s*inset\(50%\)/);
  assert.doesNotMatch(body, /display\s*:\s*none|visibility\s*:\s*hidden/, 'screen readers still read it');
});

test('title.css: every animation moves or fades and nothing else', () => {
  const frames = keyframes();
  assert.ok(frames.length >= 6, 'the scene is alive');
  for (const { name, body } of frames) {
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const prop of props) {
      assert.ok(['transform', 'opacity'].includes(prop), `@keyframes ${name} animates ${prop}`);
    }
  }
});

test('title.css: everything that is animated is stilled, by the class and by the media query', () => {
  const animated = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/animation(-name)?\s*:(?!\s*none)/.test(m[2])) continue;
    for (const sel of m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',')) {
      const s = sel.trim();
      if (s.startsWith('.title-') && !s.includes(':hover') && !s.includes(':active')) animated.add(s);
    }
  }
  assert.ok(animated.size >= 6);
  const still = css.match(/\.title-screen\.is-still \*\s*,\s*\.title-screen\.is-still \*::before\s*,\s*\.title-screen\.is-still \*::after\s*\{([^}]*)\}/);
  assert.ok(still, '.is-still stills every element and pseudo-element of the screen');
  assert.match(still[1], /animation\s*:\s*none\s*!important/);
  assert.match(still[1], /transition\s*:\s*none\s*!important/);
  const media = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/);
  assert.ok(media, 'a reduced-motion block');
  assert.match(media[1], /\.title-screen \*/);
  assert.match(media[1], /animation\s*:\s*none\s*!important/);
});

test('title.css: the pointer shifts the layers against each other, the nearest most, the archway not at all', () => {
  const shift = (sel) => {
    const m = rules(sel).join('\n').match(/translate\s*:\s*calc\(var\(--px\) \* (-?[0-9.]+)px\)/);
    return m ? Number(m[1]) : 0;
  };
  assert.ok(shift('.title-valley-img') < 0, 'the valley slides the other way');
  assert.equal(shift('.title-arch'), 0);
  assert.equal(shift('.title-cast'), 0);
  assert.ok(shift('.title-ferns') > Math.abs(shift('.title-valley-img')), 'the ferns are nearest');
});
