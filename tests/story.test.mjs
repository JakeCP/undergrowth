import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSeen, dueScenes, applyScene, guaranteedRoster } from '../js/story/story.js';
import { battleMoments } from '../js/story/moments.js';
import { SCENES } from '../data/story/index.js';
import { replan } from '../js/engine/bots.js';
import { applyMove } from '../js/engine/battle.js';
import { makeState } from './helpers.mjs';

/** @typedef {import('../js/story/types.js').Scene} Scene */

// The seven-node campaign from the opening-act spec, written out here
// because data/campaign.js only gains o01 and o02 in a later task.
const NODES = [
  { levelId: 'o01', x: 0, y: 0, unlocks: ['o02'] },
  { levelId: 'o02', x: 0, y: 0, unlocks: ['l01'] },
  { levelId: 'l01', x: 0, y: 0, unlocks: ['l02', 'l03'] },
  { levelId: 'l02', x: 0, y: 0, unlocks: ['l04'] },
  { levelId: 'l03', x: 0, y: 0, unlocks: ['l04'] },
  { levelId: 'l04', x: 0, y: 0, unlocks: ['l05'] },
  { levelId: 'l05', x: 0, y: 0, unlocks: [] },
];

function progress(bands = { fox: { maxLen: 2 }, hedgehog: { maxLen: 2 } }, seen = {}) {
  return { version: /** @type {1} */ (1), seeds: 5, bands, cleared: {}, story: { seen } };
}

/** @param {Partial<Scene>} s @returns {Scene} */
function scene(s) {
  return { id: 'x', when: 'map', lines: [{ who: 'narrator', text: 'Hello.' }], ...s };
}

// --- hasSeen ---

test('hasSeen: true only for a scene the save marks seen; a save with no story has seen nothing', () => {
  assert.equal(hasSeen(progress(undefined, { a: true }), 'a'), true);
  assert.equal(hasSeen(progress(undefined, { a: true }), 'b'), false);
  const old = { version: /** @type {1} */ (1), seeds: 0, bands: {}, cleared: {} };
  assert.equal(hasSeen(old, 'a'), false);
});

// --- dueScenes ---

test('a scene is due once, then not again', () => {
  const s = scene({ id: 'once', when: 'map' });
  let p = progress();
  assert.deepEqual(dueScenes([s], { when: 'map' }, p).map((x) => x.id), ['once']);
  p = applyScene(p, s);
  assert.deepEqual(dueScenes([s], { when: 'map' }, p), []);
});

test('a scene with repeat is due every time', () => {
  const s = scene({ id: 'again', when: 'map', repeat: true });
  let p = progress();
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(dueScenes([s], { when: 'map' }, p).map((x) => x.id), ['again']);
    p = applyScene(p, s);
  }
});

test('a scene is due only at its own moment, level and turn', () => {
  const scenes = [
    scene({ id: 'any-start', when: 'start' }),
    scene({ id: 'o01-start', when: 'start', level: 'o01' }),
    scene({ id: 'turn-3', when: 'turn', level: 'o01', turn: 3 }),
  ];
  const p = progress();
  const ids = (/** @type {import('../js/story/types.js').Moment} */ m) => dueScenes(scenes, m, p).map((x) => x.id);
  assert.deepEqual(ids({ when: 'start', level: 'o01' }), ['any-start', 'o01-start']);
  assert.deepEqual(ids({ when: 'start', level: 'o02' }), ['any-start']);
  assert.deepEqual(ids({ when: 'won', level: 'o01' }), []);
  assert.deepEqual(ids({ when: 'turn', level: 'o01', turn: 2 }), []);
  assert.deepEqual(ids({ when: 'turn', level: 'o01', turn: 3 }), ['turn-3']);
  assert.deepEqual(ids({ when: 'turn', level: 'o02', turn: 3 }), []);
  assert.deepEqual(ids({ when: 'turn', level: 'o01' }), [], 'a scene that names a turn needs a moment with that turn');
});

