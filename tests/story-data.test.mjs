import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES } from '../data/story/index.js';
import { BAND_TYPES } from '../js/engine/units.js';
import { dueScenes, applyScene } from '../js/story/story.js';
import { PORTRAIT_LIST } from '../js/ui/portrait-list.js';
import { MOODS as PORTRAIT_MOODS } from '../scripts/portraits.mjs';

/** @typedef {import('../js/story/types.js').Scene} Scene */

// The scene ids other tasks rely on (opening-act plan, Task 2). `level`
// undefined means any level; `gives` undefined means it gives nothing.
const FIXED = [
  { id: 'intro-band', when: 'firstSelect', level: 'o01' },
  { id: 'o01-before', when: 'before', level: 'o01' },
  { id: 'o01-won', when: 'won', level: 'o01' },
  { id: 'o02-start', when: 'start', level: 'o02' },
  { id: 'o02-convinced', when: 'denMarked', level: 'o02' },
  { id: 'o02-convinced-late', when: 'won', level: 'o02', if: { unseen: ['o02-convinced'] } },
  { id: 'o02-ants-join', when: 'won', level: 'o02', gives: [{ kind: 'band', type: 'ants' }] },
  { id: 'tip-den', when: 'denMarked', if: { unseen: ['o02-convinced'] } },
  { id: 'l01-start', when: 'start', level: 'l01' },
  { id: 'l02-beaver-joins', when: 'before', level: 'l02', gives: [{ kind: 'band', type: 'beaver' }] },
  { id: 'l02-start', when: 'start', level: 'l02', if: { owns: ['beaver'] } },
  { id: 'l03-start', when: 'start', level: 'l03' },
  { id: 'l04-start', when: 'start', level: 'l04' },
  { id: 'l05-badger-joins', when: 'before', level: 'l05', gives: [{ kind: 'band', type: 'badger' }] },
  { id: 'l05-start', when: 'start', level: 'l05', if: { owns: ['badger'] } },
  { id: 'shop-first', when: 'shop' },
  { id: 'lost-first', when: 'lost' },
];

const SEVEN_LEVELS = ['o01', 'o02', 'l01', 'l02', 'l03', 'l04', 'l05'];
const OUTSIDE_BATTLE = ['map', 'shop', 'before', 'won', 'lost'];
// The seven moods the portraits come in (scripts/portraits.mjs). `scared`
// was drawn for the portraits after the plan listed four, and `shrewd`
// and `greedy` for Hazel's shop; the story may use them all.
const MOODS = ['happy', 'surprised', 'sad', 'angry', 'scared', 'shrewd', 'greedy'];

/** @param {string} id @returns {Scene} */
function byId(id) {
  const s = SCENES.find((x) => x.id === id);
  assert.ok(s, `scene ${id} exists`);
  return s;
}

test('every fixed scene exists with its when, level, if and gives', () => {
  for (const want of FIXED) {
    const s = byId(want.id);
    assert.equal(s.when, want.when, `${want.id}: when`);
    assert.equal(s.level, want.level, `${want.id}: level`);
    assert.deepEqual(s.gives, want.gives, `${want.id}: gives`);
    if (want.if !== undefined) assert.deepEqual(s.if, want.if, `${want.id}: if`);
  }
});

test('scene ids are unique', () => {
  const ids = SCENES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every speaker is one of our band types, hazel or the narrator', () => {
  for (const s of SCENES) {
    for (const line of s.lines) {
      const ok = line.who === 'hazel' || line.who === 'narrator' || BAND_TYPES[line.who]?.side === 'us';
      assert.ok(ok, `${s.id}: unknown speaker "${line.who}"`);
    }
  }
});

