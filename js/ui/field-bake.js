// The grass field baked into one picture (performance, 2026-11-17).
//
// A grass field is the plain grass with some seventy soft patches of its
// variants laid over it (js/ui/patterns.js, `grassField`). Drawn as SVG,
// each patch is a masked, semi-transparent rect inside the field's
// <pattern>, and the browser replays every one of them for every tile it
// fills, each time any part of the board is repainted. With the bands
// bobbing that was every frame, and the board fell to a few frames a
// second.
//
// So the field is drawn once onto a canvas, the same layers and patches
// in the same order, and kept as an image (a blob URL). The field's
// pattern then holds one <image>: the board fills a tile from a single
// picture, as it does for water or stubble.
//
// `prepare` starts the bake (app start-up). Until it is done a field is
// drawn as the plain grass alone and is finished in place when the bake
// lands (`whenDone`). Where there is no canvas or the bake fails, the
// field is drawn as SVG, as before (definePattern in js/ui/patterns.js).

/** @typedef {import('./patterns.js').PatternSpec} PatternSpec */
/** @typedef {import('./patterns.js').Patch} Patch */

/**
 * Canvas pixels per board unit: the textures' own (512 pixels over three
 * tiles of 40), so the bake is as sharp as the textures it is made from.
 */
export const BAKE_SCALE = 512 / 120;

/** The soft fade a patch is masked with: [offset, opacity], as patterns.js's mask. */
export const PATCH_FADE = Object.freeze([[0, 1], [0.35, 0.9], [0.7, 0.4], [1, 0]]);

/**
 * Where a bake stands: 'none' (not asked for, or no canvas), 'pending',
 * 'ready' (url holds the picture) or 'failed'.
 * @typedef {'none'|'pending'|'ready'|'failed'} BakeStatus
 */

/**
 * @typedef {object} FieldBake
 * @property {() => BakeStatus} status
 * @property {() => string|null} url  the baked picture, once ready
 * @property {(spec: PatternSpec) => void} prepare  starts the bake, once
 * @property {(fn: (url: string|null) => void) => void} whenDone  runs `fn`
 *   with the picture (or null if the bake failed) once the bake ends; at
 *   once if it already has
 */

/**
 * A bake of one field, made by `draw`. `draw` gives the picture's URL, or
 * null when it cannot be made; a throw counts as null.
 * @param {(spec: PatternSpec) => Promise<string|null>|null} draw  null when
 *   there is nothing to draw with (no canvas)
 * @returns {FieldBake}
 */
export function createFieldBake(draw) {
  /** @type {BakeStatus} */
  let status = 'none';
  /** @type {string|null} */
  let url = null;
  /** @type {Array<(url: string|null) => void>} */
  let waiting = [];

  /** @param {string|null} made */
  function finish(made) {
    url = made;
    status = made === null ? 'failed' : 'ready';
    const run = waiting;
    waiting = [];
    for (const fn of run) fn(made);
  }

  return {
    status: () => status,
    url: () => url,
    prepare(spec) {
      if (status !== 'none') return;
      /** @type {Promise<string|null>|null} */
      let job = null;
      try {
        job = draw(spec);
      } catch {
        job = null;
      }
      if (job === null) return;
      status = 'pending';
      job.then(finish, () => finish(null));
    },
    whenDone(fn) {
      if (status === 'ready' || status === 'failed') fn(url);
      else waiting.push(fn);
    },
  };
}

/**
 * Loads one image. On its load event, not `decode()`: a page that is not
 * being drawn (a hidden tab or pane) may hold a decode back indefinitely,
 * and drawing it on the canvas decodes it anyway.
 * @param {Document} doc
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(doc, src) {
  const img = /** @type {HTMLImageElement} */ (doc.createElement('img'));
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => reject(new Error(`cannot load ${src}`)), { once: true });
    img.src = src;
  });
}

/**
 * Where a patch lands on the canvas, in whole pixels.
 * @param {Patch} p
 * @param {number} scale
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function patchBox(p, scale) {
  const x = Math.floor(p.x * scale);
  const y = Math.floor(p.y * scale);
  return {
    x, y, width: Math.ceil((p.x + p.width) * scale) - x, height: Math.ceil((p.y + p.height) * scale) - y,
  };
}

/**
 * Draws a grass field on a canvas, as definePattern would draw it in SVG:
 * the flat colour, the plain grass tiled over it, then each patch, its
 * variant tiled in the field's space, faded out from its middle to its
 * edges and laid on at its opacity. Gives the picture as a blob URL, or
 * null when there is no canvas or a texture will not load.
 * @param {PatternSpec} spec
 * @param {Document|undefined} [doc]
 * @returns {Promise<string|null>|null}  null at once when there is no document
 */
export function canvasField(spec, doc = globalThis.document) {
  if (doc === undefined || doc === null || typeof doc.createElement !== 'function') return null;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  return Promise.all(spec.layers.map((layer) => loadImage(doc, layer.image))).then((images) => {
    const scale = BAKE_SCALE;
    const px = Math.round(spec.size * scale);
    const canvas = /** @type {HTMLCanvasElement} */ (doc.createElement('canvas'));
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    const scratch = /** @type {HTMLCanvasElement} */ (doc.createElement('canvas'));
    const sctx = scratch.getContext('2d');
    if (ctx === null || sctx === null) return null;

    /**
     * Each layer as a fill on `c`, tiled in the field's space.
     * @param {CanvasRenderingContext2D} c
     * @returns {Map<string, CanvasPattern>}
     */
    const fills = (c) => {
      /** @type {Map<string, CanvasPattern>} */
      const out = new Map();
      spec.layers.forEach((layer, i) => {
        const img = images[i];
        const fill = c.createPattern(img, 'repeat');
        if (fill === null) return;
        fill.setTransform(new DOMMatrix()
          .translate(layer.x, layer.y)
          .scale(layer.size / img.naturalWidth, layer.size / img.naturalHeight));
        out.set(layer.id, fill);
      });
      return out;
    };

    ctx.fillStyle = spec.colour;
    ctx.fillRect(0, 0, px, px);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const base = fills(ctx).get(spec.layers[0].id);
    if (base === undefined) return null;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, spec.size, spec.size);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    for (const p of spec.patches) {
      const box = patchBox(p, scale);
      if (box.width <= 0 || box.height <= 0) continue;
      // Resizing clears the scratch canvas and resets its state.
      scratch.width = box.width;
      scratch.height = box.height;
      sctx.setTransform(scale, 0, 0, scale, -box.x, -box.y);
      const fill = fills(sctx).get(p.layer);
      if (fill === undefined) continue;
      sctx.fillStyle = fill;
      sctx.fillRect(p.x, p.y, p.width, p.height);
      // The fade: an ellipse filling the patch's box, as the SVG mask in
      // objectBoundingBox units is.
      sctx.globalCompositeOperation = 'destination-in';
      sctx.translate(p.x + p.width / 2, p.y + p.height / 2);
      sctx.scale(p.width / 2, p.height / 2);
      const fade = sctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [offset, opacity] of PATCH_FADE) fade.addColorStop(offset, `rgba(255, 255, 255, ${opacity})`);
      sctx.fillStyle = fade;
      sctx.fillRect(-1, -1, 2, 2);
      ctx.globalAlpha = p.opacity;
      ctx.drawImage(scratch, box.x, box.y);
      ctx.globalAlpha = 1;
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob === null ? null : URL.createObjectURL(blob)), 'image/jpeg', 0.92);
    });
  }).catch(() => null);
}

/** The game's grass field, baked on the page's canvas. */
export const fieldBake = createFieldBake((spec) => canvasField(spec));
