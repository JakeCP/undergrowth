import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntent, describeEvents, goalText, habitatCount, defeatText } from '../js/ui/text.js';
import { LEVELS } from '../data/levels/index.js';
import { applyMove } from '../js/engine/battle.js';
import { makeState } from './helpers.mjs';

// --- describeIntent ---

test('describeIntent: harvester will mow the forest to the north', () => {
  const s = makeState(['.T.', '...', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1], [1, 2]], plan: { path: [], strike: [1, 0], actionId: 'mow' } },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Harvester will mow the forest to the north');
});

test('describeIntent: saw-drone will hit Ants to the east', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[0, 1], [0, 2]], plan: { path: [], strike: [1, 1], actionId: 'saw' } },
    { id: 'ants', type: 'ants', cells: [[1, 1], [2, 1]] },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Saw-drone will hit Ants to the east');
});

test('describeIntent: saw-drone with no band at target names the terrain', () => {
  const s = makeState(['...', '=..', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1], [1, 2]], plan: { path: [], strike: [0, 1], actionId: 'saw' } },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Saw-drone will hit the dam to the west');
});

test('describeIntent: planter-bot will pave the stubble to the south', () => {
  const s = makeState(['...', '._.', '...'], [
    { id: 'planter-0', type: 'planter', cells: [[1, 0], [0, 0]], plan: { path: [], strike: [1, 1], actionId: 'pave' } },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Planter-bot will pave the stubble to the south');
});

test('describeIntent: harvester mowing an occupied tile names the occupant', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 1], [0, 2]], plan: { path: [], strike: [1, 1], actionId: 'mow' } },
    { id: 'ants', type: 'ants', cells: [[1, 1], [2, 1]] },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Harvester will hit Ants to the east');
});

test('describeIntent: planter-bot paving an occupied tile names the occupant', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'planter-0', type: 'planter', cells: [[1, 0], [0, 0]], plan: { path: [], strike: [1, 1], actionId: 'pave' } },
    { id: 'badger', type: 'badger', cells: [[1, 1], [1, 2]] },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Planter-bot will hit Badger to the south');
});

test('describeIntent: open ground is called ground, never "the open"', () => {
  const mow = makeState(['...', '...', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1], [1, 2]], plan: { path: [], strike: [1, 0], actionId: 'mow' } },
  ]);
  assert.equal(describeIntent(mow, mow.bands[0]), 'Harvester will mow the ground to the north');

  const pave = makeState(['...', '...', '...'], [
    { id: 'planter-0', type: 'planter', cells: [[1, 0], [0, 0]], plan: { path: [], strike: [1, 1], actionId: 'pave' } },
  ]);
  assert.equal(describeIntent(pave, pave.bands[0]), 'Planter-bot will pave the ground to the south');

  const saw = makeState(['...', '...', '...'], [
    { id: 'saw-0', type: 'saw', cells: [[1, 1], [1, 2]], plan: { path: [], strike: [0, 1], actionId: 'saw' } },
  ]);
  assert.equal(describeIntent(saw, saw.bands[0]), 'Saw-drone will hit the ground to the west');
});

test('describeIntent: no plan has nothing in reach', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[1, 1]], plan: null },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Harvester has nothing in reach');
});

// --- describeEvents ---

test('describeEvents: push falls into the water (name from wiped band id)', () => {
  const s = makeState(['.~.', '...', '...'], []);
  const events = [{ kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [1, 0] } }];
  assert.deepEqual(describeEvents(s, events), ['Harvester is pushed into the water and destroyed']);
});

test('describeEvents: falls wording uses the at tile, not a board guess', () => {
  const s = makeState(['.~o', '...', '...'], []);
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [2, 0] } }]),
    ['Harvester is pushed into a hole and destroyed'],
  );
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [1, 0] } }]),
    ['Harvester is pushed into the water and destroyed'],
  );
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [0, 0] } }]),
    ['Harvester falls and is destroyed'],
  );
});

test('describeEvents: terrain-cause falls in water are swept away, never pushed', () => {
  const s = makeState(['.~.', '...', '...'], []);
  const events = [{ kind: 'push', outcome: { kind: 'falls', band: 'ants', at: [1, 0], cause: 'terrain' } }];
  assert.deepEqual(describeEvents(s, events), ['The dam gives way: Ants are swept away']);
});

