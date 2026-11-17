// What the title screen draws (js/ui/title-scene.js): which paintings,
// which layers, where the cast stand and the lamps blink, and the box
// that keeps the archway and the cast registered at every window shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_KEYS, ARCH_RATIO, FOCUS_X, FOCUS_Y, CAST_SPOTS, CAST_ORDER, LAMP_SPOTS,
  shapeFor, pickValley, pickArch, coverBox, titleLayers,
} from '../js/ui/title-scene.js';
import { COMPANY, NEW_TITLE_STATE } from '../js/ui/title-state.js';

/** @type {Record<string, string|null>} */
const NONE = Object.fromEntries(ASSET_KEYS.map((k) => [k, null]));
/** @type {Record<string, string|null>} */
const ALL = Object.fromEntries(ASSET_KEYS.map((k) => [k, `assets/title/${k}.webp`]));

const WIDE = { wide: true, reducedMotion: false };
const TALL = { wide: false, reducedMotion: false };

/** @param {ReturnType<typeof titleLayers>} layers @param {string} id */
const layer = (layers, id) => {
  const found = layers.find((l) => l.id === id);
  assert.ok(found, `there is a ${id} layer`);
  return found;
};

test('the asset keys are the ones the art is painted for', () => {
  assert.deepEqual([...ASSET_KEYS], [
    'valleyCutWide', 'valleyCutTall', 'valleyMendingWide', 'valleyMendingTall',
    'valleyRegrownWide', 'valleyRegrownTall', 'archWide', 'archTall',
    'heroes', 'ants', 'bees', 'beaver', 'badger', 'owl', 'bear',
    'fernLeft', 'fernRight', 'wordmark', 'theme',
  ]);
});

test('shapeFor: a wide screen takes the wide paintings, an upright one the tall', () => {
  assert.equal(shapeFor(true), 'wide');
  assert.equal(shapeFor(false), 'tall');
});

test('pickValley: the state asked for, in the shape asked for', () => {
  assert.deepEqual(pickValley(ALL, 'mending', 'tall'), { src: ALL.valleyMendingTall, valley: 'mending', shape: 'tall' });
  assert.deepEqual(pickValley(ALL, 'cut', 'wide'), { src: ALL.valleyCutWide, valley: 'cut', shape: 'wide' });
});

test('pickValley: falls back to the other shape, then to the cut valley, then to nothing', () => {
  assert.deepEqual(
    pickValley({ ...ALL, valleyMendingTall: null }, 'mending', 'tall'),
    { src: ALL.valleyMendingWide, valley: 'mending', shape: 'wide' },
  );
  assert.deepEqual(
    pickValley({ ...ALL, valleyMendingTall: null, valleyMendingWide: null }, 'mending', 'tall'),
    { src: ALL.valleyCutTall, valley: 'cut', shape: 'tall' },
  );
  assert.deepEqual(
    pickValley({ ...NONE, valleyCutWide: 'w.webp' }, 'regrown', 'tall'),
    { src: 'w.webp', valley: 'cut', shape: 'wide' },
  );
  assert.equal(pickValley(NONE, 'cut', 'wide'), null);
});

test('pickArch: the shape asked for, or the other one, or nothing', () => {
  assert.deepEqual(pickArch(ALL, 'tall'), { src: ALL.archTall, shape: 'tall' });
  assert.deepEqual(pickArch({ ...ALL, archTall: null }, 'tall'), { src: ALL.archWide, shape: 'wide' });
  assert.equal(pickArch(NONE, 'wide'), null);
});

test('titleLayers: with every asset, valley, mist, archway, ferns, motes, title, controls', () => {
  const layers = titleLayers(ALL, NEW_TITLE_STATE, WIDE);
  assert.deepEqual(layers.map((l) => l.id), ['valley', 'mist', 'arch', 'ferns', 'motes', 'title', 'controls']);
  assert.equal(layer(layers, 'valley').src, ALL.valleyCutWide);
  assert.equal(layer(layers, 'valley').shape, 'wide');
  assert.equal(layer(layers, 'mist').shape, 'wide', "the mist lies in the valley's box");
  assert.equal(layer(layers, 'arch').src, ALL.archWide);
  assert.deepEqual(layer(layers, 'arch').cast?.map((c) => c.id), ['heroes']);
  assert.equal(layer(layers, 'arch').cast?.[0].src, ALL.heroes);
  assert.deepEqual(layer(layers, 'arch').cast?.[0].spot, CAST_SPOTS.wide.heroes);
  assert.equal(layer(layers, 'valley').lamps?.length, 2, 'two machines at work');
  assert.deepEqual(layer(layers, 'ferns').ferns, { left: ALL.fernLeft, right: ALL.fernRight });
  assert.ok(layers.every((l) => l.animated));
});

