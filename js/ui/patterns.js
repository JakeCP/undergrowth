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
import { fieldBake, PATCH_FADE } from './field-bake.js';

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

/** @typedef {'grass'|'soil'|'water'|'stubble'|'paving'|'stone'|'meadow'|'bank'|GrassVariant} TextureName */
/** @typedef {'grass-lush'|'grass-clover'} GrassVariant */

/**
 * A ground is what a tile stands on. Most terrain kinds are their own
 * ground; 'meadow' and 'bank' are open ground with flowers and open ground
 * beside water, and a dam or a ford shows the water or hole under it. (An
 * earth bank, terrain kind 'earthbank', stands on grass like the stones.) Several
 * grounds are filled alike (see SURFACE).
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
 * A texture tiled on its own, for a field to paint with: the plain grass
 * under everything, or one of its variants in a patch.
 * @typedef {{id: string, image: string, size: number, x: number, y: number}} Layer
 */

/**
 * A soft patch of one grass variant: a rectangle filled with that
 * variant's layer, faded out to nothing from its middle to its edges (an
 * ellipse with no rim), at this opacity.
 * @typedef {{layer: string, x: number, y: number, width: number, height: number, opacity: number}} Patch
 */

/**
 * A pattern as data. `x`, `y` and `size` are in board units; `image` is
 * the texture file's URL, or null for the code-made fallback. A grass
 * field (when grass variants are present) also has `layers`, the plain
 * grass first, and `patches` of the variants laid over it.
 * @typedef {{id: string, x: number, y: number, size: number, colour: string, image: string|null, tint: Tint|null, specks: Speck[], layers: Layer[], patches: Patch[]}} PatternSpec
 */

/**
 * Textures the look needs. Until one exists its grounds use the fallback.
 * (Soil and stone, and the optional meadow and bank, are still made and
 * shipped but no ground is filled with them now: see SURFACE.)
 */
/** @type {readonly TextureName[]} */
export const REQUIRED_TEXTURES = Object.freeze(['grass', 'soil', 'water', 'stubble', 'paving', 'stone']);

/**
 * The same grass painted two other ways: a damper, overgrown patch and a
 * low one of clover and moss. They are laid in soft patches over the
 * plain grass so a field is not one picture repeating every three tiles
 * (Jake, 2026-11-16: "we need some more variety now"). A sunnier, yellower
 * variant and grass worn thin to earth were tried and dropped: Jake liked
 * neither.
 */
/** @type {readonly GrassVariant[]} */
export const GRASS_VARIANTS = Object.freeze(['grass-lush', 'grass-clover']);

/** Textures that are nice to have. Without one, a required texture stands in. */
/** @type {readonly TextureName[]} */
export const OPTIONAL_TEXTURES = Object.freeze(['meadow', 'bank', ...GRASS_VARIANTS]);

/** @type {readonly GroundKey[]} */
export const GROUND_KEYS = Object.freeze([
  'open', 'meadow', 'bank', 'forest', 'stubble', 'paving', 'water', 'hole', 'stones',
  'habitat', 'habitatDamaged',
]);

/**
 * What the ground is made of. The trees, the rocks, the dens, a dug
 * hole, the flowers and the riverbank all stand on the same grass (Jake,
 * 2026-11-16: a square of darker or browner ground under each of them
 * read as a grid of tiles, and a hole that turned its whole tile to
 * soil was confusing); only water, stubble and paving are grounds of
 * their own.
 * @typedef {'grass'|'stubble'|'paving'|'water'} Surface
 */

/** @type {Readonly<Record<GroundKey, Surface>>} */
export const SURFACE = Object.freeze({
  open: 'grass',
  meadow: 'grass',
  bank: 'grass',
  forest: 'grass',
  hole: 'grass',
  stones: 'grass',
  habitat: 'grass',
  habitatDamaged: 'grass',
  stubble: 'stubble',
  paving: 'paving',
  water: 'water',
});

/** The surfaces, lowest first: where two meet, the higher one spills a little onto the lower. */
/** @type {readonly Surface[]} */
export const SURFACES = Object.freeze(['grass', 'stubble', 'paving', 'water']);

