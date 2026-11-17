// The menus (play-feel spec, "Changed after Jake's playtest of the full
// build"): portraits, where the deploy panel goes, the trading post's
// scene and greeting, and the unit card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { BAND_TYPES } from '../js/engine/units.js';
import { parseGrid } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { PALETTE, ANIMAL, RUST } from '../js/ui/patterns.js';
import {
  SHOPKEEPER, portraitSpec, shopkeeperSpec, portraitFile, drawPortrait, portraitSvg,
} from '../js/ui/portraits.js';
import { panelHalf, underHalf, HALVES } from '../js/ui/menu-layout.js';
import { shopScene, drawShopScene, shopGreeting } from '../js/ui/shop-scene.js';
import { renderUnitCard, nextTierLine, markCounts } from '../js/ui/unit-card.js';
import { unitCard, SPEED_SCALE } from '../js/ui/unit-info.js';
import { valleyProgress } from './helpers.mjs';

installFakeDom({ canvas: true });

const COLOURS = new Set(Object.values(PALETTE).map((c) => c.toLowerCase()));

// --- portraits ---

test('portrait files follow the assets/portraits/<id>.webp convention', () => {
  assert.equal(SHOPKEEPER.id, 'shopkeeper');
  assert.equal(portraitFile('owl'), 'assets/portraits/owl.webp');
  assert.equal(portraitFile('shopkeeper'), 'assets/portraits/shopkeeper.webp');
  assert.equal(portraitFile('fox-surprised'), 'assets/portraits/fox-surprised.webp');
});

test('until there is an image, the portrait is the band\'s stamp on its disc', () => {
  assert.deepEqual(portraitSpec('ants', []), {
    kind: 'stamp', glyph: BAND_TYPES.ants.glyph, disc: ANIMAL, rim: PALETTE.ANIMAL_DARK, alt: 'Ants',
  });
  assert.equal(portraitSpec('saw', []).kind, 'stamp');
  assert.equal(/** @type {any} */ (portraitSpec('saw', [])).disc, RUST);
  assert.deepEqual(portraitSpec('owl', ['owl']), {
    kind: 'image', href: 'assets/portraits/owl.webp', alt: 'Owl',
  });
  assert.equal(shopkeeperSpec([]).kind, 'stamp');
  assert.deepEqual(shopkeeperSpec(['shopkeeper']), {
    kind: 'image', href: 'assets/portraits/shopkeeper.webp', alt: 'Hazel, the keeper of the trading post',
  });
});

