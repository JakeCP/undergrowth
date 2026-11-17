/** @typedef {import('./types.js').Pos} Pos */
/** @typedef {import('./types.js').Dir} Dir */

/** @type {Dir[]} */
export const DIR_ORDER = ['N', 'E', 'S', 'W'];

/** @type {Record<Dir, Pos>} */
export const DIRS = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

/**
 * @param {Pos} p
 * @param {Pos} d
 * @returns {Pos}
 */
export function add(p, d) {
  return [p[0] + d[0], p[1] + d[1]];
}

/**
 * @param {Pos} a
 * @param {Pos} b
 * @returns {boolean}
 */
export function eq(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * @param {Pos} p
 * @returns {string}
 */
export function key(p) {
  return `${p[0]},${p[1]}`;
}

/**
 * @param {{width: number, height: number}} s
 * @param {Pos} p
 * @returns {boolean}
 */
export function inBounds(s, p) {
  return p[0] >= 0 && p[0] < s.width && p[1] >= 0 && p[1] < s.height;
}

/**
 * @param {Pos} a
 * @param {Pos} b
 * @returns {number}
 */
export function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/**
 * @param {Pos} from
 * @param {Pos} to
 * @returns {Dir|null}
 */
export function dirBetween(from, to) {
  if (eq(from, to)) return null;
  if (from[0] === to[0]) return to[1] > from[1] ? 'S' : 'N';
  if (from[1] === to[1]) return to[0] > from[0] ? 'E' : 'W';
  return null;
}

/**
 * @param {{width: number, height: number}} s
 * @param {Pos} p
 * @returns {Pos[]}
 */
export function neighbours(s, p) {
  /** @type {Pos[]} */
  const result = [];
  for (const dir of DIR_ORDER) {
    const next = add(p, DIRS[dir]);
    if (inBounds(s, next)) result.push(next);
  }
  return result;
}
