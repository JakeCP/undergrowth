import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandLinks } from '../js/ui/links.js';

test('bandLinks: a lone head and an empty band draw no links', () => {
  assert.deepEqual(bandLinks([]), []);
  assert.deepEqual(bandLinks([[2, 2]]), []);
});

test('bandLinks: a straight band links each body cell to the one before it', () => {
  assert.deepEqual(bandLinks([[3, 0], [2, 0], [1, 0], [0, 0]]), [
    { from: 1, to: 0 },
    { from: 2, to: 1 },
    { from: 3, to: 2 },
  ]);
});

test('bandLinks: a bent band still links along the march', () => {
  // head at (2,2), body goes up then left: an L shape.
  assert.deepEqual(bandLinks([[2, 2], [2, 1], [2, 0], [1, 0], [0, 0]]), [
    { from: 1, to: 0 },
    { from: 2, to: 1 },
    { from: 3, to: 2 },
    { from: 4, to: 3 },
  ]);
});

test('bandLinks: a band folded back beside itself links to the earliest touching cell', () => {
  // A U-turn: 0 1
  //           3 2   cell 3 touches both the head (0) and cell 2; the head wins.
  assert.deepEqual(bandLinks([[0, 0], [1, 0], [1, 1], [0, 1]]), [
    { from: 1, to: 0 },
    { from: 2, to: 1 },
    { from: 3, to: 0 },
  ]);
});

test('bandLinks: a long fold links every doubled-back cell to the cell beside it, not the one behind', () => {
  // 0 1 2
  // 5 4 3   cell 4 touches 1, 3 and (later) 5: links to 1. Cell 5 touches 0 and 4: links to 0.
  assert.deepEqual(bandLinks([[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]]), [
    { from: 1, to: 0 },
    { from: 2, to: 1 },
    { from: 3, to: 2 },
    { from: 4, to: 1 },
    { from: 5, to: 0 },
  ]);
});

test('bandLinks: a body cell reordered by a self-step links to the first cell it touches', () => {
  // The head stepped back onto its own body: cells are no longer in march order.
  // 1 0
  // 2 3
  assert.deepEqual(bandLinks([[1, 0], [0, 0], [0, 1], [1, 1]]), [
    { from: 1, to: 0 },
    { from: 2, to: 1 },
    { from: 3, to: 0 },
  ]);
});

test('bandLinks: every body cell draws exactly one link, and diagonals do not touch', () => {
  const cells = /** @type {[number, number][]} */ ([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]]);
  const links = bandLinks(cells);
  assert.equal(links.length, cells.length - 1);
  assert.deepEqual(links.map((l) => l.from), [1, 2, 3, 4, 5, 6, 7]);
  for (const link of links) {
    assert.ok(link.to < link.from);
    const a = cells[link.from];
    const b = cells[link.to];
    assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
  }
  // (0,1) touches the head (0,0), (1,1) and (0,2); the head is earliest.
  assert.deepEqual(links[6], { from: 7, to: 0 });
});

test('bandLinks: a cell that touches nothing before it draws no link', () => {
  assert.deepEqual(bandLinks([[0, 0], [1, 1], [1, 0]]), [{ from: 2, to: 0 }]);
});

test('bandLinks: does not change its input', () => {
  const cells = /** @type {[number, number][]} */ ([[0, 0], [1, 0]]);
  bandLinks(cells);
  assert.deepEqual(cells, [[0, 0], [1, 0]]);
});