test('a stamp portrait draws the disc and the large silhouette; an image is clipped round', () => {
  const svg = portraitSvg(portraitSpec('bees', []));
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.getAttribute('aria-label'), 'Bees');
  const disc = svg.querySelector('circle');
  assert.equal(disc.getAttribute('fill'), ANIMAL);
  const glyph = svg.querySelector('[data-glyph]');
  assert.equal(glyph.tag, 'image');
  assert.ok(Number(glyph.getAttribute('width')) > 30, 'drawn large');

  const parent = new FakeEl('svg');
  drawPortrait(/** @type {any} */ (parent), { kind: 'image', href: 'a.webp', alt: 'A' }, 10, 10, 8);
  const image = parent.all().find((e) => e.tag === 'image' && e.getAttribute('href') === 'a.webp');
  assert.ok(image, 'the portrait image, over its fallback stamp');
  assert.match(image.getAttribute('clip-path'), /url\(#/);
  assert.ok(parent.querySelector('clipPath'));
});

// --- the deploy panel ---

test('a tile is under a half when any of it is', () => {
  assert.equal(underHalf('top', [0, 3], 8, 8), true);
  assert.equal(underHalf('top', [0, 4], 8, 8), false);
  assert.equal(underHalf('bottom', [0, 4], 8, 8), true);
  assert.equal(underHalf('left', [3, 0], 8, 8), true);
  assert.equal(underHalf('right', [3, 0], 8, 8), false);
  // On an odd board the middle row is under both.
  assert.equal(underHalf('top', [0, 3], 7, 7), true);
  assert.equal(underHalf('bottom', [0, 3], 7, 7), true);
});

test('the panel takes the half away from the deploy tiles', () => {
  assert.equal(panelHalf([[0, 7], [1, 7]], 8, 8), 'top');
  assert.equal(panelHalf([[0, 0], [1, 0]], 8, 8), 'bottom');
  // A wide half beats a tall one, even when the tall one is farther.
  assert.equal(panelHalf([[0, 6], [0, 7]], 8, 8), 'top');
  // Deploy tiles at the top and the bottom on the left: the right half.
  assert.equal(panelHalf([[2, 3], [0, 7]], 8, 8), 'right');
  assert.equal(panelHalf([[6, 0], [7, 7]], 8, 8), 'left');
  // No free half: below the board.
  assert.equal(panelHalf([[0, 0], [7, 7]], 8, 8), null);
});

test('on every level the panel covers no deploy tile', () => {
  for (const level of LEVELS) {
    const { width, height, deployTiles } = parseGrid(level.grid);
    const half = panelHalf(deployTiles, width, height);
    if (half === null) continue;
    assert.ok(HALVES.includes(half));
    for (const tile of deployTiles) {
      assert.equal(underHalf(half, tile, width, height), false, `${level.id}: ${tile} under the ${half} panel`);
    }
  }
});

// --- the trading post ---

test('the shop scene has a counter, shelves, goods, a lamp and its warm light', () => {
  const scene = shopScene();
  const parts = new Set(scene.shapes.map((s) => s.part));
  for (const part of ['wall', 'window', 'shelf', 'goods', 'lamp', 'glow', 'counter']) {
    assert.ok(parts.has(part), `the scene has a ${part}`);
  }
  assert.ok(scene.shapes.filter((s) => s.layer === 'front').every((s) => s.part === 'counter' || s.part === 'goods'));
  assert.ok(scene.shapes.some((s) => s.part === 'counter' && s.layer === 'front'));
});

test('the shop scene uses the game\'s palette, and no filters', () => {
  for (const shape of shopScene().shapes) {
    for (const key of ['fill', 'stroke']) {
      const v = shape.attrs[key];
      if (v === undefined || v === 'none') continue;
      assert.ok(COLOURS.has(String(v).toLowerCase()), `${shape.part} ${key} ${v} is in the palette`);
    }
    assert.equal(shape.attrs.filter, undefined);
  }
});

test('the keeper sits behind the counter, inside the scene', () => {
  const { keeper, width, height, counterTop } = shopScene();
  assert.ok(keeper.cx - keeper.r >= 0 && keeper.cx + keeper.r <= width);
  assert.ok(keeper.cy - keeper.r >= 10, 'below the beam');
  assert.ok(keeper.cy < counterTop, 'its face above the counter');
  assert.ok(keeper.cy + keeper.r > counterTop, 'the counter in front of it');
  assert.ok(keeper.cy + keeper.r < height);
});

test('drawing the scene puts the keeper between the shop and the counter', () => {
  const svg = new FakeEl('svg');
  drawShopScene(/** @type {any} */ (svg), shopkeeperSpec());
  const layers = svg.children.map((c) => c.getAttribute('data-layer'));
  assert.deepEqual(layers, ['back', 'keeper', 'front']);
  assert.ok(svg.children[1].querySelector('[data-portrait]'));
  assert.equal(svg.getAttribute('viewBox'), `0 0 ${shopScene().width} ${shopScene().height}`);
});

test('the keeper\'s greeting follows the purse', () => {
  const p = valleyProgress();
  p.seeds = 0;
  assert.match(shopGreeting(p), /empty pouch/i);
  p.seeds = 5;
  assert.match(shopGreeting(p), /^You'll want 10 seeds/);
  p.seeds = 12;
  assert.match(shopGreeting(p), /^Fresh recruits/);
  // The cheapest band for hire that the purse covers.
  p.seeds = 55;
  assert.equal(BAND_TYPES.bees.price, 30);
  assert.equal(shopGreeting(p), 'Bees for hire! 30 seeds and they\'re yours.');
  p.bands.bees = { maxLen: 2 };
  assert.equal(shopGreeting(p), 'Owl for hire! 50 seeds and they\'re yours.');

  const all = valleyProgress();
  for (const def of Object.values(BAND_TYPES)) {
    if (def.side === 'us') all.bands[def.id] = { maxLen: def.maxLenCap };
  }
  all.seeds = 1000;
  assert.match(shopGreeting(all), /bought me out/);
});

// --- the unit card ---

test('the unit card shows the portrait, name, speed and length, and every action', () => {
  const card = renderUnitCard(unitCard('ants', 5));
  assert.equal(card.dataset.unit, 'ants');
  const art = card.all().find((n) => n.className === 'unit-card__art');
  assert.ok(art, 'the cut-out portrait');
  assert.equal(art.src, 'assets/portraits/ants.webp');
  assert.equal(art.parent.className, 'unit-card__figure', 'unframed: no disc and no box around it');
  assert.equal(art.parent.children.length, 1);
  const text = card.text;
  assert.match(text, /Ants/);
  assert.match(text, /Speed 3 · Length 5, up to 12/, 'speed and length in words, for a screen reader');
  assert.match(text, /Bite Deals 1 damage to an enemy next to it\./);
  assert.match(text, /At length 6: becomes Ant Colony and learns Ram:/);
  assert.equal(card.className, 'unit-card ui-panel--parchment', 'a card on the kit\'s parchment');
  const compact = renderUnitCard(unitCard('ants', 5), { compact: true });
  assert.equal(compact.className, 'unit-card ui-panel--parchment unit-card--compact');
  assert.doesNotMatch(compact.text, /At length 6/, 'no next tier on the deploy screen, where nothing can be bought');
});

test('speed is drawn as pips and length as linked dots, the room to grow hollow', () => {
  const card = renderUnitCard(unitCard('ants', 6));
  const dots = (kind) => card.all().find((n) => n.className === `unit-card__dots unit-card__dots--${kind}`).children;
  assert.equal(dots('pips').length, SPEED_SCALE);
  assert.equal(dots('pips').filter((d) => d.className.includes('is-filled')).length, 3);
  assert.equal(dots('chain').length, 12);
  assert.equal(dots('chain').filter((d) => d.className.includes('is-filled')).length, 6);
  const drawn = card.all().find((n) => n.className === 'unit-card__marks-drawn');
  assert.equal(drawn.getAttribute('aria-hidden'), 'true', 'the marks are read out as words instead');
  assert.deepEqual(markCounts(unitCard('owl', 2)), { speed: { filled: 4, hollow: SPEED_SCALE - 4 }, length: { filled: 2, hollow: 0 } });
  assert.deepEqual(markCounts(unitCard('fox', 2)).length, { filled: 2, hollow: 2 });
});

test('each action and each trait is one row: its label, then its sentence', () => {
  const card = renderUnitCard(unitCard('ants', 6));
  const rows = card.all().filter((n) => typeof n.className === 'string' && n.className.startsWith('unit-card__row '));
  assert.deepEqual(rows.map((r) => r.dataset.action), ['bite', 'ram']);
  for (const r of rows) {
    assert.equal(r.children[0].className, 'unit-card__label');
    assert.equal(r.children[r.children.length - 1].className, 'unit-card__text');
  }
  const hedgehog = renderUnitCard(unitCard('hedgehog', 2));
  const bristle = hedgehog.all().find((n) => n.dataset?.trait === 'bristle');
  assert.equal(bristle.text, 'Bristle A bot that strikes it takes 1 damage.');
  const bees = renderUnitCard(unitCard('bees', 1));
  assert.equal(bees.all().find((n) => n.dataset?.trait === 'slips').text,
    'Slips through other bands, friend or bot, but must end its move on free ground.');
});

test('a band with no portrait shows its stamp in the portrait\'s place; a failed image gives way to it', () => {
  const card = renderUnitCard(unitCard('fox', 2));
  const art = card.all().find((n) => n.className === 'unit-card__art');
  const fig = art.parent;
  art.dispatch('error');
  assert.equal(fig.children.length, 1);
  assert.equal(fig.children[0].tag, 'svg');
  assert.equal(fig.children[0].getAttribute('class'), 'unit-card__stamp');
});

test('the card shows traits, and no tier line once the last tier is reached', () => {
  const owl = renderUnitCard(unitCard('owl', 1));
  assert.match(owl.text, /Flies over water and holes/);
  assert.equal(nextTierLine(unitCard('badger', 3)), null);
  assert.equal(nextTierLine(unitCard('ants', 12)), null);
  assert.equal(nextTierLine(unitCard('ants', 7)), 'At length 9: becomes Supercolony.');
});

test('the painted shop: three layers when both pictures exist, else none', async () => {
  const { shopLayers, KEEPER_PLACE, shortGreeting } = await import('../js/ui/shop-scene.js');
  const keeper = shopkeeperSpec(['shopkeeper']);
  const both = { interior: 'assets/shop/shop-interior.webp', counter: 'assets/shop/shop-counter.webp' };
  assert.deepEqual(shopLayers(both, keeper), {
    interior: both.interior,
    keeper: { href: 'assets/portraits/shopkeeper.webp', ...KEEPER_PLACE },
    counter: both.counter,
  });
  assert.equal(shopLayers({}, keeper), null);
  assert.equal(shopLayers({ interior: both.interior }, keeper), null);
  assert.equal(shopLayers({ counter: both.counter }, keeper), null);
  assert.equal(shopLayers(both, shopkeeperSpec([])), null, 'a stamp cannot stand behind a painted counter');
  // She stands in the middle, inside the picture, her head below the top.
  assert.ok(KEEPER_PLACE.left > 0 && KEEPER_PLACE.left + KEEPER_PLACE.size < 1);
  const heightShare = KEEPER_PLACE.size * 1.5;
  assert.ok(KEEPER_PLACE.top > 0 && KEEPER_PLACE.top + heightShare > 2 / 3, 'the counter hides her lower edge');
  assert.equal(shortGreeting(30, 12), 'Ah, that one\'s 30 seeds, and you\'re 18 short. Win a few more and I\'ll keep it for you.');
});
