// The trading post's painted pictures: js/ui/shop-assets.js (written by
// scripts/shop-assets.mjs) must match the converted files on disk, every
// listed file must be precached for offline play, the pair stays within
// 300 KB, the counter keeps its transparency, and no PNG is committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOP_ASSETS } from '../js/ui/shop-assets.js';
import {
  BUDGET_BYTES, WIDTH, SHOP_DIR, IMAGES, shopAssetsSource, syncShopPrecache, run,
} from '../scripts/shop-assets.mjs';
import { webpSize } from '../scripts/textures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** @param {string} sw */
function precacheUrls(sw = read('sw.js')) {
  const block = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare const PRECACHE_URLS = [...]');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function webpOnDisk() {
  const dir = path.join(ROOT, SHOP_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => `${SHOP_DIR}/${f}`).sort();
}

test('the shop picture list matches the WebP files on disk', () => {
  assert.deepEqual(Object.values(SHOP_ASSETS).sort(), webpOnDisk(), 'run `node scripts/shop-assets.mjs`');
});

test('the list module is what the script would write for it', () => {
  assert.equal(read('js/ui/shop-assets.js'), shopAssetsSource(SHOP_ASSETS));
});

test('every shop picture is precached; the script never is', () => {
  const urls = precacheUrls();
  for (const file of Object.values(SHOP_ASSETS)) assert.ok(urls.includes(file), `${file} is not precached`);
  assert.deepEqual(urls.filter((u) => u.startsWith('assets/shop/')).sort(), Object.values(SHOP_ASSETS).sort());
  assert.ok(urls.includes('js/ui/shop-assets.js'));
  assert.ok(!urls.some((u) => u.startsWith('scripts/')));
});

test('the two pictures stay within 300 KB together, at 1280 px wide or less', () => {
  assert.equal(BUDGET_BYTES, 300 * 1024);
  let total = 0;
  for (const file of Object.values(SHOP_ASSETS)) {
    const data = fs.readFileSync(path.join(ROOT, file));
    total += data.length;
    const size = webpSize(data);
    assert.ok(size !== null, `${file} is a WebP`);
    assert.ok(size.width <= WIDTH, `${file} is ${size.width} px wide`);
    assert.ok(Math.abs(size.width / size.height - 1.5) < 0.01, `${file} is 3:2`);
  }
  assert.ok(total <= BUDGET_BYTES, `${total} bytes`);
});

test('the counter keeps its transparency; the interior has none', () => {
  const alpha = (/** @type {string} */ file) => {
    const data = fs.readFileSync(path.join(ROOT, file));
    return data.toString('ascii', 12, 16) === 'VP8X' && (data[20] & 0x10) !== 0;
  };
  if (SHOP_ASSETS.counter !== undefined) assert.equal(alpha(SHOP_ASSETS.counter), true);
  if (SHOP_ASSETS.interior !== undefined) assert.equal(alpha(SHOP_ASSETS.interior), false);
});

test('shop PNG sources are git-ignored, so only WebP files are committed', () => {
  assert.match(read('.gitignore'), /^assets\/shop\/\*\.png$/m);
});

test('the list module names only what exists, in a fixed order', () => {
  assert.match(shopAssetsSource({}), /export const SHOP_ASSETS = Object\.freeze\(\{\}\);/);
  const both = shopAssetsSource({ counter: 'assets/shop/shop-counter.webp', interior: 'assets/shop/shop-interior.webp' });
  assert.ok(both.indexOf('interior:') < both.indexOf('counter:'));
  assert.deepEqual(IMAGES.map((i) => i.key), ['interior', 'counter']);
});

test('syncShopPrecache lists exactly the shop files, before the title files, and is idempotent', () => {
  const sw = "const PRECACHE_URLS = [\n  'index.html',\n  'assets/ui/seed.webp',\n  'assets/title/title-bg.webp',\n];\n";
  const one = syncShopPrecache(sw, ['assets/shop/shop-interior.webp', 'assets/shop/shop-counter.webp']);
  assert.deepEqual(precacheUrls(one), [
    'index.html', 'assets/ui/seed.webp', 'assets/shop/shop-counter.webp', 'assets/shop/shop-interior.webp', 'assets/title/title-bg.webp',
  ]);
  assert.equal(syncShopPrecache(one, ['assets/shop/shop-interior.webp', 'assets/shop/shop-counter.webp']), one);
  assert.deepEqual(precacheUrls(syncShopPrecache(one, [])), ['index.html', 'assets/ui/seed.webp', 'assets/title/title-bg.webp']);
});

test('run: with no pictures, nothing ships and the list is empty', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-shop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'js/ui'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sw.js'), "const PRECACHE_URLS = [\n  'index.html',\n];\n");
  const result = run({ root, converter: null });
  assert.equal(result.ok, true);
  assert.deepEqual(result.assets, {});
  assert.deepEqual(result.missing, ['assets/shop/shop-interior.webp', 'assets/shop/shop-counter.webp']);
  assert.equal(fs.readFileSync(path.join(root, 'js/ui/shop-assets.js'), 'utf8'), shopAssetsSource({}));
});