test('only scenes outside a battle give anything, and every gift is real', () => {
  for (const s of SCENES) {
    if (s.gives === undefined) continue;
    assert.ok(OUTSIDE_BATTLE.includes(s.when), `${s.id} gives, but fires at ${s.when}`);
    for (const g of s.gives) {
      if (g.kind === 'seeds') assert.ok(Number.isInteger(g.amount) && g.amount > 0, s.id);
      else assert.equal(BAND_TYPES[g.type]?.side, 'us', `${s.id}: gives "${g.type}"`);
    }
  }
});

test('every scene has 1 to 6 lines, none longer than 140 characters', () => {
  for (const s of SCENES) {
    assert.ok(s.lines.length >= 1 && s.lines.length <= 6, `${s.id}: ${s.lines.length} lines`);
    for (const line of s.lines) {
      assert.ok(line.text.length > 0, `${s.id}: an empty line`);
      assert.ok(line.text.length <= 140, `${s.id}: ${line.text.length} characters: ${line.text}`);
    }
  }
});

test('l02-start and l05-start each point at exactly one tile', () => {
  for (const id of ['l02-start', 'l05-start']) {
    const pointed = byId(id).lines.filter((l) => l.point !== undefined);
    assert.equal(pointed.length, 1, id);
    const point = pointed[0].point;
    assert.equal(point?.kind, 'tile', id);
  }
});

test('every pointer is well formed', () => {
  for (const s of SCENES) {
    for (const line of s.lines) {
      const p = line.point;
      if (p === undefined) continue;
      if (p.kind === 'tile') {
        assert.ok(p.at.length === 2 && p.at.every((n) => Number.isInteger(n) && n >= 0), `${s.id}: tile ${p.at}`);
      } else if (p.kind === 'band') {
        assert.equal(BAND_TYPES[p.type]?.side, 'us', `${s.id}: band ${p.type}`);
      } else if (p.kind === 'den') {
        assert.ok(['denMarked', 'denDamaged'].includes(s.when), `${s.id}: a den pointer needs a den moment`);
      } else {
        assert.ok(p.kind === 'ui' && ['endTurn', 'undo'].includes(p.id), `${s.id}: pointer ${JSON.stringify(p)}`);
      }
    }
  }
});

test('moods are the seven the portraits come in, on the fox, the hedgehog, or a speaker whose mood portrait ships', () => {
  assert.deepEqual(MOODS, [...PORTRAIT_MOODS], 'the story and the portrait script know the same moods');
  for (const s of SCENES) {
    for (const line of s.lines) {
      if (line.mood === undefined) continue;
      assert.ok(MOODS.includes(line.mood), `${s.id}: mood ${line.mood}`);
      // The fox and the hedgehog may have any mood (a missing image falls
      // back to the ordinary portrait). Anyone else only a mood that has
      // been drawn, so a line never names a face that cannot show.
      const who = line.who === 'hazel' ? 'shopkeeper' : line.who;
      assert.ok(
        line.who === 'fox' || line.who === 'hedgehog' || PORTRAIT_LIST.includes(`${who}-${line.mood}`),
        `${s.id}: ${line.who} has no ${line.mood} portrait`,
      );
    }
  }
});

test('every mood portrait that ships is one a line could show', () => {
  // A portrait named for a mood the story cannot name is cached for nothing.
  for (const id of PORTRAIT_LIST) {
    const dash = id.lastIndexOf('-');
    // A blink frame is not a mood: it is laid over the plain portrait.
    if (dash < 0 || id.endsWith('-blink')) continue;
    assert.ok(MOODS.includes(id.slice(dash + 1)), `${id}: not a mood a line can name`);
  }
  assert.ok(PORTRAIT_LIST.includes('fox-scared') && PORTRAIT_LIST.includes('hedgehog-scared'));
});

test('the moods the script needs are there', () => {
  /** @param {string} id @param {string} who @param {string} mood */
  const has = (id, who, mood) => byId(id).lines.some((l) => l.who === who && l.mood === mood);
  assert.ok(has('o02-convinced', 'fox', 'surprised'));
  assert.ok(has('o02-convinced', 'hedgehog', 'angry'));
  assert.ok(has('o02-ants-join', 'fox', 'happy'));
  assert.ok(has('o02-ants-join', 'hedgehog', 'happy'));
  assert.ok(has('lost-first', 'hedgehog', 'sad'));
});