test('describeEvents: terrain-cause falls into a hole use ground-gives-way wording', () => {
  const s = makeState(['.~o', '...', '...'], []);
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'badger', at: [2, 0], cause: 'terrain' } }]),
    ['The ground gives way: Badger falls and is destroyed'],
  );
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'ants', at: [2, 0], cause: 'terrain' } }]),
    ['The ground gives way: Ants fall and are destroyed'],
  );
});

test('describeEvents: push falls use are for plural names', () => {
  const s = makeState(['.~o', '...', '...'], []);
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'ants', at: [1, 0] } }]),
    ['Ants are pushed into the water and destroyed'],
  );
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'ants', at: [2, 0] } }]),
    ['Ants are pushed into a hole and destroyed'],
  );
  assert.deepEqual(
    describeEvents(s, [{ kind: 'push', outcome: { kind: 'falls', band: 'ants', at: [0, 0] } }]),
    ['Ants fall and are destroyed'],
  );
});

test('describeEvents: wiped damage sentence is dropped when a falls event follows', () => {
  const s = makeState(['.~.', '...', '...'], []);
  const events = [
    { kind: 'damage', band: 'harvester-0', amount: 3, wiped: true },
    { kind: 'push', outcome: { kind: 'falls', band: 'harvester-0', at: [1, 0] } },
  ];
  assert.deepEqual(describeEvents(s, events), ['Harvester is pushed into the water and destroyed']);
});

test('describeEvents: push bumped into another band', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
    { id: 'ants', type: 'ants', cells: [[1, 0]] },
  ]);
  const events = [{ kind: 'push', outcome: { kind: 'bumped', band: 'harvester-0', other: 'ants' } }];
  assert.deepEqual(describeEvents(s, events), ['Harvester is pushed and bumps into Ants']);
});

test('describeEvents: push bumped into the edge', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'harvester-0', type: 'harvester', cells: [[0, 0]] },
  ]);
  const events = [{ kind: 'push', outcome: { kind: 'bumped', band: 'harvester-0', other: null } }];
  assert.deepEqual(describeEvents(s, events), ['Harvester is pushed and bumps into the edge']);
});

test('describeEvents: push moved is pushed back', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'saw-1', type: 'saw', cells: [[0, 0]] },
  ]);
  const events = [{ kind: 'push', outcome: { kind: 'moved', band: 'saw-1', to: [1, 0] } }];
  assert.deepEqual(describeEvents(s, events), ['Saw-drone is pushed back']);
});

test('describeEvents: damage uses lose for plural names and loses for singular', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'badger', type: 'badger', cells: [[1, 0]] },
  ]);
  const events = [
    { kind: 'damage', band: 'ants', amount: 2, wiped: false },
    { kind: 'damage', band: 'badger', amount: 1, wiped: false },
  ];
  assert.deepEqual(describeEvents(s, events), ['Ants lose 2', 'Badger loses 1']);
});

test('describeEvents: wiped damage appends wiped out (are/is by plurality)', () => {
  const s = makeState(['...', '...', '...'], []);
  const events = [
    { kind: 'damage', band: 'ants', amount: 3, wiped: true },
    { kind: 'damage', band: 'badger', amount: 2, wiped: true },
  ];
  assert.deepEqual(describeEvents(s, events), [
    'Ants lose 3 and are wiped out',
    'Badger loses 2 and is wiped out',
  ]);
});

test('describeEvents: terrain transitions are named by the new kind', () => {
  const s = makeState(['...', '...', '...'], []);
  const events = [
    { kind: 'terrain', at: [0, 0], from: 'open', to: 'hole' },
    { kind: 'terrain', at: [1, 0], from: 'water', to: 'dam' },
    { kind: 'terrain', at: [2, 0], from: 'forest', to: 'stubble' },
    { kind: 'terrain', at: [0, 1], from: 'open', to: 'paving' },
    { kind: 'terrain', at: [1, 1], from: 'dam', to: 'open' },
  ];
  assert.deepEqual(describeEvents(s, events), [
    'A hole is dug',
    'A dam is built',
    'Forest is mown to stubble',
    'The ground is paved',
    'The ground is cleared',
  ]);
});

test('describeEvents: dam cut to water is not "ground becomes water"', () => {
  const s = makeState(['...', '...', '...'], []);
  assert.deepEqual(
    describeEvents(s, [{ kind: 'terrain', at: [0, 0], from: 'dam', to: 'water' }]),
    ['The dam is cut and the water flows'],
  );
  assert.deepEqual(
    describeEvents(s, [{ kind: 'terrain', at: [0, 0], from: 'open', to: 'forest' }]),
    ['The ground becomes forest'],
  );
});

