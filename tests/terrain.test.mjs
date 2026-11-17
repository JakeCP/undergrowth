import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRAIN,
  LEGEND,
  canEnter,
  isDeadly,
  dig,
  build,
  mow,
  pave,
  cut,
  strikeHabitat,
} from '../js/engine/terrain.js';

test('TERRAIN encodes every row of the table', () => {
  assert.deepEqual(TERRAIN, {
    open: { animalWalk: true, botWalk: true, flyOver: true, diggable: true },
    stubble: { animalWalk: true, botWalk: true, flyOver: true, diggable: true },
    forest: { animalWalk: true, botWalk: false, flyOver: true, diggable: true },
    paving: { animalWalk: true, botWalk: true, flyOver: true, diggable: false },
    water: { animalWalk: false, botWalk: false, flyOver: true, diggable: false },
    hole: { animalWalk: false, botWalk: false, flyOver: true, diggable: false },
    dam: { animalWalk: true, botWalk: true, flyOver: true, diggable: true },
    stones: { animalWalk: false, botWalk: false, flyOver: false, diggable: false },
    habitat: { animalWalk: true, botWalk: false, flyOver: true, diggable: false },
    habitatDamaged: { animalWalk: true, botWalk: false, flyOver: true, diggable: false },
  });
});

test('LEGEND maps every char to its tile and mark', () => {
  assert.deepEqual(LEGEND['.'], { tile: { kind: 'open', variant: 'grass', under: null }, mark: null });
  assert.deepEqual(LEGEND[','], { tile: { kind: 'open', variant: 'flowers', under: null }, mark: null });
  assert.deepEqual(LEGEND[';'], { tile: { kind: 'open', variant: 'mushrooms', under: null }, mark: null });
  assert.deepEqual(LEGEND['T'], { tile: { kind: 'forest', variant: null, under: null }, mark: null });
  assert.deepEqual(LEGEND['_'], { tile: { kind: 'stubble', variant: null, under: null }, mark: null });
  assert.deepEqual(LEGEND['#'], { tile: { kind: 'paving', variant: null, under: null }, mark: null });
  assert.deepEqual(LEGEND['~'], { tile: { kind: 'water', variant: null, under: null }, mark: null });
  assert.deepEqual(LEGEND['o'], { tile: { kind: 'hole', variant: null, under: null }, mark: null });
  assert.deepEqual(LEGEND['='], { tile: { kind: 'dam', variant: null, under: 'water' }, mark: null });
  assert.deepEqual(LEGEND['S'], { tile: { kind: 'stones', variant: null, under: null }, mark: null });
  assert.deepEqual(LEGEND['D'], { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'deploy' });
  assert.deepEqual(LEGEND['P'], { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'permit' });
  assert.deepEqual(LEGEND['K'], { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'stake' });
  assert.deepEqual(LEGEND['*'], { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'pickup' });
});

test('LEGEND tiles are distinct objects', () => {
  const tiles = Object.values(LEGEND).map((e) => e.tile);
  assert.equal(new Set(tiles).size, tiles.length);
  assert.notEqual(LEGEND['.'].tile, LEGEND['D'].tile);
});

test('canEnter respects side for walkers', () => {
  assert.equal(canEnter(LEGEND['T'].tile, 'bots', false), false);
  assert.equal(canEnter(LEGEND['T'].tile, 'us', false), true);
  assert.equal(canEnter(LEGEND['.'].tile, 'us', false), true);
  assert.equal(canEnter(LEGEND['.'].tile, 'bots', false), true);
  assert.equal(canEnter(LEGEND['_'].tile, 'us', false), true);
  assert.equal(canEnter(LEGEND['_'].tile, 'bots', false), true);
  assert.equal(canEnter(LEGEND['#'].tile, 'us', false), true);
  assert.equal(canEnter(LEGEND['#'].tile, 'bots', false), true);
  assert.equal(canEnter(LEGEND['~'].tile, 'us', false), false);
  assert.equal(canEnter(LEGEND['~'].tile, 'bots', false), false);
  assert.equal(canEnter(LEGEND['o'].tile, 'us', false), false);
  assert.equal(canEnter(LEGEND['o'].tile, 'bots', false), false);
  assert.equal(canEnter(LEGEND['='].tile, 'us', false), true);
  assert.equal(canEnter(LEGEND['='].tile, 'bots', false), true);
  assert.equal(canEnter(LEGEND['S'].tile, 'us', false), false);
  assert.equal(canEnter(LEGEND['S'].tile, 'bots', false), false);
});

