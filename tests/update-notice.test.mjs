// The new-version notice (js/ui/update-notice.js), against a fake
// service worker container and the fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchForUpdates, UPDATE_TEXT, UPDATE_BUTTON } from '../js/ui/update-notice.js';
import { FakeEl } from './fake-dom.mjs';

/** @param {{controller?: object|null, registerFails?: boolean}} [opts] */
function fakeWorld(opts = {}) {
  const updates = { count: 0 };
  const registered = [];
  const sw = new FakeEl('sw');
  Object.assign(sw, {
    controller: opts.controller === undefined ? {} : opts.controller,
    register(url) {
      registered.push(url);
      if (opts.registerFails) return Promise.reject(new Error('no'));
      return Promise.resolve({ update: () => { updates.count += 1; return Promise.resolve(); } });
    },
  });
  const doc = new FakeEl('document');
  Object.assign(doc, { body: new FakeEl('body'), createElement: (tag) => new FakeEl(tag), visibilityState: 'visible' });
  const reloads = { count: 0 };
  return { sw, doc, updates, registered, reloads, reload: () => { reloads.count += 1; } };
}

/** @param {ReturnType<typeof fakeWorld>} w */
function start(w) {
  watchForUpdates({ sw: /** @type {any} */ (w.sw), doc: /** @type {any} */ (w.doc), reload: w.reload });
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const notice = (/** @type {FakeEl} */ body) => body.children.find((c) => c.className.includes('update-notice'));

test('registers sw.js', () => {
  const w = fakeWorld();
  start(w);
  assert.deepEqual(w.registered, ['sw.js']);
});

test('a new version taking over a page shows the notice, once', () => {
  const w = fakeWorld();
  start(w);
  assert.equal(notice(w.doc.body), undefined, 'nothing before an update');
  w.sw.dispatch('controllerchange');
  w.sw.dispatch('controllerchange');
  const box = notice(w.doc.body);
  assert.ok(box !== undefined);
  assert.equal(w.doc.body.children.length, 1, 'one notice');
  assert.equal(box.attrs.role, 'status');
  assert.equal(box.children[0].textContent, UPDATE_TEXT);
  assert.equal(box.children[1].tag, 'button');
  assert.equal(box.children[1].textContent, UPDATE_BUTTON);
});

test('the button reloads the page, and nothing reloads by itself', () => {
  const w = fakeWorld();
  start(w);
  w.sw.dispatch('controllerchange');
  assert.equal(w.reloads.count, 0);
  notice(w.doc.body).children[1].dispatch('click');
  assert.equal(w.reloads.count, 1);
});

test('the first worker taking over a first visit is not a new version', () => {
  const w = fakeWorld({ controller: null });
  start(w);
  w.sw.dispatch('controllerchange');
  assert.equal(notice(w.doc.body), undefined);
  // A later one is.
  w.sw.dispatch('controllerchange');
  assert.ok(notice(w.doc.body) !== undefined);
});

test('coming back to the page asks the worker to check for a new version', async () => {
  const w = fakeWorld();
  start(w);
  await tick();
  w.doc.dispatch('visibilitychange');
  assert.equal(w.updates.count, 1);
  w.doc.visibilityState = 'hidden';
  w.doc.dispatch('visibilitychange');
  assert.equal(w.updates.count, 1, 'not while hidden');
});

test('no service workers, or a failed registration: nothing breaks', async () => {
  watchForUpdates({ sw: undefined, doc: /** @type {any} */ (fakeWorld().doc), reload: () => {} });
  const w = fakeWorld({ registerFails: true });
  start(w);
  await tick();
  w.doc.dispatch('visibilitychange');
  assert.equal(w.updates.count, 0);
});
