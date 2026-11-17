// Portraits: mood lookup (js/ui/portraits.js), the dev script that
// converts PNG sources to WebP (scripts/portraits.mjs), and the shipped
// files themselves. The conversion test makes its own small PNGs in a
// temp folder and is skipped where cwebp is not installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { portraitFor, portraitSpec, shopkeeperSpec, drawPortrait, PORTRAIT_MOODS, SHOPKEEPER } from '../js/ui/portraits.js';
import { PORTRAIT_LIST } from '../js/ui/portrait-list.js';
import { BAND_TYPES } from '../js/engine/units.js';
import {
  KNOWN_IDS, MOODS, MAX_SIZE, BUDGET_BYTES, QUALITY,
  normalizePortraitName, squareCrop, portraitListSource,
  syncPrecache, run, formatReport,
  WHOLE_FIGURES, SEAT_SHARE, rowCoverage, seatRow, seatGap, shiftDown, readPam, writePam, baseId, decoderFor,
  MOOD_FRAMES, moodFrame, framePixels, placeOn,
  isBlinkId, silhouetteMismatch, silhouetteOffset, blinkMask, blinkPatch, BLINK_GROW, BLINK_FEATHER, BLINK_REACH,
} from '../scripts/portraits.mjs';
import { webpSize } from '../scripts/textures.mjs';

