// The tokens' painted depth (interface pass): the band heads and body
// tokens are lit from the top left like the painted board, with a radial
// gradient, a thin arc of rim light and a soft shadow on the ground. All
// static paint: no filter on anything that moves, nothing new animated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBoard, mixColour, TOKEN_TONES, tokenFill } from '../js/ui/board.js';
import { ANIMAL, RUST, CREAM } from '../js/ui/patterns.js';
import { makeState } from './helpers.mjs';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { setBoardPieces } from '../js/ui/pieces.js';

installFakeDom({ canvas: true });
setBoardPieces({});

const VIEW = { selected: null, highlights: [], highlightKind: null, ghost: null };

function board() {
  const s = makeState(['....', '....', '....'], [
    { id: 'ants', type: 'ants', cells: [[1, 0], [1, 1], [2, 1]], maxLen: 4 },
    { id: 'harvester-0', type: 'harvester', cells: [[3, 2], [3, 1]] },
  ]);
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, /** @type {any} */ (VIEW));
  return { s, svg };
}

/** @param {FakeEl} svg @param {string} id */
const band = (svg, id) => svg.children.find((c) => c.attrs['data-band'] === id);

test('mixColour: part way from one colour to another', () => {
  assert.equal(mixColour('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixColour('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixColour('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixColour(ANIMAL, CREAM, 0), ANIMAL);
});

test('each side has its own gradient, light at the top left, its own colour in the middle', () => {
  const { svg } = board();
  const defs = svg.children.find((c) => c.tag === 'defs');
  assert.ok(defs);
  for (const [side, middle] of /** @type {const} */ ([['us', ANIMAL], ['bots', RUST]])) {
    const grad = defs.find('id', `ug-token-${side}`);
    assert.ok(grad, side);
    assert.equal(grad.tag, 'radialGradient');
    assert.ok(Number(grad.attrs.fx) < 0.5 && Number(grad.attrs.fy) < 0.5, 'lit from the top left');
    const stops = grad.children.map((c) => c.attrs['stop-color']);
    assert.deepEqual(stops, [...TOKEN_TONES[side]]);
    assert.equal(stops[1], middle);
  }
  assert.ok(defs.find('id', 'ug-token-shade'), 'and the soft shadow');
});

test('heads and body tokens are filled with their side\'s gradient, with a rim light and a shadow', () => {
  const { svg } = board();
  const ants = band(svg, 'ants');
  const bot = band(svg, 'harvester-0');
  assert.equal(ants.find('data-disc').attrs.fill, tokenFill('us'));
  assert.equal(bot.find('data-disc').attrs.fill, tokenFill('bots'));
  for (const g of [ants, bot]) {
    for (const token of g.findAll('data-token')) {
      assert.equal(token.findAll('data-shade').length, 1, 'one shadow under each token');
      assert.equal(token.findAll('data-rim').length, 1, 'one rim light on each token');
      const disc = token.all().find((n) => n.tag === 'circle' && String(n.attrs.fill).startsWith('url(#ug-token-'));
      assert.ok(disc, 'its disc takes the gradient');
    }
  }
});

test('a body token\'s shadow stays on the ground while the token bobs over it', () => {
  const { svg } = board();
  const tail = band(svg, 'ants').find('data-token', '2');
  const shade = tail.find('data-shade');
  const wobble = tail.all().find((n) => (n.attrs.class ?? '').split(' ').includes('ug-wobble'));
  assert.ok(shade && wobble);
  assert.equal(wobble.all().includes(shade), false, 'the shadow is not in the bobbing group');
  assert.ok(wobble.find('data-rim'), 'the rim light bobs with the token');
});

test('the depth is static paint: no filter, no transform, no new animation', () => {
  const { svg } = board();
  for (const id of ['ants', 'harvester-0']) {
    for (const n of band(svg, id).all()) {
      assert.equal(n.attrs.filter, undefined, `${id}: no filter`);
      if (n.attrs['data-shade'] !== undefined || n.attrs['data-rim'] !== undefined) {
        assert.equal(n.attrs.transform, undefined);
        assert.equal(n.attrs.class, undefined, 'nothing animated');
        assert.equal(n.attrs.style, undefined);
      }
    }
  }
});

test('a ghost band (the hover preview) has no shadow of its own', () => {
  const s = makeState(['....', '....'], [{ id: 'ants', type: 'ants', cells: [[0, 0]], maxLen: 2 }]);
  const ghost = { ...s, bands: s.bands.map((b) => ({ ...b, cells: [[1, 0]] })) };
  const svg = new FakeEl('svg');
  renderBoard(/** @type {any} */ (svg), s, /** @type {any} */ ({ ...VIEW, ghost }));
  const layer = svg.children.find((c) => c.attrs['data-layer'] === 'ghost');
  assert.ok(layer);
  assert.equal(layer.findAll('data-shade').length, 0);
});
