// The interface icons (js/ui/icons.js): the painted seed, den and forest
// images in place of the emoji, with alt text, and the emoji back
// when an image is not in the asset list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { icon, iconSrc, setIconText, iconText, svgIcon, ICON_EMOJI, ICON_ALT } from '../js/ui/icons.js';
import { MAP_ASSETS } from '../js/ui/map-assets.js';

installFakeDom({ canvas: true });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('each icon is its shipped image, with alt text', () => {
  for (const name of /** @type {const} */ (['seed', 'den', 'forest'])) {
    assert.equal(iconSrc(name), MAP_ASSETS.icons[name]);
    const img = icon(name);
    assert.equal(img.tag, 'img');
    assert.equal(img.getAttribute('src'), MAP_ASSETS.icons[name]);
    assert.equal(img.getAttribute('alt'), ICON_ALT[name]);
    assert.equal(img.className, 'ui-icon');
  }
  assert.equal(icon('den', { alt: 'Den' }).getAttribute('alt'), 'Den');
});

test('an icon missing from the asset list falls back to its emoji', () => {
  assert.equal(iconSrc('seed', {}), null);
  const span = icon('seed', { icons: {} });
  assert.equal(span.tag, 'span');
  assert.equal(span.textContent, ICON_EMOJI.seed);
  assert.equal(span.getAttribute('aria-label'), 'Seeds');
  const t = svgIcon(new FakeEl('g'), 'seed', 20, 20, 16, {});
  assert.equal(t.tag, 'text');
  assert.equal(t.textContent, '🌰');
});

test('setIconText and iconText put the icon before the text, replacing what was there', () => {
  const p = new FakeEl('p');
  setIconText(/** @type {any} */ (p), 'seed', '+0');
  setIconText(/** @type {any} */ (p), 'seed', '+12');
  assert.equal(p.children.length, 2);
  assert.equal(p.children[0].tag, 'img');
  assert.equal(p.text, ' +12');
  const s = iconText('span', 'seeds', 'seed', 40);
  assert.equal(s.className, 'seeds');
  assert.equal(s.text, ' 40');
});

test('svgIcon: an image centred on the point', () => {
  const g = new FakeEl('g');
  const im = svgIcon(/** @type {any} */ (g), 'seed', 30, 50, 16);
  assert.equal(im.tag, 'image');
  assert.deepEqual([im.attrs.x, im.attrs.y, im.attrs.width, im.attrs.href], ['22', '42', '16', MAP_ASSETS.icons.seed]);
  assert.equal(im.attrs['data-icon'], 'seed');
});

test('no seed, den or forest emoji is left in the interface outside the icon helper', () => {
  const dir = path.join(ROOT, 'js/ui');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'icons.js') continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(src, /🌰|🏡|🌲/u, `js/ui/${f}`);
  }
});