test('if: owns / lacks / seen / unseen are all respected', () => {
  const at = { when: /** @type {const} */ ('map') };
  const due = (/** @type {Scene} */ s, /** @type {ReturnType<typeof progress>} */ p) => dueScenes([s], at, p).length === 1;
  const withBeaver = progress({ fox: { maxLen: 2 }, beaver: { maxLen: 3 } }, { met: true });
  const without = progress({ fox: { maxLen: 2 } }, {});

  const owns = scene({ if: { owns: ['beaver', 'fox'] } });
  assert.equal(due(owns, withBeaver), true);
  assert.equal(due(owns, without), false);

  const lacks = scene({ if: { lacks: ['beaver'] } });
  assert.equal(due(lacks, withBeaver), false);
  assert.equal(due(lacks, without), true);

  const seen = scene({ if: { seen: ['met'] } });
  assert.equal(due(seen, withBeaver), true);
  assert.equal(due(seen, without), false);

  const unseen = scene({ if: { unseen: ['met'] } });
  assert.equal(due(unseen, withBeaver), false);
  assert.equal(due(unseen, without), true);

  const all = scene({ if: { owns: ['fox'], lacks: ['bear'], seen: ['met'], unseen: ['other'] } });
  assert.equal(due(all, withBeaver), true);
  assert.equal(due(all, without), false);
});

test('dueScenes keeps data order, and checks each scene as if the ones before it had played', () => {
  const scenes = [
    scene({ id: 'first', when: 'denMarked' }),
    scene({ id: 'tip', when: 'denMarked', if: { unseen: ['first'] } }),
    scene({ id: 'gift', when: 'won', gives: [{ kind: 'band', type: 'beaver' }] }),
    scene({ id: 'after-gift', when: 'won', if: { owns: ['beaver'] } }),
  ];
  const p = progress();
  assert.deepEqual(dueScenes(scenes, { when: 'denMarked' }, p).map((x) => x.id), ['first']);
  assert.deepEqual(dueScenes(scenes, { when: 'denMarked' }, applyScene(p, scenes[0])), []);
  assert.deepEqual(dueScenes(scenes, { when: 'won' }, p).map((x) => x.id), ['gift', 'after-gift']);
  assert.equal(p.bands.beaver, undefined, 'dueScenes changes nothing');
  assert.deepEqual(p.story.seen, {});
});

// --- applyScene ---

test('a band gift gives a band the player does not own at its starting length', () => {
  const p = applyScene(progress(), scene({ id: 'g', gives: [{ kind: 'band', type: 'beaver' }] }));
  assert.deepEqual(p.bands.beaver, { maxLen: 3 });
});

test('a band gift for an owned band becomes one recruit', () => {
  const p = applyScene(
    progress({ fox: { maxLen: 2 }, beaver: { maxLen: 3 } }),
    scene({ id: 'g', gives: [{ kind: 'band', type: 'beaver' }] }),
  );
  assert.deepEqual(p.bands.beaver, { maxLen: 4 });
  assert.deepEqual(Object.keys(p.bands).sort(), ['beaver', 'fox'], 'no second band');
  assert.equal(p.seeds, 5);
});

test('a recruit gift adds one to the band\'s length', () => {
  const p = applyScene(progress(), scene({ id: 'g', gives: [{ kind: 'recruit', type: 'fox' }] }));
  assert.deepEqual(p.bands.fox, { maxLen: 3 });
});

test('a recruit gift at the largest size becomes 10 seeds', () => {
  const p = applyScene(progress({ fox: { maxLen: 4 } }), scene({ id: 'g', gives: [{ kind: 'recruit', type: 'fox' }] }));
  assert.deepEqual(p.bands.fox, { maxLen: 4 });
  assert.equal(p.seeds, 15);
});

test('a band gift for a band owned at its largest size becomes 10 seeds', () => {
  const p = applyScene(progress({ beaver: { maxLen: 6 } }), scene({ id: 'g', gives: [{ kind: 'band', type: 'beaver' }] }));
  assert.deepEqual(p.bands.beaver, { maxLen: 6 }, 'never past maxLenCap');
  assert.equal(p.seeds, 15, 'and not silently lost');
});