test('titleLayers: an upright screen takes the tall paintings and the tall spots', () => {
  const layers = titleLayers(ALL, NEW_TITLE_STATE, TALL);
  assert.equal(layer(layers, 'valley').src, ALL.valleyCutTall);
  assert.equal(layer(layers, 'arch').shape, 'tall');
  assert.deepEqual(layer(layers, 'arch').cast?.[0].spot, CAST_SPOTS.tall.heroes);
});

test('titleLayers: the company stands with the pair, back to front', () => {
  const layers = titleLayers(ALL, { valley: 'cut', company: ['ants', 'bear'] }, WIDE);
  assert.deepEqual(layer(layers, 'arch').cast?.map((c) => c.id), ['bear', 'heroes', 'ants']);
  const everyone = titleLayers(ALL, { valley: 'cut', company: [...COMPANY] }, WIDE);
  assert.deepEqual(layer(everyone, 'arch').cast?.map((c) => c.id), [...CAST_ORDER]);
});

test('titleLayers: a companion with no painting is left out; an unknown one too', () => {
  const layers = titleLayers({ ...ALL, bear: null }, { valley: 'cut', company: ['bear', 'ants', 'wombat'] }, WIDE);
  assert.deepEqual(layer(layers, 'arch').cast?.map((c) => c.id), ['heroes', 'ants']);
});

test('titleLayers: with no archway nobody is drawn, for there is nothing to stand on', () => {
  const layers = titleLayers({ ...ALL, archWide: null, archTall: null }, { valley: 'cut', company: ['ants'] }, WIDE);
  assert.deepEqual(layers.map((l) => l.id), ['valley', 'mist', 'ferns', 'motes', 'title', 'controls']);
  assert.ok(layers.every((l) => l.cast === undefined));
});

test('titleLayers: the cast stand where the archway actually drawn puts them', () => {
  const layers = titleLayers({ ...ALL, archTall: null }, NEW_TITLE_STATE, TALL);
  assert.equal(layer(layers, 'arch').shape, 'wide');
  assert.deepEqual(layer(layers, 'arch').cast?.[0].spot, CAST_SPOTS.wide.heroes);
});

test('titleLayers: the lamps are those of the valley actually drawn', () => {
  const mending = titleLayers(ALL, { valley: 'mending', company: [] }, WIDE);
  assert.deepEqual(layer(mending, 'valley').lamps, LAMP_SPOTS.wide.mending);
  const fellBack = titleLayers({ ...ALL, valleyMendingWide: null, valleyMendingTall: null }, { valley: 'mending', company: [] }, WIDE);
  assert.equal(layer(fellBack, 'valley').src, ALL.valleyCutWide);
  assert.deepEqual(layer(fellBack, 'valley').lamps, LAMP_SPOTS.wide.cut);
  const regrown = titleLayers(ALL, { valley: 'regrown', company: [] }, TALL);
  assert.deepEqual(layer(regrown, 'valley').lamps, [], 'the last machine is still');
});

test('titleLayers: with no valley the scene is the code-drawn gradient, with no mist or lamps', () => {
  const layers = titleLayers(NONE, NEW_TITLE_STATE, WIDE);
  assert.deepEqual(layers.map((l) => l.id), ['valley', 'motes', 'title', 'controls']);
  assert.equal(layer(layers, 'valley').src, null);
  assert.deepEqual(layer(layers, 'valley').lamps, []);
});