test('describeEvents: capture names the permit', () => {
  const s = makeState(['.P.', '...', '...'], []);
  assert.deepEqual(describeEvents(s, [{ kind: 'capture', at: [1, 0] }]), ['The permit is captured']);
});

test('describeEvents: capture names a survey stake', () => {
  const s = makeState(['.K.', '...', '...'], []);
  assert.deepEqual(describeEvents(s, [{ kind: 'capture', at: [1, 0] }]), ['A survey stake is captured']);
});

test('describeEvents: capture with no objective at the tile falls back', () => {
  const s = makeState(['...', '...', '...'], []);
  assert.deepEqual(describeEvents(s, [{ kind: 'capture', at: [1, 0] }]), ['An objective is captured']);
});

test('describeEvents: pickup and freed (freed name from trapped- id)', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'trapped-bear', type: 'bear', cells: [[0, 0], [1, 0]], trapped: true },
  ]);
  const events = [
    { kind: 'pickup', at: [2, 2] },
    { kind: 'freed', band: 'trapped-bear' },
  ];
  assert.deepEqual(describeEvents(s, events), ['Seeds picked up', 'Bear is freed']);
});

test('describeEvents: move, action and plan events are skipped', () => {
  const s = makeState(['...', '...', '...'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
  ]);
  const events = [
    { kind: 'move', band: 'ants', path: [[1, 0]] },
    { kind: 'action', actor: 'ants', actionId: 'bite', from: [1, 0], target: [2, 0] },
    { kind: 'plan', band: 'harvester-0', plan: null },
  ];
  assert.deepEqual(describeEvents(s, events), []);
});

// --- goalText ---

test('goalText: capture the forged permit (l01), with its one den', () => {
  assert.equal(goalText(LEVELS.find((l) => l.id === 'l01')), 'Capture the forged permit and keep the den standing');
});

test('goalText: capture both survey stakes (l02), with its two dens', () => {
  assert.equal(goalText(LEVELS.find((l) => l.id === 'l02')), 'Capture both survey stakes and keep the 2 dens standing');
});

test('goalText: capture the survey stake when there is one', () => {
  assert.equal(goalText({ ...LEVELS.find((l) => l.id === 'l01'), goal: 'capture', grid: ['K'] }), 'Capture the survey stake');
});

test('goalText: rescue the trapped bear (l04), with its two dens', () => {
  assert.equal(goalText(LEVELS.find((l) => l.id === 'l04')), 'Rescue the trapped bear and keep the 2 dens standing');
});

test('goalText: drive out every bot (l05), with its three dens', () => {
  assert.equal(goalText(LEVELS.find((l) => l.id === 'l05')), 'Drive out every bot and keep the 3 dens standing');
});

// --- plans that walk (living-bots spec: bots walk, then strike) ---