installFakeDom({ canvas: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// --- portraitFor: mood, base, stamp ---

test('portraitFor prefers the mood portrait, then the base portrait, then the stamp', () => {
  assert.deepEqual(portraitFor('fox', 'surprised', ['fox', 'fox-surprised']), {
    kind: 'image', href: 'assets/portraits/fox-surprised.webp', alt: 'Fox',
  });
  assert.deepEqual(portraitFor('fox', 'sad', ['fox']), {
    kind: 'image', href: 'assets/portraits/fox.webp', alt: 'Fox',
  });
  assert.deepEqual(portraitFor('owl', undefined, ['owl', 'owl-happy']), {
    kind: 'image', href: 'assets/portraits/owl.webp', alt: 'Owl',
  });
  const stamp = portraitFor('owl', 'angry', []);
  assert.equal(stamp.kind, 'stamp');
  assert.equal(stamp.alt, 'Owl');
});

test('portraitFor does not throw for an id with no band type: a plain stamp from its first letter', () => {
  // The fox and the hedgehog are band types now: their stamps are their own.
  const fox = portraitFor('fox', 'happy', []);
  assert.equal(fox.kind, 'stamp');
  assert.equal(/** @type {any} */ (fox).glyph, BAND_TYPES.fox.glyph);
  const hedgehog = portraitFor('hedgehog', undefined, []);
  assert.equal(hedgehog.kind, 'stamp');
  assert.equal(/** @type {any} */ (hedgehog).glyph, BAND_TYPES.hedgehog.glyph);
  assert.doesNotThrow(() => portraitFor('wombat', 'sad', []));
  assert.equal(/** @type {any} */ (portraitFor('wombat', 'sad', [])).glyph, 'W');
});

test('portraitSpec and shopkeeperSpec keep working for their current callers', () => {
  assert.deepEqual(portraitSpec('owl', ['owl']), {
    kind: 'image', href: 'assets/portraits/owl.webp', alt: 'Owl',
  });
  assert.equal(portraitSpec('owl', []).kind, 'stamp');
  assert.deepEqual(shopkeeperSpec(['shopkeeper']), {
    kind: 'image', href: 'assets/portraits/shopkeeper.webp',
    alt: 'Hazel, the keeper of the trading post',
  });
  assert.equal(shopkeeperSpec([]).kind, 'stamp');
  assert.equal(portraitSpec('owl').kind, PORTRAIT_LIST.includes('owl') ? 'image' : 'stamp');
  assert.equal(shopkeeperSpec().kind, PORTRAIT_LIST.includes('shopkeeper') ? 'image' : 'stamp');
});

// --- the name-normalising function ---

test('normalizePortraitName maps obvious names to the <id> / <id>-<mood> convention', () => {
  const cases = [
    ['ants.png', 'ants'],
    ['Fox.png', 'fox'],
    ['FOX.PNG', 'fox'],
    ['shopkeeper.png', 'shopkeeper'],
    ['Fox Surprised.png', 'fox-surprised'],
    ['hedgehog_angry.png', 'hedgehog-angry'],
    ['owl-happy.png', 'owl-happy'],
    ['Bear Sad.png', 'bear-sad'],
    ['saw angry.PNG', 'saw-angry'],
    ['  beaver_happy .png', 'beaver-happy'],
    ['fox-mad.png', 'fox-angry'],
    ['fox-mad-transparent.png', 'fox-angry'],
    ['badger-scared-transparent.png', 'badger-scared'],
    ['hedgehog-surprised-transparent.png', 'hedgehog-surprised'],
    ['fox-subtle-happy-transparent.png', 'fox-happy'],
    ['bear-subtle-sad-transparent.png', 'bear-sad'],
    ['fox-transparent.png', 'fox'],
    ['Hedgehog Transparent.png', 'hedgehog'],
    ['shopkeeper-shrewd-transparent.png', 'shopkeeper-shrewd'],
    ['shopkeeper-greedy-transparent.png', 'shopkeeper-greedy'],
    ['Shopkeeper Greedy.png', 'shopkeeper-greedy'],
    ['fox_shrewd.png', 'fox-shrewd'],
    ['fox-blink-transparent.png', 'fox-blink'],
    ['shopkeeper-blink-transparent.png', 'shopkeeper-blink'],
    ['Owl Blink.png', 'owl-blink'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizePortraitName(input), expected, input);
  }
});

test('normalizePortraitName refuses names it cannot place instead of guessing', () => {
  const cases = [
    'transparent.png',
    'wombat-transparent.png',
    'wombat.png',
    'fox-smug.png',
    'fox-subtle.png',
    'fox-transparent-happy.png',
    'happy.png',
    'fox-happy-extra.png',
    'fox.jpg',
    'fox',
    '',
    '.png',
    'fox2.png',
    'screenshot 2026.png',
    'blink.png',
    'wombat-blink.png',
    'fox-happy-blink.png',
    'blink-fox.png',
    'fox-subtle-blink.png',
  ];
  for (const input of cases) {
    assert.equal(normalizePortraitName(input), null, input);
  }
});

test('the script knows every band id, fox, hedgehog, the shopkeeper, and the seven moods', () => {
  assert.deepEqual([...KNOWN_IDS].sort(), [
    'ants', 'badger', 'bear', 'beaver', 'bees', 'fox', 'harvester',
    'hedgehog', 'owl', 'planter', 'saw', 'shopkeeper',
  ]);
  assert.deepEqual([...MOODS].sort(), ['angry', 'greedy', 'happy', 'sad', 'scared', 'shrewd', 'surprised']);
  assert.deepEqual([...PORTRAIT_MOODS], [...MOODS], 'the game and the script know the same moods');
  assert.equal(MAX_SIZE, 512);
  assert.equal(BUDGET_BYTES, 2 * 1024 * 1024);
  assert.ok(Number.isInteger(QUALITY) && QUALITY >= 1 && QUALITY <= 100);
});

// --- centre crop ---

test('squareCrop centre-crops to a square of 512 px or less and never enlarges', () => {
  assert.deepEqual(squareCrop(1254, 1254), { x: 0, y: 0, size: 1254, out: 512 });
  assert.deepEqual(squareCrop(1000, 600), { x: 200, y: 0, size: 600, out: 512 });
  assert.deepEqual(squareCrop(600, 1000), { x: 0, y: 200, size: 600, out: 512 });
  assert.deepEqual(squareCrop(601, 400), { x: 100, y: 0, size: 400, out: 400 });
  assert.deepEqual(squareCrop(64, 64), { x: 0, y: 0, size: 64, out: 64 });
});

// --- the generated list and the precache ---

test('portraitListSource writes a sorted module that exports PORTRAIT_LIST', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-portrait-list-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'list.mjs');
  fs.writeFileSync(file, portraitListSource(['owl', 'ants', 'owl-happy']));
  const mod = await import(pathToFileURL(file).href);
  assert.deepEqual([...mod.PORTRAIT_LIST], ['ants', 'owl', 'owl-happy']);
  assert.match(portraitListSource([]), /Generated by scripts\/portraits\.mjs/);
});

const SW = `// header comment
const APP_VERSION = '7';
const CACHE_NAME = \`undergrowth-v\${APP_VERSION}\`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'js/ui/portrait-list.js',
  'assets/textures/grass.webp',
];

self.addEventListener('install', () => {});
`;

function precacheUrls(sw) {
  const block = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block);
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('syncPrecache lists exactly the portraits, leaves textures alone, and is idempotent', () => {
  const out = syncPrecache(SW, ['owl', 'ants']);
  assert.deepEqual(precacheUrls(out).filter((u) => u.startsWith('assets/portraits/')), [
    'assets/portraits/ants.webp', 'assets/portraits/owl.webp',
  ]);
  assert.ok(precacheUrls(out).includes('assets/textures/grass.webp'), 'textures untouched');
  assert.equal(syncPrecache(out, ['ants', 'owl']), out);
  assert.deepEqual(
    precacheUrls(syncPrecache(out, ['owl'])).filter((u) => u.startsWith('assets/portraits/')),
    ['assets/portraits/owl.webp'],
  );
  assert.equal(syncPrecache(SW, []), SW);
  assert.throws(() => syncPrecache('const nothing = 1;\n', ['owl']), /PRECACHE_URLS/);
});

// --- the shipped files ---

