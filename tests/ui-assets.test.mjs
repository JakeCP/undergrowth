// The painted interface kit: js/ui/ui-assets.js (written by
// scripts/ui-assets.mjs) must match the converted files on disk, every
// listed file must be precached for offline play, the whole kit stays
// within 900 KB at the widths it is shown at, the cut-outs keep their
// transparency and the pictures do not, no PNG is committed, and the
// pixel work that cleans the cut-outs' fringes and the backdrop's seam
// does what it says (scripts/png.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_ASSETS, UI_ASSET_SIZES } from '../js/ui/ui-assets.js';
import {
  BUDGET_BYTES, KIT, KIT_DIR, PIECES, uiAssetsSource, syncUiPrecache, run,
} from '../scripts/ui-assets.mjs';
import { decodePng, encodePng, cleanCutout, trim, resize, seamlessTile, seamScore } from '../scripts/png.mjs';
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
  const dir = path.join(ROOT, KIT_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => `${KIT_DIR}/${f}`).sort();
}

test('the kit list matches the WebP files on disk', () => {
  assert.deepEqual(Object.values(UI_ASSETS).sort(), webpOnDisk(), 'run `node scripts/ui-assets.mjs`');
});

test('the list module is what the script would write for it, and names only kit pieces', () => {
  assert.equal(read('js/ui/ui-assets.js'), uiAssetsSource(UI_ASSETS, UI_ASSET_SIZES));
  for (const [name, file] of Object.entries(UI_ASSETS)) {
    assert.ok(PIECES.includes(name), name);
    assert.equal(file, `${KIT_DIR}/${name}.webp`);
    const size = webpSize(fs.readFileSync(path.join(ROOT, file)));
    assert.deepEqual({ ...UI_ASSET_SIZES[name] }, { width: size?.width, height: size?.height }, `${name}: the listed size is the file's`);
  }
});

test('every kit file is precached; the scripts never are', () => {
  const urls = precacheUrls();
  for (const file of Object.values(UI_ASSETS)) assert.ok(urls.includes(file), `${file} is not precached`);
  assert.deepEqual(urls.filter((u) => u.startsWith(`${KIT_DIR}/`)).sort(), Object.values(UI_ASSETS).sort());
  assert.ok(urls.includes('js/ui/ui-assets.js'));
  assert.ok(!urls.some((u) => u.startsWith('scripts/')));
});

test('the whole kit stays within 900 KB, each piece no wider than it is shown at twice phone density', () => {
  assert.equal(BUDGET_BYTES, 900 * 1024);
  const widths = Object.fromEntries(KIT.map((p) => [p.key, p.width]));
  assert.equal(widths['button-primary'], 900);
  assert.equal(widths['panel-wood'], 768);
  assert.equal(widths['ribbon-green'], 1200);
  assert.equal(widths['button-round'], 192);
  assert.equal(widths['action-bite'], 128);
  assert.equal(widths.backdrop, 512);
  assert.equal(widths['result-victory'], 1280);
  let total = 0;
  for (const piece of KIT) {
    const file = UI_ASSETS[piece.key];
    if (file === undefined) continue;
    const data = fs.readFileSync(path.join(ROOT, file));
    total += data.length;
    const size = webpSize(data);
    assert.ok(size !== null, `${file} is a WebP`);
    assert.ok(size.width <= piece.width, `${file} is ${size.width} px wide, over ${piece.width}`);
    if (piece.kind === 'emblem') assert.equal(size.width, size.height, `${file} is square`);
    const alpha = data.toString('ascii', 12, 16) === 'VP8X' && (data[20] & 0x10) !== 0;
    const opaque = piece.kind === 'tile' || piece.kind === 'scene';
    assert.equal(alpha, !opaque, `${file} ${opaque ? 'is opaque' : 'keeps its transparency'}`);
  }
  assert.ok(total <= BUDGET_BYTES, `${total} bytes`);
});