test('canEnter uses flyOver for flyers regardless of side', () => {
  assert.equal(canEnter(LEGEND['~'].tile, 'us', true), true);
  assert.equal(canEnter(LEGEND['~'].tile, 'bots', true), true);
  assert.equal(canEnter(LEGEND['o'].tile, 'us', true), true);
  assert.equal(canEnter(LEGEND['T'].tile, 'bots', true), true);
  assert.equal(canEnter(LEGEND['.'].tile, 'us', true), true);
  assert.equal(canEnter(LEGEND['S'].tile, 'us', true), false);
  assert.equal(canEnter(LEGEND['S'].tile, 'bots', true), false);
});

test('isDeadly is water or hole when not flying', () => {
  assert.equal(isDeadly(LEGEND['~'].tile, false), true);
  assert.equal(isDeadly(LEGEND['o'].tile, false), true);
  assert.equal(isDeadly(LEGEND['~'].tile, true), false);
  assert.equal(isDeadly(LEGEND['o'].tile, true), false);
  assert.equal(isDeadly(LEGEND['.'].tile, false), false);
  assert.equal(isDeadly(LEGEND['T'].tile, false), false);
  assert.equal(isDeadly(LEGEND['='].tile, false), false);
  assert.equal(isDeadly(LEGEND['S'].tile, false), false);
  assert.equal(isDeadly(LEGEND['.'].tile, true), false);
});

test('dig turns open, stubble and forest into a hole', () => {
  assert.deepEqual(dig(LEGEND['.'].tile), { kind: 'hole', variant: null, under: null });
  assert.deepEqual(dig(LEGEND[','].tile), { kind: 'hole', variant: null, under: null });
  assert.deepEqual(dig(LEGEND[';'].tile), { kind: 'hole', variant: null, under: null });
  assert.deepEqual(dig(LEGEND['_'].tile), { kind: 'hole', variant: null, under: null });
  assert.deepEqual(dig(LEGEND['T'].tile), { kind: 'hole', variant: null, under: null });
});

test('dig turns a dam into its under', () => {
  assert.deepEqual(dig(LEGEND['='].tile), { kind: 'water', variant: null, under: null });
  assert.deepEqual(
    dig({ kind: 'dam', variant: null, under: 'hole' }),
    { kind: 'hole', variant: null, under: null },
  );
});

test('dig returns null where it does not apply', () => {
  assert.equal(dig(LEGEND['#'].tile), null);
  assert.equal(dig(LEGEND['~'].tile), null);
  assert.equal(dig(LEGEND['o'].tile), null);
  assert.equal(dig(LEGEND['S'].tile), null);
});

test('build turns water or hole into a dam over the old kind', () => {
  assert.deepEqual(build(LEGEND['o'].tile), { kind: 'dam', variant: null, under: 'hole' });
  assert.deepEqual(build(LEGEND['~'].tile), { kind: 'dam', variant: null, under: 'water' });
  assert.equal(build(LEGEND['.'].tile), null);
  assert.equal(build(LEGEND['T'].tile), null);
  assert.equal(build(LEGEND['#'].tile), null);
  assert.equal(build(LEGEND['='].tile), null);
  assert.equal(build(LEGEND['S'].tile), null);
  assert.equal(build(LEGEND['_'].tile), null);
});

