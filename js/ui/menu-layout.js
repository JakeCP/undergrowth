// The deploy screen's layout rules. Where the band's card may lie over
// the board (play-feel spec, "Changed after Jake's playtest of the full
// build"): over half of the board, on the half away from the deploy
// tiles, and never over one of them. The Start button is below the
// board, outside the panel's reach. Since the deploy screen's rebuild,
// that is the last resort: cardPlacement (below) puts the card beside
// or under the board first.
//
// Pure: board sizes are in tiles, measured room in CSS px.

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {'top'|'bottom'|'left'|'right'} Half */

/** Wide halves first: a card reads best in full-width lines on a phone. */
/** @type {readonly Half[]} */
export const HALVES = Object.freeze(['top', 'bottom', 'left', 'right']);

/**
 * Whether a tile is even partly under this half of the board. On an odd
 * board the middle row or column is under both halves.
 * @param {Half} half
 * @param {Pos} at
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function underHalf(half, at, width, height) {
  const [x, y] = at;
  switch (half) {
    case 'top': return y < height / 2;
    case 'bottom': return y + 1 > height / 2;
    case 'left': return x < width / 2;
    default: return x + 1 > width / 2;
  }
}

/**
 * The centre of a half, in tiles.
 * @param {Half} half
 * @param {number} width
 * @param {number} height
 * @returns {[number, number]}
 */
function centreOf(half, width, height) {
  switch (half) {
    case 'top': return [width / 2, height / 4];
    case 'bottom': return [width / 2, (height * 3) / 4];
    case 'left': return [width / 4, height / 2];
    default: return [(width * 3) / 4, height / 2];
  }
}

/**
 * The half of the board the panel takes, or null when every half has a
 * deploy tile under it (the panel then sits below the board instead).
 * Of the halves with no deploy tile, a wide one (top or bottom) wins over
 * a tall one, and then the one farther from the deploy tiles.
 * @param {readonly Pos[]} deployTiles
 * @param {number} width
 * @param {number} height
 * @returns {Half|null}
 */
export function panelHalf(deployTiles, width, height) {
  const free = HALVES.filter((half) => !deployTiles.some((t) => underHalf(half, t, width, height)));
  if (free.length === 0) return null;
  const n = Math.max(1, deployTiles.length);
  const mx = deployTiles.reduce((s, t) => s + t[0] + 0.5, 0) / n;
  const my = deployTiles.reduce((s, t) => s + t[1] + 0.5, 0) / n;
  /** @param {Half} half */
  const distance = (half) => {
    const [cx, cy] = centreOf(half, width, height);
    return (cx - mx) ** 2 + (cy - my) ** 2;
  };
  /** @param {Half} half */
  const wide = (half) => half === 'top' || half === 'bottom';
  let best = free[0];
  for (const half of free.slice(1)) {
    if (wide(half) !== wide(best)) {
      if (wide(half)) best = half;
      continue;
    }
    if (distance(half) > distance(best)) best = half;
  }
  return best;
}

// --- where the picked band's card goes (the deploy screen's rebuild) ---
//
// The card never covers the board where it can help it. On a wide screen
// it lives in the side panel beside the board, as the battle screen's
// panel does. On a phone it sits in the space under the board when there
// is room for it there without shrinking the board much; only when there
// is not does it lie over the half of the board away from the deploy
// tiles (panelHalf). Wherever it goes, the full card is shown when it
// fits, and otherwise the brief one (name, pips, one line per action),
// with the full card a tap away.

/** @typedef {'side'|'below'|'over'} CardPlace */
/** @typedef {'full'|'brief'} CardForm */
/**
 * What the screen measured, in CSS px. On a phone, `areaW` and `areaH`
 * are the cell the board and the space under it share; `fullH` and
 * `briefH` the tallest card of the roster in each form at that width. On
 * a wide screen, `sideH` is the room the side panel leaves for the card.
 * A size of 0 (or not a number) means it could not be measured.
 * @typedef {{wide: boolean, areaW?: number, areaH?: number, sideH?: number, fullH: number, briefH: number, half: Half|null}} CardRoom
 */

/** The board is never drawn smaller than this on a phone, in px. */
export const MIN_BOARD = 240;
/** Nor larger, as on the battle screen. */
export const MAX_BOARD = 520;
/**
 * The card may sit under the board if the board keeps at least this
 * share of the width it would have alone: it may give up a little to
 * keep the card off it, not much.
 * @type {number}
 */
export const BOARD_KEEP = 0.86;
/** The gap between the board and a card under it, in px. */
export const CARD_GAP = 10;

/** @param {number|undefined} n */
const measured = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Where the card goes, in which form, and how tall the space under the
 * board must be for it (0 when it is not under the board).
 * @param {CardRoom} room
 * @returns {{place: CardPlace, form: CardForm, slot: number}}
 */
export function cardPlacement(room) {
  if (room.wide) {
    const fits = !measured(room.sideH) || !measured(room.fullH) || room.fullH <= /** @type {number} */ (room.sideH);
    return { place: 'side', form: fits ? 'full' : 'brief', slot: 0 };
  }
  const areaW = room.areaW ?? 0;
  const areaH = room.areaH ?? 0;
  // Nothing to measure by (no layout yet): over the free half, as before.
  if (!measured(areaW) || !measured(areaH)) {
    return { place: room.half === null ? 'below' : 'over', form: 'brief', slot: 0 };
  }
  const alone = Math.min(areaW, areaH, MAX_BOARD);
  const need = Math.min(alone, Math.max(MIN_BOARD, Math.floor(Math.min(areaW, MAX_BOARD) * BOARD_KEEP)));
  /** @param {number} h */
  const roomFor = (h) => measured(h) && areaH - CARD_GAP - h >= need;
  if (roomFor(room.fullH)) return { place: 'below', form: 'full', slot: Math.ceil(room.fullH) + CARD_GAP };
  if (roomFor(room.briefH)) return { place: 'below', form: 'brief', slot: Math.ceil(room.briefH) + CARD_GAP };
  if (room.half !== null) return { place: 'over', form: 'brief', slot: 0 };
  // No half is clear of deploy tiles: under the board anyway, and the
  // page scrolls if it must.
  return { place: 'below', form: 'brief', slot: measured(room.briefH) ? Math.ceil(room.briefH) + CARD_GAP : 0 };
}

/**
 * How many bands may still go on the board, out of how many: the level's
 * limit, or the bands owned when there are fewer.
 * @param {number} placed
 * @param {number} maxBands
 * @param {number} owned
 * @returns {{placed: number, room: number, left: number, line: string}}
 */
export function placedCount(placed, maxBands, owned) {
  const room = Math.max(0, Math.min(maxBands, owned));
  return { placed, room, left: Math.max(0, room - placed), line: `${placed} of ${room} placed` };
}

/**
 * The Start button's words: what is missing while it cannot start.
 * @param {number} placed
 * @param {number} maxBands
 * @returns {{label: string, ready: boolean}}
 */
export function startLabel(placed, maxBands) {
  if (placed < 1) return { label: 'Place at least one band', ready: false };
  if (placed > maxBands) return { label: `Only ${maxBands} may go`, ready: false };
  return { label: 'Start', ready: true };
}
