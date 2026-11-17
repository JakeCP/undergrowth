// The ground under each tile (look-and-motion spec, "Look" and Builder's
// call 6). Each terrain kind fills its tile with an SVG <pattern>:
//
// - a painted WebP texture, when its file is listed as present in
//   js/ui/texture-list.js (written by scripts/textures.mjs), or
// - until then, a fallback made in code: a flat colour with a subtle
//   noise of specks.
//
// Patterns are laid out in board units and span more than one tile, so a
// tile shows a different part of the pattern from its neighbours and
// same-terrain tiles join without a seam. Each ground starts its repeat at
// a different origin, so the repeats of different grounds don't line up.
//
// The pure half (`groundKey`, `fallbackPattern`, `groundPattern`) returns
// plain data; `definePattern` and `defineGroundPatterns` turn it into SVG
// with the helpers in js/ui/svg.js.

import { el } from './svg.js';
import { TEXTURES_PRESENT } from './texture-list.js';

// --- palette: the animals' world ---

/** The deep forest-green frame around the board (replaces the cream page). */
export const FRAME = '#16301f';
export const GRASS = '#7cab4e';
export const GRASS_LIGHT = '#a3c96b';
export const GRASS_SHADE = '#5d8a3a';
export const MEADOW = '#96b955';
export const MEADOW_LIGHT = '#e3d98a';
export const FOREST_FLOOR = '#4c8440';
export const FOREST_LIGHT = '#6fa252';
export const FOREST_SHADE = '#2c5a30';
export const SOIL = '#6e4b2f';
export const SOIL_LIGHT = '#8a6442';
export const SOIL_DARK = '#473020';
export const STUBBLE = '#c2a468';
export const STUBBLE_LIGHT = '#d9c088';
export const STUBBLE_SHADE = '#9c7f4a';
export const BANK = '#a08d5c';
export const BANK_LIGHT = '#c0ad7c';
export const BANK_SHADE = '#7b6a42';
export const WATER = '#3d8fb5';
export const WATER_LIGHT = '#74bbd8';
export const WATER_DEEP = '#2a6c93';
export const STONE = '#9b9488';
export const STONE_LIGHT = '#b9b3a7';
export const STONE_SHADE = '#6f6a60';
/** The ground of an intact habitat, and the warm glow over it. */
export const DEN_GROUND = '#b3a857';
export const DEN_GLOW = '#f3c766';
/** The ground of a damaged habitat. */
export const DEN_SCORCHED = '#7d6a4e';
export const DEN_ASH = '#4f4338';
/** The animal stamps' disc and its rim. */
export const ANIMAL = '#3f7d3a';
export const ANIMAL_DARK = '#27501f';

// --- palette: the bots ---

export const RUST = '#b4532a';
export const RUST_DARK = '#6e2d12';
export const STEEL = '#5f6b76';
export const HAZARD = '#f2c12e';
export const PAVING = '#868e96';
export const PAVING_LIGHT = '#a3abb3';
export const PAVING_SHADE = '#636b74';

// --- palette: lines and lettering ---

export const INK = '#1d2618';
export const CREAM = '#f4efe6';

export const PALETTE = Object.freeze({
  FRAME,
  GRASS, GRASS_LIGHT, GRASS_SHADE,
  MEADOW, MEADOW_LIGHT,
  FOREST_FLOOR, FOREST_LIGHT, FOREST_SHADE,
  SOIL, SOIL_LIGHT, SOIL_DARK,
  STUBBLE, STUBBLE_LIGHT, STUBBLE_SHADE,
  BANK, BANK_LIGHT, BANK_SHADE,
  WATER, WATER_LIGHT, WATER_DEEP,
  STONE, STONE_LIGHT, STONE_SHADE,
  DEN_GROUND, DEN_GLOW, DEN_SCORCHED, DEN_ASH,
  ANIMAL, ANIMAL_DARK,
  RUST, RUST_DARK, STEEL, HAZARD,
  PAVING, PAVING_LIGHT, PAVING_SHADE,
  INK, CREAM,
});

// --- grounds ---

/** @typedef {'grass'|'soil'|'water'|'stubble'|'paving'|'stone'|'meadow'|'bank'} TextureName */

/**
 * A ground is what a tile is filled with. Most terrain kinds are their own
 * ground; 'meadow' and 'bank' are open ground with flowers and open ground
 * beside water, and a dam shows the water or hole under it.
 * @typedef {'open'|'meadow'|'bank'|'forest'|'stubble'|'paving'|'water'|'hole'|'stones'|'habitat'|'habitatDamaged'} GroundKey
 */

/** @typedef {{colour: string, opacity: number}} Tint */