function shippedWebp() {
  const dir = path.join(ROOT, 'assets/portraits');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
}

test('PORTRAIT_LIST matches the WebP files on disk, sorted, and every one is precached', () => {
  assert.deepEqual([...PORTRAIT_LIST], shippedWebp().map((f) => f.slice(0, -5)).sort());
  assert.deepEqual([...PORTRAIT_LIST], [...PORTRAIT_LIST].sort());
  const precached = new Set(precacheUrls(read('sw.js')));
  for (const id of PORTRAIT_LIST) {
    assert.ok(precached.has(`assets/portraits/${id}.webp`), `${id} is precached`);
  }
  assert.ok(precached.has('js/ui/portrait-list.js'), 'the list module itself is precached');
  assert.ok(![...precached].some((u) => u.includes('scripts/portraits')), 'the script is never precached');
  assert.ok(![...precached].some((u) => u.endsWith('.png') && u.startsWith('assets/portraits/')), 'no PNG is shipped');
});

test('each shipped portrait is a square WebP of 512 px or less, under 2 MB in total', () => {
  assert.ok(PORTRAIT_LIST.length > 0, 'at least one portrait is shipped');
  let total = 0;
  for (const file of shippedWebp()) {
    const data = fs.readFileSync(path.join(ROOT, 'assets/portraits', file));
    const size = webpSize(data);
    assert.ok(size !== null, `${file} is a WebP image`);
    assert.equal(size.width, size.height, `${file} is square`);
    assert.ok(size.width <= MAX_SIZE, `${file} is ${size.width}px, over ${MAX_SIZE}px`);
    total += data.length;
  }
  assert.ok(total < BUDGET_BYTES, `portraits total ${total} bytes, over the ${BUDGET_BYTES} byte budget`);
});

test('portrait PNG sources are git-ignored, so only WebP files are committed', () => {
  const ignored = read('.gitignore').split('\n').map((line) => line.trim());
  assert.ok(ignored.includes('assets/portraits/*.png'), '.gitignore must list assets/portraits/*.png');
});

// --- display: cover, centred, alt, stamp on failure ---

test('an image portrait fills its circle with the name as its label, over a plain disc', () => {
  const parent = new FakeEl('svg');
  drawPortrait(/** @type {any} */ (parent), portraitFor('owl', undefined, ['owl']), 32, 32, 30);
  const images = parent.all().filter((e) => e.tag === 'image');
  const photo = images.find((e) => e.getAttribute('href') === 'assets/portraits/owl.webp');
  assert.ok(photo, 'the portrait image is drawn');
  assert.equal(photo.getAttribute('preserveAspectRatio'), 'xMidYMid slice', 'cover, centred');
  assert.match(photo.getAttribute('clip-path'), /url\(#/);
  const title = parent.all().find((e) => e.tag === 'title');
  assert.equal(title?.textContent, 'Owl', 'the character name labels the image');
  assert.ok(
    !parent.all().some((e) => e.getAttribute('data-glyph') !== null),
    'no stamp glyph under the image, so nothing peeks through a transparent portrait',
  );
  photo.dispatch('error');
  assert.ok(
    !parent.all().some((e) => e.getAttribute('href') === 'assets/portraits/owl.webp'),
    'a failed image is removed',
  );
  assert.ok(parent.all().some((e) => e.getAttribute('data-glyph') !== null), 'leaving the stamp instead');
});

test('a shop-mood portrait that fails to load leaves Hazel\'s own stamp, not a letter', () => {
  for (const mood of ['shrewd', 'greedy']) {
    const parent = new FakeEl('svg');
    drawPortrait(/** @type {any} */ (parent), portraitFor('shopkeeper', mood, ['shopkeeper', `shopkeeper-${mood}`]), 32, 32, 30);
    const photo = parent.all().find((e) => e.getAttribute('href') === `assets/portraits/shopkeeper-${mood}.webp`);
    assert.ok(photo, mood);
    photo.dispatch('error');
    const glyph = parent.all().find((e) => e.getAttribute('data-glyph') !== null);
    assert.equal(glyph?.getAttribute('data-glyph'), SHOPKEEPER.glyph, mood);
  }
});

// --- putting a mood portrait in its character's frame ---

test('only the shopkeeper\'s mood portraits are reframed, onto her plain portrait\'s frame', () => {
  assert.deepEqual(Object.keys(MOOD_FRAMES), ['shopkeeper']);
  assert.equal(moodFrame('shopkeeper'), null, 'the plain portrait stays as it is');
  for (const mood of MOODS) assert.equal(moodFrame(`shopkeeper-${mood}`), MOOD_FRAMES.shopkeeper, mood);
  assert.equal(moodFrame('fox-happy'), null);
  assert.equal(moodFrame('shopkeeper-blink'), null, 'a blink is of the plain portrait, in its frame already');
  assert.equal(moodFrame('fox'), null);
  // At 512 px: shrunk to 461 px, its corner at (25, 51), so its bottom
  // edge stays on the bottom edge and the bust still stands on it.
  const px = framePixels(MOOD_FRAMES.shopkeeper, 512);
  assert.deepEqual(px, { size: 461, x: 25, y: 51 });
  assert.equal(px.y + px.size, 512);
});

test('placeOn lays an image on a transparent square, cutting off what falls outside', () => {
  const image = rowsImage([2, 2], 2);
  const placed = placeOn(image, 4, 1, 2);
  assert.equal(placed.width, 4);
  assert.equal(placed.height, 4);
  assert.deepEqual(rowCoverage(placed), [0, 0, 2, 2]);
  const alpha = (/** @type {any} */ img, x, y) => img.data[(y * img.width + x) * 4 + 3];
  assert.equal(alpha(placed, 0, 2), 0);
  assert.equal(alpha(placed, 1, 2), 255);
  assert.equal(alpha(placed, 2, 3), 255);
  assert.equal(alpha(placed, 3, 3), 0);
  // Hanging off the right and bottom edges, and off the left.
  assert.deepEqual(rowCoverage(placeOn(image, 4, 3, 3)), [0, 0, 0, 1]);
  assert.deepEqual(rowCoverage(placeOn(image, 4, -1, 0)), [1, 1, 0, 0]);
  assert.deepEqual(rowCoverage(placeOn(image, 4, 9, 0)), [0, 0, 0, 0]);
});

// --- running the script ---

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
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-portraits-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'js/ui'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sw.js'), SW);
  fs.writeFileSync(path.join(root, 'js/ui/portrait-list.js'), portraitListSource([]));
  return root;
}

test('run: with no portraits at all, nothing is written and the result is ok', (t) => {
  const root = tempRoot(t);
  const result = run({ root, converter: null });
  assert.equal(result.ok, true);
  assert.deepEqual(result.present, []);
  assert.deepEqual(result.unplaced, []);
  assert.equal(result.changed, false);
  assert.equal(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), SW);
});

