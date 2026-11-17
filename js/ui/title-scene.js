// What the title screen draws, decided without a browser: which
// paintings, which layers back to front, where the cast stand and the
// machines' lamps blink, and the box that keeps the archway and the
// cast registered to each other at every window shape.
//
// The scene is one painting taken apart. Behind: the valley, three
// states of it (js/ui/title-state.js), each painted wide (3:2) and
// tall (2:3). In front: the dark forest archway with a see-through
// opening, in the same two shapes, with the mossy root the cast stand
// on. The cast are cut-outs placed in percentages of the archway's own
// box, never of the screen, so feet stay on the painted root however
// the box is cropped.

/** @typedef {import('./title-state.js').TitleState} TitleState */
/** @typedef {'wide'|'tall'} Shape */
/** @typedef {'cut'|'mending'|'regrown'} Valley */

/**
 * Every title asset, in the list file's order. Each is a path relative
 * to index.html, or null while that piece does not exist.
 */
export const ASSET_KEYS = Object.freeze(/** @type {const} */ ([
  'valleyCutWide', 'valleyCutTall', 'valleyMendingWide', 'valleyMendingTall',
  'valleyRegrownWide', 'valleyRegrownTall', 'archWide', 'archTall',
  'heroes', 'ants', 'bees', 'beaver', 'badger', 'owl', 'bear',
  'fernLeft', 'fernRight', 'wordmark', 'theme',
]));

/** @typedef {Record<typeof ASSET_KEYS[number], string|null>} TitleAssets */

/** Width over height of the paintings of each shape. */
export const ARCH_RATIO = Object.freeze({ wide: 3 / 2, tall: 2 / 3 });

/**
 * When a painting is wider than the screen, the share of the overhang
 * that is cropped off its left side: 0.5 crops both sides alike. The
 * wide painting has the cast on its left, so it gives up more of its
 * right.
 */
export const FOCUS_X = Object.freeze({ wide: 0.2, tall: 0.5 });

/**
 * When a painting is taller than the screen, the share of the overhang
 * that is cropped off its bottom; the rest comes off the top. On a very
 * wide screen the wide painting gives up a little of its foreground so
 * the fox keeps her ears.
 */
export const FOCUS_Y = Object.freeze({ wide: 0.25, tall: 0 });

/**
 * Where a cut-out stands in the archway's box: its left edge, its
 * bottom edge and its width, in percent of the box. Its height follows
 * from its own shape.
 * @typedef {{left: number, bottom: number, width: number}} Spot
 */

/**
 * The cast, back to front: the bear looms behind, the pair stand in the
 * middle, the small ones are nearest.
 */
export const CAST_ORDER = Object.freeze(['bear', 'owl', 'heroes', 'badger', 'beaver', 'ants', 'bees']);

/**
 * Where each of the cast stands, per painting. Measured from the
 * paintings; change these when a painting is redone.
 * @type {Readonly<Record<Shape, Readonly<Record<string, Spot>>>>}
 */
export const CAST_SPOTS = Object.freeze({
  wide: Object.freeze({
    heroes: { left: 11.85, bottom: 11.5, width: 35.35 },
    bear: { left: 0, bottom: 12, width: 27 },
    owl: { left: 6.5, bottom: 64.5, width: 5 },
    badger: { left: 48.5, bottom: 9, width: 13 },
    beaver: { left: 59, bottom: 8, width: 11.5 },
    ants: { left: 67, bottom: 12, width: 13 },
    bees: { left: 63, bottom: 34, width: 4.5 },
  }),
  tall: Object.freeze({
    heroes: { left: 16, bottom: 24.5, width: 46 },
    bear: { left: 4, bottom: 25, width: 36 },
    owl: { left: 78, bottom: 24, width: 6.5 },
    badger: { left: 54, bottom: 23.5, width: 15 },
    beaver: { left: 66, bottom: 22.5, width: 13 },
    ants: { left: 30, bottom: 19, width: 26 },
    bees: { left: 68, bottom: 40, width: 8 },
  }),
});

/**
 * Where the machines' lamps are in each valley painting, in percent of
 * the painting. The regrown valley's last machine is still.
 * @type {Readonly<Record<Shape, Readonly<Record<Valley, readonly {left: number, top: number}[]>>>>}
 */
export const LAMP_SPOTS = Object.freeze({
  wide: Object.freeze({
    cut: [{ left: 70.2, top: 60.9 }, { left: 79.4, top: 59.6 }],
    mending: [{ left: 78.6, top: 59.4 }],
    regrown: [],
  }),
  tall: Object.freeze({
    cut: [{ left: 57, top: 59 }, { left: 73.3, top: 58.8 }],
    mending: [{ left: 73.2, top: 58.9 }],
    regrown: [],
  }),
});

