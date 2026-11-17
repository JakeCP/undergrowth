// Title assets: js/ui/title-assets.js (written by
// scripts/title-assets.mjs) must match the converted files on disk,
// every listed file must be precached for offline play, and the shipped
// sizes must stay in budget (images 2 MB, music 1.2 MB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TITLE_ASSETS, WORDMARK_NAME } from '../js/ui/title-assets.js';
import { ASSET_KEYS } from '../js/ui/title-scene.js';
import { GAME_TITLE } from '../js/ui/title-view.js';
import {
  IMAGES, IMAGE_BUDGET_BYTES, MUSIC_BUDGET_BYTES, titleAssetsSource, syncTitlePrecache,
} from '../scripts/title-assets.mjs';
import * as script from '../scripts/title-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function precacheUrls() {
  const block = read('sw.js').match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare const PRECACHE_URLS = [...]');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function titleFilesOnDisk() {
  const dir = path.join(ROOT, 'assets/title');
  if (!fs.existsSync(dir)) return [];
  // Only shipped files count: PNG and source-audio files beside them
  // are git-ignored inputs to scripts/title-assets.mjs.
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.webp') || f === 'title-theme.mp3')
    .sort()
    .map((f) => `assets/title/${f}`);
}

test('the asset list matches the converted files on disk', () => {
  const listed = Object.values(TITLE_ASSETS).filter((v) => v !== null).sort();
  assert.deepEqual(
    listed,
    titleFilesOnDisk(),
    'js/ui/title-assets.js and assets/title/ disagree: run `node scripts/title-assets.mjs`',
  );
  assert.equal(
    read('js/ui/title-assets.js'),
    titleAssetsSource(TITLE_ASSETS),
    'js/ui/title-assets.js is not what the script would write',
  );
});

test('every listed file exists and is in the service worker precache', () => {
  const urls = new Set(precacheUrls());
  for (const rel of Object.values(TITLE_ASSETS)) {
    if (rel === null) continue;
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `listed but missing: ${rel}`);
    assert.ok(urls.has(rel), `listed but not precached: ${rel}`);
  }
  assert.ok(![...urls].some((u) => u.includes('title-assets.mjs')), 'the script is never precached');
});

test('images total 2 MB or less and the music 1.2 MB or less', () => {
  let images = 0;
  let music = 0;
  for (const rel of titleFilesOnDisk()) {
    const bytes = fs.statSync(path.join(ROOT, rel)).size;
    if (rel.endsWith('.webp')) images += bytes;
    else music += bytes;
  }
  assert.equal(IMAGE_BUDGET_BYTES, 2 * 1024 * 1024);
  assert.equal(MUSIC_BUDGET_BYTES, Math.floor(1.2 * 1024 * 1024));
  assert.ok(images <= IMAGE_BUDGET_BYTES, `images total ${images} bytes`);
  assert.ok(music <= MUSIC_BUDGET_BYTES, `music totals ${music} bytes`);
});

test('syncTitlePrecache lists exactly the title files and is idempotent', () => {
  const sw = "const PRECACHE_URLS = [\n  './',\n  'js/app.js',\n];\n";
  const once = syncTitlePrecache(sw, ['assets/title/title-theme.mp3', 'assets/title/title-bg.webp']);
  assert.match(once, /'assets\/title\/title-bg\.webp'/);
  assert.match(once, /'assets\/title\/title-theme\.mp3'/);
  assert.equal(syncTitlePrecache(once, ['assets/title/title-bg.webp', 'assets/title/title-theme.mp3']), once);
  assert.equal(syncTitlePrecache(once, []), sw, 'removing every asset restores the list');
});

test('source PNGs and source audio are git-ignored; only converted files ship', () => {
  const ignored = read('.gitignore').split('\n').map((line) => line.trim());
  assert.ok(ignored.includes('assets/title/*.png'), '.gitignore must list assets/title/*.png');
  assert.ok(
    ignored.some((line) => line.startsWith('assets/title/') && /(wav|aif|flac|ogg|m4a)/.test(line)),
    '.gitignore must cover source audio under assets/title/',
  );
});

test('the list has exactly the keys the scene draws from, in order', () => {
  assert.deepEqual(Object.keys(TITLE_ASSETS), [...ASSET_KEYS]);
});

test('every image key has one source name; only the valleys are opaque', () => {
  assert.deepEqual(IMAGES.map((i) => i.key), ASSET_KEYS.filter((k) => k !== 'theme'));
  const byKey = Object.fromEntries(IMAGES.map((i) => [i.key, i]));
  assert.equal(byKey.valleyCutWide.png, 'title-valley-cut-wide.png');
  assert.equal(byKey.valleyRegrownTall.webp, 'title-valley-regrown-tall.webp');
  assert.equal(byKey.archTall.png, 'title-arch-tall.png');
  assert.equal(byKey.heroes.png, 'title-cast-heroes.png');
  assert.equal(byKey.bear.png, 'title-cast-bear.png');
  assert.equal(byKey.fernLeft.png, 'title-fern-left.png');
  assert.equal(byKey.wordmark.png, 'title-wordmark.png');
  for (const image of IMAGES) assert.equal(image.alpha, !image.key.startsWith('valley'), image.key);
});

test('the wordmark is lettered with the game\'s name', () => {
  assert.equal(WORDMARK_NAME, script.WORDMARK_NAME, 'the list file carries the script\'s name');
  assert.equal(
    WORDMARK_NAME, GAME_TITLE,
    'the game was renamed: repaint title-wordmark.png (docs/art/title-prompts.md) and change WORDMARK_NAME',
  );
});

test('trimCutout: a cut-out is cropped to its paint, faint residue ignored, and says where it was', () => {
  // 20x10, transparent, with a faint haze everywhere (alpha 2) and a
  // solid 6x4 block of paint at (10, 3).
  const width = 20;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) data.set([255, 200, 120, 2], p * 4);
  for (let y = 3; y < 7; y += 1) {
    for (let x = 10; x < 16; x += 1) data.set([200, 90, 30, 255], (y * width + x) * 4);
  }
  const { img, box } = script.trimCutout({ width, height, data });
  assert.deepEqual([img.width, img.height], [6, 4]);
  assert.deepEqual(box, { left: 50, top: 30, width: 30, height: 40 }, 'in percent of the source');
  assert.equal(img.data[3], 255);
});

test('only the cast, the ferns and the wordmark are trimmed; the archway keeps its whole canvas', () => {
  const trimmed = IMAGES.filter((i) => i.trim).map((i) => i.key);
  assert.deepEqual(trimmed, ['heroes', 'ants', 'bees', 'beaver', 'badger', 'owl', 'bear', 'fernLeft', 'fernRight', 'wordmark']);
});

test('each image ships no larger than it is shown: companions small, paintings 1280', () => {
  const side = Object.fromEntries(IMAGES.map((i) => [i.key, i.maxSide]));
  assert.equal(side.valleyCutWide, 1280);
  assert.equal(side.archTall, 1280);
  assert.equal(side.wordmark, 1280);
  assert.equal(side.heroes, 640);
  for (const key of ['ants', 'bees', 'beaver', 'badger', 'owl', 'bear', 'fernLeft', 'fernRight']) {
    assert.equal(side[key], 448, key);
  }
});