test('run: a PNG whose name cannot be placed is reported, not converted', (t) => {
  const root = tempRoot(t);
  const dir = path.join(root, 'assets/portraits');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mystery.png'), makePng(16, 16));
  fs.writeFileSync(path.join(dir, 'fox-transparent-happy.png'), makePng(16, 16));
  const result = run({ root, converter: null });
  assert.deepEqual(result.unplaced, ['fox-transparent-happy.png', 'mystery.png']);
  assert.match(formatReport(result), /could not place/);
  assert.ok(!fs.existsSync(path.join(dir, 'mystery.webp')));
});

test('run: fox.png and fox-transparent.png both name the fox, so neither is converted', (t) => {
  const root = tempRoot(t);
  const dir = path.join(root, 'assets/portraits');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fox.png'), makePng(16, 16));
  fs.writeFileSync(path.join(dir, 'fox-transparent.png'), makePng(16, 16));
  const result = run({ root, converter: null });
  assert.ok(result.errors.some((e) => /both name the 'fox' portrait/.test(e)), result.errors.join('\n'));
  assert.ok(!fs.existsSync(path.join(dir, 'fox.webp')));
});

test('every shipped portrait is a transparent cutout, so a scene can stand it over the battlefield', () => {
  for (const id of PORTRAIT_LIST) {
    const data = fs.readFileSync(path.join(ROOT, 'assets/portraits', `${id}.webp`));
    // An extended WebP (VP8X) whose flags byte has the alpha bit set.
    assert.equal(data.toString('ascii', 12, 16), 'VP8X', `${id} is an extended WebP`);
    assert.ok((data[20] & 0x10) !== 0, `${id} has an alpha channel`);
  }
});

const hasCwebp = spawnSync('cwebp', ['-version'], { encoding: 'utf8' }).status === 0;

test('run: converts PNGs to square WebP under canonical names, then changes nothing on a second run',
  { skip: hasCwebp ? false : 'no cwebp on this machine' }, (t) => {
    const root = tempRoot(t);
    const dir = path.join(root, 'assets/portraits');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'owl.png'), makePng(600, 400));
    fs.writeFileSync(path.join(dir, 'Fox Surprised.png'), makePng(80, 80));

    const result = run({ root, converter: 'cwebp' });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.present, ['fox-surprised', 'owl']);
    assert.equal(result.changed, true);
    assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, 'owl.webp'))), { width: 400, height: 400 });
    assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, 'fox-surprised.webp'))), { width: 80, height: 80 });
    assert.equal(
      fs.readFileSync(path.join(root, 'js/ui/portrait-list.js'), 'utf8'),
      portraitListSource(['fox-surprised', 'owl']),
    );
    assert.deepEqual(
      precacheUrls(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'))
        .filter((u) => u.startsWith('assets/portraits/')),
      ['assets/portraits/fox-surprised.webp', 'assets/portraits/owl.webp'],
    );
    assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /const APP_VERSION = '7';/,
      'run leaves the version to the command line');

    const again = run({ root, converter: 'cwebp' });
    assert.equal(again.changed, false, 'running twice in a row changes nothing');
    assert.deepEqual(again.present, ['fox-surprised', 'owl']);
  });

