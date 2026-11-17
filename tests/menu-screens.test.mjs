// The deploy screen's band panel and the trading post, mounted on the
// fake DOM (play-feel spec, "Changed after Jake's playtest of the full
// build").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { renderDeploy } from '../js/ui/deploy-view.js';
import { renderShop, dealText } from '../js/ui/shop-view.js';
import { shopItems } from '../js/campaign/shop.js';
import { parseGrid } from '../js/engine/battle.js';
import { LEVELS } from '../data/levels/index.js';
import { panelHalf } from '../js/ui/menu-layout.js';
import { valleyProgress, fakeClock } from './helpers.mjs';

installFakeDom({ canvas: true });

/** @param {FakeEl} root @param {string} cls */
const byClass = (root, cls) => root.all().filter((n) => typeof n.className === 'string' && n.className.split(' ').includes(cls));
/** @param {FakeEl} root @param {string} text */
const button = (root, text) => root.all().find((n) => n.tag === 'button' && n.text.includes(text));

/** @param {import('../js/engine/types.js').Level} level */
function deploy(level, progress = valleyProgress()) {
  const root = new FakeEl('div');
  /** @type {any[]} */
  const started = [];
  renderDeploy(/** @type {any} */ (root), { level, progress, onStart: (d) => started.push(d), onBack() {} });
  const svg = root.all().find((n) => n.tag === 'svg');
  return {
    root,
    started,
    panel: () => byClass(root, 'deploy-panel')[0],
    roster: () => byClass(root, 'roster-btn'),
    tap: (/** @type {[number, number]} */ [x, y]) => svg.dispatch('pointerup', { clientX: x * 40 + 20, clientY: y * 40 + 20, pointerType: 'touch' }),
  };
}

test('the deploy screen opens with the first band\'s card over the half away from the deploy tiles', () => {
  const level = LEVELS.find((l) => l.id === 'l01');
  const ui = deploy(level);
  const panel = ui.panel();
  assert.ok(panel, 'a panel');
  const { deployTiles, width, height } = parseGrid(level.grid);
  const half = panelHalf(deployTiles, width, height);
  assert.ok(panel.className.includes(`deploy-panel--${half}`));
  assert.equal(panel.hidden, false);
  assert.equal(panel.parent.className, 'board-wrap', 'over the board, not over the Start button');
  // The first band owned, in BAND_TYPES order: every save has the fox.
  const card = byClass(panel, 'unit-card')[0];
  assert.equal(card.dataset.unit, 'fox');
  assert.match(card.text, /Bite/);
  assert.match(card.text, /Speed 3/);
});

test('choosing another band shows its card; the hide button tucks it away', () => {
  const ui = deploy(LEVELS.find((l) => l.id === 'l01'));
  const badger = ui.roster().find((b) => b.text.includes('Badger'));
  badger.dispatch('click');
  assert.equal(byClass(ui.panel(), 'unit-card')[0].dataset.unit, 'badger');
  assert.match(ui.panel().text, /Dig/);
  byClass(ui.panel(), 'deploy-panel__hide')[0].dispatch('click');
  assert.equal(ui.panel().hidden, true);
  assert.equal(byClass(ui.panel(), 'unit-card').length, 0);
  ui.roster().find((b) => b.text.includes('Beaver')).dispatch('click');
  assert.equal(ui.panel().hidden, false);
  assert.equal(byClass(ui.panel(), 'unit-card')[0].dataset.unit, 'beaver');
});

test('placing a band moves on to the next; a full board puts the card away', () => {
  const level = LEVELS.find((l) => l.id === 'l01');
  const ui = deploy(level);
  const { deployTiles } = parseGrid(level.grid);
  ui.tap(deployTiles[0]);
  assert.equal(byClass(ui.panel(), 'unit-card')[0].dataset.unit, 'hedgehog');
  for (let i = 1; i < level.maxBands; i += 1) ui.tap(deployTiles[i]);
  assert.equal(ui.panel().hidden, true, `${level.maxBands} placed: nothing left to choose`);
  // Taking one back chooses it again.
  ui.tap(deployTiles[0]);
  assert.equal(ui.panel().hidden, false);
  assert.equal(byClass(ui.panel(), 'unit-card')[0].dataset.unit, 'fox');
  button(ui.root, 'Start').dispatch('click');
  assert.equal(ui.started.length, 1);
});