/** The ground that stands for each surface (its pattern fills the surface's shapes). */
/** @type {Readonly<Record<Surface, GroundKey>>} */
export const SURFACE_GROUND = Object.freeze({ grass: 'open', stubble: 'stubble', paving: 'paving', water: 'water' });

/**
 * @param {GroundKey} key
 * @returns {Surface}
 */
export function surfaceOf(key) {
  return SURFACE[key];
}

/** @type {GroundDef} */
const GRASS_DEF = Object.freeze({
  colour: GRASS, light: GRASS_LIGHT, dark: GRASS_SHADE, textures: /** @type {readonly TextureName[]} */ (['grass']), tint: null,
});

/** @type {Readonly<Record<GroundKey, GroundDef>>} */
export const GROUND = Object.freeze({
  open: GRASS_DEF,
  meadow: GRASS_DEF,
  bank: GRASS_DEF,
  forest: GRASS_DEF,
  stubble: { colour: STUBBLE, light: STUBBLE_LIGHT, dark: STUBBLE_SHADE, textures: ['stubble'], tint: null },
  paving: { colour: PAVING, light: PAVING_LIGHT, dark: PAVING_SHADE, textures: ['paving'], tint: null },
  water: { colour: WATER, light: WATER_LIGHT, dark: WATER_DEEP, textures: ['water'], tint: null },
  hole: GRASS_DEF,
  stones: GRASS_DEF,
  habitat: GRASS_DEF,
  habitatDamaged: GRASS_DEF,
});

/** Tiles are 40 board units wide (TILE in js/ui/board.js). */
/** The fallback noise repeats every two tiles. */
export const FALLBACK_SPAN = 80;

/** A texture is stretched over three tiles, then repeats. */
export const TEXTURE_SPAN = 120;

/**
 * A grass field (plain grass with its patches) repeats every twelve
 * tiles, so no board of eight shows it twice. Every layer's span divides
 * it, so nothing is cut where the field repeats.
 */
export const FIELD_SPAN = 480;

/**
 * How each variant is tiled inside a field: its span (near the plain
 * grass's, so a blade is the same size) and where its repeat starts, a
 * different place for each so their repeats never line up.
 * @type {Readonly<Record<GrassVariant, {size: number, x: number, y: number}>>}
 */
const VARIANT_TILING = Object.freeze({
  'grass-lush': { size: 160, x: 40, y: 100 },
  'grass-clover': { size: 160, x: 110, y: 60 },
});

/** How many clusters of patches a field has. */
const PATCH_CLUSTERS = 18;

/** The fade every patch is masked with (definePattern adds it once). */
export const PATCH_MASK = 'ug-patch';

/** How strong the variants' patches are, faintest to strongest. */
const PATCH_OPACITY = Object.freeze([0.6, 0.95]);

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
    case 'ford':
      return tile.under === 'hole' ? 'hole' : 'water';
    case 'earthbank':
      return 'open';
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
 * Where this ground's pattern starts its repeat: the same for every
 * ground of one surface, so the grass under a tree joins the grass
 * beside it without a seam, and different for each surface.
 * @param {GroundKey} key
 * @param {number} size
 * @returns {{x: number, y: number}}
 */
function origin(key, size) {
  const index = GROUND_KEYS.indexOf(SURFACE_GROUND[SURFACE[key]]);
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
  // Seeded by the surface, so every grass ground has the same specks.
  const seed = GROUND_KEYS.indexOf(SURFACE_GROUND[SURFACE[key]]);
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
  return {
    id: patternId(key), ...origin(key, size), size, colour: def.colour, image: null, tint: null, specks, layers: [], patches: [],
  };
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
  const variants = GRASS_VARIANTS.filter((v) => present.includes(v));
  if (name === 'grass' && variants.length > 0) return grassField(key, variants);
  const size = TEXTURE_SPAN;
  return {
    id: patternId(key),
    ...origin(key, size),
    size,
    colour: def.colour,
    image: textureUrl(name),
    tint: def.tint === null ? null : { ...def.tint },
    specks: [],
    layers: [],
    patches: [],
  };
}

