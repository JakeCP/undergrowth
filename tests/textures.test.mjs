// The texture dev script (scripts/textures.mjs): PNG sources in
// assets/textures/ become 512px WebP files beside them, and the texture
// list and the service worker's precache list follow what is on disk.
// The conversion test makes its own small PNGs in a temp folder and is
// skipped where neither cwebp nor a WebP-writing sips is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  REQUIRED, OPTIONAL, MAX_SIZE, BUDGET_BYTES,
  pngSize, webpSize, targetSize, findConverter,
  syncPrecache, bumpVersion, textureListSource, run, formatReport,
} from '../scripts/textures.mjs';
import { REQUIRED_TEXTURES, OPTIONAL_TEXTURES } from '../js/ui/patterns.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- a tiny PNG writer, so no test image is ever committed ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** An RGB gradient of the given size. */
function makePng(width, height) {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * row + 1 + x * 3;
      raw[i] = 60 + ((x * 120) / width) | 0;
      raw[i + 1] = 120 + ((y * 100) / height) | 0;
      raw[i + 2] = 50;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const SW = `// header comment
const APP_VERSION = '7';
const CACHE_NAME = \`undergrowth-v\${APP_VERSION}\`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'js/app.js',
  'icons/icon-512.png',
];

self.addEventListener('install', () => {});
`;

function precacheUrls(sw) {
  const block = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block);
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** A throwaway project root with just what the script touches. */
function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-textures-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'js/ui'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sw.js'), SW);
  fs.writeFileSync(path.join(root, 'js/ui/texture-list.js'), textureListSource([]));
  return root;
}

// --- names ---

test('the script and the game agree on the texture names', () => {
  assert.deepEqual(REQUIRED, ['grass', 'soil', 'water', 'stubble', 'paving', 'stone']);
  assert.deepEqual(OPTIONAL, ['meadow', 'bank', 'grass-lush', 'grass-clover']);
  assert.deepEqual(REQUIRED, [...REQUIRED_TEXTURES]);
  assert.deepEqual(OPTIONAL, [...OPTIONAL_TEXTURES]);
  assert.equal(MAX_SIZE, 512);
  assert.equal(BUDGET_BYTES, 400 * 1024);
});

// --- image headers ---

test('pngSize reads the size from a PNG header and rejects other data', () => {
  assert.deepEqual(pngSize(makePng(600, 400)), { width: 600, height: 400 });
  assert.deepEqual(pngSize(makePng(1, 1)), { width: 1, height: 1 });
  assert.equal(pngSize(Buffer.from('not a png at all, just some text')), null);
  assert.equal(pngSize(Buffer.alloc(4)), null);
});