test('every level shows the panel off its deploy tiles', () => {
  for (const level of LEVELS) {
    const ui = deploy(level);
    const { deployTiles, width, height } = parseGrid(level.grid);
    const half = panelHalf(deployTiles, width, height);
    assert.equal(ui.panel().className.includes(`deploy-panel--${half ?? 'below'}`), true, level.id);
  }
});

// --- the trading post ---

function shop(seeds = 100, extra = {}) {
  const progress = valleyProgress();
  progress.seeds = seeds;
  const root = new FakeEl('div');
  /** @type {string[]} */
  const bought = [];
  renderShop(/** @type {any} */ (root), { progress, onBuy: (id) => bought.push(id), onBack() {}, ...extra });
  return { root, bought, progress };
}

const PAINTED = { interior: 'assets/shop/shop-interior.webp', counter: 'assets/shop/shop-counter.webp' };

test('the trading post shows its interior, the keeper and a greeting', () => {
  const { root } = shop(100, { assets: {} });
  const scene = root.all().find((n) => n.attrs.class === 'shop-scene');
  assert.equal(scene.tag, 'svg');
  assert.ok(scene.querySelector('[data-part="counter"]'));
  assert.ok(scene.querySelector('[data-portrait]'), 'the keeper\'s portrait');
  const greeting = byClass(root, 'shop-greeting')[0];
  assert.match(greeting.text, /^Hazel /);
});

test('every band for sale and every owned band shows its card, price and what buying changes', () => {
  const { root, bought, progress } = shop(100);
  for (const item of shopItems(progress)) {
    const row = root.all().find((n) => n.dataset?.item === item.id);
    assert.ok(row, item.id);
    assert.equal(byClass(row, 'unit-card')[0].dataset.unit, item.type);
    const price = row.all().find((n) => n.className === 'shop-deal__price');
    assert.equal(price.text, ` ${item.price}`);
    assert.equal(price.children[0].getAttribute('alt'), 'Seeds', 'after the seed icon');
    assert.ok(row.text.includes(dealText(item, progress)));
  }
  const ants = root.all().find((n) => n.dataset?.item === 'recruit:ants');
  assert.match(ants.text, /Next recruit: length 4 → 5\. 2 more to Ant Colony, which learns Ram\./);
  const owl = root.all().find((n) => n.dataset?.item === 'type:owl');
  assert.match(owl.text, /Recruit an Owl band/);
  byClass(owl, 'shop-deal__buy')[0].dispatch('click');
  assert.deepEqual(bought, ['type:owl']);
});

test('a band the purse can\'t cover shows its price, with the button off; a tap makes Hazel say why', () => {
  const { root, bought } = shop(0, { assets: PAINTED });
  const bear = root.all().find((n) => n.dataset?.item === 'type:bear');
  const btn = byClass(bear, 'shop-deal__buy')[0];
  assert.equal(btn.getAttribute('aria-disabled'), 'true');
  assert.ok(btn.classList.contains('is-short'));
  btn.dispatch('click');
  assert.deepEqual(bought, []);
  assert.ok(byClass(bear, 'shop-deal__price')[0].classList.contains('is-short'));
  assert.match(byClass(root, 'shop-greeting')[0].text, /^Hazel Ah, that one's \d+ seeds, and you're \d+ short\./);
  assert.equal(byClass(root, 'shop-painted__keeper')[0].dataset.mood, 'sad');
});