test('a recruit gift for a band not owned gives the band, so it is not lost', () => {
  const p = applyScene(progress(), scene({ id: 'g', gives: [{ kind: 'recruit', type: 'badger' }] }));
  assert.deepEqual(p.bands.badger, { maxLen: 3 });
});

test('a seeds gift adds the seeds; several gifts apply in order', () => {
  const p = applyScene(progress(), scene({
    id: 'g',
    gives: [{ kind: 'seeds', amount: 7 }, { kind: 'band', type: 'ants' }, { kind: 'recruit', type: 'ants' }],
  }));
  assert.equal(p.seeds, 12);
  assert.deepEqual(p.bands.ants, { maxLen: 5 });
});

test('applyScene marks the scene seen and leaves the input unchanged', () => {
  const p = progress();
  const before = structuredClone(p);
  const out = applyScene(p, scene({ id: 'g', gives: [{ kind: 'band', type: 'beaver' }, { kind: 'seeds', amount: 3 }] }));
  assert.deepEqual(p, before);
  assert.equal(hasSeen(out, 'g'), true);
  assert.equal(out.seeds, 8);
  assert.notEqual(out.story, p.story);
});

test('applyScene starts a story for a save that has none, and keeps every other field', () => {
  const old = { version: /** @type {1} */ (1), seeds: 0, bands: {}, cleared: { l01: true }, botSpeed: 'fast' };
  const out = applyScene(old, scene({ id: 'g' }));
  assert.deepEqual(out.story, { seen: { g: true } });
  assert.equal(out.botSpeed, 'fast');
  assert.deepEqual(out.cleared, { l01: true });
  assert.equal('story' in old, false);
});

test('applyScene gives nothing a second time for a scene already seen, unless it repeats', () => {
  const once = scene({ id: 'g', gives: [{ kind: 'seeds', amount: 10 }] });
  const twice = applyScene(applyScene(progress(), once), once);
  assert.equal(twice.seeds, 15);
  const again = scene({ id: 'r', repeat: true, gives: [{ kind: 'seeds', amount: 10 }] });
  assert.equal(applyScene(applyScene(progress(), again), again).seeds, 25);
});

test('applyScene refuses a gift of a band type that does not exist', () => {
  assert.throws(() => applyScene(progress(), scene({ id: 'g', gives: [{ kind: 'band', type: 'dragon' }] })), /dragon/);
});

// --- guaranteedRoster ---

test('guaranteed roster follows the campaign graph', () => {
  const r = (/** @type {string} */ id) => guaranteedRoster(id, NODES, SCENES, ['fox', 'hedgehog']).sort();
  assert.deepEqual(r('o01'), ['fox', 'hedgehog']);
  assert.deepEqual(r('o02'), ['fox', 'hedgehog']);
  assert.deepEqual(r('l01'), ['ants', 'fox', 'hedgehog']);
  assert.deepEqual(r('l02'), ['ants', 'beaver', 'fox', 'hedgehog']);
  assert.deepEqual(r('l03'), ['ants', 'fox', 'hedgehog']);
  assert.deepEqual(r('l04'), ['ants', 'fox', 'hedgehog']); // l03 is a way round l02
  assert.deepEqual(r('l05'), ['ants', 'badger', 'fox', 'hedgehog']);
});

test('guaranteed roster: a won scene counts only on later levels, a before scene on its own level too', () => {
  const nodes = [
    { levelId: 'a', x: 0, y: 0, unlocks: ['b'] },
    { levelId: 'b', x: 0, y: 0, unlocks: [] },
  ];
  const scenes = [
    scene({ id: 'a-won', when: 'won', level: 'a', gives: [{ kind: 'band', type: 'ants' }] }),
    scene({ id: 'a-before', when: 'before', level: 'a', gives: [{ kind: 'band', type: 'owl' }] }),
    scene({ id: 'b-won', when: 'won', level: 'b', gives: [{ kind: 'band', type: 'bear' }] }),
    scene({ id: 'b-start', when: 'start', level: 'b', gives: [{ kind: 'band', type: 'bees' }] }),
    scene({ id: 'b-iffy', when: 'before', level: 'b', if: { unseen: ['a-won'] }, gives: [{ kind: 'band', type: 'badger' }] }),
    scene({ id: 'b-seeds', when: 'before', level: 'b', gives: [{ kind: 'seeds', amount: 5 }, { kind: 'recruit', type: 'fox' }] }),
  ];
  assert.deepEqual(guaranteedRoster('a', nodes, scenes, ['fox']), ['fox', 'owl']);
  assert.deepEqual(guaranteedRoster('b', nodes, scenes, ['fox']), ['fox', 'ants', 'owl']);
});

