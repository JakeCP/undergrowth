// White unit silhouettes as images (look-and-motion spec, Constraints:
// "no live SVG filter on anything that moves"). Each glyph is drawn once
// onto a canvas, painted white where it has ink (the same result the old
// ug-white colour-matrix filter gave), and kept as a PNG data URL. The
// board shows it with a plain <image>, so a moving head needs no filter.
//
// Where there is no canvas (or it fails), `url` gives null and the board
// falls back to the plain glyph, unfiltered.

/** The silhouette's edge in canvas pixels: sharp at 3x on a large board. */
export const SILHOUETTE_PX = 96;

const FONT = `${Math.round(SILHOUETTE_PX * 0.8)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

/**
 * Draws one glyph as a white silhouette and returns it as a PNG data URL,
 * or null when there is no usable canvas or the glyph drew nothing.
 * @param {string} glyph
 * @param {Document|undefined} [doc]
 * @returns {string|null}
 */
export function canvasSilhouette(glyph, doc = globalThis.document) {
  if (doc === undefined || doc === null || typeof doc.createElement !== 'function') return null;
  try {
    const canvas = /** @type {HTMLCanvasElement|null} */ (doc.createElement('canvas'));
    if (canvas === null || typeof canvas.getContext !== 'function') return null;
    canvas.width = SILHOUETTE_PX;
    canvas.height = SILHOUETTE_PX;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    const mid = SILHOUETTE_PX / 2;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, mid, mid + SILHOUETTE_PX * 0.04);
    // Keep only the glyph's shape, painted white.
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SILHOUETTE_PX, SILHOUETTE_PX);
    ctx.globalCompositeOperation = 'source-over';
    const pixels = ctx.getImageData(0, 0, SILHOUETTE_PX, SILHOUETTE_PX).data;
    let inked = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) {
        inked = true;
        break;
      }
    }
    if (!inked) return null;
    const url = canvas.toDataURL('image/png');
    return typeof url === 'string' && url.startsWith('data:image/png') ? url : null;
  } catch {
    return null;
  }
}

/**
 * A cache of silhouettes made by `make`: each glyph is made once, on
 * `prepare` at start-up or on first use, and a failure is remembered too.
 * @param {(glyph: string) => string|null} make
 * @returns {{url: (glyph: string) => string|null, prepare: (glyphs: Iterable<string>) => void}}
 */
export function createSilhouettes(make) {
  /** @type {Map<string, string|null>} */
  const cache = new Map();
  /**
   * @param {string} glyph
   * @returns {string|null}
   */
  function url(glyph) {
    const hit = cache.get(glyph);
    if (hit !== undefined) return hit;
    /** @type {string|null} */
    let made = null;
    try {
      made = make(glyph);
    } catch {
      made = null;
    }
    cache.set(glyph, made);
    return made;
  }
  return {
    url,
    prepare(glyphs) {
      for (const glyph of glyphs) url(glyph);
    },
  };
}

/** The game's silhouettes, drawn on the page's canvas. */
export const silhouettes = createSilhouettes((glyph) => canvasSilhouette(glyph));