test('with both painted pictures, the shop is layers: the interior, Hazel, her closed eyes, then the counter', () => {
  // An empty purse: nothing to pitch, so her plain portrait.
  const { root } = shop(0, { assets: PAINTED, reducedMotion: false });
  assert.equal(root.all().find((n) => n.attrs.class === 'shop-scene'), undefined, 'no drawn scene');
  const box = byClass(root, 'shop-painted')[0];
  assert.equal(box.getAttribute('role'), 'img');
  assert.match(box.getAttribute('aria-label'), /Hazel/);
  const layers = box.children.map((c) => c.className.split(' ').slice(1).join(' '));
  assert.deepEqual(layers, [
    'shop-painted__interior', 'shop-painted__keeper', 'shop-painted__keeper shop-painted__blink', 'shop-painted__counter',
  ]);
  assert.equal(box.children[0].src, PAINTED.interior);
  assert.equal(box.children[1].src, 'assets/portraits/shopkeeper.webp');
  assert.equal(box.children[2].src, 'assets/portraits/shopkeeper-blink.webp');
  assert.equal(box.children[3].src, PAINTED.counter);
  for (const face of [box.children[1], box.children[2]]) {
    assert.equal(face.style.left, '29.82%');
    assert.equal(face.style.top, '10.84%');
    assert.equal(face.style.width, '40.36%');
  }
  assert.equal(box.children[2].style.opacity, '0', 'eyes open until she blinks');
  for (const img of box.children) assert.equal(img.alt, '', 'the box carries the label');
  // No blink frame, or less motion asked for: no closed-eyes layer.
  for (const extra of [{ portraits: ['shopkeeper'] }, { reducedMotion: true }]) {
    const plain = byClass(shop(0, { assets: PAINTED, ...extra }).root, 'shop-painted')[0];
    assert.equal(plain.children.length, 3, JSON.stringify(extra));
  }
});

test('with only one painted picture, the drawn scene stays', () => {
  for (const assets of [{ interior: PAINTED.interior }, { counter: PAINTED.counter }]) {
    const { root } = shop(100, { assets });
    assert.equal(byClass(root, 'shop-painted').length, 0);
    assert.ok(root.all().find((n) => n.attrs.class === 'shop-scene'));
  }
});

test('Hazel looks happy after a purchase, where she has a happy portrait', async () => {
  const { keeperSpec } = await import('../js/ui/shop-view.js');
  assert.equal(keeperSpec('happy', ['shopkeeper', 'shopkeeper-happy']).href, 'assets/portraits/shopkeeper-happy.webp');
  assert.equal(keeperSpec('happy', ['shopkeeper']).href, 'assets/portraits/shopkeeper.webp');
  assert.equal(keeperSpec(undefined, []).kind, 'stamp');
  assert.match(keeperSpec('sad', ['shopkeeper']).alt, /keeper of the trading post/);
  const { root } = shop(100, { assets: PAINTED, sold: true });
  assert.equal(byClass(root, 'shop-painted__keeper')[0].dataset.mood, 'happy');
});

// --- Hazel's mood ---

