/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').Band} Band */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('../engine/types.js').Tile} Tile */
/** @typedef {import('./patterns.js').GroundKey} GroundKey */
/** @typedef {import('./look.js').Tree} Tree */
/** @typedef {'wipe'|'water'|'hole'|'bump'|'own'} BadgeIcon */
/** @typedef {import('./turn-state.js').TurnState} TurnState */
/**
 * What to draw besides the state. `marks: false` leaves out the marks for
 * what each band has left this turn (the deploy screen has no turn yet).
 * @typedef {{selected: string|null, highlights: Pos[], highlightKind: 'move'|'target'|'deploy'|null, ghost: BattleState|null, targets?: Array<BoardTarget>, marks?: boolean}} BoardView
 */
/**
 * A target on the board: the tile a tap aims at, its badges, and (for an
 * action that strikes more than one tile, the bees' sting) every tile it
 * strikes, starting with `at`, each with the badges for the band there.
 * @typedef {{at: Pos, badges: BadgeIcon[], strikes?: Array<{at: Pos, badges: BadgeIcon[]}>}} BoardTarget
 */

// The battle board (look-and-motion spec, "Look"). Layers, bottom up:
//
//   defs (kept between renders), the frame, the tiles, the faint grid
//   (only while choosing a move or target), objectives and pickups, the
//   bots' plans (kept between renders), highlights and targets, the
//   bands, the hover ghost, and the target badges on top.
//
// Every tile is a <g data-tile="x,y"> holding its ground (a rect filled
// from js/ui/patterns.js, [data-ground]), its soft edges ([data-edge]) and
// its code-drawn feature ([data-feature]). Every band is a
// <g data-band="id"> holding one [data-token="i"] per cell; token 0 is the
// head ([data-head]). Nothing that the animation step may move carries a
// transform attribute or a filter: everything is drawn in board
// coordinates, so a CSS transform moves it from where it is drawn. See
// the selectors in js/ui/look.js.

import { BAND_TYPES } from '../engine/units.js';
import { el } from './svg.js';
import { svgIcon } from './icons.js';
import {
  defineGroundPatterns, groundFill, hasTexture,
  INK, CREAM, HAZARD, RUST, RUST_DARK, STEEL, ANIMAL, ANIMAL_DARK, FRAME,
  GRASS_LIGHT, GRASS_SHADE, FOREST_LIGHT, FOREST_SHADE,
  SOIL, SOIL_LIGHT, SOIL_DARK, STUBBLE_LIGHT, STUBBLE_SHADE,
  WATER_LIGHT, WATER_DEEP, STONE, STONE_LIGHT, STONE_SHADE,
  PAVING_LIGHT, PAVING_SHADE,
  DEN_GROUND, DEN_GLOW, DEN_SCORCHED, DEN_ASH,
} from './patterns.js';
import { planDrawings, diffPlans, engagedBotIds } from './plans.js';
import {
  TILE, hash01, groundGrid, softEdges, showGrid, forestTrees, bandTokens, aimedHabitats, phaseDelay, tileMarks,
} from './look.js';
import { silhouettes } from './silhouettes.js';
import { pieceScene, drawTilePiece, drawDenMarks, drawObjectivePiece } from './board-pieces.js';
import { turnStates } from './turn-state.js';

export { TILE };

/** Board edge length in viewBox units (8 tiles of 40). */
const BOARD_PX = 320;
const COLS = BOARD_PX / TILE;

/** The cracks on a damaged den: pale, like embers through ash. */
const CRACK = '#f4e3a1';
const SMOKE = '#d3cec6';
const BARK = '#5a3b1e';
const PLANK = '#a8743f';
const PLANK_LIGHT = '#d9b27c';
const BIRCH_BARK = '#ece6da';
const PINE_TONES = ['#2c5a30', '#336a36', '#3d7639'];
const BIRCH_TONES = ['#86b552', '#97c35c', '#74a748'];
const BUSH_TONES = ['#4f8a3a', '#5d9a41', '#457e35'];
const BLOSSOM = ['#ec86a6', '#f2d65a', '#b893de'];
const FLOWERS = ['#e0644a', '#f0c23e', '#a47ccf'];
const CAP = '#b8452f';
/** The ring on a band that is ready, or can still act: a bright spring green. */
const READY = '#d6f77a';

/** Radius of an outcome badge, in viewBox units. */
const BADGE_R = 8;
/** Width of a soft tile edge. */
const EDGE = 6;
/** Radius of a body token, and of the head's disc. */
const TOKEN_R = 8;
const HEAD_R = 15;

/** Periods of the endless idle animations, in ms (see css/game.css). */
const WOBBLE_MS = 1400;
const RIPPLE_MS = 4200;
const PULSE_MS = 1100;
const SMOKE_MS = 3000;

/**
 * A hash-picked number: min + hash * span, rounded to 0.1.
 * @param {number} x
 * @param {number} y
 * @param {number} i
 * @param {number} min
 * @param {number} span
 * @returns {number}
 */
function off(x, y, i, min, span) {
  return Math.round((min + hash01(x, y, i) * span) * 10) / 10;
}

/**
 * @param {number} v
 * @returns {number}
 */
function r1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * The centre of tile column (or row) `x`, in board units.
 * @param {number} x
 * @returns {number}
 */
function cx(x) {
  return x * TILE + TILE / 2;
}

/**
 * The style that starts an endless CSS animation in phase with the clock.
 * @param {number} now
 * @param {number} period
 * @param {number} offset
 * @returns {string}
 */
function phase(now, period, offset) {
  return `animation-delay: ${phaseDelay(now, period, offset)}ms`;
}

// --- defs, kept between renders ---

/** @type {WeakMap<SVGSVGElement, SVGElement>} */
const keptDefs = new WeakMap();

/**
 * The board's <defs>: every ground pattern and the four soft-edge
 * gradients. Made once per board and re-attached on each render, so the
 * patterns are not rebuilt on every tap.
 * @param {SVGSVGElement} svg
 * @returns {SVGElement}
 */
function boardDefs(svg) {
  const kept = keptDefs.get(svg);
  if (kept !== undefined) return kept;
  const defs = el('defs', {});
  defineGroundPatterns(defs);
  /** @type {Record<string, [number, number, number, number]>} */
  const dirs = { n: [0, 0, 0, 1], e: [1, 0, 0, 0], s: [0, 1, 0, 0], w: [0, 0, 1, 0] };
  for (const [side, [x1, y1, x2, y2]] of Object.entries(dirs)) {
    const grad = el('linearGradient', { id: `ug-edge-${side}`, x1, y1, x2, y2 }, defs);
    el('stop', { offset: 0, 'stop-color': INK, 'stop-opacity': 0.3 }, grad);
    el('stop', { offset: 1, 'stop-color': INK, 'stop-opacity': 0 }, grad);
  }
  defineTokenPaint(defs);
  keptDefs.set(svg, defs);
  return defs;
}

