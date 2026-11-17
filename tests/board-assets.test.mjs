// The battle board's painted pieces: js/ui/board-assets.js (written by
// scripts/board-assets.mjs) must match the converted files on disk, every
// listed file must be precached for offline play, the pieces stay within
// 300 KB together at 192 px square with their transparency, and no PNG
// is committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_ASSETS } from '../js/ui/board-assets.js';
import {
  BUDGET_BYTES, SIZE, BOARD_DIR, PIECES, boardAssetsSource, syncBoardPrecache, run,
} from '../scripts/board-assets.mjs';
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
  const dir = path.join(ROOT, BOARD_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => `${BOARD_DIR}/${f}`).sort();
}

test('the board piece list matches the WebP files on disk', () => {
  assert.deepEqual(Object.values(BOARD_ASSETS).sort(), webpOnDisk(), 'run `node scripts/board-assets.mjs`');
});

test('the list module is what the script would write for it, and names only pieces', () => {
  assert.equal(read('js/ui/board-assets.js'), boardAssetsSource(BOARD_ASSETS));
  for (const [name, file] of Object.entries(BOARD_ASSETS)) {
    assert.ok(PIECES.includes(name), name);
    assert.equal(file, `${BOARD_DIR}/${name}.webp`);
  }
});

test('every board piece is precached; the script never is', () => {
  const urls = precacheUrls();
  for (const file of Object.values(BOARD_ASSETS)) assert.ok(urls.includes(file), `${file} is not precached`);
  assert.deepEqual(urls.filter((u) => u.startsWith(`${BOARD_DIR}/`)).sort(), Object.values(BOARD_ASSETS).sort());
  assert.ok(urls.includes('js/ui/board-assets.js'));
  assert.ok(!urls.some((u) => u.startsWith('scripts/')));
});

test('the board pieces stay within 300 KB together, 192 px square, each with transparency', () => {
  assert.equal(BUDGET_BYTES, 300 * 1024);
  assert.equal(SIZE, 192);
  let total = 0;
  for (const file of Object.values(BOARD_ASSETS)) {
    const data = fs.readFileSync(path.join(ROOT, file));
    total += data.length;
    const size = webpSize(data);
    assert.ok(size !== null, `${file} is a WebP`);
    assert.equal(size.width, SIZE, `${file} width`);
    assert.equal(size.height, SIZE, `${file} height`);
    assert.ok(data.toString('ascii', 12, 16) === 'VP8X' && (data[20] & 0x10) !== 0, `${file} keeps its alpha`);
  }
  assert.ok(total <= BUDGET_BYTES, `${total} bytes`);
});

test('board PNG sources are git-ignored, so only WebP files are committed', () => {
  assert.match(read('.gitignore'), /^assets\/board\/\*\.png$/m);
});

test('the list module names only what exists, in the fixed piece order', () => {
  assert.match(boardAssetsSource({}), /export const BOARD_ASSETS = Object\.freeze\(\{\}\);/);
  const two = boardAssetsSource({ stump: 'assets/board/stump.webp', 'forest-pines': 'assets/board/forest-pines.webp' });
  assert.ok(two.indexOf("'forest-pines'") < two.indexOf("'stump'"));
  assert.equal(new Set(PIECES).size, PIECES.length);
  assert.equal(PIECES.length, 22);
});

test('syncBoardPrecache lists exactly the board files, before the title files, and is idempotent', () => {
  const sw = "const PRECACHE_URLS = [\n  'index.html',\n  'assets/ui/seed.webp',\n  'assets/title/title-bg.webp',\n];\n";
  const one = syncBoardPrecache(sw, ['assets/board/stump.webp', 'assets/board/hole.webp']);
  assert.deepEqual(precacheUrls(one), [
    'index.html', 'assets/ui/seed.webp', 'assets/board/hole.webp', 'assets/board/stump.webp', 'assets/title/title-bg.webp',
  ]);
  assert.equal(syncBoardPrecache(one, ['assets/board/stump.webp', 'assets/board/hole.webp']), one);
  assert.deepEqual(precacheUrls(syncBoardPrecache(one, [])), ['index.html', 'assets/ui/seed.webp', 'assets/title/title-bg.webp']);
});

test('run: with no pieces, nothing ships, the list is empty, and a second run changes nothing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-board-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'js/ui'), { recursive: true });
  fs.mkdirSync(path.join(root, BOARD_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, BOARD_DIR, 'old.webp'), 'x');
  fs.writeFileSync(path.join(root, 'sw.js'), "const PRECACHE_URLS = [\n  'index.html',\n  'assets/board/old.webp',\n];\n");
  const first = run({ root, converter: null });
  assert.equal(first.ok, true);
  assert.deepEqual(first.assets, {});
  assert.deepEqual(first.removed, ['assets/board/old.webp']);
  assert.equal(first.missing.length, PIECES.length);
  assert.equal(first.changed, true);
  assert.equal(fs.readFileSync(path.join(root, 'js/ui/board-assets.js'), 'utf8'), boardAssetsSource({}));
  assert.deepEqual(precacheUrls(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')), ['index.html']);
  const second = run({ root, converter: null });
  assert.equal(second.changed, false);
});

test('run: a source with no converter is an error, not a silent skip', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-board-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'js/ui'), { recursive: true });
  fs.mkdirSync(path.join(root, BOARD_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, BOARD_DIR, 'stump.png'), 'not really a png');
  fs.writeFileSync(path.join(root, 'sw.js'), "const PRECACHE_URLS = [\n  'index.html',\n];\n");
  const result = run({ root, converter: null });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /cwebp was not found/);
});