test('titleLayers: one fern is enough for the fern layer; none leaves it out', () => {
  const one = titleLayers({ ...ALL, fernRight: null }, NEW_TITLE_STATE, WIDE);
  assert.deepEqual(layer(one, 'ferns').ferns, { left: ALL.fernLeft, right: null });
  const none = titleLayers({ ...ALL, fernLeft: null, fernRight: null }, NEW_TITLE_STATE, WIDE);
  assert.ok(!none.some((l) => l.id === 'ferns'));
});

test('titleLayers: reduced motion yields no animation on any layer', () => {
  for (const assets of [NONE, ALL]) {
    const layers = titleLayers(assets, NEW_TITLE_STATE, { wide: false, reducedMotion: true });
    assert.ok(layers.length > 0);
    assert.ok(layers.every((l) => l.animated === false));
  }
});

/** @param {{width: number, height: number, left: number, top: number}} box */
const rounded = (box) => Object.fromEntries(
  Object.entries(box).map(([k, v]) => [k, Math.round(v * 100) / 100 + 0]),
);

test('coverBox: the smallest box of the painting\'s shape that covers the screen, bottoms together', () => {
  assert.deepEqual(rounded(coverBox(1600, 900, 1.5, 0.3)), { width: 1600, height: 1066.67, left: 0, top: -166.67 });
  assert.deepEqual(rounded(coverBox(900, 900, 1.5, 0.3)), { width: 1350, height: 900, left: -135, top: 0 });
  assert.deepEqual(rounded(coverBox(390, 844, 2 / 3, 0.5)), { width: 562.67, height: 844, left: -86.33, top: 0 });
});

test('every spot is inside its painting', () => {
  for (const shape of /** @type {const} */ (['wide', 'tall'])) {
    assert.deepEqual(Object.keys(CAST_SPOTS[shape]).sort(), [...CAST_ORDER].sort());
    for (const [id, spot] of Object.entries(CAST_SPOTS[shape])) {
      assert.ok(spot.left >= 0 && spot.left + spot.width <= 100, `${shape} ${id} across`);
      assert.ok(spot.bottom >= 0 && spot.bottom < 100 && spot.width > 0, `${shape} ${id} up`);
    }
    for (const lamps of Object.values(LAMP_SPOTS[shape])) {
      for (const lamp of lamps) {
        assert.ok(lamp.left >= 0 && lamp.left <= 100 && lamp.top >= 0 && lamp.top <= 100);
      }
    }
  }
});

test('coverBox: a box taller than the screen gives up focusY of its overhang at the bottom', () => {
  // 2520x1080 under a 3:2 painting: 1680 high, 600 too many.
  assert.deepEqual(rounded(coverBox(2520, 1080, 1.5, 0.2, 0)), { width: 2520, height: 1680, left: 0, top: -600 });
  assert.deepEqual(rounded(coverBox(2520, 1080, 1.5, 0.2, 0.25)), { width: 2520, height: 1680, left: 0, top: -450 });
});

test('no window shape crops the fox or the hedgehog', () => {
  // A square, an ultra-wide, a tall phone, a small phone, a tablet upright.
  for (const [w, h] of [[1000, 1000], [2520, 1080], [900, 1950], [360, 640], [1024, 1366]]) {
    const shape = shapeFor(w >= h);
    const box = coverBox(w, h, ARCH_RATIO[shape], FOCUS_X[shape], FOCUS_Y[shape]);
    const spot = CAST_SPOTS[shape].heroes;
    const left = box.left + (spot.left / 100) * box.width;
    const right = left + (spot.width / 100) * box.width;
    assert.ok(left >= 0, `${w}x${h}: the pair start at ${left.toFixed(1)}px`);
    assert.ok(right <= w, `${w}x${h}: the pair end at ${right.toFixed(1)}px of ${w}`);
    // The pair are about as tall as they are wide: ears to feet inside the screen.
    const feet = box.top + box.height * (1 - spot.bottom / 100);
    const ears = feet - (spot.width / 100) * box.width * 1.02;
    assert.ok(ears >= 0, `${w}x${h}: the fox's ears are at ${ears.toFixed(1)}px`);
    assert.ok(feet <= h, `${w}x${h}: their feet are at ${feet.toFixed(1)}px of ${h}`);
  }
});
