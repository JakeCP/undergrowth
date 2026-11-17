// White silhouettes drawn once into images, so no head needs a live SVG
// filter (look-and-motion spec, Constraints). The canvas is faked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSilhouettes, canvasSilhouette, SILHOUETTE_PX } from '../js/ui/silhouettes.js';

/**
 * A fake 2D canvas that records what is drawn and reports some opaque
 * pixels unless told the glyph drew nothing.
 * @param {{blank?: boolean, noContext?: boolean, throwOnUrl?: boolean}} [opts]
 */
function fakeDoc(opts = {}) {
  /** @type {Array<[string, ...unknown[]]>} */
  const ops = [];
  const ctx = {
    font: '', textAlign: '', textBaseline: '', fillStyle: '', globalCompositeOperation: 'source-over',
    clearRect: (...a) => ops.push(['clearRect', ...a]),
    fillText: (...a) => ops.push(['fillText', ...a]),
    fillRect: (...a) => {
      ops.push(['fillRect', ctx.globalCompositeOperation, ctx.fillStyle, ...a]);
    },
    getImageData: (_x, _y, w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      if (!opts.blank) data[3 + 4 * Math.floor((w * h) / 2)] = 255;
      return { data, width: w, height: h };
    },
  };
  const canvas = {
    width: 0, height: 0,
    getContext: (kind) => (opts.noContext ? null : kind === '2d' ? ctx : null),
    toDataURL: (type) => {
      if (opts.throwOnUrl) throw new Error('tainted');
      return `data:${type};base64,AAAA`;
    },
  };
  return { doc: { createElement: (tag) => (tag === 'canvas' ? canvas : null) }, ops, canvas, ctx };
}

test('canvasSilhouette: draws the glyph, then paints it white keeping its shape, as a PNG data URL', () => {
  const { doc, ops, canvas } = fakeDoc();
  const url = canvasSilhouette('🐜', /** @type {any} */ (doc));
  assert.equal(url, 'data:image/png;base64,AAAA');
  assert.equal(canvas.width, SILHOUETTE_PX);
  assert.equal(canvas.height, SILHOUETTE_PX);
  const text = ops.findIndex((o) => o[0] === 'fillText');
  const paint = ops.findIndex((o) => o[0] === 'fillRect' && o[1] === 'source-in');
  assert.ok(text >= 0 && ops[text][1] === '🐜', 'the glyph is drawn');
  assert.ok(paint > text, 'then painted over, only where the glyph is');
  assert.equal(ops[paint][2], '#ffffff', 'in white');
});

test('canvasSilhouette: no canvas, no 2D context, a glyph that draws nothing, or a failed export give null', () => {
  assert.equal(canvasSilhouette('🐜', undefined), null, 'no document');
  assert.equal(canvasSilhouette('🐜', /** @type {any} */ ({})), null, 'no createElement');
  assert.equal(canvasSilhouette('🐜', /** @type {any} */ (fakeDoc({ noContext: true }).doc)), null);
  assert.equal(canvasSilhouette('🐜', /** @type {any} */ (fakeDoc({ blank: true }).doc)), null);
  assert.equal(canvasSilhouette('🐜', /** @type {any} */ (fakeDoc({ throwOnUrl: true }).doc)), null);
});

test('createSilhouettes: each glyph is drawn once and then served from the cache', () => {
  /** @type {string[]} */
  const made = [];
  const s = createSilhouettes((glyph) => {
    made.push(glyph);
    return `img:${glyph}`;
  });
  s.prepare(['🐜', '🦡', '🐜']);
  assert.deepEqual(made, ['🐜', '🦡']);
  assert.equal(s.url('🐜'), 'img:🐜');
  assert.equal(s.url('🚜'), 'img:🚜', 'a glyph not prepared is drawn on first use');
  assert.equal(s.url('🚜'), 'img:🚜');
  assert.deepEqual(made, ['🐜', '🦡', '🚜']);
});

test('createSilhouettes: a maker that fails or throws gives null once, and is not retried', () => {
  let calls = 0;
  const s = createSilhouettes(() => {
    calls += 1;
    throw new Error('no canvas');
  });
  assert.equal(s.url('🐜'), null);
  assert.equal(s.url('🐜'), null);
  assert.equal(calls, 1);
});