test('webpSize reads lossy, lossless and extended WebP headers', () => {
  const riff = (fourcc, payload) => {
    const body = Buffer.concat([Buffer.from('WEBP'), Buffer.from(fourcc, 'latin1'), Buffer.alloc(4), payload]);
    const head = Buffer.alloc(8);
    head.write('RIFF', 0, 'latin1');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  // VP8 (lossy): 3 bytes frame tag, start code 9d 01 2a, then 14-bit width and height.
  const vp8 = Buffer.alloc(10);
  vp8.set([0x9d, 0x01, 0x2a], 3);
  vp8.writeUInt16LE(512, 6);
  vp8.writeUInt16LE(341, 8);
  assert.deepEqual(webpSize(riff('VP8 ', vp8)), { width: 512, height: 341 });
  // VP8L (lossless): signature 2f, then 14 bits of width-1 and 14 bits of height-1.
  const vp8l = Buffer.alloc(5);
  vp8l[0] = 0x2f;
  vp8l.writeUInt32LE(((256 - 1) | ((64 - 1) << 14)) >>> 0, 1);
  assert.deepEqual(webpSize(riff('VP8L', vp8l)), { width: 256, height: 64 });
  // VP8X (extended): flags, 3 reserved bytes, then 24-bit width-1 and height-1.
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(1024 - 1, 4, 3);
  vp8x.writeUIntLE(768 - 1, 7, 3);
  assert.deepEqual(webpSize(riff('VP8X', vp8x)), { width: 1024, height: 768 });

  assert.equal(webpSize(makePng(8, 8)), null);
  assert.equal(webpSize(Buffer.alloc(10)), null);
});

test('targetSize fits the longer side into 512 px, keeps the shape, and never enlarges', () => {
  assert.deepEqual(targetSize(600, 600), { width: 512, height: 512 });
  assert.deepEqual(targetSize(1024, 512), { width: 512, height: 256 });
  assert.deepEqual(targetSize(600, 400), { width: 512, height: 341 });
  assert.deepEqual(targetSize(400, 2000), { width: 102, height: 512 });
  assert.deepEqual(targetSize(512, 512), { width: 512, height: 512 });
  assert.deepEqual(targetSize(64, 48), { width: 64, height: 48 });
  assert.deepEqual(targetSize(5000, 1), { width: 512, height: 1 });
});

// --- the precache list and the texture list ---

test('syncPrecache adds the textures on disk to the precache list and nothing else changes', () => {
  const out = syncPrecache(SW, ['grass', 'water']);
  assert.deepEqual(precacheUrls(out), [
    './', 'index.html', 'js/app.js', 'icons/icon-512.png',
    'assets/textures/grass.webp', 'assets/textures/water.webp',
  ]);
  assert.equal(out.replace(/^  'assets\/textures\/[a-z]+\.webp',\n/gm, ''), SW);
});

test('syncPrecache is idempotent, sorts, and drops textures that are gone', () => {
  const once = syncPrecache(SW, ['water', 'grass']);
  assert.equal(syncPrecache(once, ['grass', 'water']), once);
  const fewer = syncPrecache(once, ['water']);
  assert.deepEqual(precacheUrls(fewer).filter((u) => u.startsWith('assets/')), ['assets/textures/water.webp']);
  assert.equal(syncPrecache(fewer, []), SW);
  assert.equal(syncPrecache(SW, []), SW);
});

test('syncPrecache refuses a service worker with no precache list', () => {
  assert.throws(() => syncPrecache('const nothing = 1;\n', ['grass']), /PRECACHE_URLS/);
});

test('bumpVersion adds one to APP_VERSION', () => {
  assert.match(bumpVersion(SW), /const APP_VERSION = '8';/);
  assert.match(bumpVersion(SW.replace("'7'", "'9'")), /const APP_VERSION = '10';/);
  assert.equal(bumpVersion(SW).replace("'8'", "'7'"), SW);
  assert.throws(() => bumpVersion('nothing here'), /APP_VERSION/);
});

test('textureListSource writes a module that exports the names', async (t) => {
  const root = tempRoot(t);
  const file = path.join(root, 'list.mjs');
  fs.writeFileSync(file, textureListSource(['grass', 'meadow']));
  const mod = await import(pathToFileURL(file).href);
  assert.deepEqual([...mod.TEXTURES_PRESENT], ['grass', 'meadow']);
  assert.match(textureListSource([]), /Generated by scripts\/textures\.mjs/);
});

test('the committed texture list is what the script would write', () => {
  const dir = path.join(ROOT, 'assets/textures');
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).sort().map((f) => f.slice(0, -5))
    : [];
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'js/ui/texture-list.js'), 'utf8'),
    textureListSource(names),
    'js/ui/texture-list.js is out of date: run `node scripts/textures.mjs`',
  );
});

// --- running the script ---

test('run: with no textures at all, every required one is reported missing and nothing is written', (t) => {
  const root = tempRoot(t);
  const result = run({ root, converter: null });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingRequired, REQUIRED);
  assert.deepEqual(result.missingOptional, OPTIONAL);
  assert.deepEqual(result.present, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.changed, false, 'nothing changed, so nothing to re-hash');
  assert.equal(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), SW);
  assert.equal(fs.readFileSync(path.join(root, 'js/ui/texture-list.js'), 'utf8'), textureListSource([]));

  const report = formatReport(result);
  assert.match(report, /MISSING required texture/);
  for (const name of REQUIRED) {
    assert.match(report, new RegExp(`assets/textures/${name}\\.png`), `${name} is named with the file to add`);
  }
  assert.match(report, /fallback/);
});

