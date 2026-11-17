// css/title.css: the painting holds still, and the cast stands in the
// screen's bottom-left corner just behind the foliage clump, whatever
// the window's shape. (Pinned to a spot in the painting, the cast slid
// off the left edge of a near-square window, where the 16:9 scene is
// cropped hard at the sides.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('title.css: the painting and the cast do not drift or zoom', () => {
  assert.doesNotMatch(css, /@keyframes title-(scene|planted)-drift/);
  for (const sel of ['.title-scene img', '.title-cast']) {
    const body = rules(sel).join('\n');
    assert.doesNotMatch(body, /animation\s*:/, `${sel} has no animation`);
    assert.doesNotMatch(body, /transform\s*:/, `${sel} has no transform`);
  }
});

test('title.css: the cast is placed in screen units, not from the painting', () => {
  const body = rules('.title-cast').join('\n');
  assert.ok(body.length > 0, 'there is a .title-cast rule');
  assert.doesNotMatch(css, /--scene-[wxyh]\b/, 'nothing tracks where the painting lands');
  assert.match(body, /\bleft\s*:/);
  assert.match(body, /\bheight\s*:/);
});

test('title.css: the cast stands below the frame, so their feet never show on the painted grass', () => {
  const bottoms = rules('.title-cast').join('\n').match(/\bbottom\s*:\s*([^;]+);/g) ?? [];
  assert.ok(bottoms.length >= 1, 'the cast is placed by its bottom edge');
  for (const b of bottoms) assert.match(b, /bottom\s*:\s*-/, `${b} is below the screen's edge`);
});

test('title.css: the title screen clips rather than hides its overflow', () => {
  // The foliage and the cast hang past the bottom edge. With
  // overflow: hidden the screen is still scrollable, and focusing Begin
  // on load scrolled it up, lifting the whole scene off the bottom.
  const body = rules('.title-screen').join('\n');
  assert.match(body, /overflow\s*:\s*clip/);
});
