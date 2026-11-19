// PWA tests (Task 12, modelled on ~/augury/tests/pwa.test.mjs): every
// precached path exists, every shipped .js/.css/.woff2 and every WebP
// ground texture is precached, the manifest is installable and
// relative, index.html wires manifest/icons, and js/app.js registers
// sw.js relatively.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { webpSize, MAX_SIZE, BUDGET_BYTES } from '../scripts/textures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function mustExist(rel, what) {
  assert.ok(exists(rel), `${what} missing from repo: ${rel}`);
}

// The precache list is a plain string array in sw.js so it can be checked
// here and in review without executing the worker.
function precacheUrls() {
  const sw = read('sw.js');
  const block = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare const PRECACHE_URLS = [...]');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

test('sw.js: parses, versioned undergrowth-v<N> cache, no waiting worker', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'sw.js')]);
  const sw = read('sw.js');
  assert.match(sw, /const APP_VERSION = '\d+';/);
  assert.match(sw, /const CACHE_NAME = `undergrowth-v\$\{APP_VERSION\}`;/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  assert.match(sw, /names\.filter\(\(name\) => name !== CACHE_NAME\)\.map\(\(name\) => caches\.delete\(name\)\)/,
    'activate deletes every older cache');
});

test('sw.js: every precache entry is relative and exists on disk', () => {
  const urls = precacheUrls();
  assert.ok(urls.length > 0, 'precache list is empty');
  for (const url of urls) {
    assert.ok(!url.startsWith('/'), `precache path must be relative: ${url}`);
    assert.ok(!url.startsWith('http'), `precache path must not be absolute: ${url}`);
    const rel = url === './' ? 'index.html' : url.split('?')[0];
    mustExist(rel, 'precached path');
  }
});

test('sw.js: every .js/.css/.woff2 under js/ data/ css/ fonts/ is precached', () => {
  const urls = new Set(precacheUrls());
  for (const dir of ['js', 'data', 'css', 'fonts']) {
    for (const rel of walk(dir)) {
      if (!/\.(js|css|woff2)$/.test(rel)) continue;
      assert.ok(urls.has(rel), `shipped file not precached: ${rel}`);
    }
  }
});

// Ground textures (look-and-motion spec): the offline cache must hold
// every texture, and only WebP files are shipped. `node
// scripts/textures.mjs` keeps the precache list and
// js/ui/texture-list.js in step with assets/textures/.
const TEXTURE_DIR = 'assets/textures';

function textureFiles() {
  if (!exists(TEXTURE_DIR)) return [];
  return fs.readdirSync(path.join(ROOT, TEXTURE_DIR)).filter((f) => f.endsWith('.webp')).sort();
}

test('sw.js: precaches exactly the WebP textures under assets/textures/', () => {
  const precached = precacheUrls().filter((url) => url.startsWith(`${TEXTURE_DIR}/`)).sort();
  assert.deepEqual(
    precached,
    textureFiles().map((f) => `${TEXTURE_DIR}/${f}`),
    'precache list and assets/textures/ disagree: run `node scripts/textures.mjs`',
  );
});

test('js/ui/texture-list.js names exactly the WebP textures under assets/textures/', async () => {
  const { TEXTURES_PRESENT } = await import('../js/ui/texture-list.js');
  assert.deepEqual(
    [...TEXTURES_PRESENT],
    textureFiles().map((f) => f.slice(0, -'.webp'.length)),
    'texture list and assets/textures/ disagree: run `node scripts/textures.mjs`',
  );
});

test('textures: real WebP, 512 px or less each, within the size budget in total', () => {
  let total = 0;
  for (const file of textureFiles()) {
    const data = fs.readFileSync(path.join(ROOT, TEXTURE_DIR, file));
    const size = webpSize(data);
    assert.ok(size !== null, `${file} is not a WebP image`);
    assert.ok(
      size.width <= MAX_SIZE && size.height <= MAX_SIZE,
      `${file} is ${size.width}x${size.height}, over ${MAX_SIZE} px`,
    );
    total += data.length;
  }
  assert.ok(total <= BUDGET_BYTES, `textures total ${total} bytes, over the ${BUDGET_BYTES} byte budget`);
});

test('textures: PNG sources are git-ignored, so only WebP files are committed', () => {
  const ignored = read('.gitignore').split('\n').map((line) => line.trim());
  assert.ok(ignored.includes('assets/textures/*.png'), '.gitignore must list assets/textures/*.png');
});