test('kit PNG sources and the spare versions are git-ignored, so only WebP files are committed', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^assets\/ui\/\*\.png$/m);
  assert.match(ignore, /^assets\/ui\/alternates\/$/m);
});

test('the list module names only what exists, in the kit\'s order, with sizes', () => {
  const empty = uiAssetsSource({}, {});
  assert.match(empty, /export const UI_ASSETS = Object\.freeze\(\{\}\);/);
  assert.match(empty, /export const UI_ASSET_SIZES = Object\.freeze\(\{\}\);/);
  const two = uiAssetsSource(
    { 'action-bite': 'assets/kit/action-bite.webp', 'button-primary': 'assets/kit/button-primary.webp' },
    { 'action-bite': { width: 128, height: 128 }, 'button-primary': { width: 900, height: 182 } },
  );
  assert.ok(two.indexOf("'button-primary'") < two.indexOf("'action-bite'"));
  assert.match(two, /'button-primary': Object\.freeze\(\{ width: 900, height: 182 \}\)/);
  assert.equal(new Set(PIECES).size, PIECES.length);
  for (const id of ['bite', 'dig', 'build', 'ram', 'sting', 'maul', 'shove', 'strike']) assert.ok(PIECES.includes(`action-${id}`), id);
});

test('syncUiPrecache lists exactly the kit files, before the title files, and is idempotent', () => {
  const sw = "const PRECACHE_URLS = [\n  'index.html',\n  'assets/ui/seed.webp',\n  'assets/title/title-bg.webp',\n];\n";
  const one = syncUiPrecache(sw, ['assets/kit/panel-wood.webp', 'assets/kit/backdrop.webp']);
  assert.deepEqual(precacheUrls(one), [
    'index.html', 'assets/ui/seed.webp', 'assets/kit/backdrop.webp', 'assets/kit/panel-wood.webp', 'assets/title/title-bg.webp',
  ]);
  assert.equal(syncUiPrecache(one, ['assets/kit/panel-wood.webp', 'assets/kit/backdrop.webp']), one);
  assert.deepEqual(precacheUrls(syncUiPrecache(one, [])), ['index.html', 'assets/ui/seed.webp', 'assets/title/title-bg.webp']);
});

test('run: with no sources, nothing ships, the list is empty, the icons are left alone, and a second run changes nothing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-ui-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, KIT_DIR), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets/ui'), { recursive: true });
  fs.writeFileSync(path.join(root, KIT_DIR, 'old.webp'), 'x');
  fs.writeFileSync(path.join(root, 'assets/ui/seed.webp'), 'icon');
  fs.writeFileSync(path.join(root, 'sw.js'), "const PRECACHE_URLS = [\n  'index.html',\n  'assets/ui/seed.webp',\n  'assets/kit/old.webp',\n];\n");
  const first = run({ root, converter: null });
  assert.equal(first.ok, true);
  assert.deepEqual(first.assets, {});
  assert.deepEqual(first.removed, ['assets/kit/old.webp']);
  assert.equal(first.missing.length, PIECES.length);
  assert.equal(first.changed, true);
  assert.ok(fs.existsSync(path.join(root, 'assets/ui/seed.webp')), 'the map\'s icons are not the kit\'s');
  assert.deepEqual(precacheUrls(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')), ['index.html', 'assets/ui/seed.webp']);
  assert.equal(run({ root, converter: null }).changed, false);
});

test('run: a source with no converter is an error, not a silent skip', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-ui-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets/ui'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/ui/backdrop.png'), 'not really a png');
  fs.writeFileSync(path.join(root, 'sw.js'), "const PRECACHE_URLS = [\n  'index.html',\n];\n");
  const result = run({ root, converter: null });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /cwebp was not found/);
});

// --- the pixel work (scripts/png.mjs) ---

/**
 * A w x h image of one colour and alpha.
 * @param {number} w @param {number} h @param {number[]} rgba
 */
function solid(w, h, rgba) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p += 1) data.set(rgba, p * 4);
  return { width: w, height: h, data };
}