test('o02-convinced ends with the den rule in the hedgehog\'s voice, and tip-den gives the same rule', () => {
  const last = byId('o02-convinced').lines.at(-1);
  assert.equal(last?.who, 'hedgehog');
  assert.match(last?.text ?? '', /one hit/);
  assert.ok(byId('tip-den').lines.some((l) => l.text === last?.text));
});

test('every level a scene names is one of the seven, and every turn is a whole number', () => {
  for (const s of SCENES) {
    if (s.level !== undefined) assert.ok(SEVEN_LEVELS.includes(s.level), `${s.id}: level ${s.level}`);
    if (s.turn !== undefined) assert.ok(Number.isInteger(s.turn) && s.turn >= 1, `${s.id}: turn`);
  }
});

test('every scene an if names exists', () => {
  const ids = new Set(SCENES.map((s) => s.id));
  for (const s of SCENES) {
    for (const id of [...(s.if?.seen ?? []), ...(s.if?.unseen ?? [])]) assert.ok(ids.has(id), `${s.id}: ${id}`);
    for (const t of [...(s.if?.owns ?? []), ...(s.if?.lacks ?? [])]) assert.ok(BAND_TYPES[t], `${s.id}: ${t}`);
  }
});

// --- the script in play ---

const NEW_GAME = { version: /** @type {1} */ (1), seeds: 0, bands: { fox: { maxLen: 2 }, hedgehog: { maxLen: 2 } }, cleared: {}, story: { seen: {} } };

/** @param {import('../js/story/types.js').Moment} m @param {typeof NEW_GAME} [p] */
const due = (m, p = NEW_GAME) => dueScenes(SCENES, m, p).map((s) => s.id);

test('the den first marked on o02 plays the fox convinced, and not the den tip as well', () => {
  assert.deepEqual(due({ when: 'denMarked', level: 'o02', at: [0, 0] }), ['o02-convinced']);
});

test('the den first marked anywhere else plays the den tip, until the fox has been convinced', () => {
  assert.deepEqual(due({ when: 'denMarked', level: 'l01', at: [0, 0] }), ['tip-den']);
  const convinced = applyScene(NEW_GAME, byId('o02-convinced'));
  assert.deepEqual(due({ when: 'denMarked', level: 'l01', at: [0, 0] }, convinced), []);
});

test('winning o02 convinces the fox first if the den was never marked, then the ants join', () => {
  assert.deepEqual(due({ when: 'won', level: 'o02' }), ['o02-convinced-late', 'o02-ants-join']);
  const convinced = applyScene(NEW_GAME, byId('o02-convinced'));
  assert.deepEqual(due({ when: 'won', level: 'o02' }, convinced), ['o02-ants-join']);
});

test('l02 opens with the beaver joining, and the pointed line follows once the beaver is owned', () => {
  assert.deepEqual(due({ when: 'before', level: 'l02' }), ['l02-beaver-joins']);
  assert.deepEqual(due({ when: 'start', level: 'l02' }), []);
  const joined = applyScene(NEW_GAME, byId('l02-beaver-joins'));
  assert.deepEqual(joined.bands.beaver, { maxLen: BAND_TYPES.beaver.startLen });
  assert.deepEqual(due({ when: 'start', level: 'l02' }, joined), ['l02-start']);
});

test('a player who bought the badger still meets it before l05, and gets one free recruit', () => {
  const bought = { ...NEW_GAME, bands: { ...NEW_GAME.bands, badger: { maxLen: 3 } } };
  assert.deepEqual(due({ when: 'before', level: 'l05' }, bought), ['l05-badger-joins']);
  const after = applyScene(bought, byId('l05-badger-joins'));
  assert.deepEqual(after.bands.badger, { maxLen: 4 });
});
