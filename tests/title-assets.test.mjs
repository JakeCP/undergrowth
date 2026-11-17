// Title assets: js/ui/title-assets.js (written by
// scripts/title-assets.mjs) must match the converted files on disk,
// every listed file must be precached for offline play, and the shipped
// sizes must stay in budget (images 1 MB, music 1.2 MB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TITLE_ASSETS } from '../js/ui/title-assets.js';
import {
  IMAGE_BUDGET_BYTES, MUSIC_BUDGET_BYTES, titleAssetsSource, syncTitlePrecache,
} from '../scripts/title-assets.mjs';

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

test('images total 1 MB or less and the music 1.2 MB or less', () => {
  let images = 0;
  let music = 0;
  for (const rel of titleFilesOnDisk()) {
    const bytes = fs.statSync(path.join(ROOT, rel)).size;
    if (rel.endsWith('.webp')) images += bytes;
    else music += bytes;
  }
  assert.equal(IMAGE_BUDGET_BYTES, 1024 * 1024);
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