// --- seating each figure on the bottom edge ---

/**
 * A test image: each row's opaque pixels centred, `widths[y]` of them.
 * @param {number[]} widths
 * @param {number} [width]
 */
function rowsImage(widths, width = 20) {
  const data = new Uint8Array(width * widths.length * 4);
  widths.forEach((w, y) => {
    const from = Math.floor((width - w) / 2);
    for (let x = from; x < from + w; x += 1) data[(y * width + x) * 4 + 3] = 255;
  });
  return { width, height: widths.length, data };
}

test('a whole figure sits on its lowest row: only the empty rows under it count', () => {
  const bees = rowsImage([0, 0, 4, 6, 2, 0, 0, 0]);
  assert.deepEqual(rowCoverage(bees), [0, 0, 4, 6, 2, 0, 0, 0]);
  assert.equal(seatRow(rowCoverage(bees), true), 4);
  assert.equal(seatGap(bees, true), 3);
  assert.equal(seatGap(rowsImage([0, 0, 0]), true), 0, 'an empty image has nothing to seat');
});

test('a bust cut straight across sits on the bottom edge already', () => {
  const bust = rowsImage([0, 4, 8, 10, 16, 18, 18, 18]);
  assert.equal(seatGap(bust, false), 0);
});

test('a bust cut out with an oval mask sits on the row as wide as its chest, not on the point of the oval', () => {
  // The hedgehog-happy shape: it touches the bottom edge by a sliver, so
  // it has no empty rows, but its chest rounds off well above the edge.
  const oval = rowsImage([0, 4, 6, 8, 8, 8, 10, 12, 14, 16, 18, 18, 18, 18, 17, 14, 10, 6, 2]);
  const coverage = rowCoverage(oval);
  assert.equal(coverage[coverage.length - 1] > 0, true, 'no empty rows under it');
  const seat = seatRow(coverage, false);
  assert.ok(coverage[seat] >= SEAT_SHARE * 17, 'its seat is nearly as wide as the chest above the oval');
  assert.equal(seat, 15);
  assert.equal(seatGap(oval, false), 3);
  // As a whole figure the same shape would only lose its empty rows.
  assert.equal(seatGap(oval, true), 0);
});

test('shiftDown moves the figure down at the same size; what falls off the bottom is gone', () => {
  const image = rowsImage([2, 4, 6, 8]);
  const moved = shiftDown(image, 1);
  assert.equal(moved.width, image.width);
  assert.equal(moved.height, image.height);
  assert.deepEqual(rowCoverage(moved), [0, 2, 4, 6]);
  assert.deepEqual(rowCoverage(shiftDown(image, 0)), [2, 4, 6, 8]);
  assert.deepEqual(rowCoverage(shiftDown(image, 9)), [0, 0, 0, 0]);
  // Seating a bust takes away its gap, near enough: the cropped figure is
  // a little shorter, so its chest band moves by a row.
  const oval = rowsImage([0, 4, 6, 8, 8, 8, 10, 12, 14, 16, 18, 18, 18, 18, 17, 14, 10, 6, 2]);
  assert.ok(seatGap(shiftDown(oval, seatGap(oval, false)), false) <= 2);
});

test('PAM images round-trip, the format dwebp writes and cwebp reads', () => {
  const image = rowsImage([1, 3, 5], 6);
  image.data[0] = 200;
  const back = readPam(writePam(image));
  assert.equal(back.width, 6);
  assert.equal(back.height, 3);
  assert.deepEqual([...back.data], [...image.data]);
  assert.throws(() => readPam(Buffer.from('P6\n1 1\n255\n')));
});

test('the whole figures are the bees and the machines; the moods share their character\'s kind', () => {
  assert.deepEqual([...WHOLE_FIGURES].sort(), ['bees', 'harvester', 'planter', 'saw']);
  for (const id of WHOLE_FIGURES) assert.ok(KNOWN_IDS.includes(id));
  assert.equal(baseId('hedgehog-happy'), 'hedgehog');
  assert.equal(baseId('fox'), 'fox');
  assert.equal(decoderFor('/opt/homebrew/bin/cwebp'), '/opt/homebrew/bin/dwebp');
  assert.equal(decoderFor('cwebp'), 'dwebp');
});

const hasDwebp = spawnSync('dwebp', ['-version'], { encoding: 'utf8' }).status === 0;

