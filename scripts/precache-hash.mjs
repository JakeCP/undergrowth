// Writes precache-hash.txt: sha256 over every precached file's
// path+content (PRECACHE_URLS parsed from sw.js, sorted; './'
// maps to index.html; sw.js itself is excluded). Run via
// `npm run precache-hash` after bumping APP_VERSION in sw.js.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const block = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
if (!block) throw new Error('sw.js must declare const PRECACHE_URLS = [...]');
const urls = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

const hash = crypto.createHash('sha256');
for (const url of urls) {
  const rel = url === './' ? 'index.html' : url.split('?')[0];
  if (rel === 'sw.js') continue;
  hash.update(url);
  hash.update(fs.readFileSync(path.join(ROOT, rel)));
}
const digest = hash.digest('hex');
fs.writeFileSync(path.join(ROOT, 'precache-hash.txt'), `${digest}\n`);
console.log(digest);