/**
 * @param {string} name
 * @returns {string}
 */
export function layerId(name) {
  return `ug-layer-${name}`;
}

/**
 * The grass as a field: the plain grass, with soft patches of the
 * variants that are present laid over it. The same for every grass
 * ground, from the same origin, so the grass under a tree joins the grass
 * beside it without a seam.
 * @param {GroundKey} key
 * @param {readonly GrassVariant[]} variants
 * @returns {PatternSpec}
 */
export function grassField(key, variants) {
  const size = FIELD_SPAN;
  const base = 'grass';
  /** @type {Layer[]} */
  const layers = [
    { id: layerId(base), image: textureUrl(base), size: TEXTURE_SPAN, x: 0, y: 0 },
    ...variants.map((v) => ({ id: layerId(v), image: textureUrl(v), ...VARIANT_TILING[v] })),
  ];
  return {
    id: patternId(key),
    ...origin(key, size),
    size,
    colour: GROUND[key].colour,
    image: textureUrl(base),
    tint: null,
    specks: [],
    layers,
    patches: grassPatches(variants),
  };
}

/**
 * Where the patches lie in a field: clusters of two or three overlapping
 * soft ellipses, so a patch has a ragged outline and no shape repeats.
 * The same every time. A patch that crosses the field's edge is laid
 * again on the far side, so the field repeats without a seam.
 * @param {readonly GrassVariant[]} variants
 * @returns {Patch[]}
 */
export function grassPatches(variants) {
  if (variants.length === 0) return [];
  const size = FIELD_SPAN;
  /** @type {Patch[]} */
  const out = [];
  for (let i = 0; i < PATCH_CLUSTERS; i += 1) {
    const h = (/** @type {number} */ k) => hash01(101 + i, k);
    const variant = variants[Math.floor(h(0) * variants.length)];
    const cx = h(1) * size;
    const cy = h(2) * size;
    const blobs = 2 + Math.floor(h(3) * 2);
    for (let j = 0; j < blobs; j += 1) {
      const g = (/** @type {number} */ k) => hash01(101 + i, 10 + j * 7 + k);
      const width = round(70 + g(0) * 80, 1);
      const height = round(60 + g(1) * 70, 1);
      const x = round(cx + (g(2) - 0.5) * 70 - width / 2, 1);
      const y = round(cy + (g(3) - 0.5) * 60 - height / 2, 1);
      const [low, high] = PATCH_OPACITY;
      const opacity = round(low + g(4) * (high - low), 2);
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const px = x + dx;
          const py = y + dy;
          if (px + width <= 0 || px >= size || py + height <= 0 || py >= size) continue;
          out.push({
            layer: layerId(variant), x: round(px, 1), y: round(py, 1), width, height, opacity,
          });
        }
      }
    }
  }
  return out;
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
 * and its tint if there are any, then the specks. A grass field is its
 * baked picture once `bake` has it (js/ui/field-bake.js); while the bake
 * is under way, the plain grass, finished in place when it lands; and
 * where there is no bake, the plain grass with each patch masked over it.
 * @param {Element} defs
 * @param {PatternSpec} spec
 * @param {import('./field-bake.js').FieldBake} [bake]
 * @returns {SVGElement}
 */