/**
 * One layer of the title screen, back to front. `src` is its painting,
 * or null for a layer drawn in code. The valley and the archway say
 * which `shape` of painting was picked, since a missing one falls back
 * to the other; the mist lies in the valley's box, so it says the
 * valley's. The valley carries its `lamps`, the archway its `cast`,
 * the fern layer its two `ferns`.
 * @typedef {object} TitleLayer
 * @property {'valley'|'mist'|'arch'|'ferns'|'motes'|'title'|'controls'} id
 * @property {string|null} src
 * @property {boolean} animated false under reduced motion
 * @property {Shape} [shape]
 * @property {readonly {left: number, top: number}[]} [lamps]
 * @property {{id: string, src: string, spot: Spot}[]} [cast]
 * @property {{left: string|null, right: string|null}} [ferns]
 */

/**
 * @param {boolean} wide true when the screen is at least as wide as tall
 * @returns {Shape}
 */
export function shapeFor(wide) {
  return wide ? 'wide' : 'tall';
}

/**
 * @param {Shape} shape
 * @returns {Shape}
 */
function otherShape(shape) {
  return shape === 'wide' ? 'tall' : 'wide';
}

/**
 * @param {string} word
 * @returns {string}
 */
function cap(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * @param {Readonly<Record<string, string|null>>} assets
 * @param {string} key
 * @returns {string|null}
 */
function asset(assets, key) {
  return assets[key] ?? null;
}

/**
 * The valley painting to draw: the state asked for in the shape asked
 * for; failing that the same state in the other shape (cropped to
 * cover); failing that the freshly cut valley, either shape. Null when
 * there is no valley painting at all: the gradient stands in.
 * @param {Readonly<Record<string, string|null>>} assets
 * @param {Valley} valley
 * @param {Shape} shape
 * @returns {{src: string, valley: Valley, shape: Shape}|null}
 */
export function pickValley(assets, valley, shape) {
  /** @type {[Valley, Shape][]} */
  const tries = [[valley, shape], [valley, otherShape(shape)], ['cut', shape], ['cut', otherShape(shape)]];
  for (const [v, s] of tries) {
    const src = asset(assets, `valley${cap(v)}${cap(s)}`);
    if (src !== null) return { src, valley: v, shape: s };
  }
  return null;
}

/**
 * The archway painting to draw: the shape asked for, or the other one.
 * @param {Readonly<Record<string, string|null>>} assets
 * @param {Shape} shape
 * @returns {{src: string, shape: Shape}|null}
 */
export function pickArch(assets, shape) {
  for (const s of [shape, otherShape(shape)]) {
    const src = asset(assets, `arch${cap(s)}`);
    if (src !== null) return { src, shape: s };
  }
  return null;
}

/**
 * The smallest box of a painting's shape that covers the screen. When
 * it is wider than the screen, `focusX` of the overhang is cropped off
 * the left; when taller, `focusY` of the overhang is cropped off the
 * bottom (none by default: bottom edges together). css/title.css sizes
 * the valley and the archway by the same rule.
 * @param {number} screenW
 * @param {number} screenH
 * @param {number} ratio the painting's width over its height
 * @param {number} focusX
 * @param {number} [focusY]
 * @returns {{width: number, height: number, left: number, top: number}}
 */
export function coverBox(screenW, screenH, ratio, focusX, focusY = 0) {
  const width = Math.max(screenW, screenH * ratio);
  const height = width / ratio;
  return {
    width,
    height,
    left: (screenW - width) * focusX,
    top: (screenH - height) * (1 - focusY),
  };
}

/**
 * The layers to draw, back to front. The valley (or the gradient), the
 * motes, the title and the controls are always drawn. The mist needs a
 * valley to drift over. The cast are drawn only on an archway, for
 * without it there is nothing for them to stand on.
 * @param {Readonly<Record<string, string|null>>} assets
 * @param {TitleState} state
 * @param {{wide: boolean, reducedMotion: boolean}} opts
 * @returns {TitleLayer[]}
 */
export function titleLayers(assets, state, opts) {
  const animated = !opts.reducedMotion;
  const shape = shapeFor(opts.wide);
  /** @type {TitleLayer[]} */
  const layers = [];

  const valley = pickValley(assets, state.valley, shape);
  if (valley === null) {
    layers.push({ id: 'valley', src: null, animated, lamps: [] });
  } else {
    layers.push({
      id: 'valley', src: valley.src, animated, shape: valley.shape,
      lamps: LAMP_SPOTS[valley.shape][valley.valley],
    });
    layers.push({ id: 'mist', src: null, animated, shape: valley.shape });
  }

  const arch = pickArch(assets, shape);
  if (arch !== null) {
    const present = new Set(['heroes', ...state.company]);
    /** @type {{id: string, src: string, spot: Spot}[]} */
    const cast = [];
    for (const id of CAST_ORDER) {
      const src = asset(assets, id);
      if (present.has(id) && src !== null) cast.push({ id, src, spot: CAST_SPOTS[arch.shape][id] });
    }
    layers.push({ id: 'arch', src: arch.src, animated, shape: arch.shape, cast });
  }

  const ferns = { left: asset(assets, 'fernLeft'), right: asset(assets, 'fernRight') };
  if (ferns.left !== null || ferns.right !== null) layers.push({ id: 'ferns', src: null, animated, ferns });

  layers.push(
    { id: 'motes', src: null, animated },
    { id: 'title', src: null, animated },
    { id: 'controls', src: null, animated },
  );
  return layers;
}
