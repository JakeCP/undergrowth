// The trading post's interior (play-feel spec, "Changed after Jake's
// playtest of the full build"): a little shop drawn in code in the game's
// colours, with a back wall of planks, a window on the forest, shelves of
// goods, a hanging lamp's warm light, the shopkeeper behind the counter,
// and the counter in front.
//
// `shopScene` is the scene as plain data, so it can be tested;
// `drawShopScene` turns it into SVG. Flat shapes only, no filters.
// `shopGreeting` is the keeper's line for the player's purse.
//
// Once the painted pictures exist (scripts/shop-assets.mjs), the shop
// shows them instead: `shopLayers` says what goes where, back to front:
// the interior, the keeper's cut-out portrait, and the counter in front
// of her. Until both exist, the drawn scene stays as it is.

/** @typedef {import('../engine/types.js').Progress} Progress */
/** @typedef {import('./portraits.js').PortraitSpec} PortraitSpec */
/**
 * @typedef {object} SceneShape
 * @property {string} part  what it is: wall, window, shelf, goods, lamp, glow, counter
 * @property {'back'|'front'} layer  back: behind the keeper; front: the counter and what's on it
 * @property {'rect'|'circle'|'ellipse'|'line'|'polygon'} tag
 * @property {Record<string, string|number>} attrs
 */
/** @typedef {{width: number, height: number, keeper: {cx: number, cy: number, r: number}, counterTop: number, shapes: SceneShape[]}} Scene */

import { el } from './svg.js';
import { drawPortrait } from './portraits.js';
import { shopItems } from '../campaign/shop.js';
import { BAND_TYPES } from '../engine/units.js';
import {
  SOIL, SOIL_LIGHT, SOIL_DARK, BANK_LIGHT, BANK_SHADE, STUBBLE, STUBBLE_LIGHT, STUBBLE_SHADE,
  WATER_LIGHT, WATER, FOREST_SHADE, FOREST_LIGHT, GRASS, GRASS_LIGHT, DEN_GLOW, HAZARD, CREAM, INK,
  MEADOW_LIGHT, RUST,
} from './patterns.js';

export const SCENE_W = 320;
export const SCENE_H = 176;
const COUNTER_TOP = 114;

/**
 * The scene as data, back to front.
 * @returns {Scene}
 */
