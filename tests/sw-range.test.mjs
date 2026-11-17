// The service worker and the title theme. A media element asks for its
// file in byte ranges (`Range: bytes=0-1` first, in Safari), and Safari
// will not play a file answered with the whole thing and status 200. The
// worker serves everything cache-first, so in the installed game the
// theme would be silent on an iPhone unless a ranged request is answered
// from the cached copy with just those bytes (206 Partial Content).
//
// sw.js is a classic worker script, so the test runs it in a vm with a
// fake `self` and `caches` and calls its fetch handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://example.test';
const THEME = `${ORIGIN}/game/assets/title/title-theme.mp3`;

/**
 * Runs sw.js with a cache holding `files` (url -> bytes) and a network
 * that records what it is asked.
 * @param {Record<string, Uint8Array>} files
 */
function worker(files) {
  /** @type {Record<string, Function>} */
  const handlers = {};
  /** @type {Request[]} */
  const fetched = [];
  const cache = {
    match: async (/** @type {Request} */ request) => {
      const bytes = files[new URL(request.url).href.split('?')[0]];
      if (bytes === undefined) return undefined;
      return new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(bytes.length) } });
    },
    put: async () => { throw new Error('the worker must not write on a fetch'); },
  };
  const context = {
    self: {
      addEventListener: (/** @type {string} */ type, /** @type {Function} */ fn) => { handlers[type] = fn; },
      location: { origin: ORIGIN },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async (/** @type {Request} */ request) => { fetched.push(request); return new Response('from the network', { status: 200 }); },
    Request, Response, Headers, URL,
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), context);
  return {
    fetched,
    /**
     * @param {string} url
     * @param {Record<string, string>} [headers]
     * @returns {Promise<Response>}
     */
    get(url, headers = {}) {
      /** @type {Promise<Response>|undefined} */
      let answer;
      handlers.fetch({ request: new Request(url, { headers }), respondWith: (/** @type {Promise<Response>} */ p) => { answer = p; } });
      assert.ok(answer !== undefined, 'the worker answers a same-origin GET');
      return answer;
    },
  };
}

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);

/** @param {Response} r */
const bytesOf = async (r) => [...new Uint8Array(await r.arrayBuffer())];

test('a request with no Range gets the whole cached file, as before', async () => {
  const sw = worker({ [THEME]: BYTES });
  const r = await sw.get(THEME);
  assert.equal(r.status, 200);
  assert.deepEqual(await bytesOf(r), [...BYTES]);
  assert.equal(sw.fetched.length, 0, 'served from the cache');
});

test('Safari\'s probe, bytes=0-1, gets two bytes and a 206 from the cache', async () => {
  const sw = worker({ [THEME]: BYTES });
  const r = await sw.get(THEME, { Range: 'bytes=0-1' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Range'), 'bytes 0-1/100');
  assert.equal(r.headers.get('Content-Length'), '2');
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(r.headers.get('Content-Type'), 'audio/mpeg');
  assert.deepEqual(await bytesOf(r), [0, 1]);
  assert.equal(sw.fetched.length, 0, 'offline works: nothing went to the network');
});

test('an open-ended range, a middle range and a suffix range each get exactly their bytes', async () => {
  const sw = worker({ [THEME]: BYTES });
  const open = await sw.get(THEME, { Range: 'bytes=90-' });
  assert.equal(open.status, 206);
  assert.equal(open.headers.get('Content-Range'), 'bytes 90-99/100');
  assert.deepEqual(await bytesOf(open), [90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);

  const middle = await sw.get(THEME, { Range: 'bytes=10-12' });
  assert.equal(middle.headers.get('Content-Range'), 'bytes 10-12/100');
  assert.deepEqual(await bytesOf(middle), [10, 11, 12]);

  const past = await sw.get(THEME, { Range: 'bytes=95-500' });
  assert.equal(past.headers.get('Content-Range'), 'bytes 95-99/100', 'an end past the file stops at its last byte');
  assert.deepEqual(await bytesOf(past), [95, 96, 97, 98, 99]);

  const suffix = await sw.get(THEME, { Range: 'bytes=-3' });
  assert.equal(suffix.headers.get('Content-Range'), 'bytes 97-99/100');
  assert.deepEqual(await bytesOf(suffix), [97, 98, 99]);

  const whole = await sw.get(THEME, { Range: 'bytes=0-' });
  assert.equal(whole.status, 206);
  assert.equal(whole.headers.get('Content-Range'), 'bytes 0-99/100');
  assert.equal((await bytesOf(whole)).length, 100);
});

test('a range that starts past the end is refused with 416, and one the worker cannot read gets the whole file', async () => {
  const sw = worker({ [THEME]: BYTES });
  const beyond = await sw.get(THEME, { Range: 'bytes=100-' });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get('Content-Range'), 'bytes */100');

  const odd = await sw.get(THEME, { Range: 'bytes=0-1,5-6' });
  assert.equal(odd.status, 200);
  assert.equal((await bytesOf(odd)).length, 100);
});

test('a ranged request for a file not in the cache goes to the network with its Range', async () => {
  const sw = worker({});
  const r = await sw.get(THEME, { Range: 'bytes=0-1' });
  assert.equal(await r.text(), 'from the network');
  assert.equal(sw.fetched.length, 1);
  assert.equal(sw.fetched[0].headers.get('Range'), 'bytes=0-1');
});
