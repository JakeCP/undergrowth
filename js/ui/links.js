/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {{from: number, to: number}} Link */

/**
 * The band link rule (look-and-motion spec, "Look"): a band's cells are
 * ordered head first, and each body cell draws one link, to the earliest
 * cell before it in that order that it touches. Two cells touch when they
 * share an edge.
 *
 * Returns one entry per linked body cell, in cell order. `from` is the
 * body cell's index and `to` is the index of the earlier cell it links to.
 * A body cell that touches no earlier cell draws no link.
 * @param {Pos[]} cells head first
 * @returns {Link[]}
 */
export function bandLinks(cells) {
  /** @type {Link[]} */
  const links = [];
  for (let i = 1; i < cells.length; i += 1) {
    const cell = cells[i];
    for (let j = 0; j < i; j += 1) {
      const earlier = cells[j];
      if (Math.abs(earlier[0] - cell[0]) + Math.abs(earlier[1] - cell[1]) === 1) {
        links.push({ from: i, to: j });
        break;
      }
    }
  }
  return links;
}
