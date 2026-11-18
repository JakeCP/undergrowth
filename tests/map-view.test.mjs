// The painted campaign map on the fake DOM, with the campaign and level
// data as they ship: a column of region plates, each open level a place
// with its landmark and state, locked levels not shown at all, mist
// over regions not yet reached, the trading post with its own tap
// target, and a level's panel giving its goal line, dens included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, installFakeDom } from './fake-dom.mjs';
import { renderMap } from '../js/ui/map-view.js';
import { CAMPAIGN_NODES, REGIONS } from '../data/campaign.js';
import { LEVELS } from '../data/levels/index.js';
import { MAP_ASSETS } from '../js/ui/map-assets.js';
import { newProgress } from '../js/campaign/progress.js';
import { goalText } from '../js/ui/text.js';

installFakeDom({ canvas: true });

function mount(progress) {
  const root = new FakeEl('div');
  const chosen = [];
  let shop = 0;
  renderMap(/** @type {any} */ (root), { progress, onLevel: (id) => chosen.push(id), onShop: () => { shop += 1; } });
  const svg = root.all().find((n) => n.tag === 'svg');
  const buttons = root.all().filter((n) => n.tag === 'button' && n.className === 'map-node-btn');
  const texts = svg.all().filter((n) => n.tag === 'text').map((n) => n.textContent);
  return { root, svg, buttons, texts, chosen, shop: () => shop };
}

const cleared = (...ids) => {
  const p = newProgress();
  for (const id of ids) p.cleared[id] = true;
  return p;
};
const ALL = LEVELS.map((l) => l.id);

test('map: every level is on the map, and every map place is a level', () => {
  assert.deepEqual(CAMPAIGN_NODES.map((n) => n.levelId).sort(), [...ALL].sort());
  const { svg } = mount(cleared(...ALL));
  for (const level of LEVELS) {
    assert.ok(svg.querySelector(`[data-node="${level.id}"]`), `${level.id} has a place`);
    assert.ok(svg.querySelector(`[data-patch="${level.id}"]`), `${level.id} has greened ground`);
  }
  assert.ok(svg.querySelector('[data-post]'), 'the trading post');
  assert.ok(svg.querySelector('[data-home]'), 'home, where the path starts');
});

test('map: one plate per region, stacked in a column, each over the one below it', () => {
  const { root } = mount(newProgress());
  const column = root.all().find((n) => n.className === 'map-column');
  assert.ok(column.style.aspectRatio.startsWith('100 / '));
  const plates = column.children.filter((n) => n.tag === 'img' && n.className.startsWith('map-plate'));
  assert.deepEqual(plates.map((p) => p.getAttribute('src')), REGIONS.map((r) => MAP_ASSETS.plates[r.plate]));
  assert.equal(plates[0].className, 'map-plate', 'the lowest plate is not faded');
  assert.equal(plates[1].className, 'map-plate map-plate--over', 'the one above fades into it');
  assert.ok(Number.parseFloat(plates[0].style.top) > Number.parseFloat(plates[1].style.top), 'home is at the bottom');
});

test('map: at the start only level 1 is shown, lit as next; nothing locked is on the map', () => {
  const { svg, buttons, texts } = mount(newProgress());
  assert.equal(svg.querySelector('[data-node="o01"]').attrs['data-state'], 'next');
  for (const id of ['o02', 'l01', 'l02', 'l03', 'l04', 'l05']) {
    assert.equal(svg.querySelector(`[data-node="${id}"]`), null, `${id} is not shown`);
    const name = LEVELS.find((l) => l.id === id).name;
    assert.ok(!texts.includes(name), `${id}'s name is not shown`);
    assert.equal(svg.querySelector(`[data-edge="o01-${id}"]`), null);
  }
  assert.ok(svg.querySelector('[data-edge="home-o01"]'), 'the path from home');
  assert.ok(svg.querySelector('[data-edge="o01-post"]'), 'the path to the trading post');
  const labels = buttons.map((b) => b.getAttribute('aria-label'));
  assert.deepEqual(labels, [LEVELS[0].name, 'Trading post'], 'a tap target for level 1 and the post');
  assert.ok(buttons[0].classList.contains('is-next'));
});

test('map: each place shows its own landmark; a cleared one carries the sapling', () => {
  const { svg } = mount(cleared('o01', 'o02', 'l01'));
  for (const n of CAMPAIGN_NODES.filter((c) => ['o01', 'o02', 'l01', 'l02', 'l03'].includes(c.levelId))) {
    const g = svg.querySelector(`[data-node="${n.levelId}"]`);
    const img = g.find('data-marker', n.landmark);
    assert.ok(img, `${n.levelId} shows ${n.landmark}`);
    assert.equal(img.attrs.href, MAP_ASSETS.markers[n.landmark]);
    const sapling = g.find('data-marker', 'sapling');
    assert.equal(sapling !== undefined, ['o01', 'o02', 'l01'].includes(n.levelId), `${n.levelId} sapling only once cleared`);
  }
  assert.equal(svg.querySelector('[data-node="l02"]').attrs['data-state'], 'next');
  assert.ok(svg.find('data-marker', 'trading-post'));
  assert.ok(svg.find('data-marker', 'home-camp'));
  assert.equal(svg.find('data-marker', 'depot'), undefined, 'no depot yet');
});

