import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIR_ORDER,
  DIRS,
  add,
  eq,
  key,
  inBounds,
  manhattan,
  dirBetween,
  neighbours,
} from '../js/engine/grid.js';

test('DIR_ORDER is N, E, S, W', () => {
  assert.deepEqual(DIR_ORDER, ['N', 'E', 'S', 'W']);
});

test('DIRS maps each direction to its delta', () => {
  assert.deepEqual(DIRS, {
    N: [0, -1],
    E: [1, 0],
    S: [0, 1],
    W: [-1, 0],
  });
  assert.deepEqual(DIRS.N, [0, -1]);
  assert.deepEqual(DIRS.E, [1, 0]);
  assert.deepEqual(DIRS.S, [0, 1]);
  assert.deepEqual(DIRS.W, [-1, 0]);
});

test('add adds component-wise', () => {
  assert.deepEqual(add([2, 3], DIRS.N), [2, 2]);
  assert.deepEqual(add([2, 3], DIRS.E), [3, 3]);
  assert.deepEqual(add([2, 3], DIRS.S), [2, 4]);
  assert.deepEqual(add([2, 3], DIRS.W), [1, 3]);
  assert.deepEqual(add([0, 0], [0, 0]), [0, 0]);
  assert.deepEqual(add([-1, 5], [1, -5]), [0, 0]);
});

test('add does not mutate its inputs', () => {
  const p = [2, 3];
  const d = [1, -1];
  assert.deepEqual(add(p, d), [3, 2]);
  assert.deepEqual(p, [2, 3]);
  assert.deepEqual(d, [1, -1]);
});

test('eq compares both coordinates', () => {
  assert.equal(eq([1, 2], [1, 2]), true);
  assert.equal(eq([0, 0], [0, 0]), true);
  assert.equal(eq([1, 2], [1, 3]), false);
  assert.equal(eq([1, 2], [0, 2]), false);
  assert.equal(eq([1, 2], [3, 4]), false);
});

test('key formats as "x,y"', () => {
  assert.equal(key([4, 7]), '4,7');
  assert.equal(key([0, 0]), '0,0');
  assert.equal(key([-1, 12]), '-1,12');
});

test('inBounds checks 0 <= x < width and 0 <= y < height', () => {
  assert.equal(inBounds({ width: 8, height: 8 }, [8, 0]), false);
  assert.equal(inBounds({ width: 8, height: 8 }, [0, 0]), true);
  assert.equal(inBounds({ width: 8, height: 8 }, [7, 7]), true);
  assert.equal(inBounds({ width: 8, height: 8 }, [0, 8]), false);
  assert.equal(inBounds({ width: 8, height: 8 }, [-1, 0]), false);
  assert.equal(inBounds({ width: 8, height: 8 }, [0, -1]), false);
  assert.equal(inBounds({ width: 3, height: 2 }, [2, 1]), true);
  assert.equal(inBounds({ width: 3, height: 2 }, [3, 1]), false);
  assert.equal(inBounds({ width: 3, height: 2 }, [2, 2]), false);
});

test('manhattan is the sum of absolute differences', () => {
  assert.equal(manhattan([0, 0], [0, 0]), 0);
  assert.equal(manhattan([0, 0], [1, 0]), 1);
  assert.equal(manhattan([0, 0], [0, 3]), 3);
  assert.equal(manhattan([1, 1], [4, 5]), 7);
  assert.equal(manhattan([4, 5], [1, 1]), 7);
  assert.equal(manhattan([-2, -1], [1, 2]), 6);
});

test('dirBetween returns direction along a shared row or column', () => {
  assert.equal(dirBetween([1, 1], [1, 4]), 'S');
  assert.equal(dirBetween([1, 1], [2, 2]), null);
  assert.equal(dirBetween([1, 1], [1, 1]), null);
  assert.equal(dirBetween([1, 4], [1, 1]), 'N');
  assert.equal(dirBetween([1, 1], [4, 1]), 'E');
  assert.equal(dirBetween([4, 1], [1, 1]), 'W');
  assert.equal(dirBetween([1, 1], [1, 2]), 'S');
  assert.equal(dirBetween([1, 1], [1, 0]), 'N');
  assert.equal(dirBetween([1, 1], [2, 1]), 'E');
  assert.equal(dirBetween([1, 1], [0, 1]), 'W');
  assert.equal(dirBetween([0, 0], [2, 1]), null);
});

test('neighbours returns in-bounds neighbours in N/E/S/W order', () => {
  assert.deepEqual(neighbours({ width: 8, height: 8 }, [0, 0]), [[1, 0], [0, 1]]);
  assert.deepEqual(neighbours({ width: 8, height: 8 }, [1, 1]), [[1, 0], [2, 1], [1, 2], [0, 1]]);
  assert.deepEqual(neighbours({ width: 8, height: 8 }, [7, 7]), [[7, 6], [6, 7]]);
  assert.deepEqual(neighbours({ width: 8, height: 8 }, [7, 0]), [[7, 1], [6, 0]]);
  assert.deepEqual(neighbours({ width: 8, height: 8 }, [0, 7]), [[0, 6], [1, 7]]);
  assert.deepEqual(neighbours({ width: 1, height: 1 }, [0, 0]), []);
});

test('neighbours does not mutate its inputs', () => {
  const s = { width: 8, height: 8 };
  const p = [1, 1];
  neighbours(s, p);
  assert.deepEqual(s, { width: 8, height: 8 });
  assert.deepEqual(p, [1, 1]);
});