test('describeIntent: a bot that walks and then strikes says both', () => {
  const s = makeState(['T....', '.....'], [
    { id: 'harvester-0', type: 'harvester', cells: [[3, 0]], plan: { path: [[2, 0], [1, 0]], strike: [0, 0], actionId: 'mow' } },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Harvester will walk 2 tiles, then mow the forest to the west');
});

test('describeIntent: one tile of walk is "1 tile", and a band target is named', () => {
  const s = makeState(['.....'], [
    { id: 'saw-0', type: 'saw', cells: [[3, 0]], plan: { path: [[2, 0]], strike: [1, 0], actionId: 'saw' } },
    { id: 'ants', type: 'ants', cells: [[1, 0], [0, 0]] },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Saw-drone will walk 1 tile, then hit Ants to the west');
});

test('describeIntent: a bot that walks without striking is not "nothing in reach"', () => {
  const s = makeState(['.....'], [
    { id: 'planter-0', type: 'planter', cells: [[0, 0]], plan: { path: [[1, 0], [2, 0]], strike: null, actionId: null } },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Planter-bot will walk 2 tiles, with nothing to strike yet');
});

test('describeIntent: a bot aiming at a den tears into it, intact or damaged', () => {
  const s = makeState(['H.'], [
    { id: 'planter-0', type: 'planter', cells: [[1, 0]], plan: { path: [], strike: [0, 0], actionId: 'pave' } },
  ]);
  assert.equal(describeIntent(s, s.bands[0]), 'Planter-bot will tear into the den to the west');
  s.tiles[0][0] = { kind: 'habitatDamaged', variant: null, under: null };
  assert.equal(describeIntent(s, s.bands[0]), 'Planter-bot will tear into the damaged den to the west');
});

// --- den events ---

test('describeEvents: a den damaged names the bot and warns of the next hit', () => {
  const s = makeState(['H.'], [{ id: 'harvester-0', type: 'harvester', cells: [[1, 0]] }]);
  s.tiles[0][0] = { kind: 'habitatDamaged', variant: null, under: null };
  const events = /** @type {any[]} */ ([
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [1, 0], target: [0, 0] },
    { kind: 'terrain', at: [0, 0], from: 'habitat', to: 'habitatDamaged', cause: 'mow' },
  ]);
  assert.deepEqual(describeEvents(s, events), [
    'The harvester tears into the den',
    "Den damaged — one more hit and it's gone",
  ]);
});

test('describeEvents: a den destroyed is lost, never "mown to stubble"', () => {
  const s = makeState(['_.'], [{ id: 'planter-0', type: 'planter', cells: [[1, 0]] }]);
  const events = /** @type {any[]} */ ([
    { kind: 'action', actor: 'planter-0', actionId: 'pave', from: [1, 0], target: [0, 0] },
    { kind: 'terrain', at: [0, 0], from: 'habitatDamaged', to: 'stubble', cause: 'pave' },
  ]);
  assert.deepEqual(describeEvents(s, events), ['The planter-bot tears into the den', 'The den is lost']);
});

test('describeEvents: two strikes on one den in a turn, from a real bots turn', () => {
  const s = makeState(['D...', '....', '..H.', '....'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]] },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2]] },
    { id: 'planter-1', type: 'planter', cells: [[2, 3]] },
  ]);
  const after = applyMove(s, { kind: 'end' });
  assert.equal(after.lostReason, 'habitat');
  assert.deepEqual(describeEvents(after, after.events), [
    'The harvester tears into the den',
    "Den damaged — one more hit and it's gone",
    'The planter-bot tears into the den',
    'The den is lost',
  ]);
});

// A strike on a band hits the band only (living-bots spec, section 6).