test('run: a PNG with no converter installed is an error that says what to install', (t) => {
  const root = tempRoot(t);
  fs.mkdirSync(path.join(root, 'assets/textures'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/textures/grass.png'), makePng(8, 8));
  const result = run({ root, converter: null });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cwebp/);
  assert.match(formatReport(result), /cwebp/);
  assert.ok(!fs.existsSync(path.join(root, 'assets/textures/grass.webp')));
});

test('run: a file that is not a real PNG is reported, not converted', (t) => {
  const root = tempRoot(t);
  fs.mkdirSync(path.join(root, 'assets/textures'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/textures/soil.png'), 'this is not an image');
  const result = run({ root, converter: 'cwebp' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /soil\.png/);
  assert.ok(result.missingRequired.includes('soil'));
});

test('run: a PNG whose name is not a texture the game uses is skipped with a warning', (t) => {
  const root = tempRoot(t);
  fs.mkdirSync(path.join(root, 'assets/textures'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/textures/lava.png'), makePng(8, 8));
  const result = run({ root, converter: null });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /lava\.png/);
  assert.ok(!fs.existsSync(path.join(root, 'assets/textures/lava.webp')));
});

test('run: WebP files already there count as present, with no PNG and no converter', (t) => {
  const root = tempRoot(t);
  fs.mkdirSync(path.join(root, 'assets/textures'), { recursive: true });
  // A fresh clone has only the committed WebP files. This one is a header with no picture.
  const vp8x = Buffer.alloc(30);
  vp8x.write('RIFF', 0, 'latin1');
  vp8x.writeUInt32LE(22, 4);
  vp8x.write('WEBPVP8X', 8, 'latin1');
  vp8x.writeUIntLE(1024 - 1, 24, 3);
  vp8x.writeUIntLE(64 - 1, 27, 3);
  for (const name of REQUIRED) fs.writeFileSync(path.join(root, `assets/textures/${name}.webp`), vp8x);
  const result = run({ root, converter: null });
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.present, [...REQUIRED].sort());
  assert.equal(result.changed, true, 'the lists had to be brought up to date');
  assert.deepEqual(
    precacheUrls(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')).filter((u) => u.startsWith('assets/')),
    [...REQUIRED].sort().map((n) => `assets/textures/${n}.webp`),
  );
  // Too big is a warning, on every file that is too big.
  assert.equal(result.warnings.filter((w) => /1024x64/.test(w)).length, REQUIRED.length);
  assert.equal(run({ root, converter: null }).changed, false);
});

const converter = findConverter();

test('run: converts PNG sources to WebP of 512 px or less and updates both lists', { skip: converter === null ? 'no cwebp and no WebP-writing sips on this machine' : false }, (t) => {
  const root = tempRoot(t);
  const dir = path.join(root, 'assets/textures');
  fs.mkdirSync(dir, { recursive: true });
  const big = makePng(600, 400);
  const small = makePng(64, 64);
  fs.writeFileSync(path.join(dir, 'grass.png'), big);
  fs.writeFileSync(path.join(dir, 'meadow.png'), small);

  const result = run({ root, converter });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.converted, ['grass', 'meadow']);
  assert.deepEqual(result.present, ['grass', 'meadow']);
  assert.deepEqual(result.missingRequired, ['soil', 'water', 'stubble', 'paving', 'stone']);
  assert.deepEqual(result.missingOptional, ['bank', 'grass-lush', 'grass-clover']);
  assert.equal(result.ok, false, 'required textures are still missing');
  assert.equal(result.changed, true);

  // WebP beside the source, shrunk to fit 512 px, never enlarged.
  assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, 'grass.webp'))), { width: 512, height: 341 });
  assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, 'meadow.webp'))), { width: 64, height: 64 });
  assert.ok(result.totalBytes > 0 && result.totalBytes < BUDGET_BYTES);
  // The sources are left alone.
  assert.deepEqual(fs.readFileSync(path.join(dir, 'grass.png')), big);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['grass.png', 'grass.webp', 'meadow.png', 'meadow.webp']);

  // The game's list and the service worker's precache list both follow.
  assert.equal(
    fs.readFileSync(path.join(root, 'js/ui/texture-list.js'), 'utf8'),
    textureListSource(['grass', 'meadow']),
  );
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.deepEqual(precacheUrls(sw).filter((u) => u.startsWith('assets/')), [
    'assets/textures/grass.webp', 'assets/textures/meadow.webp',
  ]);
  assert.match(sw, /const APP_VERSION = '7';/, 'run leaves the version to the command line');

  const report = formatReport(result);
  assert.match(report, /grass/);
  assert.match(report, /512x341/);
  assert.match(report, /MISSING required texture/);
  assert.match(report, /soil\s+MISSING/);
  assert.doesNotMatch(report, /grass\s+MISSING/);

  // Running again changes nothing.
  const again = run({ root, converter });
  assert.equal(again.changed, false);
  assert.deepEqual(again.present, ['grass', 'meadow']);
});

test('run: with every required texture present the result is ok', { skip: converter === null ? 'no cwebp and no WebP-writing sips on this machine' : false }, (t) => {
  const root = tempRoot(t);
  const dir = path.join(root, 'assets/textures');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of REQUIRED) fs.writeFileSync(path.join(dir, `${name}.png`), makePng(32, 32));
  const result = run({ root, converter });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.missingOptional, OPTIONAL);
  assert.doesNotMatch(formatReport(result), /MISSING/);
});
