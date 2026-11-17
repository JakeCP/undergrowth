import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScenes } from '../js/story/run.js';
import { hasSeen } from '../js/story/story.js';
import { SCENES } from '../data/story/index.js';
import { newProgress, loadProgress, saveProgress } from '../js/campaign/progress.js';

/** @typedef {import('../js/story/types.js').Scene} Scene */
/** @typedef {import('../js/engine/types.js').Progress} Progress */

/** @param {Partial<Scene>} s @returns {Scene} */
function scene(s) {
  return { id: 'x', when: 'map', lines: [{ who: 'narrator', text: 'Hello.' }], ...s };
}

/** @param {Record<string, string>} [initial] */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (/** @type {string} */ k) => (data.has(k) ? /** @type {string} */ (data.get(k)) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { data.set(k, v); },
  };
}

/**
 * A ctx over one progress value, recording every scene played and what
 * the progress was at the moment it was shown.
 * @param {Scene[]} scenes
 * @param {Progress} start
 * @param {(scene: Scene) => Promise<unknown>} [answer]
 */
function harness(scenes, start, answer = async () => 'done') {
  let progress = start;
  /** @type {{id: string, progress: Progress}[]} */
  const shown = [];
  const ctx = {
    scenes,
    getProgress: () => progress,
    setProgress: (/** @type {Progress} */ p) => { progress = p; },
    play: (/** @type {Scene} */ s) => {
      shown.push({ id: s.id, progress });
      return answer(s);
    },
  };
  return { ctx, shown, get progress() { return progress; } };
}

test('gifts and "seen" are saved before the scene is shown', async () => {
  const h = harness(SCENES, newProgress());
  const played = await runScenes({ when: 'before', level: 'l02' }, h.ctx);
  assert.equal(played, 1);
  assert.deepEqual(h.shown.map((s) => s.id), ['l02-beaver-joins']);
  const atShow = h.shown[0].progress;
  assert.ok(atShow.bands.beaver !== undefined, 'the beaver is owned while its scene plays');
  assert.equal(hasSeen(atShow, 'l02-beaver-joins'), true);
});

test('a reload in the middle of a recruit scene keeps the band (Review Focus 2)', async () => {
  const storage = fakeStorage();
  let progress = newProgress();
  /** @type {Progress|null} */
  let reloaded = null;
  // The scene never finishes: the page is reloaded while it is open.
  const never = new Promise(() => {});
  const run = runScenes({ when: 'before', level: 'l02' }, {
    scenes: SCENES,
    getProgress: () => progress,
    setProgress: (p) => { progress = p; saveProgress(p, storage); },
    play: () => { reloaded = loadProgress(storage); return never; },
  });
  await Promise.resolve();
  assert.ok(reloaded !== null, 'the scene was shown');
  const p = /** @type {Progress} */ (/** @type {unknown} */ (reloaded));
  assert.ok(p.bands.beaver !== undefined, 'the reloaded save has the beaver');
  assert.equal(hasSeen(p, 'l02-beaver-joins'), true);
  void run;
});

test('a reload during the first of two scenes keeps what the second gives', async () => {
  // o02 won without the fox convinced in play: o02-convinced-late plays
  // first, and the ants join in the scene after it. Closing the game
  // during the first must not leave l01 unlocked with no ants.
  const storage = fakeStorage();
  let progress = newProgress();
  /** @type {Progress|null} */
  let reloaded = null;
  /** @type {string[]} */
  const shown = [];
  const never = new Promise(() => {});
  void runScenes({ when: 'won', level: 'o02' }, {
    scenes: SCENES,
    getProgress: () => progress,
    setProgress: (p) => { progress = p; saveProgress(p, storage); },
    play: (s) => { shown.push(s.id); reloaded = loadProgress(storage); return never; },
  });
  await Promise.resolve();
  assert.deepEqual(shown, ['o02-convinced-late'], 'the first scene is open, the second has not been shown');
  const p = /** @type {Progress} */ (/** @type {unknown} */ (reloaded));
  assert.deepEqual(p.bands.ants, { maxLen: 4 }, 'the reloaded save has the ants');
});

