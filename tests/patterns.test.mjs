import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as patterns from '../js/ui/patterns.js';
import {
  PALETTE, GROUND, GROUND_KEYS, REQUIRED_TEXTURES, OPTIONAL_TEXTURES,
  FALLBACK_SPAN, TEXTURE_SPAN,
  groundKey, fallbackPattern, groundPattern, patternId, groundFill, textureUrl,
  definePattern, defineGroundPatterns,
} from '../js/ui/patterns.js';
import { TEXTURES_PRESENT } from '../js/ui/texture-list.js';

// The board's tile size in board units (TILE in js/ui/board.js). Not
// imported, so these tests do not depend on the board module loading.
const TILE = 40;

const TERRAIN_KINDS = [
  'open', 'forest', 'stubble', 'paving', 'water', 'hole', 'dam', 'stones', 'habitat', 'habitatDamaged',
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// --- palette ---

test('the palette is named constants, each a six-digit hex colour', () => {
  const names = Object.keys(PALETTE);
  assert.ok(names.length >= 12);
  for (const name of names) {
    assert.match(PALETTE[name], /^#[0-9a-f]{6}$/, name);
    assert.equal(patterns[name], PALETTE[name], `${name} is also exported by name`);
    assert.match(name, /^[A-Z][A-Z_]*$/, `${name} is a constant name`);
  }
});

test('the palette fits the spec: warm greens, earth browns, river blues; rust, steel and hazard yellow', () => {
  for (const name of ['GRASS', 'MEADOW', 'FOREST_FLOOR']) {
    const [r, g, b] = rgb(PALETTE[name]);
    assert.ok(g > r && g > b, `${name} is green`);
    assert.ok(r > b, `${name} is a warm green`);
  }
  for (const name of ['SOIL', 'STUBBLE', 'BANK']) {
    const [r, g, b] = rgb(PALETTE[name]);
    assert.ok(r > g && g > b, `${name} is an earth brown`);
  }
  {
    const [r, g, b] = rgb(PALETTE.WATER);
    assert.ok(b > g && g > r, 'WATER is a river blue');
  }
  {
    const [r, g, b] = rgb(PALETTE.RUST);
    assert.ok(r > 150 && r > g && g > b, 'RUST is rust');
  }
  {
    const [r, g, b] = rgb(PALETTE.STEEL);
    assert.ok(Math.abs(r - g) < 24 && b >= r, 'STEEL is a cool grey');
  }
  {
    const [r, g, b] = rgb(PALETTE.HAZARD);
    assert.ok(r > 200 && g > 160 && b < 110, 'HAZARD is yellow');
  }
  {
    const [r, g, b] = rgb(PALETTE.FRAME);
    assert.ok(g > r && g > b && g < 90, 'FRAME is a deep forest green');
  }
});

// --- which ground a tile gets ---

test('every terrain kind, the two habitat kinds included, has a ground', () => {
  for (const kind of TERRAIN_KINDS) {
    for (const under of [null, 'water', 'hole']) {
      const key = groundKey({ kind, variant: null, under });
      assert.ok(GROUND_KEYS.includes(key), `${kind} has ground ${key}`);
      assert.ok(GROUND[key] !== undefined);
    }
  }
  assert.equal(groundKey({ kind: 'habitat', variant: null, under: null }), 'habitat');
  assert.equal(groundKey({ kind: 'habitatDamaged', variant: null, under: null }), 'habitatDamaged');
  assert.notEqual(GROUND.habitat.colour, GROUND.habitatDamaged.colour);
});

test('a dam shows what it was built over', () => {
  assert.equal(groundKey({ kind: 'dam', variant: null, under: 'water' }), 'water');
  assert.equal(groundKey({ kind: 'dam', variant: null, under: 'hole' }), 'hole');
  assert.equal(groundKey({ kind: 'dam', variant: null, under: null }), 'water');
});

test('open ground is grass, meadow where flowers grow, and bank beside water', () => {
  assert.equal(groundKey({ kind: 'open', variant: 'grass', under: null }), 'open');
  assert.equal(groundKey({ kind: 'open', variant: 'mushrooms', under: null }), 'open');
  assert.equal(groundKey({ kind: 'open', variant: 'flowers', under: null }), 'meadow');
  assert.equal(groundKey({ kind: 'open', variant: 'grass', under: null }, true), 'bank');
  assert.equal(groundKey({ kind: 'open', variant: 'flowers', under: null }, true), 'bank');
  // Only open ground turns to bank.
  assert.equal(groundKey({ kind: 'forest', variant: null, under: null }, true), 'forest');
  assert.equal(groundKey({ kind: 'paving', variant: null, under: null }, true), 'paving');
});

test('an unknown terrain kind falls back to open ground', () => {
  assert.equal(groundKey({ kind: 'lava', variant: null, under: null }), 'open');
});

test('the grounds use the textures the spec lists', () => {
  assert.deepEqual(REQUIRED_TEXTURES, ['grass', 'soil', 'water', 'stubble', 'paving', 'stone']);
  assert.deepEqual(OPTIONAL_TEXTURES, ['meadow', 'bank']);
  const known = new Set([...REQUIRED_TEXTURES, ...OPTIONAL_TEXTURES]);
  const used = new Set();
  for (const key of GROUND_KEYS) {
    const textures = GROUND[key].textures;
    assert.ok(textures.length > 0, `${key} has no texture`);
    for (const name of textures) {
      assert.ok(known.has(name), `${key} uses unknown texture ${name}`);
      used.add(name);
    }
    // An optional texture is always backed by a required one.
    assert.ok(REQUIRED_TEXTURES.includes(textures[textures.length - 1]), `${key} ends on a required texture`);
  }
  assert.deepEqual([...used].sort(), [...known].sort(), 'every texture is used by some ground');
  assert.deepEqual(GROUND.open.textures, ['grass']);
  assert.deepEqual(GROUND.hole.textures, ['soil']);
  assert.deepEqual(GROUND.water.textures, ['water']);
  assert.deepEqual(GROUND.stubble.textures, ['stubble']);
  assert.deepEqual(GROUND.paving.textures, ['paving']);
  assert.deepEqual(GROUND.stones.textures, ['stone']);
});

// --- the fallback: a flat colour plus subtle code-made noise ---

test('fallback: every ground has a flat colour and a subtle noise of specks', () => {
  for (const key of GROUND_KEYS) {
    const spec = fallbackPattern(key);
    assert.equal(spec.id, patternId(key));
    assert.equal(spec.id, `ug-ground-${key}`);
    assert.equal(spec.colour, GROUND[key].colour);
    assert.match(spec.colour, /^#[0-9a-f]{6}$/);
    assert.equal(spec.image, null);
    assert.equal(spec.tint, null);
    assert.equal(spec.size, FALLBACK_SPAN);
    assert.ok(spec.specks.length >= 24, `${key} has too little noise`);
    for (const speck of spec.specks) {
      assert.match(speck.colour, /^#[0-9a-f]{6}$/);
      assert.notEqual(speck.colour, spec.colour, 'a speck the colour of the ground is invisible');
      assert.ok(speck.opacity >= 0.1 && speck.opacity <= 0.45, `${key} speck opacity ${speck.opacity} is not subtle`);
      assert.ok(speck.r >= 0.4 && speck.r <= 2, `${key} speck size ${speck.r}`);
      // Whole specks only: nothing is cut off where the pattern repeats.
      assert.ok(speck.x - speck.r >= 0 && speck.x + speck.r <= spec.size);
      assert.ok(speck.y - speck.r >= 0 && speck.y + speck.r <= spec.size);
    }
    const colours = new Set(spec.specks.map((s) => s.colour));
    assert.ok(colours.size >= 2, `${key} noise has lighter and darker specks`);
  }
});

test('fallback: the noise is the same every time, and differs from ground to ground', () => {
  assert.deepEqual(fallbackPattern('open'), fallbackPattern('open'));
  assert.notDeepEqual(
    fallbackPattern('open').specks.map((s) => [s.x, s.y]),
    fallbackPattern('stubble').specks.map((s) => [s.x, s.y]),
  );
});

test('patterns span more than one tile and each ground starts its repeat somewhere else', () => {
  assert.ok(FALLBACK_SPAN > TILE && FALLBACK_SPAN % TILE === 0);
  assert.ok(TEXTURE_SPAN > TILE && TEXTURE_SPAN % TILE === 0);
  const origins = new Set(GROUND_KEYS.map((key) => {
    const spec = fallbackPattern(key);
    assert.ok(spec.x >= 0 && spec.x < spec.size && spec.y >= 0 && spec.y < spec.size);
    return `${spec.x},${spec.y}`;
  }));
  assert.equal(origins.size, GROUND_KEYS.length);
});

// --- textures, when present ---

test('with no textures listed, every ground is its fallback', () => {
  for (const key of GROUND_KEYS) {
    assert.deepEqual(groundPattern(key, []), fallbackPattern(key));
  }
});

test('a ground whose texture is listed as present uses the texture instead', () => {
  const spec = groundPattern('open', ['grass']);
  assert.equal(spec.id, patternId('open'), 'same id, so the board does not care which it got');
  assert.equal(spec.image, 'assets/textures/grass.webp');
  assert.equal(spec.image, textureUrl('grass'));
  assert.equal(spec.size, TEXTURE_SPAN);
  assert.deepEqual(spec.specks, [], 'no code-made noise over a painted texture');
  assert.equal(spec.colour, GROUND.open.colour, 'the flat colour stays underneath while the image loads');
  // The others are not affected.
  assert.deepEqual(groundPattern('water', ['grass']), fallbackPattern('water'));
  assert.equal(groundPattern('hole', ['grass', 'soil']).image, 'assets/textures/soil.webp');
  assert.equal(groundPattern('stones', ['stone']).image, 'assets/textures/stone.webp');
});

test('an optional texture is used when present, and its required stand-in when not', () => {
  assert.equal(groundPattern('meadow', ['grass', 'meadow']).image, 'assets/textures/meadow.webp');
  assert.equal(groundPattern('meadow', ['grass']).image, 'assets/textures/grass.webp');
  assert.equal(groundPattern('bank', ['grass', 'bank']).image, 'assets/textures/bank.webp');
  assert.equal(groundPattern('bank', ['grass']).image, 'assets/textures/grass.webp');
  assert.deepEqual(groundPattern('bank', ['water']), fallbackPattern('bank'));
});

test('grounds that share a texture are told apart by a tint over it', () => {
  const forest = groundPattern('forest', ['grass']);
  const habitat = groundPattern('habitat', ['grass']);
  const damaged = groundPattern('habitatDamaged', ['grass']);
  assert.equal(forest.image, 'assets/textures/grass.webp');
  assert.equal(groundPattern('open', ['grass']).tint, null);
  for (const spec of [forest, habitat, damaged]) {
    assert.ok(spec.tint !== null);
    assert.match(spec.tint.colour, /^#[0-9a-f]{6}$/);
    assert.ok(spec.tint.opacity > 0 && spec.tint.opacity <= 0.5);
  }
  assert.notDeepEqual(habitat.tint, damaged.tint);
});

test('groundPattern reads the generated texture list by default', () => {
  assert.ok(Array.isArray(TEXTURES_PRESENT));
  for (const key of GROUND_KEYS) {
    assert.deepEqual(groundPattern(key), groundPattern(key, TEXTURES_PRESENT));
  }
});

test('an unknown name in the list is ignored', () => {
  assert.deepEqual(groundPattern('open', ['lava', 'GRASS']), fallbackPattern('open'));
});

test('groundFill points at the pattern', () => {
  assert.equal(groundFill('habitat'), 'url(#ug-ground-habitat)');
});

// --- the SVG definitions, built with js/ui/svg.js against a tiny fake DOM ---

function withFakeDocument(run) {
  const had = Object.hasOwn(globalThis, 'document');
  const before = globalThis.document;
  globalThis.document = {
    createElementNS(ns, tag) {
      return {
        ns,
        tag,
        attrs: {},
        children: [],
        setAttribute(k, v) { this.attrs[k] = v; },
        appendChild(child) { this.children.push(child); return child; },
      };
    },
  };
  try {
    return run(globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'defs'));
  } finally {
    if (had) globalThis.document = before;
    else delete globalThis.document;
  }
}

test('definePattern: a fallback becomes a user-space <pattern> of a colour rect and specks', () => {
  withFakeDocument((defs) => {
    const spec = fallbackPattern('stubble');
    const pattern = definePattern(defs, spec);
    assert.equal(defs.children.length, 1);
    assert.equal(defs.children[0], pattern);
    assert.equal(pattern.tag, 'pattern');
    assert.equal(pattern.ns, 'http://www.w3.org/2000/svg');
    assert.deepEqual(pattern.attrs, {
      id: 'ug-ground-stubble',
      x: String(spec.x),
      y: String(spec.y),
      width: String(spec.size),
      height: String(spec.size),
      patternUnits: 'userSpaceOnUse',
    });
    const [base, ...rest] = pattern.children;
    assert.equal(base.tag, 'rect');
    assert.equal(base.attrs.fill, spec.colour);
    assert.equal(base.attrs.width, String(spec.size));
    assert.equal(base.attrs.height, String(spec.size));
    assert.equal(rest.length, spec.specks.length);
    rest.forEach((circle, i) => {
      assert.equal(circle.tag, 'circle');
      assert.deepEqual(circle.attrs, {
        cx: String(spec.specks[i].x),
        cy: String(spec.specks[i].y),
        r: String(spec.specks[i].r),
        fill: spec.specks[i].colour,
        opacity: String(spec.specks[i].opacity),
      });
    });
  });
});

test('definePattern: a texture becomes colour rect, image, then tint', () => {
  withFakeDocument((defs) => {
    const pattern = definePattern(defs, groundPattern('forest', ['grass']));
    assert.deepEqual(pattern.children.map((c) => c.tag), ['rect', 'image', 'rect']);
    const [, image, tint] = pattern.children;
    assert.equal(image.attrs.href, 'assets/textures/grass.webp');
    assert.equal(image.attrs.width, String(TEXTURE_SPAN));
    assert.equal(image.attrs.height, String(TEXTURE_SPAN));
    assert.equal(image.attrs.preserveAspectRatio, 'none');
    assert.equal(tint.attrs.fill, GROUND.forest.tint.colour);
    assert.equal(tint.attrs.opacity, String(GROUND.forest.tint.opacity));

    const plain = definePattern(defs, groundPattern('open', ['grass']));
    assert.deepEqual(plain.children.map((c) => c.tag), ['rect', 'image']);
  });
});

test('defineGroundPatterns: defines one pattern per ground and returns their fills', () => {
  withFakeDocument((defs) => {
    const fills = defineGroundPatterns(defs, ['water']);
    assert.equal(defs.children.length, GROUND_KEYS.length);
    assert.deepEqual(defs.children.map((p) => p.attrs.id), GROUND_KEYS.map(patternId));
    for (const key of GROUND_KEYS) assert.equal(fills[key], `url(#ug-ground-${key})`);
    const water = defs.children[GROUND_KEYS.indexOf('water')];
    assert.ok(water.children.some((c) => c.tag === 'image'));
    const open = defs.children[GROUND_KEYS.indexOf('open')];
    assert.ok(!open.children.some((c) => c.tag === 'image'));
  });
});
