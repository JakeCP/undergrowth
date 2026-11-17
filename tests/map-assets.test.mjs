// Map art: js/ui/map-assets.js (written by scripts/map-assets.mjs) must
// match the converted files on disk, every listed file must be
// precached for offline play, only what the game uses ships, and the
// plates, markers and icons stay within 900 KB together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_ASSETS } from '../js/ui/map-assets.js';
import {
  BUDGET_BYTES, PLATE_TARGET_BYTES, wantedAssets, mapAssetsSource, syncMapPrecache,
} from '../scripts/map-assets.mjs';
import { webpSize } from '../scripts/textures.mjs';
import { REGIONS, CAMPAIGN_NODES } from '../data/campaign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function precacheUrls() {
  const block = read('sw.js').match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare const PRECACHE_URLS = [...]');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Every shipped WebP under assets/map/ and assets/ui/. */
function webpOnDisk() {
  const out = [];
  for (const dir of ['assets/map', 'assets/map/markers', 'assets/ui']) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) if (f.endsWith('.webp')) out.push(`${dir}/${f}`);
  }
  return out.sort();
}

const listed = () => [
  ...Object.values(MAP_ASSETS.plates), ...Object.values(MAP_ASSETS.markers), ...Object.values(MAP_ASSETS.icons),
];

test('the map asset list matches the WebP files on disk', () => {
  assert.deepEqual([...listed()].sort(), webpOnDisk(), 'run `node scripts/map-assets.mjs`');
});

test('the list module is what the script would write for it', () => {
  assert.equal(read('js/ui/map-assets.js'), mapAssetsSource(MAP_ASSETS));
});

test('every map file is precached, and nothing under assets/map or assets/ui is precached unlisted', () => {
  const urls = precacheUrls();
  for (const file of listed()) assert.ok(urls.includes(file), `${file} is not precached`);
  const ours = urls.filter((u) => /^assets\/(map|ui)\//.test(u));
  assert.deepEqual(ours.sort(), [...listed()].sort());
  assert.ok(urls.includes('js/ui/map-assets.js'));
  assert.ok(!urls.some((u) => u.startsWith('scripts/')), 'the asset script is never precached');
});

test('only what the game uses ships: the plates, the markers it places and the three icons', () => {
  const wanted = wantedAssets().map((w) => `${w.dir}/${w.key}.webp`);
  for (const file of listed()) assert.ok(wanted.includes(file), `${file} is not used by the game`);
  assert.ok(!('depot' in MAP_ASSETS.markers), 'no level uses the depot yet');
  for (const r of REGIONS) assert.ok(r.plate in MAP_ASSETS.plates, `the plate of ${r.id}`);
  for (const n of CAMPAIGN_NODES) {
    if (n.landmark !== undefined) assert.ok(n.landmark in MAP_ASSETS.markers, `the landmark of ${n.levelId}`);
  }
  for (const key of ['home-camp', 'trading-post', 'stake', 'sapling', 'mist']) assert.ok(key in MAP_ASSETS.markers, key);
  assert.deepEqual(Object.keys(MAP_ASSETS.icons).sort(), ['den', 'forest', 'seed']);
});

test('real WebP files at their sizes, each plate near 150 KB, all of it within 900 KB', () => {
  let total = 0;
  for (const file of listed()) {
    const data = fs.readFileSync(path.join(ROOT, file));
    const size = webpSize(data);
    assert.ok(size !== null, `${file} is not a WebP image`);
    total += data.length;
    if (file.startsWith('assets/ui/')) assert.ok(size.width <= 96, file);
    else if (file.endsWith('/mist.webp')) assert.ok(size.width <= 512, file);
    else if (file.includes('/markers/')) assert.ok(size.width <= 256, file);
    else {
      assert.ok(size.width <= 1024, file);
      assert.ok(data.length <= PLATE_TARGET_BYTES, `${file} is ${data.length} bytes`);
    }
  }
  assert.ok(total <= BUDGET_BYTES, `the map art is ${total} bytes, over ${BUDGET_BYTES}`);
  assert.equal(BUDGET_BYTES, 900 * 1024);
});

test('syncMapPrecache lists exactly the map files and is idempotent', () => {
  const sw = read('sw.js');
  assert.equal(syncMapPrecache(sw, listed()), sw, 'sw.js is already in step');
  const fewer = syncMapPrecache(sw, ['assets/ui/seed.webp']);
  assert.ok(fewer.includes("'assets/ui/seed.webp'") && !fewer.includes("'assets/ui/den.webp'"));
  assert.equal(syncMapPrecache(fewer, listed()), sw);
});

test('source PNGs are git-ignored; only WebP files ship', () => {
  const ignored = read('.gitignore').split('\n');
  for (const line of ['assets/map/*.png', 'assets/map/markers/*.png', 'assets/ui/*.png']) {
    assert.ok(ignored.includes(line), line);
  }
});