test('every shipped portrait stands on the bottom edge: at most a couple of rows under its seat',
  { skip: hasDwebp ? false : 'no dwebp on this machine' }, (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-seat-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    // A blink frame holds only the eyes, laid over its plain portrait.
    for (const id of PORTRAIT_LIST.filter((i) => !isBlinkId(i))) {
      const pam = path.join(tmp, `${id}.pam`);
      const done = spawnSync('dwebp', ['-quiet', path.join(ROOT, 'assets/portraits', `${id}.webp`), '-pam', '-o', pam]);
      assert.equal(done.status, 0, `${id} decodes`);
      const image = readPam(fs.readFileSync(pam));
      const coverage = rowCoverage(image);
      let empty = 0;
      while (empty < coverage.length && coverage[coverage.length - 1 - empty] === 0) empty += 1;
      assert.ok(empty <= 2, `${id}: ${empty} empty rows under the figure`);
      const gap = seatGap(image, WHOLE_FIGURES.includes(baseId(id)));
      assert.ok(gap <= 2, `${id}: its seat is ${gap} rows above the bottom edge`);
    }
  });

test('Hazel\'s shipped mood portraits stand exactly where her plain one does: her apron lines up best unmoved',
  { skip: hasDwebp ? false : 'no dwebp on this machine' }, (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-frame-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const decode = (/** @type {string} */ id) => {
      const pam = path.join(tmp, `${id}.pam`);
      const done = spawnSync('dwebp', ['-quiet', path.join(ROOT, 'assets/portraits', `${id}.webp`), '-pam', '-o', pam]);
      assert.equal(done.status, 0, `${id} decodes`);
      return readPam(fs.readFileSync(pam));
    };
    const plain = decode('shopkeeper');
    const side = plain.width;
    // The apron and shirt, which no expression changes.
    const box = { x0: Math.round(0.34 * side), x1: Math.round(0.74 * side), y0: Math.round(0.62 * side), y1: Math.round(0.94 * side) };
    /** How unlike the plain apron the mood's is, shifted by (dx, dy) and scaled by s about the box's centre. */
    const unlike = (/** @type {any} */ mood, dx, dy, s) => {
      const cx = (box.x0 + box.x1) / 2;
      const cy = (box.y0 + box.y1) / 2;
      let sum = 0;
      let n = 0;
      for (let y = box.y0; y < box.y1; y += 2) {
        for (let x = box.x0; x < box.x1; x += 2) {
          const p = (y * side + x) * 4;
          if (plain.data[p + 3] < 250) continue;
          const mx = Math.round(cx + (x - cx) / s - dx);
          const my = Math.round(cy + (y - cy) / s - dy);
          if (mx < 0 || my < 0 || mx >= side || my >= side) continue;
          const q = (my * side + mx) * 4;
          if (mood.data[q + 3] < 250) continue;
          sum += Math.abs(mood.data[q] - plain.data[p]) + Math.abs(mood.data[q + 1] - plain.data[p + 1])
            + Math.abs(mood.data[q + 2] - plain.data[p + 2]);
          n += 1;
        }
      }
      return sum / n;
    };
    for (const id of PORTRAIT_LIST.filter((i) => i.startsWith('shopkeeper-'))) {
      const mood = decode(id);
      let best = { v: Infinity, dx: 0, dy: 0, s: 1 };
      for (const s of [0.96, 1, 1.04]) {
        for (let dy = -4; dy <= 4; dy += 1) {
          for (let dx = -4; dx <= 4; dx += 1) {
            const v = unlike(mood, dx, dy, s);
            if (v < best.v) best = { v, dx, dy, s };
          }
        }
      }
      assert.equal(best.s, 1, `${id}: the same size as the plain portrait`);
      assert.ok(Math.abs(best.dx) <= 1 && Math.abs(best.dy) <= 1, `${id}: off by (${best.dx}, ${best.dy}) px`);
    }
  });

// --- blink frames ---

/** A square test image: a filled disc of radius r at (cx, cy), opaque grey. */
function disc(side, cx, cy, r) {
  const data = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      data.set([120, 100, 80, 255], (y * side + x) * 4);
    }
  }
  return { width: side, height: side, data };
}

test('silhouetteOffset finds how far a blink frame is off its plain portrait', () => {
  const plain = disc(40, 20, 20, 10);
  assert.deepEqual(silhouetteOffset(plain, plain), { dx: 0, dy: 0, mismatch: 0 });
  const off = disc(40, 17, 22, 10);
  const found = silhouetteOffset(plain, off);
  assert.deepEqual([found.dx, found.dy, found.mismatch], [3, -2, 0], 'moved back by (3, -2)');
  assert.ok(silhouetteMismatch(plain, off) > 0.1);
  // Out of reach, or another shape: it still disagrees.
  assert.ok(silhouetteOffset(plain, disc(40, 20 + BLINK_REACH + 3, 20, 10)).mismatch > 0.05);
  assert.ok(silhouetteOffset(plain, disc(40, 20, 20, 14)).mismatch > 0.05);
});