test('keeperMood: sold, then short, then greedy on walking in with 100 seeds, then shrewd, then plain', async () => {
  const { keeperMood, GREEDY_SEEDS, MOOD_MS } = await import('../js/ui/shop-view.js');
  assert.equal(GREEDY_SEEDS, 100);
  assert.equal(MOOD_MS, 3000);
  const purse = (/** @type {number} */ seeds) => ({ ...valleyProgress(), seeds });
  // Every flag at once: the first rule wins, and so on down.
  assert.equal(keeperMood({ progress: purse(200), sold: true, short: true, entering: true }), 'happy');
  assert.equal(keeperMood({ progress: purse(200), short: true, entering: true }), 'sad');
  assert.equal(keeperMood({ progress: purse(100), entering: true }), 'greedy');
  assert.equal(keeperMood({ progress: purse(99), entering: true }), 'shrewd', '99 seeds is not enough to look greedy');
  assert.equal(keeperMood({ progress: purse(100) }), 'shrewd', 'after the first tap she pitches');
  // 10 seeds buys nothing here; 0 seeds neither.
  const cheapest = Math.min(...shopItems(purse(0)).filter((i) => i.available).map((i) => i.price));
  assert.equal(keeperMood({ progress: purse(cheapest - 1), entering: true }), undefined);
  assert.equal(keeperMood({ progress: purse(cheapest) }), 'shrewd');
  assert.equal(keeperMood({ progress: purse(0) }), undefined);
  // Greedy needs only the seeds, even with nothing left to buy.
  const { BAND_TYPES } = await import('../js/engine/units.js');
  const boughtOut = purse(500);
  for (const id of Object.keys(BAND_TYPES)) if (BAND_TYPES[id].side === 'us') boughtOut.bands[id] = { maxLen: 99 };
  assert.equal(shopItems(boughtOut).filter((i) => i.available).length, 0, 'bought out');
  assert.equal(keeperMood({ progress: boughtOut, entering: true }), 'greedy');
  assert.equal(keeperMood({ progress: boughtOut }), undefined, 'nothing she offers: plain');
  // Every face lasts three seconds from the start of its moment, then plain.
  for (const [moment, mood] of [
    [{ progress: purse(200), sold: true }, 'happy'],
    [{ progress: purse(40), short: true }, 'sad'],
    [{ progress: purse(120), entering: true }, 'greedy'],
    [{ progress: purse(40) }, 'shrewd'],
  ]) {
    assert.equal(keeperMood({ ...moment, elapsed: 0 }), mood);
    assert.equal(keeperMood({ ...moment, elapsed: MOOD_MS - 1 }), mood);
    assert.equal(keeperMood({ ...moment, elapsed: MOOD_MS }), undefined, `${mood} returns to plain`);
  }
});

test('every mood falls back to Hazel\'s plain portrait when its image is missing', async () => {
  const { keeperSpec } = await import('../js/ui/shop-view.js');
  for (const mood of ['happy', 'sad', 'shrewd', 'greedy']) {
    assert.equal(keeperSpec(mood, ['shopkeeper', `shopkeeper-${mood}`]).href, `assets/portraits/shopkeeper-${mood}.webp`, mood);
    assert.equal(keeperSpec(mood, ['shopkeeper']).href, 'assets/portraits/shopkeeper.webp', mood);
    // Another mood's portrait does not stand in for a missing one.
    const others = ['happy', 'sad', 'shrewd', 'greedy'].filter((m) => m !== mood).map((m) => `shopkeeper-${m}`);
    assert.equal(keeperSpec(mood, ['shopkeeper', ...others]).href, 'assets/portraits/shopkeeper.webp', mood);
  }
});

/** @param {FakeEl} root */
const keeperOf = (root) => byClass(root, 'shop-painted__keeper')[0];

test('in the painted shop Hazel goes greedy, shrewd, sad and happy in one place, at one size', () => {
  /** @type {Array<{mood: string, src: string, left: string, top: string, width: string}>} */
  const seen = [];
  const look = (/** @type {FakeEl} */ root) => {
    const k = keeperOf(root);
    seen.push({ mood: k.dataset.mood, src: k.src, left: k.style.left, top: k.style.top, width: k.style.width });
  };
  // Walks in with 100 seeds: greedy. The first tap, on a card, ends it.
  const rich = shop(100, { assets: PAINTED });
  look(rich.root);
  byClass(rich.root, 'unit-card')[0].dispatch('click');
  look(rich.root);
  // With 40 seeds the bear (60) is too dear: a tap on it makes her sad.
  const some = shop(40, { assets: PAINTED });
  look(some.root);
  const bear = some.root.all().find((n) => n.dataset?.item === 'type:bear');
  byClass(bear, 'shop-deal__buy')[0].dispatch('click');
  look(some.root);
  // Just after a sale: happy.
  look(shop(70, { assets: PAINTED, sold: true }).root);
  // Nothing she can sell: plain.
  look(shop(0, { assets: PAINTED }).root);
  assert.deepEqual(seen.map((s) => s.mood), ['greedy', 'shrewd', 'shrewd', 'sad', 'happy', '']);
  assert.deepEqual(seen.map((s) => s.src), [
    'assets/portraits/shopkeeper-greedy.webp', 'assets/portraits/shopkeeper-shrewd.webp',
    'assets/portraits/shopkeeper-shrewd.webp', 'assets/portraits/shopkeeper-sad.webp', 'assets/portraits/shopkeeper-happy.webp',
    'assets/portraits/shopkeeper.webp',
  ]);
  for (const s of seen) {
    assert.deepEqual([s.left, s.top, s.width], ['29.82%', '10.84%', '40.36%'], `${s.mood || 'plain'} stands where the plain one does`);
  }
});