test('guaranteed roster refuses a level the graph does not have', () => {
  assert.throws(() => guaranteedRoster('zz', NODES, SCENES, ['fox']), /zz/);
});

// --- battleMoments ---

const DEN_GRID = ['H....', '.....', '.....'];

/**
 * A board with a harvester; `strike` is what its plan strikes.
 * @param {[number, number]|null} strike
 * @param {object} [extra]
 */
function board(strike, extra = {}) {
  return makeState(DEN_GRID, [
    { id: 'fox', type: 'fox', cells: [[4, 2], [4, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0], [3, 0]], plan: { path: [], strike, actionId: 'mow' } },
  ], extra);
}

const whens = (/** @type {import('../js/story/types.js').Moment[]} */ ms) => ms.map((m) => m.when);

test('battleMoments: nothing happened, nothing to report', () => {
  assert.deepEqual(battleMoments(board(null), board(null)), []);
});

test('battleMoments: den first marked, at the den', () => {
  assert.deepEqual(battleMoments(board(null), board([0, 0])), [{ when: 'denMarked', at: [0, 0] }]);
});

test('battleMoments does not report denMarked again while a den stays marked', () => {
  assert.deepEqual(battleMoments(board([0, 0]), board([0, 0])), []);
  // Marked, then not, then marked again: a fresh mark.
  assert.deepEqual(battleMoments(board([0, 0]), board(null)), []);
  assert.deepEqual(whens(battleMoments(board(null), board([0, 0]))), ['denMarked']);
});

test('battleMoments: a den shielded by a band is not marked', () => {
  const shielded = makeState(DEN_GRID, [
    { id: 'fox', type: 'fox', cells: [[0, 0], [0, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0], [2, 0], [3, 0]], plan: { path: [], strike: [0, 0], actionId: 'mow' } },
  ]);
  assert.deepEqual(battleMoments(board(null), shielded), []);
});

test('battleMoments: den damaged, band wiped, band freed, bot destroyed, last bot destroyed, new turn, won, lost', () => {
  const before = makeState(DEN_GRID, [
    { id: 'fox', type: 'fox', cells: [[4, 2]] },
    { id: 'ants', type: 'ants', cells: [[3, 2]] },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 2]], trapped: true },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'saw-1', type: 'saw', cells: [[1, 1]] },
  ]);
  const after = makeState(['_....', '.....', '.....'], [
    { id: 'fox', type: 'fox', cells: [[4, 2]] },
    { id: 'trapped-bear', type: 'bear', cells: [[2, 2]] },
  ], { turn: 2, outcome: 'won' });
  after.events = [
    { kind: 'terrain', at: [0, 0], from: 'habitat', to: 'habitatDamaged', cause: 'mow' },
    { kind: 'damage', band: 'ants', amount: 1, wiped: true, cells: [[3, 2]] },
    { kind: 'damage', band: 'fox', amount: 1, wiped: false, cells: [[4, 1]] },
    { kind: 'freed', band: 'trapped-bear' },
    { kind: 'damage', band: 'harvester-0', amount: 1, wiped: true, cells: [[1, 0]] },
    { kind: 'damage', band: 'saw-1', amount: 1, wiped: true, cells: [[1, 1]] },
  ];
  assert.deepEqual(battleMoments(before, after), [
    { when: 'denDamaged', at: [0, 0] },
    { when: 'bandWiped', at: [3, 2] },
    { when: 'bandFreed', at: [2, 2] },
    { when: 'botDestroyed', at: [1, 0] },
    { when: 'lastBotDestroyed', at: [1, 1] },
    { when: 'turn', turn: 2 },
    { when: 'won' },
  ]);
});