// --- the tokens' painted depth ---
//
// The discs and body tokens are lit from the top left, as the painted
// board is: a radial gradient from a lighter tone under the light to a
// deeper one at the far edge, a thin arc of rim light, and a soft shadow
// on the ground under them. All static paint: gradients, not filters, so
// nothing that moves carries a live SVG filter.

/**
 * A colour part way to another: `t` 0 is `a`, 1 is `b`.
 * @param {string} a  #rrggbb
 * @param {string} b  #rrggbb
 * @param {number} t
 * @returns {string}
 */
export function mixColour(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** The token paints, by side: [light, middle, deep]. */
export const TOKEN_TONES = Object.freeze({
  us: [mixColour(ANIMAL, CREAM, 0.36), ANIMAL, mixColour(ANIMAL, ANIMAL_DARK, 0.9)],
  bots: [mixColour(RUST, CREAM, 0.34), RUST, mixColour(RUST, RUST_DARK, 0.8)],
});

/**
 * The fill of a band's disc or body token: the gradient for its side.
 * @param {'us'|'bots'} side
 * @returns {string}
 */
export function tokenFill(side) {
  return `url(#ug-token-${side})`;
}

/** The soft shadow under a token. */
const TOKEN_SHADE = 'url(#ug-token-shade)';

/**
 * @param {Element} defs
 * @returns {void}
 */
function defineTokenPaint(defs) {
  for (const side of /** @type {const} */ (['us', 'bots'])) {
    const [light, middle, deep] = TOKEN_TONES[side];
    const grad = el('radialGradient', { id: `ug-token-${side}`, cx: 0.5, cy: 0.5, r: 0.5, fx: 0.36, fy: 0.3 }, defs);
    el('stop', { offset: 0, 'stop-color': light }, grad);
    el('stop', { offset: 0.55, 'stop-color': middle }, grad);
    el('stop', { offset: 1, 'stop-color': deep }, grad);
  }
  const shade = el('radialGradient', { id: 'ug-token-shade', cx: 0.5, cy: 0.5, r: 0.5 }, defs);
  el('stop', { offset: 0, 'stop-color': INK, 'stop-opacity': 0.6 }, shade);
  el('stop', { offset: 0.55, 'stop-color': INK, 'stop-opacity': 0.38 }, shade);
  el('stop', { offset: 1, 'stop-color': INK, 'stop-opacity': 0 }, shade);
}

/**
 * The soft shadow a token of radius `r` casts on the ground, a little
 * below and to the right of it, away from the light.
 * @param {Element} parent
 * @param {number} x  the token's centre
 * @param {number} y
 * @param {number} r
 * @returns {void}
 */
function tokenShadow(parent, x, y, r) {
  el('ellipse', {
    cx: r1(x + r * 0.18), cy: r1(y + r * 0.5), rx: r1(r * 1.22), ry: r1(r * 0.98), fill: TOKEN_SHADE, 'data-shade': 'true',
  }, parent);
}

/**
 * The rim light: a thin bright arc just inside the top-left of a token's
 * edge, where the light catches it.
 * @param {Element} parent
 * @param {number} x
 * @param {number} y
 * @param {number} r  the arc's radius
 * @param {number} width
 * @returns {void}
 */
function rimLight(parent, x, y, r, width) {
  const at = (/** @type {number} */ deg) => {
    const a = (deg * Math.PI) / 180;
    return `${r1(x + Math.cos(a) * r)} ${r1(y + Math.sin(a) * r)}`;
  };
  el('path', {
    d: `M${at(168)} A${r} ${r} 0 0 1 ${at(282)}`,
    fill: 'none', stroke: CREAM, 'stroke-width': width, 'stroke-linecap': 'round', opacity: 0.42, 'data-rim': 'true',
  }, parent);
}

// --- small drawings ---

/**
 * A grass tuft: three blades.
 * @param {Element} parent
 * @param {number} px
 * @param {number} py
 * @param {string} [col]
 * @returns {void}
 */
function tuft(parent, px, py, col = GRASS_SHADE) {
  el('path', {
    d: `M${px} ${py} l-2.2 -5.5 M${px} ${py} l0 -6.5 M${px} ${py} l2.2 -5.5`,
    stroke: col, 'stroke-width': 1.3, fill: 'none', 'stroke-linecap': 'round',
  }, parent);
}

/**
 * @param {Element} parent
 * @param {number} px
 * @param {number} py
 * @param {string} col
 * @returns {void}
 */
function flower(parent, px, py, col) {
  for (let k = 0; k < 5; k += 1) {
    const a = k * 1.256;
    el('circle', { cx: r1(px + Math.cos(a) * 2.3), cy: r1(py + Math.sin(a) * 2.3), r: 1.7, fill: col }, parent);
  }
  el('circle', { cx: px, cy: py, r: 1.1, fill: '#f8e9a8' }, parent);
}

/**
 * @param {Element} parent
 * @param {number} px
 * @param {number} py
 * @returns {void}
 */
function mushroom(parent, px, py) {
  el('ellipse', { cx: px + 1.5, cy: py + 6.2, rx: 4, ry: 1.3, fill: INK, opacity: 0.25 }, parent);
  el('rect', { x: px - 1.2, y: py, width: 2.4, height: 6, rx: 1, fill: '#efe5cf' }, parent);
  el('path', { d: `M${px - 5} ${py + 1} a5 4.2 0 0 1 10 0 z`, fill: CAP }, parent);
  el('circle', { cx: px - 1.6, cy: py - 1.4, r: 0.9, fill: CREAM }, parent);
  el('circle', { cx: px + 1.8, cy: py - 0.6, r: 0.7, fill: CREAM }, parent);
}

/**
 * One tree or bush, with its shadow, in a <g data-tree="kind">.
 * @param {Element} parent
 * @param {Tree} t
 * @param {number} ox
 * @param {number} oy
 * @returns {void}
 */
function drawTree(parent, t, ox, oy) {
  const g = el('g', { 'data-tree': t.kind }, parent);
  const X = r1(ox + t.x);
  const Y = r1(oy + t.y);
  const s = t.size;
  const wide = t.kind === 'pine' || t.kind === 'birch' ? 6.5 : 7.5;
  el('ellipse', {
    cx: r1(X + 2.5 * s), cy: r1(Y + 0.6), rx: r1(wide * s), ry: r1(2.4 * s),
    fill: INK, opacity: 0.3, 'data-shadow': 'true',
  }, g);
  if (t.kind === 'pine') {
    const col = PINE_TONES[t.tone];
    el('rect', { x: r1(X - 1.1 * s), y: r1(Y - 4 * s), width: r1(2.2 * s), height: r1(4 * s), fill: BARK }, g);
    el('path', {
      d: `M${X} ${r1(Y - 17 * s)} L${r1(X + 7 * s)} ${r1(Y - 3.5 * s)} L${r1(X - 7 * s)} ${r1(Y - 3.5 * s)} Z`
        + ` M${X} ${r1(Y - 23 * s)} L${r1(X + 5.2 * s)} ${r1(Y - 11 * s)} L${r1(X - 5.2 * s)} ${r1(Y - 11 * s)} Z`,
      fill: col,
    }, g);
    el('path', {
      d: `M${X} ${r1(Y - 22 * s)} L${r1(X - 4.6 * s)} ${r1(Y - 11.5 * s)} L${X} ${r1(Y - 12.5 * s)} Z`
        + ` M${X} ${r1(Y - 16 * s)} L${r1(X - 6.2 * s)} ${r1(Y - 4 * s)} L${X} ${r1(Y - 5 * s)} Z`,
      fill: FOREST_LIGHT, opacity: 0.45,
    }, g);
  } else if (t.kind === 'birch') {
    el('rect', { x: r1(X - 1.2 * s), y: r1(Y - 15 * s), width: r1(2.4 * s), height: r1(15 * s), rx: 1, fill: BIRCH_BARK }, g);
    el('path', {
      d: `M${r1(X - 1.2 * s)} ${r1(Y - 5 * s)} h${r1(1.6 * s)} M${r1(X - 0.4 * s)} ${r1(Y - 9 * s)} h${r1(1.6 * s)}`,
      stroke: INK, 'stroke-width': 0.9, opacity: 0.7,
    }, g);
    el('circle', { cx: X, cy: r1(Y - 17 * s), r: r1(6.4 * s), fill: BIRCH_TONES[t.tone] }, g);
    el('circle', { cx: r1(X + 3.6 * s), cy: r1(Y - 13.5 * s), r: r1(4 * s), fill: BIRCH_TONES[(t.tone + 1) % 3] }, g);
    el('circle', { cx: r1(X - 2.2 * s), cy: r1(Y - 19.5 * s), r: r1(2.4 * s), fill: GRASS_LIGHT, opacity: 0.6 }, g);
  } else {
    const shrub = t.kind === 'shrub';
    const k = shrub ? 0.85 : 1;
    const col = BUSH_TONES[t.tone];
    el('circle', { cx: r1(X - 3.4 * s * k), cy: r1(Y - 3.4 * s * k), r: r1(4.2 * s * k), fill: col }, g);
    el('circle', { cx: r1(X + 3.4 * s * k), cy: r1(Y - 3.4 * s * k), r: r1(4.2 * s * k), fill: col }, g);
    el('circle', { cx: X, cy: r1(Y - 6.4 * s * k), r: r1(4.8 * s * k), fill: col }, g);
    el('circle', { cx: r1(X - 1.6 * s), cy: r1(Y - 8 * s * k), r: r1(1.8 * s), fill: FOREST_LIGHT, opacity: 0.6 }, g);
    if (shrub) {
      const bloom = BLOSSOM[t.tone];
      for (const [dx, dy] of [[-3.6, -4.6], [2.6, -7.6], [3.8, -3], [-0.6, -2.4]]) {
        el('circle', { cx: r1(X + dx * s), cy: r1(Y + dy * s), r: r1(1.4 * s), fill: bloom }, g);
      }
    }
  }
}

/**
 * @param {Element} f
 * @param {number} ox
 * @param {number} oy
 * @param {number} x
 * @param {number} y
 * @param {number} now
 * @returns {void}
 */
function drawWater(f, ox, oy, x, y, now) {
  for (let i = 0; i < 2; i += 1) {
    const px = ox + off(x, y, 10 + i, 5, 14);
    const py = oy + 13 + i * 13 + off(x, y, 12 + i, -2, 4);
    el('path', {
      d: `M${px} ${r1(py)} q3.5 -2.6 7 0 t7 0`,
      stroke: WATER_LIGHT, 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round', opacity: 0.6,
      class: 'ug-ripple', style: phase(now, RIPPLE_MS, Math.round(hash01(x, y, 14 + i) * RIPPLE_MS)),
    }, f);
  }
}

/**
 * A den: a warm earth mound with a dark doorway on a ring of straw. An
 * intact den glows softly; a damaged one is ash-grey, cracked and
 * smoking, with no glow. A den some bot plan strikes gets a pulsing
 * hazard ring.
 * @param {Element} f
 * @param {number} ox
 * @param {number} oy
 * @param {boolean} damaged
 * @param {boolean} aimed
 * @param {number} now
 * @returns {void}
 */
function drawDen(f, ox, oy, damaged, aimed, now) {
  const mx = ox + 20;
  if (!damaged) {
    for (const [r, o] of [[19, 0.16], [15, 0.2], [11, 0.24]]) {
      el('circle', { cx: mx, cy: oy + 23, r, fill: DEN_GLOW, opacity: o }, f);
    }
  }
  el('ellipse', { cx: mx + 1.5, cy: oy + 32, rx: 15, ry: 4.5, fill: damaged ? DEN_SCORCHED : DEN_GROUND, opacity: 0.95 }, f);
  el('path', {
    d: `M${ox + 7} ${oy + 32} Q${ox + 20} ${oy + 5} ${ox + 33} ${oy + 32} Z`,
    fill: damaged ? DEN_ASH : SOIL_LIGHT, stroke: damaged ? INK : SOIL_DARK, 'stroke-width': 1.4, 'stroke-linejoin': 'round',
  }, f);
  if (!damaged) {
    el('path', { d: `M${ox + 12} ${oy + 22} Q${ox + 17} ${oy + 12} ${ox + 22} ${oy + 11}`, stroke: STUBBLE_LIGHT, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round', opacity: 0.7 }, f);
    tuft(f, ox + 26, oy + 16, GRASS_SHADE);
  }
  el('path', { d: `M${ox + 15} ${oy + 32} V${oy + 26} a5 5 0 0 1 10 0 V${oy + 32} Z`, fill: INK, opacity: 0.88 }, f);
  if (!damaged) el('circle', { cx: mx, cy: oy + 28.5, r: 2, fill: DEN_GLOW, opacity: 0.8 }, f);
  if (damaged) {
    el('path', {
      d: `M${ox + 13} ${oy + 16} l3 4 l-2 3 l3 3 M${ox + 26} ${oy + 14} l-2 4 l3 3 M${ox + 20} ${oy + 10} l1 3`,
      stroke: CRACK, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'data-cracks': 'true',
    }, f);
    el('path', {
      d: `M${ox + 24} ${oy + 9} q-3 -3 0 -5 q3 -2 0 -5`,
      stroke: SMOKE, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round', opacity: 0.75,
      class: 'ug-smoke', style: phase(now, SMOKE_MS, 0), 'data-smoke': 'true',
    }, f);
  }
  if (aimed) {
    el('circle', {
      cx: mx, cy: oy + 22, r: 16.5, fill: 'none', stroke: HAZARD, 'stroke-width': 2.6,
      class: 'ug-pulse', style: phase(now, PULSE_MS, 0), 'data-pulse': 'true',
    }, f);
  }
}

/**
 * The code-drawn feature of one tile, into its <g data-feature>.
 * @param {Element} f
 * @param {Tile} tile
 * @param {GroundKey} ground
 * @param {number} x
 * @param {number} y
 * @param {boolean} aimed
 * @param {number} now
 * @returns {void}
 */
function drawFeature(f, tile, ground, x, y, aimed, now) {
  const ox = x * TILE;
  const oy = y * TILE;
  // Marks that only repeat a painted texture are left out (look.js).
  const marks = tileMarks(ground, hasTexture(ground));
  switch (tile.kind) {
    case 'open':
      if (tile.variant === 'flowers') {
        if (marks.grass) tuft(f, ox + off(x, y, 0, 6, 28), oy + off(x, y, 1, 16, 20));
        flower(f, ox + off(x, y, 4, 8, 24), oy + off(x, y, 5, 8, 22), FLOWERS[Math.floor(hash01(x, y, 6) * 3)]);
        flower(f, ox + off(x, y, 7, 8, 24), oy + off(x, y, 8, 8, 22), FLOWERS[Math.floor(hash01(x, y, 9) * 3)]);
      } else if (tile.variant === 'mushrooms') {
        if (marks.grass) tuft(f, ox + off(x, y, 0, 6, 10), oy + 34);
        mushroom(f, ox + off(x, y, 1, 9, 10), oy + off(x, y, 2, 20, 8));
        mushroom(f, ox + off(x, y, 3, 22, 9), oy + off(x, y, 4, 14, 12));
      } else {
        if (marks.grass) {
          tuft(f, ox + off(x, y, 0, 6, 28), oy + off(x, y, 1, 14, 22));
          tuft(f, ox + off(x, y, 2, 6, 28), oy + off(x, y, 3, 14, 22), GRASS_LIGHT);
          if (ground !== 'bank') tuft(f, ox + off(x, y, 4, 6, 28), oy + off(x, y, 5, 14, 22));
        }
        if (marks.pebbles) {
          el('ellipse', { cx: ox + off(x, y, 4, 8, 24), cy: oy + off(x, y, 5, 10, 22), rx: 2.6, ry: 1.8, fill: STONE_LIGHT }, f);
          el('ellipse', { cx: ox + off(x, y, 6, 8, 24), cy: oy + off(x, y, 7, 10, 22), rx: 1.8, ry: 1.3, fill: STONE }, f);
        }
      }
      return;
    case 'forest':
      for (const t of forestTrees(x, y)) drawTree(f, t, ox, oy);
      return;
    case 'water':
      drawWater(f, ox, oy, x, y, Math.round(now));
      return;
    case 'stones':
      for (const [sx, sy, rx, ry] of [[14, 22, 7, 5.2], [25, 28, 5.4, 4.2], [16, 31, 4.4, 3.2]]) {
        el('ellipse', { cx: ox + sx + 2, cy: oy + sy + 2.5, rx, ry: ry * 0.7, fill: INK, opacity: 0.3 }, f);
        el('ellipse', { cx: ox + sx, cy: oy + sy, rx, ry, fill: STONE, stroke: STONE_SHADE, 'stroke-width': 1 }, f);
        el('ellipse', { cx: ox + sx - rx * 0.3, cy: oy + sy - ry * 0.35, rx: rx * 0.45, ry: ry * 0.35, fill: STONE_LIGHT }, f);
      }
      return;
    case 'hole':
      el('path', {
        d: `M${ox + 4} ${oy + 8} L${ox + 12} ${oy + 4} L${ox + 21} ${oy + 7} L${ox + 30} ${oy + 4} L${ox + 36} ${oy + 9} L${ox + 35} ${oy + 19} L${ox + 37} ${oy + 28} L${ox + 33} ${oy + 36} L${ox + 23} ${oy + 34} L${ox + 13} ${oy + 37} L${ox + 5} ${oy + 33} L${ox + 3} ${oy + 23} L${ox + 5} ${oy + 15} Z`,
        fill: SOIL_DARK, stroke: SOIL_LIGHT, 'stroke-width': 1.2, 'stroke-linejoin': 'round',
      }, f);
      el('ellipse', { cx: ox + 20, cy: oy + 22, rx: 11, ry: 9, fill: INK, opacity: 0.5 }, f);
      return;
    case 'dam':
      for (let i = 0; i < 4; i += 1) {
        const py = oy + 7 + i * 7;
        el('rect', { x: ox + 2, y: py, width: TILE - 4, height: 5.6, rx: 2.8, fill: PLANK, stroke: BARK, 'stroke-width': 0.9 }, f);
        el('circle', { cx: ox + 4.8, cy: py + 2.8, r: 1.6, fill: STUBBLE_LIGHT, stroke: BARK, 'stroke-width': 0.6 }, f);
      }
      return;
    case 'stubble': {
      if (marks.stalks) {
        let d = '';
        for (let i = 0; i < 7; i += 1) {
          d += `M${ox + off(x, y, i * 2, 5, 30)} ${oy + off(x, y, i * 2 + 1, 10, 26)} l0.8 -3.2 `;
        }
        el('path', { d: d.trim(), stroke: STUBBLE_SHADE, 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round', 'data-stalks': 'true' }, f);
      }
      if (hash01(x, y, 30) < 0.45) {
        const sx = ox + off(x, y, 31, 12, 16);
        const sy = oy + off(x, y, 32, 18, 12);
        el('rect', { x: sx - 4, y: sy, width: 8, height: 4, fill: SOIL }, f);
        el('ellipse', { cx: sx, cy: sy + 4, rx: 4, ry: 1.6, fill: SOIL }, f);
        el('ellipse', { cx: sx, cy: sy, rx: 4, ry: 1.6, fill: STUBBLE_LIGHT, stroke: SOIL, 'stroke-width': 0.8 }, f);
      }
      return;
    }
    case 'paving': {
      if (!marks.slabs) return;
      let dark = '';
      let light = '';
      for (let i = 1; i < 3; i += 1) {
        const p = Math.round(i * 13.3);
        dark += `M${ox} ${oy + p} H${ox + TILE} M${ox + p} ${oy} V${oy + TILE} `;
        light += `M${ox} ${oy + p + 0.9} H${ox + TILE} M${ox + p + 0.9} ${oy} V${oy + TILE} `;
      }
      el('path', { d: light.trim(), stroke: PAVING_LIGHT, 'stroke-width': 0.7, fill: 'none' }, f);
      el('path', { d: dark.trim(), stroke: PAVING_SHADE, 'stroke-width': 0.9, fill: 'none', 'data-slabs': 'true' }, f);
      return;
    }
    case 'habitat':
    case 'habitatDamaged':
      drawDen(f, ox, oy, tile.kind === 'habitatDamaged', aimed, now);
      return;
    default:
      return;
  }
}

/**
 * The name a tile's feature group carries: its terrain kind, with the
 * open variants told apart.
 * @param {Tile} tile
 * @param {GroundKey} ground
 * @returns {string}
 */
function featureName(tile, ground) {
  if (tile.kind === 'open') return ground === 'bank' ? 'bank' : tile.variant ?? 'grass';
  return tile.kind;
}

/**
 * One tile: its ground, the soft edges where it meets another ground,
 * and its feature: its painted piece (js/ui/board-pieces.js), or the
 * code drawing when its picture is not listed.
 * @param {Element} parent
 * @param {Tile} tile
 * @param {GroundKey[][]} grounds
 * @param {number} x
 * @param {number} y
 * @param {boolean} aimed
 * @param {number} now
 * @param {import('./board-pieces.js').PieceScene} scene
 * @returns {void}
 */
function drawTile(parent, tile, grounds, x, y, aimed, now, scene) {
  const g = el('g', { 'data-tile': `${x},${y}`, 'data-x': x, 'data-y': y }, parent);
  const ox = x * TILE;
  const oy = y * TILE;
  const ground = grounds[y][x];
  // A hair wider than the tile so neighbours overlap and no seam shows.
  el('rect', {
    x: ox, y: oy, width: TILE + 0.5, height: TILE + 0.5, fill: groundFill(ground), 'data-ground': ground,
  }, g);
  for (const side of softEdges(grounds, x, y)) {
    const horizontal = side === 'n' || side === 's';
    el('rect', {
      x: side === 'e' ? ox + TILE - EDGE : ox,
      y: side === 's' ? oy + TILE - EDGE : oy,
      width: horizontal ? TILE : EDGE,
      height: horizontal ? EDGE : TILE,
      fill: `url(#ug-edge-${side})`,
      'data-edge': side,
    }, g);
  }
  const f = el('g', { 'data-feature': featureName(tile, ground) }, g);
  if (!drawTilePiece(f, tile, x, y, scene)) drawFeature(f, tile, ground, x, y, aimed, now);
}

/**
 * The forged permit: a rolled paper with a red seal, drawn, not an emoji.
 * @param {Element} g
 * @param {number} x  the tile's centre
 * @param {number} y
 * @returns {void}
 */
function drawPermit(g, x, y) {
  const p = el('g', { 'data-objective-kind': 'permit' }, g);
  el('rect', { x: x - 8, y: y - 8, width: 16, height: 15, rx: 1.5, fill: CREAM, stroke: INK, 'stroke-width': 1.3 }, p);
  el('rect', { x: x - 10, y: y - 10, width: 20, height: 4, rx: 2, fill: PLANK_LIGHT, stroke: INK, 'stroke-width': 1.2 }, p);
  el('rect', { x: x - 10, y: y + 5, width: 20, height: 4, rx: 2, fill: PLANK_LIGHT, stroke: INK, 'stroke-width': 1.2 }, p);
  el('path', { d: `M${x - 5} ${y - 3} h10 M${x - 5} ${y} h7`, stroke: INK, 'stroke-width': 1, opacity: 0.55, 'stroke-linecap': 'round' }, p);
  el('circle', { cx: x + 4, cy: y + 2.5, r: 2.6, fill: CAP, stroke: INK, 'stroke-width': 0.8 }, p);
}

/**
 * A survey stake: a wooden peg with a hazard-orange flag.
 * @param {Element} g
 * @param {number} x  the tile's centre
 * @param {number} y
 * @returns {void}
 */
function drawStake(g, x, y) {
  const p = el('g', { 'data-objective-kind': 'stake' }, g);
  el('path', { d: `M${x - 1.6} ${y - 10} h3.2 v16 l-1.6 3 l-1.6 -3 Z`, fill: PLANK, stroke: INK, 'stroke-width': 1.1, 'stroke-linejoin': 'round' }, p);
  el('path', { d: `M${x + 1.6} ${y - 10} l9 2.8 l-9 3.2 Z`, fill: HAZARD, stroke: INK, 'stroke-width': 1.1, 'stroke-linejoin': 'round' }, p);
}

// --- bands ---

/**
 * A band as a chain of tokens: the links (bandLinks), one small token per
 * body cell, and the head: a disc with the unit's white silhouette, the
 * `cells/maxLen` badge and, on an engaged bot, the "!" mark.
 *
 * `turn` is what a band of the player's has left this turn: a bright ring
 * round the head for ready, a hairline one for "can still act", and a
 * dimmed head for done. The rings sit under the selection ring and the
 * dimming under the length badge, so neither is ever hidden.
 * @param {Element} parent
 * @param {Band} band
 * @param {{selected?: boolean, engaged?: boolean, ghost?: boolean, now?: number, turn?: TurnState|null}} [opts]
 * @returns {void}
 */
function drawBand(parent, band, opts = {}) {
  const tokens = bandTokens(band);
  if (tokens.head === null) return;
  const def = BAND_TYPES[band.type];
  const isUs = band.side === 'us';
  const rim = isUs ? ANIMAL_DARK : RUST_DARK;
  const chain = isUs ? ANIMAL_DARK : STEEL;
  // Lit from the top left (defineTokenPaint).
  const paint = tokenFill(isUs ? 'us' : 'bots');
  const now = opts.now ?? 0;
  const turn = opts.ghost ? null : opts.turn ?? null;
  /** @type {Record<string, string>} */
  const attrs = opts.ghost ? { 'data-ghost-band': band.id } : { 'data-band': band.id, 'data-side': band.side };
  if (turn !== null) attrs['data-turn'] = turn;
  const g = el('g', attrs, parent);
  const cells = band.cells;

  if (tokens.links.length > 0) {
    const lg = el('g', { 'data-links': 'true' }, g);
    for (const link of tokens.links) {
      const a = cells[link.to];
      const b = cells[link.from];
      el('line', {
        x1: cx(a[0]), y1: cx(a[1]), x2: cx(b[0]), y2: cx(b[1]),
        stroke: chain, 'stroke-width': 4.5, 'stroke-linecap': 'round', 'data-link': `${link.from}-${link.to}`,
      }, lg);
    }
  }

  // Tail first, so each token sits on top of the one behind it.
  for (const token of [...tokens.body].reverse()) {
    const [x, y] = token.at;
    const t = el('g', { 'data-token': token.index, 'data-cell': `${x},${y}` }, g);
    // The shadow stays on the ground while the token bobs over it.
    if (!opts.ghost) tokenShadow(t, cx(x), cx(y), TOKEN_R);
    const inner = opts.ghost ? t : el('g', { class: 'ug-wobble', style: phase(now, WOBBLE_MS, token.index * 160) }, t);
    el('circle', { cx: cx(x), cy: cx(y), r: TOKEN_R, fill: paint, stroke: isUs ? rim : STEEL, 'stroke-width': 1.8 }, inner);
    rimLight(inner, cx(x), cx(y), TOKEN_R - 2.4, 1.5);
  }

  const [hxTile, hyTile] = tokens.head;
  const hx = cx(hxTile);
  const hy = cx(hyTile);
  const head = el('g', { 'data-token': 0, 'data-head': 'true', 'data-cell': `${hxTile},${hyTile}` }, g);
  if (!opts.ghost) tokenShadow(head, hx, hy, HEAD_R);
  if (band.trapped) {
    el('circle', { cx: hx, cy: hy, r: 19, fill: 'none', stroke: CREAM, 'stroke-width': 1.6, 'stroke-dasharray': '3 3' }, head);
  }
  if (turn === 'ready') {
    const mark = el('g', { 'data-mark': 'ready' }, head);
    el('circle', { cx: hx, cy: hy, r: 18, fill: 'none', stroke: INK, 'stroke-width': 4.2, opacity: 0.8 }, mark);
    el('circle', { cx: hx, cy: hy, r: 18, fill: 'none', stroke: READY, 'stroke-width': 2.4 }, mark);
  } else if (turn === 'canAct') {
    const mark = el('g', { 'data-mark': 'canAct' }, head);
    // A hairline, not dashes: the dashed ring is the trapped band's.
    el('circle', { cx: hx, cy: hy, r: 18, fill: 'none', stroke: INK, 'stroke-width': 2.4, opacity: 0.5 }, mark);
    el('circle', { cx: hx, cy: hy, r: 18, fill: 'none', stroke: READY, 'stroke-width': 1.1 }, mark);
  }
  if (opts.selected) {
    el('circle', { cx: hx, cy: hy, r: 19.2, fill: 'none', stroke: INK, 'stroke-width': 4.4, 'data-selected': 'true' }, head);
    el('circle', { cx: hx, cy: hy, r: 19.2, fill: 'none', stroke: CREAM, 'stroke-width': 2.4 }, head);
  }
  el('circle', {
    cx: hx, cy: hy, r: HEAD_R, fill: paint, stroke: isUs ? rim : STEEL, 'stroke-width': 2.5, 'data-disc': band.side,
  }, head);
  rimLight(head, hx, hy, HEAD_R - 3, 2.2);
  const glyph = def !== undefined ? def.glyph : '?';
  const url = def !== undefined ? silhouettes.url(glyph) : null;
  if (url !== null) {
    el('image', { href: url, x: hx - 11, y: hy - 11, width: 22, height: 22, 'data-glyph': glyph }, head);
  } else {
    // No canvas: the glyph itself, unfiltered.
    const t = el('text', { x: hx, y: hy + 6, 'text-anchor': 'middle', 'font-size': 17, 'data-glyph': glyph }, head);
    t.textContent = glyph;
  }
  if (turn === 'done') {
    // A flat shade over the disc and the glyph: it stays crisp on any ground.
    const mark = el('g', { 'data-mark': 'done' }, head);
    el('circle', { cx: hx, cy: hy, r: HEAD_R + 1.25, fill: INK, opacity: 0.5 }, mark);
  }
  // Kept inside the head's tile, so a head on the board edge is not cut.
  drawLengthBadge(head, tokens.badge, tokens.badge.length > 3 ? hx - 8 : hx - 10, hy + 13);
  if (opts.engaged) drawEngaged(head, hx + 12, hy + 12);
}

/**
 * The length badge: `cells/maxLen` on a dark pill at the bottom left of
 * the head, so a band's health is always on it.
 * @param {Element} parent
 * @param {string} text
 * @param {number} x  the pill's centre
 * @param {number} y
 * @returns {void}
 */
function drawLengthBadge(parent, text, x, y) {
  const w = text.length > 3 ? 23 : 19;
  const g = el('g', { 'data-length': text }, parent);
  el('rect', { x: x - w / 2, y: y - 5.5, width: w, height: 11, rx: 5.5, fill: INK, stroke: CREAM, 'stroke-width': 0.9 }, g);
  const t = el('text', {
    x, y: y + 3.2, 'text-anchor': 'middle', 'font-size': 8.6, 'font-weight': 700,
    'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif', fill: CREAM,
  }, g);
  t.textContent = text;
}

/**
 * The engaged mark: a flat hazard-yellow disc with a "!" at the bottom
 * right of a bot's head. The target badges use the top corners.
 * @param {Element} parent
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
function drawEngaged(parent, x, y) {
  const g = el('g', { transform: `translate(${x} ${y})`, 'data-engaged': 'true' }, parent);
  el('circle', { cx: 0, cy: 0, r: 7, fill: HAZARD, stroke: INK, 'stroke-width': 1.6 }, g);
  el('path', { d: 'M0 -3.8 V0.8 M0 3.3 V3.5', stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none' }, g);
}

// --- badges, targets, highlights ---

/**
 * One outcome badge: a flat disc with a drawn mark, centred on (x, y).
 * The marks are paths, not glyphs, so they look the same on every phone.
 * @param {Element} parent
 * @param {BadgeIcon} icon
 * @param {number} x
 * @param {number} y
 * @returns {Element}
 */
export function drawBadge(parent, icon, x, y) {
  const g = el('g', { transform: `translate(${x} ${y})`, 'data-badge': icon }, parent);
  const fill = icon === 'own' ? RUST : icon === 'water' ? WATER_DEEP : INK;
  el('circle', { cx: 0, cy: 0, r: BADGE_R, fill, stroke: CREAM, 'stroke-width': 1.2 }, g);
  /** @type {string} */
  let d;
  if (icon === 'wipe') {
    // A cross: the band is wiped out.
    d = 'M-3.2 -3.2 L3.2 3.2 M3.2 -3.2 L-3.2 3.2';
  } else if (icon === 'water') {
    // Two waves: pushed into the water.
    d = 'M-4.8 -1 q1.2 -2.2 2.4 0 t2.4 0 t2.4 0 t2.4 0 M-4.8 2.8 q1.2 -2.2 2.4 0 t2.4 0 t2.4 0 t2.4 0';
  } else if (icon === 'hole') {
    // An arrow dropping into a pit: pushed into a hole.
    d = 'M0 -5 V1 M-2.6 -1.4 L0 1.4 L2.6 -1.4 M-4.6 1.6 V4.4 H4.6 V1.6';
  } else if (icon === 'bump') {
    // An arrow stopped by a wall: the push is blocked and both bump.
    d = 'M3.4 -4.6 V4.6 M-5 0 H0.8 M-1.8 -2.6 L0.8 0 L-1.8 2.6';
  } else {
    // An exclamation mark: one of your own bands gets hurt.
    d = 'M0 -4.8 V1.2 M0 3.9 V4.1';
  }
  el('path', {
    d, stroke: CREAM, 'stroke-width': 1.7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, g);
  return g;
}

/**
 * A badge as a small standalone picture, for the key under the board.
 * @param {BadgeIcon} icon
 * @returns {SVGElement}
 */
export function badgeSvg(icon) {
  const size = BADGE_R + 1;
  const svg = el('svg', {
    viewBox: `${-size} ${-size} ${size * 2} ${size * 2}`, width: 18, height: 18, 'aria-hidden': 'true',
  });
  drawBadge(svg, icon, 0, 0);
  return svg;
}

/**
 * The attributes of a flat highlight on a tile, by kind: move tiles are
 * a cream wash, targets a rust wash with a cream frame, deploy tiles a
 * dashed cream frame. Bold and flat, so they read over any ground.
 * @param {Pos} pos
 * @param {'move'|'target'|'deploy'} kind
 * @returns {Record<string, string|number>}
 */
function highlightAttrs(pos, kind) {
  /** @type {Record<string, string|number>} */
  const attrs = {
    x: pos[0] * TILE + 2, y: pos[1] * TILE + 2, width: TILE - 4, height: TILE - 4, rx: 3, 'data-highlight': kind,
  };
  if (kind === 'move') {
    attrs.fill = CREAM;
    attrs['fill-opacity'] = 0.34;
    attrs.stroke = CREAM;
    attrs['stroke-width'] = 1.6;
  } else if (kind === 'target') {
    attrs.fill = RUST;
    attrs['fill-opacity'] = 0.5;
    attrs.stroke = CREAM;
    attrs['stroke-width'] = 2;
  } else {
    attrs.fill = CREAM;
    attrs['fill-opacity'] = 0.12;
    attrs.stroke = CREAM;
    attrs['stroke-width'] = 2;
    attrs['stroke-dasharray'] = '4 3';
  }
  return attrs;
}

/**
 * Action targets, in the target highlight. When a target strikes a line
 * of tiles (the bees' sting), the rest of the line gets a lighter rust
 * wash, joined to the aimed tile by a cream rule, so the whole line of
 * three reads as one strike.
 * @param {Element} parent
 * @param {BoardTarget[]} targets
 * @returns {void}
 */
function drawTargets(parent, targets) {
  for (const target of targets) {
    const rest = (target.strikes ?? []).filter((s) => s.at[0] !== target.at[0] || s.at[1] !== target.at[1]);
    for (const strike of rest) {
      const [x, y] = strike.at;
      el('rect', {
        x: x * TILE + 3, y: y * TILE + 3, width: TILE - 6, height: TILE - 6, rx: 3,
        fill: RUST, 'fill-opacity': 0.3, stroke: CREAM, 'stroke-width': 1, 'stroke-opacity': 0.7,
        'data-highlight': 'line', 'data-line': `${x},${y}`,
      }, parent);
    }
    if (rest.length > 0) {
      const last = rest[rest.length - 1].at;
      el('path', {
        d: `M${cx(target.at[0])} ${cx(target.at[1])} L${cx(last[0])} ${cx(last[1])}`,
        stroke: CREAM, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.55, fill: 'none',
        'data-line-rule': `${target.at[0]},${target.at[1]}`,
      }, parent);
    }
    el('rect', { ...highlightAttrs(target.at, 'target'), 'data-target': `${target.at[0]},${target.at[1]}` }, parent);
  }
}

/**
 * What the action will do, as badges in the top corners of the tile of
 * the band it happens to: the outcome on the right, the "hurts your own"
 * warning on the left. Drawn above the bands so a stamp never hides them.
 * @param {Element} parent
 * @param {BoardTarget[]} targets
 * @returns {void}
 */
function drawTargetBadges(parent, targets) {
  const inset = BADGE_R + 1;
  for (const target of targets) {
    const strikes = target.strikes ?? [{ at: target.at, badges: target.badges }];
    for (const strike of strikes) {
      const ox = strike.at[0] * TILE;
      const oy = strike.at[1] * TILE;
      for (const icon of strike.badges) {
        const badge = drawBadge(parent, icon, icon === 'own' ? ox + inset : ox + TILE - inset, oy + inset);
        badge.setAttribute('data-at', `${strike.at[0]},${strike.at[1]}`);
      }
    }
  }
}

/**
 * @param {Pos[]} a
 * @param {Pos[]} b
 * @returns {boolean}
 */
function sameCells(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

// --- plans, kept between renders ---

/** The kept plan layer of each board, and what is drawn on it. */
/** @type {WeakMap<SVGSVGElement, {layer: SVGElement, drawn: Map<string, {key: string, node: SVGElement}>}>} */
const planLayers = new WeakMap();

/**
 * @param {Pos[]} line
 * @returns {string}
 */
function pathOf(line) {
  return line.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(p[0])} ${cx(p[1])}`).join(' ');
}

/**
 * One bot's plan: a bold line along its walk and on to the strike tile,
 * and a flat frame on the strike tile. Ink under hazard yellow, so it
 * reads on any ground.
 * @param {SVGElement} parent
 * @param {import('./plans.js').PlanDrawing} plan
 * @returns {SVGElement}
 */
function drawPlan(parent, plan) {
  const g = el('g', { 'data-plan': plan.id }, parent);
  /** @type {Pos[]} */
  const line = plan.strike !== null ? [...plan.line, plan.strike] : plan.line;
  if (line.length > 1) {
    const d = pathOf(line);
    const round = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    el('path', { d, stroke: INK, 'stroke-width': 7, opacity: 0.85, ...round }, g);
    el('path', { d, stroke: HAZARD, 'stroke-width': 3.5, ...round }, g);
  }
  if (plan.line.length > 1) {
    const end = plan.strikeFrom;
    el('circle', { cx: cx(end[0]), cy: cx(end[1]), r: 4.5, fill: HAZARD, stroke: INK, 'stroke-width': 1.6 }, g);
  }
  if (plan.strike !== null) {
    const [x, y] = plan.strike;
    el('rect', {
      x: x * TILE + 3, y: y * TILE + 3, width: TILE - 6, height: TILE - 6, rx: 3,
      fill: HAZARD, 'fill-opacity': 0.35, stroke: INK, 'stroke-width': 3,
      'data-strike': `${x},${y}`,
    }, g);
    el('circle', { cx: cx(x), cy: cx(y), r: 4, fill: INK }, g);
  }
  return g;
}

/**
 * Draws every bot's plan into the board's kept plan layer. A plan equal
 * to the one already drawn is left as it is: the engine emits a plan
 * event for every bot after every re-plan, changed or not.
 * @param {SVGSVGElement} svg
 * @param {BattleState} state
 * @returns {void}
 */
function drawPlans(svg, state) {
  let kept = planLayers.get(svg);
  if (kept === undefined) {
    kept = { layer: el('g', { 'data-layer': 'plans' }), drawn: new Map() };
    planLayers.set(svg, kept);
  }
  svg.appendChild(kept.layer);
  const plans = planDrawings(state);
  /** @type {Map<string, string>} */
  const keys = new Map([...kept.drawn].map(([id, d]) => [id, d.key]));
  const diff = diffPlans(keys, plans);
  for (const id of diff.drop) {
    kept.drawn.get(id)?.node.remove();
    kept.drawn.delete(id);
  }
  for (const plan of plans) {
    if (!diff.draw.includes(plan.id)) continue;
    kept.drawn.set(plan.id, { key: plan.key, node: drawPlan(kept.layer, plan) });
  }
}

/** @returns {number} */
function clock() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

/**
 * @param {SVGSVGElement} svg
 * @param {BattleState} state
 * @param {BoardView} view
 * @returns {void}
 */
export function renderBoard(svg, state, view) {
  const now = Math.round(clock());
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${BOARD_PX} ${BOARD_PX}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Battle board, turn ${state.turn}`);

  svg.appendChild(boardDefs(svg));
  el('rect', { x: 0, y: 0, width: BOARD_PX, height: BOARD_PX, fill: FRAME }, svg);

  // Bot plans and the dens they aim at, from the preview's state while
  // one is shown.
  const shown = view.ghost !== null ? view.ghost : state;
  const aimed = new Set(aimedHabitats(shown));

  // Tiles: ground, soft edges, feature, row by row from the top, so a
  // nearer row's tall pieces overlap the farther row. Then the pulse on
  // aimed dens drawn as pictures, over every piece.
  const grounds = groundGrid(state);
  const scene = pieceScene(state);
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      drawTile(svg, state.tiles[y][x], grounds, x, y, aimed.has(`${x},${y}`), now, scene);
    }
  }
  drawDenMarks(svg, state, aimed, scene, now);

  // The faint grid, only while choosing a move or a target.
  if (showGrid(view)) {
    let grid = '';
    for (let i = 1; i < COLS; i += 1) {
      grid += `M${i * TILE} 0 V${BOARD_PX} M0 ${i * TILE} H${BOARD_PX} `;
    }
    el('path', { d: grid.trim(), stroke: CREAM, 'stroke-width': 0.7, opacity: 0.22, fill: 'none', 'data-layer': 'grid' }, svg);
  }

  // Objectives.
  for (const objective of state.objectives) {
    const [x, y] = objective.at;
    const g = el('g', { 'data-objective': `${x},${y}`, opacity: objective.captured ? 0.4 : 1 }, svg);
    if (drawObjectivePiece(g, objective)) continue;
    el('ellipse', { cx: cx(x) + 1, cy: cx(y) + 9, rx: 9, ry: 3, fill: INK, opacity: 0.3 }, g);
    if (objective.kind === 'permit') drawPermit(g, cx(x), cx(y));
    else drawStake(g, cx(x), cx(y));
  }

  // Pickups.
  for (const pickup of state.pickups) {
    const g = el('g', { 'data-pickup': `${pickup[0]},${pickup[1]}` }, svg);
    el('ellipse', { cx: cx(pickup[0]) + 1, cy: cx(pickup[1]) + 6, rx: 6, ry: 2, fill: INK, opacity: 0.3 }, g);
    svgIcon(g, 'seed', cx(pickup[0]), cx(pickup[1]), 16);
  }

  drawPlans(svg, shown);

  // Highlights.
  const kind = view.highlightKind !== null ? view.highlightKind : 'move';
  for (const pos of view.highlights) el('rect', highlightAttrs(pos, kind), svg);
  const targets = view.targets !== undefined ? view.targets : [];
  drawTargets(svg, targets);

  // Bands, with the engaged mark on bots that could strike a band this turn.
  // The player's bands carry what they have left this turn.
  const engaged = new Set(engagedBotIds(state));
  const turns = view.marks === false ? new Map() : turnStates(state);
  for (const band of state.bands) {
    drawBand(svg, band, {
      selected: view.selected !== null && band.id === view.selected,
      engaged: engaged.has(band.id),
      turn: turns.get(band.id) ?? null,
      now,
    });
  }

  // Ghost bands whose cells changed, at 40% opacity on top.
  if (view.ghost !== null) {
    const ghost = view.ghost;
    const g = el('g', { opacity: 0.4, 'data-layer': 'ghost' }, svg);
    for (const band of ghost.bands) {
      const current = state.bands.find((b) => b.id === band.id);
      if (current !== undefined && sameCells(current.cells, band.cells)) continue;
      drawBand(g, band, { ghost: true });
    }
  }

  drawTargetBadges(svg, targets);
}

/**
 * Lifts each named band's group above the other bands (and nothing else),
 * so a band that walks through others, as bees do, is drawn over them for
 * its walk. The next renderBoard puts everything back in order.
 * @param {Element} svg
 * @param {string[]} bandIds
 * @returns {void}
 */
export function raiseBands(svg, bandIds) {
  for (const id of bandIds) {
    const bands = Array.from(svg.children).filter((n) => n.getAttribute('data-band') !== null);
    const band = bands.find((n) => n.getAttribute('data-band') === id);
    const last = bands[bands.length - 1];
    if (band === undefined || band === last) continue;
    svg.insertBefore(band, last.nextSibling);
  }
}

/**
 * The on-screen size of one tile, in CSS pixels (0 before layout).
 * @param {SVGSVGElement} svg
 * @returns {number}
 */
export function tileSizePx(svg) {
  return svg.getBoundingClientRect().width * (TILE / BOARD_PX);
}

/**
 * @param {SVGSVGElement} svg
 * @param {PointerEvent} evt
 * @returns {Pos|null}
 */
export function tileFromEvent(svg, evt) {
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const px = (evt.clientX - rect.left) * (BOARD_PX / rect.width);
  const py = (evt.clientY - rect.top) * (BOARD_PX / rect.height);
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= COLS || y >= COLS) return null;
  return [x, y];
}