test('describeEvents: a band on a den takes the hit and shields it, from a real bots turn', () => {
  const s = makeState(['H...', '....', '...P'], [
    { id: 'badger', type: 'badger', cells: [[0, 0], [0, 1]], maxLen: 3 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  const after = applyMove(s, { kind: 'end' });
  assert.equal(after.tiles[0][0].kind, 'habitat', 'the den stands as it was');
  assert.deepEqual(describeEvents(after, after.events), ['Badger loses 1, shielding the den']);
});

test('describeEvents: a band wiped out on a den still shielded it from that strike', () => {
  const s = makeState(['H.'], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 4 },
    { id: 'saw-0', type: 'saw', cells: [[1, 0]] },
  ]);
  const events = /** @type {any[]} */ ([
    { kind: 'action', actor: 'saw-0', actionId: 'saw', from: [1, 0], target: [0, 0] },
    { kind: 'damage', band: 'ants', amount: 2, wiped: true, cells: [[0, 0]] },
  ]);
  assert.deepEqual(describeEvents(s, events), ['Ants lose 2 and are wiped out, shielding the den']);
});

test('describeEvents: the den a band shielded is named even if a later bot then breaks it', () => {
  const s = makeState(['_.'], [{ id: 'saw-0', type: 'saw', cells: [[1, 0]] }]);
  const events = /** @type {any[]} */ ([
    { kind: 'action', actor: 'saw-0', actionId: 'saw', from: [1, 0], target: [0, 0] },
    { kind: 'damage', band: 'ants', amount: 2, wiped: true, cells: [[0, 0]] },
    { kind: 'action', actor: 'harvester-1', actionId: 'mow', from: [0, 1], target: [0, 0] },
    { kind: 'terrain', at: [0, 0], from: 'habitatDamaged', to: 'stubble', cause: 'mow' },
  ]);
  assert.deepEqual(describeEvents(s, events), [
    'Ants lose 2 and are wiped out, shielding the den',
    'The harvester tears into the den',
    'The den is lost',
  ]);
});

test('describeEvents: a strike on a band off any den says nothing of dens', () => {
  const s = makeState(['..'], [
    { id: 'badger', type: 'badger', cells: [[0, 0]], maxLen: 3 },
    { id: 'harvester-0', type: 'harvester', cells: [[1, 0]] },
  ]);
  const events = /** @type {any[]} */ ([
    { kind: 'action', actor: 'harvester-0', actionId: 'mow', from: [1, 0], target: [0, 0] },
    { kind: 'damage', band: 'badger', amount: 1, wiped: false, cells: [[0, 0]] },
  ]);
  assert.deepEqual(describeEvents(s, events), ['Badger loses 1']);
});

test('describeEvents: a den struck with no action before it still reads', () => {
  const s = makeState(['H'], []);
  const events = /** @type {any[]} */ ([
    { kind: 'terrain', at: [0, 0], from: 'habitat', to: 'habitatDamaged', cause: 'saw' },
  ]);
  assert.deepEqual(describeEvents(s, events), ['A den is struck', "Den damaged — one more hit and it's gone"]);
});

test('describeEvents: no terrain change shows a raw terrain kind', () => {
  const s = makeState(['.'], []);
  const events = /** @type {any[]} */ ([
    { kind: 'terrain', at: [0, 0], from: 'open', to: 'habitatDamaged', cause: 'x' },
  ]);
  for (const sentence of describeEvents(s, events)) assert.doesNotMatch(sentence, /habitat/);
});

// --- the den count and the goal ---

test('habitatCount: dens standing out of the start count, empty on a level without dens', () => {
  const s = makeState(['H.H', '..H'], []);
  assert.equal(habitatCount(s), '3/3');
  s.tiles[0][0] = { kind: 'habitatDamaged', variant: null, under: null };
  assert.equal(habitatCount(s), '3/3');
  s.tiles[0][2] = { kind: 'stubble', variant: null, under: null };
  assert.equal(habitatCount(s), '2/3');
  assert.equal(habitatCount(makeState(['...'], [])), '');
});

test('goalText: a level with dens asks to keep them standing', () => {
  assert.equal(
    goalText({ ...LEVELS.find((l) => l.id === 'l01'), goal: 'capture', grid: ['P.H'] }),
    'Capture the forged permit and keep the den standing',
  );
  assert.equal(
    goalText({ ...LEVELS.find((l) => l.id === 'l01'), goal: 'clear', grid: ['H.H', '..H'] }),
    'Drive out every bot and keep the 3 dens standing',
  );
});

// --- defeat ---

test('defeatText: names why the battle was lost', () => {
  const s = makeState(['.'], []);
  assert.equal(defeatText({ ...s, outcome: 'lost', lostReason: 'habitat' }), 'A den was destroyed');
  assert.equal(defeatText({ ...s, outcome: 'lost', lostReason: 'wiped' }), 'Every band was wiped out');
  assert.equal(defeatText({ ...s, outcome: 'lost', lostReason: 'turns' }), 'Out of turns');
  assert.equal(defeatText({ ...s, outcome: 'lost', lostReason: 'rescue' }), 'The trapped animal was lost');
  assert.equal(defeatText({ ...s, outcome: 'lost', lostReason: null }), '');
  assert.equal(defeatText({ ...s, outcome: 'won', lostReason: null }), '');
});

// --- a blocked push says what the band bumped into ---

/**
 * An Ant Colony at 0,0 rams the harvester next to it eastwards, on the
 * given one-row grid, through the engine.
 * @param {string} row
 * @param {number} [length]  the harvester's length
 */
function ramEast(row, length = 2) {
  const cells = [[1, 0], [1, 1]].slice(0, length);
  const s = makeState([row, '.'.repeat(row.length)], [
    { id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 6 },
    { id: 'harvester-0', type: 'harvester', cells, maxLen: 3, plan: { path: [], strike: null, actionId: null } },
  ]);
  const next = applyMove(s, { kind: 'act', band: 'ants', action: 'ram', target: [1, 0] });
  return describeEvents(next, next.events);
}

test('describeEvents: a bot pushed against forest, stones or a den bumps into that, not "the edge"', () => {
  assert.deepEqual(ramEast('..T.'), ['Harvester loses 1', 'Harvester is pushed and bumps into the forest']);
  assert.deepEqual(ramEast('..S.'), ['Harvester loses 1', 'Harvester is pushed and bumps into the stones']);
  assert.deepEqual(ramEast('..H.'), ['Harvester loses 1', 'Harvester is pushed and bumps into the den']);
});

test('describeEvents: a bot pushed against the side of the board bumps into the edge', () => {
  assert.deepEqual(ramEast('..'), ['Harvester loses 1', 'Harvester is pushed and bumps into the edge']);
});

test('describeEvents: a bot wiped out by the bump still says what it hit', () => {
  assert.deepEqual(ramEast('..T.', 1), ['Harvester loses 1 and is wiped out', 'Harvester is pushed and bumps into the forest']);
});