test('mow turns forest into stubble only', () => {
  assert.deepEqual(mow(LEGEND['T'].tile), { kind: 'stubble', variant: null, under: null });
  assert.equal(mow(LEGEND['.'].tile), null);
  assert.equal(mow(LEGEND['_'].tile), null);
  assert.equal(mow(LEGEND['~'].tile), null);
  assert.equal(mow(LEGEND['S'].tile), null);
});

test('pave turns open or stubble into paving only', () => {
  assert.deepEqual(pave(LEGEND['.'].tile), { kind: 'paving', variant: null, under: null });
  assert.deepEqual(pave(LEGEND[','].tile), { kind: 'paving', variant: null, under: null });
  assert.deepEqual(pave(LEGEND['_'].tile), { kind: 'paving', variant: null, under: null });
  assert.equal(pave(LEGEND['T'].tile), null);
  assert.equal(pave(LEGEND['~'].tile), null);
  assert.equal(pave(LEGEND['#'].tile), null);
  assert.equal(pave(LEGEND['S'].tile), null);
});

test('cut turns a dam into its under only', () => {
  assert.deepEqual(cut(LEGEND['='].tile), { kind: 'water', variant: null, under: null });
  assert.deepEqual(
    cut({ kind: 'dam', variant: null, under: 'hole' }),
    { kind: 'hole', variant: null, under: null },
  );
  assert.equal(cut(LEGEND['.'].tile), null);
  assert.equal(cut(LEGEND['~'].tile), null);
  assert.equal(cut(LEGEND['T'].tile), null);
});

test('transforms are pure and return new objects', () => {
  const open = { kind: 'open', variant: 'flowers', under: null };
  const dug = dig(open);
  assert.deepEqual(open, { kind: 'open', variant: 'flowers', under: null });
  assert.notEqual(dug, open);

  const water = { kind: 'water', variant: null, under: null };
  const dam = build(water);
  assert.deepEqual(water, { kind: 'water', variant: null, under: null });
  assert.notEqual(dam, water);

  const forest = { kind: 'forest', variant: null, under: null };
  assert.notEqual(mow(forest), forest);
  assert.deepEqual(forest, { kind: 'forest', variant: null, under: null });
});

test('LEGEND H is an intact habitat', () => {
  assert.deepEqual(LEGEND['H'], { tile: { kind: 'habitat', variant: null, under: null }, mark: null });
});

test('habitat: animals can enter, bots cannot, in either state', () => {
  const intact = LEGEND['H'].tile;
  const damaged = { kind: 'habitatDamaged', variant: null, under: null };
  for (const tile of [intact, damaged]) {
    assert.equal(canEnter(tile, 'us', false), true);
    assert.equal(canEnter(tile, 'bots', false), false);
    assert.equal(canEnter(tile, 'us', true), true);
    assert.equal(isDeadly(tile, false), false);
  }
});

test('strikeHabitat steps intact -> damaged -> stubble and nothing else', () => {
  const intact = LEGEND['H'].tile;
  const damaged = strikeHabitat(intact);
  assert.deepEqual(damaged, { kind: 'habitatDamaged', variant: null, under: null });
  assert.deepEqual(strikeHabitat(damaged), { kind: 'stubble', variant: null, under: null });
  assert.deepEqual(intact, { kind: 'habitat', variant: null, under: null });
  assert.equal(strikeHabitat(LEGEND['T'].tile), null);
  assert.equal(strikeHabitat(LEGEND['.'].tile), null);
  assert.equal(strikeHabitat(LEGEND['='].tile), null);
});

test('no animal or forest transform applies to a habitat', () => {
  const intact = LEGEND['H'].tile;
  const damaged = { kind: 'habitatDamaged', variant: null, under: null };
  for (const tile of [intact, damaged]) {
    assert.equal(dig(tile), null);
    assert.equal(build(tile), null);
    assert.equal(mow(tile), null);
    assert.equal(pave(tile), null);
    assert.equal(cut(tile), null);
  }
});