test('sw.js: navigations network-first, everything else cache-first', () => {
  const sw = read('sw.js');
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /networkFirst\(request, 'index\.html'\)/);
  assert.match(sw, /cacheFirst\(request\)/);
  assert.doesNotMatch(sw, /staleWhileRevalidate/, 'no in-place background revalidate of precached files');
  assert.match(sw, /request\.method !== 'GET'/, 'same-origin GET only');
  assert.match(sw, /url\.origin !== self\.location\.origin/, 'cross-origin requests untouched');
});

test('sw.js: precache bypasses the HTTP cache with cache: reload', () => {
  const sw = read('sw.js');
  assert.match(
    sw,
    /cache\.addAll\(PRECACHE_URLS\.map\(\(u\) => new Request\(u, \{ cache: 'reload' \}\)\)\)/,
    'install must not fill a new version cache with HTTP-cached old files',
  );
});

test('sw.js: cache-first serves the versioned cache before network and never puts', () => {
  const sw = read('sw.js');
  const block = sw.match(/async function cacheFirst\(request\) \{([\s\S]*?)\n\}/);
  assert.ok(block, 'sw.js must define async function cacheFirst(request)');
  const body = block[1];
  assert.match(body, /cache\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.ok(
    body.indexOf('cache.match') < body.indexOf('fetch(request)'),
    'cache is checked before the network fallback',
  );
  assert.doesNotMatch(body, /\.put\(/, 'a network fallback miss must not rewrite the versioned cache');
});

test('manifest: parses, relative start_url/scope, every icon exists, includes maskable', () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.equal(man.name, 'Undergrowth');
  assert.equal(man.short_name, 'Undergrowth');
  assert.equal(man.description, 'A small tactics game: forest animals take back cleared land.');
  assert.equal(man.start_url, './');
  assert.equal(man.scope, './');
  assert.equal(man.display, 'standalone');
  // The look-and-motion spec replaced the cream page with a deep
  // forest-green frame. The splash screen and the installed app's bars
  // take their colour from the manifest, so it is the same green as the
  // page (--frame in css/game.css) and as index.html's theme-color.
  const frame = read('css/game.css').match(/--frame:\s*(#[0-9a-f]{6});/);
  assert.ok(frame, 'css/game.css sets --frame');
  assert.equal(man.background_color, frame[1]);
  assert.equal(man.theme_color, frame[1]);
  assert.match(read('index.html'), new RegExp(`<meta name="theme-color" content="${frame[1]}">`));
  assert.ok(!man.start_url.startsWith('/'), 'start_url must be relative');
  assert.ok(!man.scope.startsWith('/'), 'scope must be relative');
  assert.ok(Array.isArray(man.icons) && man.icons.length > 0, 'manifest icons missing');
  const purposes = new Set(man.icons.flatMap((i) => (i.purpose || 'any').split(' ')));
  assert.ok(purposes.has('any'), 'manifest needs an any icon');
  assert.ok(purposes.has('maskable'), 'manifest needs a maskable icon');
  const anySizes = new Set(man.icons.filter((i) => (i.purpose || 'any') === 'any').map((i) => i.sizes));
  assert.ok(anySizes.has('192x192') && anySizes.has('512x512'), 'any icons at 192 and 512');
  for (const icon of man.icons) {
    assert.ok(!icon.src.startsWith('/'), `manifest icon must be relative: ${icon.src}`);
    assert.ok(!icon.src.startsWith('http'), `manifest icon must not be absolute: ${icon.src}`);
    mustExist(icon.src, 'manifest icon');
  }
});

test('index.html: links manifest, apple-touch-icon and favicon.svg', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
  mustExist('icons/apple-touch-icon.png', 'apple-touch-icon');
  mustExist('favicon.svg', 'favicon');
});

test('precache-hash.txt matches the precached file contents', () => {
  const stored = read('precache-hash.txt').trim();
  assert.match(stored, /^[0-9a-f]{64}$/, 'precache-hash.txt must hold one sha256 hex digest');
  const hash = crypto.createHash('sha256');
  for (const url of [...precacheUrls()].sort()) {
    const rel = url === './' ? 'index.html' : url.split('?')[0];
    if (rel === 'sw.js') continue;
    hash.update(url);
    hash.update(fs.readFileSync(path.join(ROOT, rel)));
  }
  assert.equal(
    hash.digest('hex'),
    stored,
    'precached files changed: bump APP_VERSION in sw.js and run `npm run precache-hash`',
  );
});

test('js/app.js registers sw.js with a relative path (through js/ui/update-notice.js)', () => {
  const app = read('js/app.js');
  assert.match(app, /watchForUpdates\(\)/);
  const notice = read('js/ui/update-notice.js');
  assert.match(notice, /\.register\(deps\.url \?\? 'sw\.js'\)/);
  for (const src of [app, notice]) assert.doesNotMatch(src, /register\([^)]*'\//, 'never from the domain root');
});