/** @param {FakeEl} root */
const eyesOf = (root) => byClass(root, 'shop-painted__blink')[0];

/** Lets the images' decoding (a promise) settle. */
const settle = () => new Promise((r) => setImmediate(r));

test('her faces each last three seconds, then she is plain and blinks; a mood face never blinks', async () => {
  const clock = fakeClock([0.3, 0.8, 0.5]);
  const opts = { assets: PAINTED, clock, reducedMotion: false };
  /** Watches her closed eyes from now on: did they ever show, and when. */
  const watch = (/** @type {FakeEl} */ root) => {
    const shut = [];
    const keeper = keeperOf(root);
    const eyes = eyesOf(root);
    return {
      /** @param {number} ms */
      run(ms) {
        for (let t = 0; t < ms; t += 10) {
          clock.advance(10);
          if (eyes.style.opacity === '1') shut.push({ at: clock.now(), mood: keeper.dataset.mood, src: keeper.src });
        }
        return shut;
      },
    };
  };
  // Walks in with 40 seeds: her pitch, shrewd, for three seconds.
  const pitch = shop(40, opts);
  await settle();
  assert.equal(keeperOf(pitch.root).dataset.mood, 'shrewd');
  let w = watch(pitch.root);
  assert.deepEqual(w.run(2990), [], 'no blink while shrewd');
  assert.equal(keeperOf(pitch.root).dataset.mood, 'shrewd');
  w.run(20);
  assert.equal(keeperOf(pitch.root).dataset.mood, '', 'plain after three seconds');
  assert.equal(keeperOf(pitch.root).src, 'assets/portraits/shopkeeper.webp');
  await settle();
  const blinks = w.run(20000);
  assert.ok(blinks.length > 0, 'and blinks');
  for (const b of blinks) assert.equal(b.src, 'assets/portraits/shopkeeper.webp', 'only over her plain face');
  // A tap on something too dear: sad for three seconds, no blink, then plain again.
  const bear = pitch.root.all().find((n) => n.dataset?.item === 'type:bear');
  byClass(bear, 'shop-deal__buy')[0].dispatch('click');
  assert.equal(keeperOf(pitch.root).dataset.mood, 'sad');
  assert.equal(eyesOf(pitch.root).style.opacity, '0');
  w = watch(pitch.root);
  assert.deepEqual(w.run(2990), [], 'no blink while sad');
  w.run(20);
  assert.equal(keeperOf(pitch.root).dataset.mood, '');

  // Greedy on walking in with 120 seeds, for three seconds even untouched.
  const rich = shop(120, opts);
  await settle();
  assert.equal(keeperOf(rich.root).dataset.mood, 'greedy');
  w = watch(rich.root);
  assert.deepEqual(w.run(2990), []);
  w.run(20);
  assert.equal(keeperOf(rich.root).dataset.mood, '');
  // Tapped within the three seconds: her pitch for the rest of them.
  const tapped = shop(120, opts);
  clock.advance(1000);
  byClass(tapped.root, 'unit-card')[0].dispatch('click');
  assert.equal(keeperOf(tapped.root).dataset.mood, 'shrewd');
  clock.advance(2000);
  assert.equal(keeperOf(tapped.root).dataset.mood, '');

  // Happy just after a sale, for three seconds.
  const sold = shop(70, { ...opts, sold: true });
  await settle();
  assert.equal(keeperOf(sold.root).dataset.mood, 'happy');
  w = watch(sold.root);
  assert.deepEqual(w.run(2990), [], 'no blink while happy');
  w.run(20);
  assert.equal(keeperOf(sold.root).dataset.mood, '');
});

