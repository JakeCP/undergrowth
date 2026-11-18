// The door to the test ground (lab/) in js/app.js. This file ships to
// the public repo, which has no lab/, so it reads the sources as text
// and imports nothing from lab/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('app.js opens the test ground only on #lab, and falls back to the title', () => {
  assert.match(app, /'#lab'/);
  assert.match(app, /addEventListener\('hashchange'/);
  assert.equal(/import\(\s*['"][^'"]*lab\//.test(app), false, 'the lab path is not a literal inside import()');
  assert.match(app, /import\(LAB_MODULE\)[\s\S]*?\.catch\(\(err\) => \{/, 'the lab import falls back when it fails');
});

test('nothing under lab/ is precached', () => {
  assert.equal(/['"]lab\//.test(sw), false);
});