test('battleMoments: a den destroyed counts as damaged; a loss is reported; a bot still standing is not the last', () => {
  const before = makeState(['H....', '.....'], [
    { id: 'fox', type: 'fox', cells: [[4, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
    { id: 'harvester-1', type: 'harvester', cells: [[3, 0]] },
  ]);
  before.tiles[0][0] = { kind: 'habitatDamaged', variant: null, under: null };
  const after = makeState(['_....', '.....'], [
    { id: 'fox', type: 'fox', cells: [[4, 1]] },
    { id: 'harvester-1', type: 'harvester', cells: [[3, 0]] },
  ], { outcome: 'lost', lostReason: 'habitat' });
  after.events = [
    { kind: 'damage', band: 'harvester-0', amount: 1, wiped: true, cells: [[1, 0]] },
    { kind: 'terrain', at: [0, 0], from: 'habitatDamaged', to: 'stubble', cause: 'mow' },
  ];
  assert.deepEqual(battleMoments(before, after), [
    { when: 'botDestroyed', at: [1, 0] },
    { when: 'denDamaged', at: [0, 0] },
    { when: 'lost' },
  ]);
});

test('battleMoments: one moment of each kind, at the first time it happened', () => {
  const before = makeState(['H.H..', '.....'], [
    { id: 'fox', type: 'fox', cells: [[4, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  const after = structuredClone(before);
  after.events = [
    { kind: 'terrain', at: [2, 0], from: 'habitat', to: 'habitatDamaged', cause: 'mow' },
    { kind: 'terrain', at: [0, 0], from: 'habitat', to: 'habitatDamaged', cause: 'mow' },
    { kind: 'terrain', at: [3, 1], from: 'open', to: 'stubble', cause: 'mow' },
  ];
  assert.deepEqual(battleMoments(before, after), [{ when: 'denDamaged', at: [2, 0] }]);
});

test('battleMoments: a band of ours that falls in is wiped; a bot wiped by bristle is destroyed', () => {
  const before = makeState(['.....', '.....'], [
    { id: 'hedgehog', type: 'hedgehog', cells: [[0, 1]] },
    { id: 'badger', type: 'badger', cells: [[4, 1]] },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1]] },
    { id: 'harvester-1', type: 'harvester', cells: [[3, 0]] },
  ]);
  const after = structuredClone(before);
  after.bands = after.bands.filter((b) => b.id !== 'badger' && b.id !== 'harvester-0');
  after.events = [
    { kind: 'damage', band: 'hedgehog', amount: 1, wiped: false, cells: [[0, 1]] },
    { kind: 'damage', band: 'harvester-0', amount: 1, wiped: true, cells: [[1, 1]] },
    { kind: 'damage', band: 'badger', amount: 3, wiped: true, cells: [[4, 1]] },
    { kind: 'push', outcome: { kind: 'falls', band: 'badger', at: [4, 1] } },
  ];
  assert.deepEqual(battleMoments(before, after), [
    { when: 'botDestroyed', at: [1, 1] },
    { when: 'bandWiped', at: [4, 1] },
  ]);
});

test('battleMoments reads a real move: the fox steps away and the harvester turns on the den', () => {
  // A harvester two tiles from a den, with the fox in its reach. Once the
  // fox has walked off, the re-made plan strikes the den.
  const before = makeState(['H......', '.......', '.......', '.......'], [
    { id: 'fox', type: 'fox', cells: [[2, 2], [2, 3]] },
    { id: 'harvester-0', type: 'harvester', cells: [[2, 0], [3, 0], [4, 0]] },
  ]);
  replan(before);
  before.events = [];
  assert.deepEqual(before.bands[1].plan?.strike, [2, 2], 'it means to mow the fox first');
  const after = applyMove(before, { kind: 'move', band: 'fox', path: [[3, 2], [4, 2], [5, 2]] });
  assert.deepEqual(battleMoments(before, after), [{ when: 'denMarked', at: [0, 0] }]);
});