export function shopScene() {
  /** @type {SceneShape[]} */
  const shapes = [];
  /**
   * @param {string} part
   * @param {SceneShape['tag']} tag
   * @param {Record<string, string|number>} attrs
   * @param {'back'|'front'} [layer]
   */
  const add = (part, tag, attrs, layer = 'back') => shapes.push({ part, layer, tag, attrs });

  // The back wall: planks under a beam.
  add('wall', 'rect', { x: 0, y: 0, width: SCENE_W, height: SCENE_H, fill: SOIL });
  for (let x = 28; x < SCENE_W; x += 36) {
    add('wall', 'line', { x1: x, y1: 0, x2: x, y2: COUNTER_TOP, stroke: SOIL_DARK, 'stroke-width': 1.5, opacity: 0.45 });
  }
  add('wall', 'rect', { x: 0, y: 0, width: SCENE_W, height: 10, fill: SOIL_DARK });

  // A window on the forest, top left.
  add('window', 'rect', { x: 14, y: 22, width: 76, height: 62, rx: 4, fill: SOIL_DARK });
  add('window', 'rect', { x: 19, y: 27, width: 66, height: 52, fill: WATER_LIGHT });
  add('window', 'polygon', { points: '19,79 19,58 30,46 41,60 52,44 64,58 74,48 85,60 85,79', fill: FOREST_SHADE });
  add('window', 'polygon', { points: '19,79 26,66 34,72 46,62 58,70 70,64 85,72 85,79', fill: FOREST_LIGHT });
  add('window', 'line', { x1: 52, y1: 27, x2: 52, y2: 79, stroke: SOIL_DARK, 'stroke-width': 3 });
  add('window', 'line', { x1: 19, y1: 53, x2: 85, y2: 53, stroke: SOIL_DARK, 'stroke-width': 3 });

  // Herbs drying under the beam.
  for (const [x, len] of [[104, 22], [114, 30], [124, 20]]) {
    add('goods', 'line', { x1: x, y1: 10, x2: x, y2: 10 + len, stroke: SOIL_DARK, 'stroke-width': 1.2 });
    add('goods', 'ellipse', { cx: x, cy: 14 + len, rx: 4, ry: 7, fill: x === 114 ? GRASS_LIGHT : GRASS });
  }

  // Two shelves on the right, with goods.
  for (const y of [46, 88]) {
    add('shelf', 'rect', { x: 206, y, width: 104, height: 6, fill: SOIL_LIGHT });
    add('shelf', 'rect', { x: 206, y: y + 6, width: 104, height: 3, fill: SOIL_DARK, opacity: 0.7 });
  }
  // Top shelf: jars of seeds.
  for (const x of [214, 238, 262, 286]) {
    add('goods', 'rect', { x, y: 26, width: 16, height: 20, rx: 3, fill: WATER_LIGHT, opacity: 0.75 });
    add('goods', 'ellipse', { cx: x + 8, cy: 39, rx: 6, ry: 5, fill: x === 262 ? MEADOW_LIGHT : STUBBLE_LIGHT });
    add('goods', 'rect', { x: x - 1, y: 23, width: 18, height: 4, rx: 1, fill: SOIL_DARK });
  }
  // Bottom shelf: a seed sack, a sprouting pot and a coil of rope.
  add('goods', 'ellipse', { cx: 226, cy: 77, rx: 14, ry: 12, fill: STUBBLE });
  add('goods', 'ellipse', { cx: 226, cy: 66, rx: 6, ry: 3, fill: STUBBLE_SHADE });
  add('goods', 'rect', { x: 250, y: 72, width: 18, height: 16, rx: 2, fill: RUST });
  add('goods', 'ellipse', { cx: 255, cy: 66, rx: 4, ry: 7, fill: GRASS });
  add('goods', 'ellipse', { cx: 263, cy: 67, rx: 4, ry: 6, fill: GRASS_LIGHT });
  add('goods', 'circle', { cx: 292, cy: 78, r: 10, fill: 'none', stroke: BANK_LIGHT, 'stroke-width': 4 });
  add('goods', 'circle', { cx: 292, cy: 78, r: 4, fill: 'none', stroke: BANK_SHADE, 'stroke-width': 2 });

  // The lamp, and its warm light: flat rings, lightest outside.
  const lamp = { x: 160, y: 30 };
  add('glow', 'rect', { x: 0, y: 0, width: SCENE_W, height: SCENE_H, fill: DEN_GLOW, opacity: 0.07 });
  add('glow', 'circle', { cx: lamp.x, cy: lamp.y, r: 120, fill: DEN_GLOW, opacity: 0.1 });
  add('glow', 'circle', { cx: lamp.x, cy: lamp.y, r: 70, fill: DEN_GLOW, opacity: 0.14 });
  add('glow', 'circle', { cx: lamp.x, cy: lamp.y, r: 30, fill: DEN_GLOW, opacity: 0.22 });
  add('lamp', 'line', { x1: lamp.x, y1: 10, x2: lamp.x, y2: lamp.y - 6, stroke: SOIL_DARK, 'stroke-width': 1.5 });
  add('lamp', 'polygon', { points: `${lamp.x - 9},${lamp.y - 2} ${lamp.x + 9},${lamp.y - 2} ${lamp.x + 5},${lamp.y - 8} ${lamp.x - 5},${lamp.y - 8}`, fill: SOIL_DARK });
  add('lamp', 'circle', { cx: lamp.x, cy: lamp.y + 2, r: 6, fill: HAZARD });
  add('lamp', 'circle', { cx: lamp.x, cy: lamp.y + 2, r: 3, fill: CREAM });

  // The counter, in front of the keeper.
  add('counter', 'rect', { x: 0, y: COUNTER_TOP, width: SCENE_W, height: SCENE_H - COUNTER_TOP, fill: SOIL_LIGHT }, 'front');
  add('counter', 'rect', { x: 0, y: COUNTER_TOP - 6, width: SCENE_W, height: 8, fill: BANK_LIGHT }, 'front');
  add('counter', 'rect', { x: 0, y: COUNTER_TOP + 2, width: SCENE_W, height: 3, fill: SOIL_DARK, opacity: 0.6 }, 'front');
  for (let x = 40; x < SCENE_W; x += 60) {
    add('counter', 'line', { x1: x, y1: COUNTER_TOP + 5, x2: x, y2: SCENE_H, stroke: SOIL, 'stroke-width': 2 }, 'front');
  }
  // On the counter: a pile of seeds and an open ledger.
  for (const [x, y] of [[238, 104], [248, 104], [258, 104], [243, 98], [253, 98], [248, 92]]) {
    add('goods', 'ellipse', { cx: x, cy: y, rx: 5, ry: 6, fill: SOIL_LIGHT, stroke: SOIL_DARK, 'stroke-width': 1 }, 'front');
    add('goods', 'rect', { x: x - 5, y: y - 7, width: 10, height: 3, rx: 1.5, fill: SOIL_DARK }, 'front');
  }
  add('goods', 'polygon', { points: '56,108 84,104 112,108 84,112', fill: CREAM }, 'front');
  add('goods', 'line', { x1: 84, y1: 104, x2: 84, y2: 112, stroke: INK, 'stroke-width': 0.8, opacity: 0.5 }, 'front');
  add('goods', 'line', { x1: 64, y1: 107, x2: 78, y2: 106, stroke: WATER, 'stroke-width': 0.8 }, 'front');
  add('goods', 'line', { x1: 90, y1: 106, x2: 104, y2: 107, stroke: WATER, 'stroke-width': 0.8 }, 'front');

  return {
    width: SCENE_W,
    height: SCENE_H,
    // Behind the counter, the bottom of the disc just under its edge.
    keeper: { cx: 160, cy: 78, r: 34 },
    counterTop: COUNTER_TOP - 6,
    shapes,
  };
}