test('blinkMask keeps what changed, a little round it, fading out; never a see-through edge', () => {
  const plain = disc(40, 20, 20, 15);
  const blink = disc(40, 20, 20, 15);
  // The 'eye': one pixel darker.
  blink.data.set([20, 20, 20, 255], (20 * 40 + 20) * 4);
  const mask = blinkMask(plain, blink);
  const at = (x, y) => mask[y * 40 + x];
  assert.equal(at(20, 20), 1);
  assert.equal(at(20 + BLINK_GROW, 20), 1, 'grown');
  assert.ok(at(20 + BLINK_GROW + 1, 20) > 0 && at(20 + BLINK_GROW + 1, 20) < 1, 'fading');
  assert.equal(at(20 + BLINK_GROW + BLINK_FEATHER + 1, 20), 0, 'and gone');
  assert.equal(at(5, 5), 0);
  const patch = blinkPatch(blink, mask);
  assert.deepEqual([...patch.data.subarray((20 * 40 + 20) * 4, (20 * 40 + 20) * 4 + 4)], [20, 20, 20, 255]);
  assert.equal(patch.data[(5 * 40 + 5) * 4 + 3], 0, 'the rest is transparent');
  // An eye at the edge of the figure: the mask stops at the silhouette.
  const edge = disc(40, 20, 20, 15);
  edge.data.set([20, 20, 20, 255], (20 * 40 + 34) * 4);
  const edgeMask = blinkMask(plain, edge);
  assert.equal(edgeMask[20 * 40 + 34], 1);
  assert.equal(edgeMask[20 * 40 + 37], 0, 'nothing laid over the see-through outside');
  assert.ok(isBlinkId('fox-blink') && !isBlinkId('fox') && !isBlinkId('fox-happy'));
});

test('run: a blink frame is cut, lined up and seated as its plain portrait; one with no plain source is refused',
  { skip: hasCwebp && hasDwebp ? false : 'no cwebp or dwebp on this machine' }, (t) => {
    const root = tempRoot(t);
    const dir = path.join(root, 'assets/portraits');
    fs.mkdirSync(dir, { recursive: true });
    // A bust: a disc cut off by the bottom edge, sitting 4 rows up.
    const plain = disc(64, 32, 48, 14);
    const blink = disc(64, 34, 47, 14);
    // Its closed eyes: a dark bar, and the whole figure 2 px right and 1 up.
    for (let x = 28; x < 40; x += 1) blink.data.set([10, 10, 10, 255], (40 * 64 + x) * 4);
    fs.writeFileSync(path.join(dir, 'fox.pam'), writePam(plain));
    fs.writeFileSync(path.join(dir, 'fox-blink.pam'), writePam(blink));
    for (const id of ['fox', 'fox-blink']) {
      const made = spawnSync('cwebp', ['-quiet', '-lossless', '-exact', path.join(dir, `${id}.pam`), '-o', path.join(dir, `${id}.webp`)]);
      assert.equal(made.status, 0);
      // cwebp cannot write PNG; the PNG sources are made by decoding the WebP.
      const png = spawnSync('dwebp', ['-quiet', path.join(dir, `${id}.webp`), '-o', path.join(dir, `${id}.png`)]);
      assert.equal(png.status, 0);
      fs.rmSync(path.join(dir, `${id}.pam`));
      fs.rmSync(path.join(dir, `${id}.webp`));
    }
    fs.writeFileSync(path.join(dir, 'owl-blink.png'), makePng(16, 16));
    const result = run({ root, converter: 'cwebp' });
    assert.deepEqual(result.blinks['fox-blink'], { dx: -2, dy: 1, mismatch: 0 });
    assert.match(formatReport(result), /Blink fox-blink: moved \(-2, 1\) px/);
    assert.ok(result.errors.some((e) => /owl-blink\.png: a blink is cut and seated exactly as its plain portrait/.test(e)));
    assert.deepEqual(result.present, ['fox', 'fox-blink']);
    const decode = (/** @type {string} */ id) => {
      const pam = path.join(root, `${id}.pam`);
      spawnSync('dwebp', ['-quiet', path.join(dir, `${id}.webp`), '-pam', '-o', pam]);
      return readPam(fs.readFileSync(pam));
    };
    const shipped = decode('fox');
    const eyes = decode('fox-blink');
    // The plain bust was seated (moved down to the bottom edge); the eyes
    // moved with it, the bar's middle where the plain portrait's row 40
    // landed.
    const gap = seatGap(plain, false);
    assert.ok(gap > 0, 'the test bust needed seating');
    const alphaAt = (/** @type {any} */ img, x, y) => img.data[(y * 64 + x) * 4 + 3];
    assert.ok(alphaAt(eyes, 33, 40 + gap) > 200, 'the closed eyes, moved down with the plain portrait');
    assert.ok(alphaAt(eyes, 33, 40) < 50 || gap > 3, 'not left where they were');
    assert.equal(alphaAt(eyes, 32, 60), 0, 'nothing but the eyes');
    assert.ok(alphaAt(shipped, 32, 63) > 200, 'the plain one stands on the bottom edge');

    // Another shape altogether cannot be lined up: no blink for it.
    fs.rmSync(path.join(dir, 'owl-blink.png'));
    const wrong = disc(64, 32, 30, 25);
    fs.writeFileSync(path.join(dir, 'fox-blink.pam'), writePam(wrong));
    spawnSync('cwebp', ['-quiet', '-lossless', '-exact', path.join(dir, 'fox-blink.pam'), '-o', path.join(dir, 'x.webp')]);
    spawnSync('dwebp', ['-quiet', path.join(dir, 'x.webp'), '-o', path.join(dir, 'fox-blink.png')]);
    fs.rmSync(path.join(dir, 'fox-blink.pam'));
    fs.rmSync(path.join(dir, 'x.webp'));
    const refused = run({ root, converter: 'cwebp' });
    assert.ok(refused.warnings.some((w) => /fox-blink\.png does not line up with fox\.png.*fox gets no blink/.test(w)), refused.warnings.join('\n'));
    assert.ok(!fs.existsSync(path.join(dir, 'fox-blink.webp')), 'the old blink frame is gone');
    assert.deepEqual(refused.present, ['fox']);
  });