/**
 * @typedef {object} GroundDef
 * @property {string} colour the flat fallback colour
 * @property {string} light the lighter fallback speck
 * @property {string} dark the darker fallback speck
 * @property {readonly TextureName[]} textures the textures to use, best
 *   first: the first one present wins
 * @property {Tint|null} tint a wash laid over the texture, to tell apart
 *   grounds that share one
 */

/** @typedef {{x: number, y: number, r: number, colour: string, opacity: number}} Speck */

/**
 * A pattern as data. `x`, `y` and `size` are in board units; `image` is
 * the texture file's URL, or null for the code-made fallback.
 * @typedef {{id: string, x: number, y: number, size: number, colour: string, image: string|null, tint: Tint|null, specks: Speck[]}} PatternSpec
 */

/** Textures the look needs. Until one exists its grounds use the fallback. */
/** @type {readonly TextureName[]} */
export const REQUIRED_TEXTURES = Object.freeze(['grass', 'soil', 'water', 'stubble', 'paving', 'stone']);

/** Textures that are nice to have. Without one, a required texture stands in. */
/** @type {readonly TextureName[]} */
export const OPTIONAL_TEXTURES = Object.freeze(['meadow', 'bank']);

/** @type {readonly GroundKey[]} */
export const GROUND_KEYS = Object.freeze([
  'open', 'meadow', 'bank', 'forest', 'stubble', 'paving', 'water', 'hole', 'stones',
  'habitat', 'habitatDamaged',
]);

/** @type {Readonly<Record<GroundKey, GroundDef>>} */
export const GROUND = Object.freeze({
  open: { colour: GRASS, light: GRASS_LIGHT, dark: GRASS_SHADE, textures: ['grass'], tint: null },
  meadow: { colour: MEADOW, light: MEADOW_LIGHT, dark: GRASS_SHADE, textures: ['meadow', 'grass'], tint: null },
  bank: { colour: BANK, light: BANK_LIGHT, dark: BANK_SHADE, textures: ['bank', 'grass'], tint: null },
  forest: {
    colour: FOREST_FLOOR, light: FOREST_LIGHT, dark: FOREST_SHADE,
    textures: ['grass'], tint: { colour: FOREST_SHADE, opacity: 0.35 },
  },
  stubble: { colour: STUBBLE, light: STUBBLE_LIGHT, dark: STUBBLE_SHADE, textures: ['stubble'], tint: null },
  paving: { colour: PAVING, light: PAVING_LIGHT, dark: PAVING_SHADE, textures: ['paving'], tint: null },
  water: { colour: WATER, light: WATER_LIGHT, dark: WATER_DEEP, textures: ['water'], tint: null },
  hole: { colour: SOIL, light: SOIL_LIGHT, dark: SOIL_DARK, textures: ['soil'], tint: null },
  stones: { colour: STONE, light: STONE_LIGHT, dark: STONE_SHADE, textures: ['stone'], tint: null },
  habitat: {
    colour: DEN_GROUND, light: DEN_GLOW, dark: GRASS_SHADE,
    textures: ['meadow', 'grass'], tint: { colour: DEN_GLOW, opacity: 0.25 },
  },
  habitatDamaged: {
    colour: DEN_SCORCHED, light: STUBBLE, dark: DEN_ASH,
    textures: ['meadow', 'grass'], tint: { colour: DEN_ASH, opacity: 0.4 },
  },
});

/** Tiles are 40 board units wide (TILE in js/ui/board.js). */
/** The fallback noise repeats every two tiles. */
export const FALLBACK_SPAN = 80;

/** A texture is stretched over three tiles, then repeats. */
export const TEXTURE_SPAN = 120;

const SPECKS = 40;

/**
 * The ground a tile is drawn on. `nearWater` is for the view to say that
 * an open tile has water next to it.
 * @param {{kind: string, variant?: string|null, under?: string|null}} tile
 * @param {boolean} [nearWater]
 * @returns {GroundKey}
 */
export function groundKey(tile, nearWater = false) {
  switch (tile.kind) {
    case 'open':
      if (nearWater) return 'bank';
      return tile.variant === 'flowers' ? 'meadow' : 'open';
    case 'dam':
      return tile.under === 'hole' ? 'hole' : 'water';
    case 'forest':
    case 'stubble':
    case 'paving':
    case 'water':
    case 'hole':
    case 'stones':
    case 'habitat':
    case 'habitatDamaged':
      return tile.kind;
    default:
      return 'open';
  }
}

/**
 * @param {GroundKey} key
 * @returns {string}
 */
export function patternId(key) {
  return `ug-ground-${key}`;
}

/**
 * The `fill` value for a tile on this ground.
 * @param {GroundKey} key
 * @returns {string}
 */
export function groundFill(key) {
  return `url(#${patternId(key)})`;
}