/** @param {{width: number, data: Uint8ClampedArray}} img @param {number} x @param {number} y */
const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

test('png: what is written reads back the same, with or without alpha', () => {
  const img = solid(5, 3, [10, 200, 30, 128]);
  img.data.set([255, 0, 0, 255], 4);
  assert.deepEqual(decodePng(encodePng(img)), img);
  const opaque = decodePng(encodePng(img, { opaque: true }));
  assert.deepEqual(px(opaque, 1, 0), [255, 0, 0, 255]);
  assert.deepEqual(px(opaque, 2, 2), [10, 200, 30, 255]);
});

test('cleanCutout: faint speckles and small specks go, a pixel of halo is trimmed, and the soft edge takes the paint\'s colour', () => {
  // A 20x20 green square in the middle of 40x40, with a soft red rim, a
  // faint yellow speckle far off and a small solid red speck.
  const img = solid(40, 40, [0, 0, 0, 0]);
  for (let y = 10; y < 30; y += 1) for (let x = 10; x < 30; x += 1) img.data.set([40, 120, 40, 255], (y * 40 + x) * 4);
  for (let x = 9; x <= 30; x += 1) { img.data.set([220, 30, 30, 140], (9 * 40 + x) * 4); img.data.set([220, 30, 30, 140], (8 * 40 + x) * 4); }
  img.data.set([240, 220, 0, 12], (2 * 40 + 2) * 4);
  img.data.set([255, 0, 0, 255], (36 * 40 + 36) * 4);
  // (A speck is small beside the piece: here under 1% of the square.)
  const report = cleanCutout(img, { island: 0.01 });
  assert.ok(report.faint >= 1);
  assert.ok(report.islands >= 1);
  assert.deepEqual(px(img, 2, 2), [0, 0, 0, 0], 'the faint speckle is gone');
  assert.deepEqual(px(img, 36, 36), [0, 0, 0, 0], 'the speck is gone');
  assert.equal(px(img, 15, 8)[3], 0, 'the outer pixel of the rim is trimmed');
  const rim = px(img, 15, 9);
  assert.equal(rim[3], 140, 'the inner rim keeps its softness');
  assert.deepEqual(rim.slice(0, 3), [40, 120, 40], 'but in the paint\'s green, not red');
  assert.deepEqual(px(img, 20, 20), [40, 120, 40, 255], 'the paint itself is untouched');
});

test('trim and resize: cropped to the piece (squared for an emblem), then shrunk without a dark rim', () => {
  const img = solid(30, 20, [0, 0, 0, 0]);
  for (let y = 5; y < 15; y += 1) for (let x = 4; x < 24; x += 1) img.data.set([200, 180, 100, 255], (y * 30 + x) * 4);
  const cut = trim(img, { pad: 1 });
  assert.equal(cut.width, 22);
  assert.equal(cut.height, 12);
  const square = trim(img, { square: true });
  assert.equal(square.width, square.height);
  const small = resize(cut, 11, 6);
  assert.equal(small.width, 11);
  const edge = px(small, 0, 3);
  assert.ok(edge[3] > 0 && edge[3] < 255, 'the edge is soft');
  assert.deepEqual(edge.slice(0, 3), [200, 180, 100], 'and keeps its colour: no black creeps in from the empty pixels');
});

test('seamlessTile: a tile whose edges do not meet is made to meet, the middle stays the painting', () => {
  // Left to right a ramp, so the right edge does not meet the left.
  const img = solid(64, 64, [0, 0, 0, 255]);
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) img.data.set([x * 3, 60, (y * 7) % 50, 255], (y * 64 + x) * 4);
  assert.ok(seamScore(img) > 2);
  const fixed = seamlessTile(img, 0.2);
  assert.ok(seamScore(fixed) < seamScore(img) / 4, `${seamScore(fixed)}`);
  assert.deepEqual(px(fixed, 32, 32), px(img, 32, 32));
});