test('map: a region not yet reached lies under mist; it lifts once one of its levels opens', () => {
  const fresh = mount(newProgress()).root;
  const mist = fresh.all().filter((n) => n.attrs['data-mist'] !== undefined);
  assert.deepEqual(mist.map((m) => m.attrs['data-mist']), ['cut-valley']);
  const puffs = mist[0].children.filter((n) => n.tag === 'img');
  assert.ok(puffs.length >= 3, 'the mist image, layered');
  assert.ok(puffs.every((p) => p.getAttribute('src') === MAP_ASSETS.markers.mist));
  assert.equal(mount(cleared('o01')).root.find('data-mist', 'cut-valley')?.attrs['data-mist'], 'cut-valley', 'still misted while l01 is locked');
  assert.equal(mount(cleared('o01', 'o02')).root.find('data-mist'), undefined, 'lifted once l01 opens');
});

test('map: with every level cleared, all are cleared and tappable', () => {
  const { svg, buttons } = mount(cleared(...ALL));
  for (const level of LEVELS) {
    assert.equal(svg.querySelector(`[data-node="${level.id}"]`).attrs['data-state'], 'cleared', level.id);
    assert.equal(svg.querySelector(`[data-patch="${level.id}"]`).attrs['data-cleared'], 'true', level.id);
  }
  assert.equal(buttons.length, LEVELS.length + 1);
});

test('map: a level panel gives the goal with its dens, and March starts it', () => {
  const chosen = [];
  for (const level of LEVELS) {
    // The map is left once March is pressed: a fresh one for each level.
    const ui = mount(cleared(...ALL));
    ui.buttons.find((b) => b.getAttribute('aria-label') === level.name).dispatch('click');
    const goal = ui.root.all().find((n) => n.className === 'map-panel__goal');
    assert.equal(goal.textContent, goalText(level), level.id);
    // o01 has no den (it teaches reach only); every other level names its dens.
    if (level.id !== 'o01') assert.match(goal.textContent, /keep the (den|\d dens) standing/, `${level.id} names its dens`);
    ui.root.all().find((n) => n.tag === 'button' && n.textContent === 'March').dispatch('click');
    chosen.push(...ui.chosen);
  }
  assert.deepEqual(chosen, ALL);
});

test('map: names are lettered on the map itself, with no plate behind them', () => {
  const { svg, texts } = mount(cleared(...ALL));
  for (const level of LEVELS) {
    const label = svg.querySelector(`[data-label="${level.id}"]`);
    assert.ok(label, `${level.id} has its name`);
    assert.deepEqual(label.children.map((n) => n.tag), ['text', 'text'], 'a soft halo, then the letters: no box');
    assert.ok(label.children.every((n) => n.textContent === level.name));
    const [halo, name] = label.children;
    assert.equal(halo.attrs.fill, 'none');
    assert.equal(name.attrs['paint-order'], 'stroke fill', 'the dark edge lies under the letters');
    assert.equal(name.attrs.stroke, halo.attrs.stroke);
  }
  assert.ok(texts.includes('Trading post'));
});

test('map: the chosen place is lit from under and its name warms; no ring is drawn round it', () => {
  const ui = mount(cleared(...ALL));
  const glow = ui.svg.all().find((n) => n.attrs.class === 'map-select');
  assert.equal(glow.attrs.visibility, 'hidden', 'nothing is chosen at first');
  assert.equal(glow.attrs.fill, 'url(#map-chosen)');
  assert.equal(glow.attrs.stroke, undefined, 'a pool of light, not a line');
  assert.equal(ui.svg.all().some((n) => n.attrs['stroke-dasharray'] !== undefined), false, 'no dashed line anywhere on the map');
  const level = LEVELS[2];
  ui.buttons.find((b) => b.getAttribute('aria-label') === level.name).dispatch('click');
  assert.equal(glow.attrs.visibility, 'visible');
  const node = CAMPAIGN_NODES.find((n) => n.levelId === level.id);
  assert.ok(node !== undefined);
  for (const other of LEVELS) {
    const label = ui.svg.querySelector(`[data-label="${other.id}"]`);
    assert.equal(label.classList.contains('map-label--chosen'), other.id === level.id, other.id);
  }
  // The level to play next keeps its breathing glow, without the hard ellipse at its foot.
  const fresh = mount(newProgress());
  const next = fresh.svg.querySelector(`[data-node="${LEVELS[0].id}"]`);
  assert.ok(next.all().some((n) => n.attrs.class === 'map-glow'));
  assert.equal(next.all().some((n) => n.tag === 'ellipse' && n.attrs.fill === 'none'), false);
});

test('map: the river is a band of water, not a stroked line', () => {
  const { svg } = mount(newProgress());
  const river = svg.querySelector('[data-river]');
  assert.ok(river.children.length >= 5, 'shadow, earth, shallows, water, current');
  for (const part of river.children) {
    assert.equal(part.tag, 'path');
    assert.match(part.attrs.d, / Z$/, 'a closed shape');
    assert.equal(part.attrs.stroke, undefined);
  }
});

test('map: the trading post opens the shop', () => {
  const ui = mount(newProgress());
  ui.buttons.find((b) => b.getAttribute('aria-label') === 'Trading post').dispatch('click');
  assert.equal(ui.shop(), 1);
});

test('map: the header shows the seeds with the seed icon', () => {
  const p = newProgress();
  p.seeds = 37;
  const { root } = mount(p);
  const seeds = root.all().find((n) => n.className === 'seeds');
  assert.equal(seeds.text, ' 37');
  assert.equal(seeds.children[0].getAttribute('src'), MAP_ASSETS.icons.seed);
});