test('every shipped blink frame lands on its plain portrait: only the eyes, only on solid pixels',
  { skip: hasDwebp ? false : 'no dwebp on this machine' }, (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-blink-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const decode = (/** @type {string} */ id) => {
      const pam = path.join(tmp, `${id}.pam`);
      const done = spawnSync('dwebp', ['-quiet', path.join(ROOT, 'assets/portraits', `${id}.webp`), '-pam', '-o', pam]);
      assert.equal(done.status, 0, `${id} decodes`);
      return readPam(fs.readFileSync(pam));
    };
    const blinks = PORTRAIT_LIST.filter(isBlinkId);
    assert.ok(blinks.length >= 3, 'the fox, the hedgehog and Hazel at least');
    for (const id of blinks) {
      const plain = decode(baseId(id));
      const eyes = decode(id);
      assert.equal(eyes.width, plain.width, id);
      const side = plain.width;
      let covered = 0;
      let y0 = side;
      let y1 = -1;
      for (let i = 0; i < side * side; i += 1) {
        const a = eyes.data[i * 4 + 3];
        if (a === 0) continue;
        covered += 1;
        y0 = Math.min(y0, Math.floor(i / side));
        y1 = Math.max(y1, Math.floor(i / side));
        // Over the plain portrait's solid face, never over its see-through edge.
        assert.ok(plain.data[i * 4 + 3] >= 200, `${id}: laid over a see-through pixel at ${i % side}, ${Math.floor(i / side)}`);
      }
      assert.ok(covered > 200, `${id}: has eyes`);
      assert.ok(covered < 0.05 * side * side, `${id}: only the eyes (${covered} px)`);
      assert.ok(y1 - y0 < 0.25 * side, `${id}: one band of the face`);
    }
  });

// --- round heads for the roster ---

test('headCrop: every band and the shopkeeper has a head inside its portrait', async () => {
  const { headCrop, HEAD_CROPS, DEFAULT_HEAD } = await import('../js/ui/portraits.js');
  for (const id of [...Object.keys(BAND_TYPES).filter((t) => BAND_TYPES[t].side === 'us'), 'shopkeeper']) {
    const crop = HEAD_CROPS[id];
    assert.ok(crop, `${id} has a head crop`);
    assert.ok(crop.size > 0 && crop.size <= 1, id);
    assert.ok(crop.x - crop.size / 2 >= 0 && crop.x + crop.size / 2 <= 1, `${id}: inside left to right`);
    assert.ok(crop.y - crop.size / 2 >= 0 && crop.y + crop.size / 2 <= 1, `${id}: inside top to bottom`);
  }
  assert.deepEqual(headCrop('nobody'), DEFAULT_HEAD);
});

test('headCropStyle scales the portrait so the head fills the round window', async () => {
  const { headCropStyle } = await import('../js/ui/portraits.js');
  // The whole portrait: the window shows it as it is.
  assert.deepEqual(headCropStyle({ x: 0.5, y: 0.5, size: 1 }), { width: '100%', left: '0%', top: '0%' });
  // A quarter in the top left corner: twice the size, not moved.
  assert.deepEqual(headCropStyle({ x: 0.25, y: 0.25, size: 0.5 }), { width: '200%', left: '0%', top: '0%' });
  // The bottom right quarter: moved up and left by the window's own size.
  assert.deepEqual(headCropStyle({ x: 0.75, y: 0.75, size: 0.5 }), { width: '200%', left: '-100%', top: '-100%' });
});
