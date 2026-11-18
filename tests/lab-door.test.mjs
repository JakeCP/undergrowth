// The door to the test ground (lab/) in js/app.js. This file ships to
// the public repo, which has no lab/, so it reads the sources as text
// and imports nothing from lab/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('app.js opens the test ground on #lab, and falls back to the title', () => {
  assert.match(app, /'#lab'/);
  assert.match(app, /addEventListener\('hashchange'/);
  assert.equal(/import\(\s*['"][^'"]*lab\//.test(app), false, 'the lab path is not a literal inside import()');
  assert.match(app, /import\(LAB_MODULE\)[\s\S]*?\.catch\(\(err\) => \{/, 'the lab import falls back when it fails');
});

test('app.js opens Alt 1-5 alone on #alt, from lab/alt/, loaded the same lazy way', () => {
  assert.match(app, /'#alt'/);
  assert.match(app, /const ALT_LEVELS_MODULE = '\.\.\/lab\/alt\/index\.js';/);
  assert.match(app, /import\(ALT_LEVELS_MODULE\)/, 'handed to import() as a variable');
  assert.match(app, /altLevels: altLevels\.ALT_LEVELS/);
  assert.match(app, /mode === 'alt' \? \{ only: 'alt' \}/, '#alt asks the test ground for the alt group alone');
  // Both hashes are told apart on load and on every change, so going from
  // #lab to #alt (or back) opens the other one.
  assert.match(app, /if \(hash === LAB_HASH\) return 'lab';\s*if \(hash === ALT_HASH\) return 'alt';/);
  assert.match(app, /addEventListener\('hashchange', \(\) => \{\s*const mode = labModeFor\(location\.hash\);/);
  assert.match(app, /if \(labShowing !== mode\) showLab\(mode\);/);
  assert.match(app, /const openingLab = labModeFor\(location\.hash\);/);
});

test('nothing under lab/ is precached', () => {
  assert.equal(/['"]lab\//.test(sw), false);
});