test('with less motion asked for, Hazel never blinks', async () => {
  const clock = fakeClock();
  const { root } = shop(0, { assets: PAINTED, clock, reducedMotion: true });
  await settle();
  clock.advance(60000);
  assert.equal(eyesOf(root), undefined);
  assert.equal(clock.pending(), 0, 'no timers at all');
});

test('with only her plain portrait listed, every state of the shop shows it', () => {
  const only = { assets: PAINTED, portraits: ['shopkeeper'] };
  const rich = shop(100, only);
  assert.equal(keeperOf(rich.root).src, 'assets/portraits/shopkeeper.webp');
  assert.equal(keeperOf(rich.root).dataset.mood, 'greedy');
  byClass(rich.root, 'unit-card')[0].dispatch('click');
  assert.equal(keeperOf(rich.root).src, 'assets/portraits/shopkeeper.webp');
  const some = shop(40, only);
  const bear = some.root.all().find((n) => n.dataset?.item === 'type:bear');
  byClass(bear, 'shop-deal__buy')[0].dispatch('click');
  assert.equal(keeperOf(some.root).dataset.mood, 'sad');
  assert.equal(keeperOf(some.root).src, 'assets/portraits/shopkeeper.webp');
  assert.equal(keeperOf(shop(70, { ...only, sold: true }).root).src, 'assets/portraits/shopkeeper.webp');
  // With no portrait at all, the drawn scene and her stamp.
  const none = shop(100, { assets: PAINTED, portraits: [] });
  assert.equal(byClass(none.root, 'shop-painted').length, 0);
  assert.ok(none.root.all().find((n) => n.attrs.class === 'shop-scene'));
});

test('every card in the shop carries its deal on its own paper', () => {
  const { root } = shop(100, { assets: PAINTED });
  for (const deal of byClass(root, 'shop-deal')) assert.equal(deal.parent.className, 'unit-card ui-panel--parchment');
});

test('a band at full strength says so, with no price', () => {
  const progress = valleyProgress();
  progress.bands.badger.maxLen = 6;
  const root = new FakeEl('div');
  renderShop(/** @type {any} */ (root), { progress, onBuy() {}, onBack() {} });
  const badger = root.all().find((n) => n.dataset?.item === 'recruit:badger');
  assert.match(badger.text, /At full strength\./);
  assert.equal(byClass(badger, 'shop-deal__buy').length, 0);
});

test('each roster token shows the band\'s head, round, from its portrait, and falls back to its emoji', async () => {
  const { rosterHead } = await import('../js/ui/deploy-view.js');
  const { BAND_TYPES } = await import('../js/engine/units.js');
  const ui = deploy(LEVELS.find((l) => l.id === 'l01'));
  for (const btn of ui.roster()) {
    // The head is set in the token's wooden disc.
    const disc = btn.children[0];
    assert.equal(disc.className, 'deploy-token__disc', btn.text);
    assert.equal(disc.getAttribute('aria-hidden'), 'true');
    const head = disc.children[0];
    assert.equal(head.className, 'roster-btn__head', btn.text);
    assert.equal(head.getAttribute('aria-hidden'), 'true');
    assert.match(head.children[0].src, /^assets\/portraits\/[a-z]+\.webp$/);
    assert.ok(!btn.text.includes(BAND_TYPES.fox.glyph), 'no emoji while the portrait is there');
  }
  // Its name, its length on the board's badge, then the key that picks
  // it, shown only with a mouse and keyboard. Read out as one line.
  assert.match(ui.roster()[0].text, /^Fox21$/);
  assert.equal(ui.roster()[0].getAttribute('aria-label'), 'Fox, length 2');
  const fox = rosterHead('fox');
  fox.children[0].dispatch('error');
  assert.equal(fox.className, 'roster-btn__glyph');
  assert.equal(fox.text, BAND_TYPES.fox.glyph);
});