export function definePattern(defs, spec, bake = fieldBake) {
  const { size } = spec;
  if (spec.layers.length > 0) defineLayers(defs, spec.layers);
  const pattern = el('pattern', {
    id: spec.id, x: spec.x, y: spec.y, width: size, height: size, patternUnits: 'userSpaceOnUse',
  }, defs);
  el('rect', { x: 0, y: 0, width: size, height: size, fill: spec.colour }, pattern);
  if (spec.layers.length > 0) {
    const status = bake.status();
    if (status === 'ready') {
      fieldImage(pattern, spec, /** @type {string} */ (bake.url()));
    } else {
      const base = el('rect', { x: 0, y: 0, width: size, height: size, fill: `url(#${spec.layers[0].id})` }, pattern);
      if (status === 'pending') {
        bake.whenDone((url) => {
          if (url !== null) {
            base.remove();
            fieldImage(pattern, spec, url);
          } else {
            fieldPatches(pattern, spec);
          }
        });
      } else {
        fieldPatches(pattern, spec);
      }
    }
  } else if (spec.image !== null) {
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
 * A field as its baked picture, filling the pattern.
 * @param {Element} pattern
 * @param {PatternSpec} spec
 * @param {string} url
 * @returns {void}
 */
function fieldImage(pattern, spec, url) {
  el('image', {
    href: url, x: 0, y: 0, width: spec.size, height: spec.size, preserveAspectRatio: 'none', 'data-field': 'baked',
  }, pattern);
}

/**
 * A field's patches drawn as SVG, each a rect of its variant masked with
 * the soft fade. Costly to paint (see js/ui/field-bake.js): only where
 * the field cannot be baked.
 * @param {Element} pattern
 * @param {PatternSpec} spec
 * @returns {void}
 */
function fieldPatches(pattern, spec) {
  for (const p of spec.patches) {
    el('rect', {
      x: p.x, y: p.y, width: p.width, height: p.height,
      fill: `url(#${p.layer})`, mask: `url(#${PATCH_MASK})`, opacity: p.opacity,
    }, pattern);
  }
}

/** @type {WeakMap<Element, Set<string>>} */
const layersIn = new WeakMap();

/**
 * Adds a field's layers to `defs`, each a pattern of its own texture
 * tiled in the field's space, and the soft fade the patches are masked
 * with; each only once per `defs`.
 * @param {Element} defs
 * @param {readonly Layer[]} layers
 * @returns {void}
 */
function defineLayers(defs, layers) {
  let done = layersIn.get(defs);
  if (done === undefined) {
    done = new Set();
    layersIn.set(defs, done);
  }
  if (!done.has(PATCH_MASK)) {
    done.add(PATCH_MASK);
    const fade = el('radialGradient', { id: `${PATCH_MASK}-fade`, cx: 0.5, cy: 0.5, r: 0.5 }, defs);
    for (const [offset, opacity] of PATCH_FADE) {
      el('stop', { offset, 'stop-color': '#fff', 'stop-opacity': opacity }, fade);
    }
    const mask = el('mask', { id: PATCH_MASK, maskContentUnits: 'objectBoundingBox' }, defs);
    el('rect', { x: 0, y: 0, width: 1, height: 1, fill: `url(#${PATCH_MASK}-fade)` }, mask);
  }
  for (const layer of layers) {
    if (done.has(layer.id)) continue;
    done.add(layer.id);
    const pattern = el('pattern', {
      id: layer.id, x: layer.x, y: layer.y, width: layer.size, height: layer.size, patternUnits: 'userSpaceOnUse',
    }, defs);
    el('image', {
      href: layer.image, x: 0, y: 0, width: layer.size, height: layer.size, preserveAspectRatio: 'none',
    }, pattern);
  }
}

/**
 * Adds the pattern of every ground to `defs` and returns the `fill` value
 * for each. Grass grounds that are a field share open ground's pattern
 * (their own pattern points at it), so the field is drawn once.
 * @param {Element} defs
 * @param {readonly string[]} [present] as for `groundPattern`
 * @param {import('./field-bake.js').FieldBake} [bake] as for `definePattern`
 * @returns {Record<GroundKey, string>}
 */
export function defineGroundPatterns(defs, present = TEXTURES_PRESENT, bake = fieldBake) {
  const fills = /** @type {Record<GroundKey, string>} */ ({});
  const shared = SURFACE_GROUND.grass;
  for (const key of GROUND_KEYS) {
    const spec = groundPattern(key, present);
    if (spec.layers.length > 0 && SURFACE[key] === 'grass' && key !== shared) {
      el('pattern', { id: spec.id, href: `#${patternId(shared)}` }, defs);
    } else {
      definePattern(defs, spec, bake);
    }
    fills[key] = groundFill(key);
  }
  return fills;
}