/**
 * Where a texture is served from, relative to index.html.
 * @param {string} name
 * @returns {string}
 */
export function textureUrl(name) {
  return `assets/textures/${name}.webp`;
}

/**
 * Deterministic hash of two small integers, in [0, 1).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function hash01(a, b) {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {number} v
 * @param {number} places
 * @returns {number}
 */
function round(v, places) {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/**
 * Where this ground's pattern starts its repeat.
 * @param {GroundKey} key
 * @param {number} size
 * @returns {{x: number, y: number}}
 */
function origin(key, size) {
  const index = GROUND_KEYS.indexOf(key);
  return { x: (index * 17) % size, y: (index * 29) % size };
}

/**
 * The code-made ground: a flat colour plus a subtle noise of lighter and
 * darker specks, the same every time. Every speck lies wholly inside the
 * pattern square, so nothing is cut where it repeats.
 * @param {GroundKey} key
 * @returns {PatternSpec}
 */
export function fallbackPattern(key) {
  const def = GROUND[key];
  const size = FALLBACK_SPAN;
  const seed = GROUND_KEYS.indexOf(key);
  /** @type {Speck[]} */
  const specks = [];
  for (let i = 0; i < SPECKS; i += 1) {
    const r = round(0.5 + hash01(seed, i * 5) * 1, 1);
    const room = size - 2 * r - 1;
    specks.push({
      x: round(r + 0.5 + hash01(seed, i * 5 + 1) * room, 1),
      y: round(r + 0.5 + hash01(seed, i * 5 + 2) * room, 1),
      r,
      colour: hash01(seed, i * 5 + 3) < 0.5 ? def.light : def.dark,
      opacity: round(0.16 + hash01(seed, i * 5 + 4) * 0.2, 2),
    });
  }
  return { id: patternId(key), ...origin(key, size), size, colour: def.colour, image: null, tint: null, specks };
}

/**
 * The pattern for a ground: its texture when one of its texture files is
 * listed as present, and the code-made fallback when none is. Both have
 * the same id, so the board fills a tile the same way either way.
 * @param {GroundKey} key
 * @param {readonly string[]} [present] the texture names that exist as
 *   files; by default the generated list in js/ui/texture-list.js
 * @returns {PatternSpec}
 */
export function groundPattern(key, present = TEXTURES_PRESENT) {
  const def = GROUND[key];
  const name = def.textures.find((t) => present.includes(t));
  if (name === undefined) return fallbackPattern(key);
  const size = TEXTURE_SPAN;
  return {
    id: patternId(key),
    ...origin(key, size),
    size,
    colour: def.colour,
    image: textureUrl(name),
    tint: def.tint === null ? null : { ...def.tint },
    specks: [],
  };
}

/**
 * Whether a ground is filled with a painted texture (one of its texture
 * files is present), not the code-made fallback.
 * @param {GroundKey} key
 * @param {readonly string[]} [present] as for `groundPattern`
 * @returns {boolean}
 */
export function hasTexture(key, present = TEXTURES_PRESENT) {
  return GROUND[key].textures.some((t) => present.includes(t));
}

/**
 * Adds one <pattern> to `defs`: the flat colour, then the texture image
 * and its tint if there are any, then the specks.
 * @param {Element} defs
 * @param {PatternSpec} spec
 * @returns {SVGElement}
 */
export function definePattern(defs, spec) {
  const { size } = spec;
  const pattern = el('pattern', {
    id: spec.id, x: spec.x, y: spec.y, width: size, height: size, patternUnits: 'userSpaceOnUse',
  }, defs);
  el('rect', { x: 0, y: 0, width: size, height: size, fill: spec.colour }, pattern);
  if (spec.image !== null) {
    el('image', {
      href: spec.image, x: 0, y: 0, width: size, height: size, preserveAspectRatio: 'none',
    }, pattern);
    if (spec.tint !== null) {
      el('rect', {
        x: 0, y: 0, width: size, height: size, fill: spec.tint.colour, opacity: spec.tint.opacity,
      }, pattern);
    }
  }
  for (const speck of spec.specks) {
    el('circle', { cx: speck.x, cy: speck.y, r: speck.r, fill: speck.colour, opacity: speck.opacity }, pattern);
  }
  return pattern;
}

/**
 * Adds the pattern of every ground to `defs` and returns the `fill` value
 * for each.
 * @param {Element} defs
 * @param {readonly string[]} [present] as for `groundPattern`
 * @returns {Record<GroundKey, string>}
 */
export function defineGroundPatterns(defs, present = TEXTURES_PRESENT) {
  const fills = /** @type {Record<GroundKey, string>} */ ({});
  for (const key of GROUND_KEYS) {
    definePattern(defs, groundPattern(key, present));
    fills[key] = groundFill(key);
  }
  return fills;
}