/**
 * Draws the scene into an <svg>, with the keeper's portrait between the
 * back of the shop and the counter.
 * @param {Element} svg
 * @param {PortraitSpec} keeper
 * @param {Scene} [scene]
 * @returns {void}
 */
export function drawShopScene(svg, keeper, scene = shopScene()) {
  svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`);
  const back = el('g', { 'data-layer': 'back' }, svg);
  const mid = el('g', { 'data-layer': 'keeper' }, svg);
  const front = el('g', { 'data-layer': 'front' }, svg);
  for (const shape of scene.shapes) {
    el(shape.tag, { ...shape.attrs, 'data-part': shape.part }, shape.layer === 'front' ? front : back);
  }
  drawPortrait(mid, keeper, scene.keeper.cx, scene.keeper.cy, scene.keeper.r);
}

/**
 * Where the keeper's square cut-out stands in the painted interior, as
 * shares of the picture's width and height (the pictures are 3:2): the
 * counter covers her lower body and her apron's acorn still shows.
 * Measured on the 1536x1024 sources: 620 px square at (458, 111).
 */
export const KEEPER_PLACE = Object.freeze({ left: 458 / 1536, top: 111 / 1024, size: 620 / 1536 });

/**
 * @typedef {object} ShopLayers
 * @property {string} interior  the back of the shop
 * @property {{href: string, left: number, top: number, size: number}} keeper  her cut-out, placed
 * @property {string} counter  the counter, in front of her
 */

/**
 * The painted scene's layers, back to front, or null when a picture is
 * missing (the drawn scene is shown then) or the keeper has only a stamp.
 * @param {Readonly<{interior?: string, counter?: string}>} assets  js/ui/shop-assets.js
 * @param {PortraitSpec} keeper  her portrait, in her mood
 * @returns {ShopLayers|null}
 */
export function shopLayers(assets, keeper) {
  if (assets.interior === undefined || assets.counter === undefined || keeper.kind !== 'image') return null;
  return {
    interior: assets.interior,
    keeper: { href: keeper.href, ...KEEPER_PLACE },
    counter: assets.counter,
  };
}

/**
 * The keeper's line when the player taps something they cannot pay for.
 * @param {number} price
 * @param {number} seeds
 * @returns {string}
 */
export function shortGreeting(price, seeds) {
  const more = price - seeds;
  return `Ah, that one's ${price} seeds, and you're ${more} short. Win a few more and I'll keep it for you.`;
}

/**
 * The keeper's greeting, from what the player can buy.
 * @param {Progress} progress
 * @returns {string}
 */
export function shopGreeting(progress) {
  const items = shopItems(progress).filter((i) => i.available);
  if (items.length === 0) return 'You\'ve bought me out! Go and win the valley back.';
  const hire = items
    .filter((i) => i.kind === 'type' && i.affordable)
    .sort((a, b) => a.price - b.price)[0];
  if (hire !== undefined) {
    return `${BAND_TYPES[hire.type].name} for hire! ${hire.price} seeds and they're yours.`;
  }
  if (items.some((i) => i.affordable)) {
    return 'Fresh recruits today. Each one makes a band longer, and a longer band takes more hits.';
  }
  if (progress.seeds === 0) {
    return 'An empty pouch? Pick up seeds on the field and come back. I\'ll keep the shelves stocked.';
  }
  const cheapest = Math.min(...items.map((i) => i.price));
  return `You'll want ${cheapest} seeds for the cheapest thing here. Come back soon.`;
}