test('a skipped scene still gives its band', async () => {
  const h = harness(SCENES, newProgress(), async () => 'skipped');
  await runScenes({ when: 'before', level: 'l02' }, h.ctx);
  assert.ok(h.progress.bands.beaver !== undefined);
  assert.equal(hasSeen(h.progress, 'l02-beaver-joins'), true);
});

test('scenes play in data order and one at a time', async () => {
  const scenes = [
    scene({ id: 'a', gives: [{ kind: 'seeds', amount: 1 }] }),
    scene({ id: 'other', when: 'shop' }),
    scene({ id: 'b', gives: [{ kind: 'seeds', amount: 2 }] }),
    scene({ id: 'c' }),
  ];
  /** @type {string[]} */
  const log = [];
  /** @type {(() => void)[]} */
  const finish = [];
  const h = harness(scenes, newProgress(), (s) => {
    log.push(`open ${s.id}`);
    return new Promise((done) => finish.push(() => { log.push(`close ${s.id}`); done('done'); }));
  });
  const seeds = h.progress.seeds;
  const run = runScenes({ when: 'map' }, h.ctx);
  await Promise.resolve();
  assert.deepEqual(log, ['open a'], 'the second scene waits for the first');
  // Everything the moment's scenes give is saved before the first is
  // shown, so closing the game during `a` cannot cost what `b` gives.
  assert.equal(h.progress.seeds, seeds + 3, 'every due scene has given before the first is shown');
  finish.shift()?.();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(log, ['open a', 'close a', 'open b']);
  assert.equal(h.progress.seeds, seeds + 3);
  finish.shift()?.();
  await new Promise((r) => setImmediate(r));
  finish.shift()?.();
  assert.equal(await run, 3);
  assert.deepEqual(log, ['open a', 'close a', 'open b', 'close b', 'open c', 'close c']);
  for (const id of ['a', 'b', 'c']) assert.equal(hasSeen(h.progress, id), true);
  assert.equal(hasSeen(h.progress, 'other'), false);
});

test('with nothing due it plays nothing and returns 0', async () => {
  const h = harness([scene({ id: 'a', when: 'shop' })], newProgress());
  const before = h.progress;
  assert.equal(await runScenes({ when: 'map' }, h.ctx), 0);
  assert.equal(h.shown.length, 0);
  assert.equal(h.progress, before, 'progress is not touched');
});

test('a scene once seen is not played again on the next visit', async () => {
  const h = harness([scene({ id: 'a' })], newProgress());
  assert.equal(await runScenes({ when: 'map' }, h.ctx), 1);
  assert.equal(await runScenes({ when: 'map' }, h.ctx), 0);
  assert.equal(h.shown.length, 1);
});

test('two calls for the same moment at once play the scene once', async () => {
  const h = harness([scene({ id: 'a' })], newProgress());
  const [x, y] = await Promise.all([runScenes({ when: 'map' }, h.ctx), runScenes({ when: 'map' }, h.ctx)]);
  assert.equal(x + y, 1);
  assert.equal(h.shown.length, 1);
});

test('resolve is handed to play', async () => {
  const resolve = () => ({ x: 1, y: 2, width: 3, height: 4 });
  /** @type {unknown[]} */
  const got = [];
  await runScenes({ when: 'map' }, {
    scenes: [scene({ id: 'a' })],
    getProgress: (() => { let p = newProgress(); return () => p; })(),
    setProgress: () => {},
    play: (_s, opts) => { got.push(opts.resolve); return Promise.resolve('done'); },
    resolve,
  });
  assert.deepEqual(got, [resolve]);
});

test('a scene that fails to play does not stop the ones after it', async () => {
  const h = harness([scene({ id: 'a' }), scene({ id: 'b' })], newProgress(), async (s) => {
    if (s.id === 'a') throw new Error('no document');
    return 'done';
  });
  assert.equal(await runScenes({ when: 'map' }, h.ctx), 2);
  assert.deepEqual(h.shown.map((s) => s.id), ['a', 'b']);
  assert.equal(hasSeen(h.progress, 'b'), true);
});

test('a won scene for o02 gives the ants to whoever wins it', async () => {
  const h = harness(SCENES, newProgress());
  await runScenes({ when: 'won', level: 'o02' }, h.ctx);
  assert.ok(h.progress.bands.ants !== undefined);
  assert.ok(h.shown.some((s) => s.id === 'o02-ants-join'));
});
