// The campaign map (look-and-motion spec, "The map"): a tall column of
// painted regions that scrolls under a fixed header, home at the
// bottom. The plates are images; the river, the path, the places and
// their names are drawn over them in one SVG, and regions not yet
// reached lie under mist. Taps go to buttons laid over the places.
// The layout is worked out in js/ui/map-layout.js.

/** @typedef {import('../engine/types.js').Progress} Progress */
/** @typedef {import('../engine/types.js').Level} Level */

import { REGIONS, CAMPAIGN_NODES, TRADING_POST, HOME_CAMP } from '../../data/campaign.js';
import { LEVELS } from '../../data/levels/index.js';
import { goalText } from './text.js';
import { el } from './svg.js';
import { iconText } from './icons.js';
import { MAP_ASSETS } from './map-assets.js';
import {
  buildMapLayout, riverRibbon, riverGlints, scrollFocusY, scrollTopFor, mapPlaces, mapStartPlace,
  PLATE_H, MARKER_SIZE, PLACE_SIZE, LABEL_FONT, POST_ID,
} from './map-layout.js';
import {
  mapKey, focusKind, keyHint, keyListBox, takeKeys, cameByKey, stepToward, focusOn, MAP_KEY_LIST,
} from './keys.js';
import {
  defineGroundPatterns, FRAME, CREAM, INK, RUST, ANIMAL, ANIMAL_DARK, GRASS_LIGHT, MEADOW,
  SOIL_LIGHT, SOIL_DARK, STUBBLE_LIGHT, DEN_GLOW,
} from './patterns.js';

/** SVG units per map unit: the column is 400 across, so the 40-unit ground patterns keep their grain. */
const S = 4;
/** A level's drawn disc, when there is no marker art, in map units. */
const DISC_R = 5.5;
/** The dark edge of the names and the frame's deepest green. */
const FRAME_DEEP = '#0c1d12';
/** The warm light under the chosen place, and the chosen name. */
const SELECT_GLOW = '#ffd97a';
/** The shadow where the river is cut into the land, and its wet earth. */
const RIVER_SHADE = '#10220f';
const RIVER_EARTH = '#4b3f27';
/** The water: a muted teal that sits in the painted land, paler in the shallows. */
const RIVER_WATER = '#4594a6';
const RIVER_DEEP = '#2c6b86';
const RIVER_SHALLOW = '#93cdd0';

/**
 * Mist over a region not yet reached: puffs of the mist image, each
 * placed in the region's box (left, top and width in % of the box's
 * width and height), drifting slowly by different amounts.
 * @type {ReadonlyArray<{x: number, y: number, w: number, o: number, s: number}>}
 */
const MIST_PUFFS = [
  { x: -42, y: -6, w: 150, o: 0.95, s: 74 },
  { x: 8, y: 8, w: 140, o: 0.85, s: 92 },
  { x: -30, y: 30, w: 160, o: 0.9, s: 84 },
  { x: 20, y: 44, w: 130, o: 0.8, s: 100 },
  { x: -46, y: 58, w: 150, o: 0.9, s: 80 },
  { x: 12, y: 72, w: 140, o: 0.75, s: 96 },
];

/** @param {number} v */
function round1(v) {
  return Math.round(v * 10) / 10;
}

/** @param {number} v map units, as an SVG coordinate */
function u(v) {
  return round1(v * S);
}

/**
 * @param {string} levelId
 * @returns {Level|undefined}
 */
function levelById(levelId) {
  return LEVELS.find((l) => l.id === levelId);
}

/**
 * @param {HTMLElement} root
 * @param {{progress: Progress, onLevel: (id: string) => void, onShop: () => void}} opts
 * @returns {void}
 */
export function renderMap(root, opts) {
  const { progress } = opts;
  root.replaceChildren();

  /** The selected place: a level's id, or POST_ID. @type {string|null} */
  let selectedId = null;
  /** The map has been left, for a level or the trading post. */
  let left = false;

  const screen = document.createElement('div');
  screen.className = 'screen map-screen';
  root.appendChild(screen);

  const header = document.createElement('header');
  header.className = 'screen-header map-header';
  screen.appendChild(header);

  const title = document.createElement('h1');
  title.className = 'screen-title';
  title.textContent = 'Undergrowth';
  header.appendChild(title);
  header.appendChild(iconText('span', 'seeds', 'seed', progress.seeds));

  const names = Object.fromEntries(LEVELS.map((l) => [l.id, l.name]));
  const layout = buildMapLayout(
    { regions: REGIONS, nodes: CAMPAIGN_NODES, post: TRADING_POST, home: HOME_CAMP },
    progress, names, MAP_ASSETS.markers,
  );
  const H = layout.height;
  const places = mapPlaces(layout);
  /** @param {number} y map units, as a % of the column's height */
  const pctY = (y) => `${Math.round((y / H) * 10000) / 100}%`;

  // The scrolling view, and in it the column: plates, drawing, mist, buttons.
  const scroll = document.createElement('div');
  scroll.className = 'map-scroll';
  screen.appendChild(scroll);
  const column = document.createElement('div');
  column.className = 'map-column';
  column.style.aspectRatio = `100 / ${H}`;
  scroll.appendChild(column);

  // The painted plates, bottom first, so each one lies over the one
  // below it; its foot fades out (CSS mask) where they overlap.
  for (const r of layout.regions) {
    const src = MAP_ASSETS.plates[r.plate];
    if (src === undefined) continue;
    const img = document.createElement('img');
    img.className = r.index === 0 ? 'map-plate' : 'map-plate map-plate--over';
    img.setAttribute('src', src);
    img.setAttribute('alt', '');
    img.setAttribute('draggable', 'false');
    img.setAttribute('data-region', r.id);
    img.style.top = pctY(r.top);
    img.style.height = pctY(PLATE_H);
    column.appendChild(img);
  }

  const svg = /** @type {SVGSVGElement} */ (
    document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  );
  svg.setAttribute('viewBox', `0 0 ${u(100)} ${u(H)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Campaign map');
  svg.classList.add('map-svg');
  column.appendChild(svg);

  const defs = el('defs', {}, svg);
  const fills = defineGroundPatterns(defs);
  const green = el('radialGradient', { id: 'map-green' }, defs);
  el('stop', { offset: '0%', 'stop-color': GRASS_LIGHT, 'stop-opacity': 0.75 }, green);
  el('stop', { offset: '55%', 'stop-color': MEADOW, 'stop-opacity': 0.45 }, green);
  el('stop', { offset: '100%', 'stop-color': MEADOW, 'stop-opacity': 0 }, green);
  const glow = el('radialGradient', { id: 'map-lit' }, defs);
  el('stop', { offset: '0%', 'stop-color': DEN_GLOW, 'stop-opacity': 0.9 }, glow);
  el('stop', { offset: '60%', 'stop-color': DEN_GLOW, 'stop-opacity': 0.35 }, glow);
  el('stop', { offset: '100%', 'stop-color': DEN_GLOW, 'stop-opacity': 0 }, glow);
  // The selection: a pool of warm light under the place, brightest in a
  // soft rim. No drawn line.
  const chosen = el('radialGradient', { id: 'map-chosen' }, defs);
  el('stop', { offset: '0%', 'stop-color': SELECT_GLOW, 'stop-opacity': 0.5 }, chosen);
  el('stop', { offset: '52%', 'stop-color': SELECT_GLOW, 'stop-opacity': 0.42 }, chosen);
  el('stop', { offset: '74%', 'stop-color': SELECT_GLOW, 'stop-opacity': 0.8 }, chosen);
  el('stop', { offset: '100%', 'stop-color': SELECT_GLOW, 'stop-opacity': 0 }, chosen);

  // A region without its plate gets the forest-floor pattern instead.
  for (const r of layout.regions) {
    if (MAP_ASSETS.plates[r.plate] !== undefined) continue;
    el('rect', { x: 0, y: u(r.top), width: u(100), height: u(PLATE_H), fill: fills.forest, 'data-region': r.id }, svg);
  }

  // The river, the length of the column: a band that swells and
  // narrows as a brook does, cut a little into the land (a soft shadow,
  // then wet earth at the water's edge), deep in the middle and paler
  // in the shallows.
  const water = el('linearGradient', { id: 'map-water', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': RIVER_WATER }, water);
  el('stop', { offset: '100%', 'stop-color': RIVER_DEEP }, water);
  const riverG = el('g', { class: 'map-river', 'data-river': 'true' }, svg);
  /** @param {number} half @param {number} [phase] */
  const band = (half, phase = 0) => riverRibbon(layout.river, S, half, { phase });
  el('path', { d: band(3.1), fill: RIVER_SHADE, opacity: 0.16 }, riverG);
  el('path', { d: band(2.6), fill: RIVER_SHADE, opacity: 0.22 }, riverG);
  el('path', { d: band(2.2), fill: RIVER_EARTH, opacity: 0.85 }, riverG);
  el('path', { d: band(1.85), fill: RIVER_SHALLOW, opacity: 0.8 }, riverG);
  el('path', { d: band(1.55, 0.6), fill: 'url(#map-water)' }, riverG);
  el('path', { d: band(1.55, 0.6), fill: fills.water, opacity: 0.35 }, riverG);
  el('path', { d: band(0.7, 2.1), fill: RIVER_SHALLOW, opacity: 0.26 }, riverG);
  // Light on the water: soft glints scattered across it, each a blurred
  // oval fading in and out at its own pace (css/map.css), not a dashed
  // line down its middle.
  const sparkle = el('radialGradient', { id: 'map-glint' }, defs);
  el('stop', { offset: '0%', 'stop-color': CREAM, 'stop-opacity': 0.95 }, sparkle);
  el('stop', { offset: '45%', 'stop-color': CREAM, 'stop-opacity': 0.55 }, sparkle);
  el('stop', { offset: '100%', 'stop-color': CREAM, 'stop-opacity': 0 }, sparkle);
  const glints = el('g', { class: 'map-river-glints' }, svg);
  for (const g of riverGlints(layout.river)) {
    el('ellipse', {
      cx: 0, cy: 0, rx: u(g.length / 2), ry: u(g.width),
      transform: `translate(${u(g.x)} ${u(g.y)}) rotate(${Math.round(g.angle)})`,
      fill: 'url(#map-glint)', opacity: Math.round(g.peak * 60) / 100,
      class: 'map-river-glint',
      style: `--glint-peak: ${g.peak}; animation-delay: ${g.delay}s; animation-duration: ${g.duration}s`,
    }, glints);
  }

  // Ground greened round each cleared level.
  for (const p of layout.patches) {
    el('circle', { cx: u(p.x), cy: u(p.y), r: u(p.r), fill: 'url(#map-green)', 'data-patch': p.levelId, 'data-cleared': 'true' }, svg);
  }

  // Path dots: cream once the way is open, pale before.
  for (const e of layout.edges) {
    const g = el('g', { 'data-edge': `${e.from}-${e.to}` }, svg);
    for (const d of e.dots) {
      el('circle', {
        cx: u(d.x), cy: u(d.y), r: e.lit ? 3.6 : 2.8, fill: e.lit ? CREAM : STUBBLE_LIGHT,
        stroke: FRAME, 'stroke-width': 1.2, 'stroke-opacity': 0.55, opacity: e.lit ? 0.95 : 0.75,
      }, g);
    }
  }

  /** Each place's name, by place id, so the chosen one can be lit. @type {Map<string, SVGElement>} */
  const nameOf = new Map();

  /**
   * A marker image in its square, centred on (x, y).
   * @param {Element} parent
   * @param {string} src
   * @param {number} x
   * @param {number} y
   * @param {number} size
   * @param {string} [name]
   */
  function image(parent, src, x, y, size, name) {
    /** @type {Record<string, string|number>} */
    const attrs = { href: src, x: u(x - size / 2), y: u(y - size / 2), width: u(size), height: u(size) };
    if (name !== undefined) attrs['data-marker'] = name;
    return el('image', attrs, parent);
  }

  /**
   * A soft shadow under a marker whose foot is `foot` of its size below
   * its centre, seating it on the ground.
   * @param {Element} parent
   * @param {number} x
   * @param {number} y
   * @param {number} size
   * @param {number} foot
   */
  function shadow(parent, x, y, size, foot) {
    el('ellipse', { cx: u(x), cy: u(y + size * foot), rx: u(size * 0.36), ry: u(size * 0.08), fill: INK, opacity: 0.3 }, parent);
  }

  /**
   * A place's name, lettered on the map itself as on a drawn map: cream
   * letters with a dark edge and a soft dark halo behind them, so they
   * read on any ground without a plate.
   * @param {Element} parent
   * @param {string} id the place's id
   * @param {string} text
   * @param {{x: number, y: number, anchor: 'start'|'middle'|'end'}} at
   */
  function label(parent, id, text, at) {
    const g = el('g', { class: 'map-label', 'data-label': id }, parent);
    /** @type {Record<string, string|number>} */
    const attrs = {
      x: u(at.x), y: u(at.y), 'text-anchor': at.anchor, 'font-size': u(LABEL_FONT), 'font-family': 'inherit',
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    };
    el('text', { ...attrs, class: 'map-label__halo', fill: 'none', stroke: FRAME_DEEP, 'stroke-width': 11, opacity: 0.32 }, g)
      .textContent = text;
    el('text', {
      ...attrs, class: 'map-label__name', fill: CREAM, stroke: FRAME_DEEP, 'stroke-width': 4.6, 'paint-order': 'stroke fill',
    }, g).textContent = text;
    nameOf.set(id, g);
  }

  // Home, where the path starts: decoration only.
  {
    const src = MAP_ASSETS.markers['home-camp'];
    if (src !== undefined) {
      const g = el('g', { 'data-home': 'true' }, svg);
      shadow(g, layout.home.x, layout.home.y, PLACE_SIZE, 0.24);
      image(g, src, layout.home.x, layout.home.y, PLACE_SIZE, 'home-camp');
    }
  }

  // The selection's light, under every place and name.
  /** @type {SVGElement} */
  const selGlow = el('circle', {
    r: u(MARKER_SIZE * 0.72), fill: 'url(#map-chosen)', visibility: 'hidden', class: 'map-select',
  }, svg);

  // The trading post: its marker, or a drawn hut.
  {
    const g = el('g', { 'data-post': 'true' }, svg);
    const src = MAP_ASSETS.markers['trading-post'];
    if (src !== undefined) {
      shadow(g, layout.post.x, layout.post.y, PLACE_SIZE, 0.34);
      image(g, src, layout.post.x, layout.post.y, PLACE_SIZE, 'trading-post');
    } else {
      const hx = u(layout.post.x);
      const hy = u(layout.post.y);
      el('ellipse', { cx: hx, cy: hy + 17, rx: 24, ry: 7, fill: INK, opacity: 0.25 }, g);
      el('rect', { x: hx - 18, y: hy - 4, width: 36, height: 21, fill: SOIL_LIGHT, stroke: INK, 'stroke-width': 2 }, g);
      el('path', { d: `M${hx - 24} ${hy - 2} L${hx} ${hy - 22} L${hx + 24} ${hy - 2} Z`, fill: RUST, stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      el('rect', { x: hx - 5, y: hy + 3, width: 10, height: 14, fill: SOIL_DARK }, g);
    }
    label(g, POST_ID, 'Trading post', layout.post.label);
  }

  // The levels that are open or cleared; a locked one is not shown at all.
  for (const n of layout.nodes) {
    const g = el('g', { 'data-node': n.levelId, 'data-state': n.state }, svg);
    if (n.state === 'next') {
      el('circle', { cx: u(n.x), cy: u(n.y), r: u(MARKER_SIZE * 0.78), fill: 'url(#map-lit)', class: 'map-glow' }, g);
    }
    const body = el('g', { class: n.state === 'next' ? 'map-marker map-marker--lit' : 'map-marker' }, g);
    if (n.marker.image !== null) {
      image(body, MAP_ASSETS.markers[n.marker.image], n.x, n.y, MARKER_SIZE, n.marker.image);
    } else {
      const cleared = n.state === 'cleared';
      el('circle', { cx: u(n.x), cy: u(n.y), r: u(DISC_R), 'stroke-width': 3, stroke: cleared ? ANIMAL_DARK : INK, fill: cleared ? ANIMAL : CREAM }, body);
      const t = el('text', { x: u(n.x), y: u(n.y) + 7, 'text-anchor': 'middle', 'font-size': 20, 'font-family': 'inherit', fill: cleared ? CREAM : INK }, body);
      t.textContent = cleared ? '✓' : String(n.number);
    }
    if (n.marker.badge !== null) {
      // The sapling, small, at the landmark's foot: this place is won back.
      const bx = n.x + MARKER_SIZE * 0.3;
      const by = n.y + MARKER_SIZE * 0.24;
      el('circle', { cx: u(bx), cy: u(by), r: u(MARKER_SIZE * 0.2), fill: CREAM, stroke: ANIMAL_DARK, 'stroke-width': 2, opacity: 0.95 }, g);
      image(g, MAP_ASSETS.markers[n.marker.badge], bx, by - MARKER_SIZE * 0.02, MARKER_SIZE * 0.36, n.marker.badge);
    }
    label(g, n.levelId, n.label.text, n.label);
  }

  // Mist over every region not yet reached: the mist image layered
  // over a pale wash, fading out where it meets the land below.
  for (const r of layout.regions) {
    if (r.revealed) continue;
    const mist = document.createElement('div');
    mist.className = 'map-mist';
    mist.setAttribute('data-mist', r.id);
    mist.style.top = pctY(r.top);
    mist.style.height = pctY(PLATE_H);
    const src = MAP_ASSETS.markers.mist;
    if (src !== undefined) {
      for (const [i, p] of MIST_PUFFS.entries()) {
        const puff = document.createElement('img');
        puff.className = 'map-mist__puff';
        puff.setAttribute('src', src);
        puff.setAttribute('alt', '');
        puff.style.left = `${p.x}%`;
        puff.style.top = `${p.y}%`;
        puff.style.width = `${p.w}%`;
        puff.style.opacity = String(p.o);
        puff.style.animationDuration = `${p.s}s`;
        puff.style.animationDelay = `${-(i * 13 + r.index * 7)}s`;
        mist.appendChild(puff);
      }
    }
    column.appendChild(mist);
  }

  const panel = document.createElement('div');
  panel.className = 'map-panel ui-panel--wood';
  screen.appendChild(panel);

  function renderPanel() {
    panel.replaceChildren();
    if (selectedId === null) {
      const hint = document.createElement('p');
      hint.className = 'map-hint';
      hint.textContent = 'Tap a place to march.';
      panel.appendChild(hint);
      return;
    }
    if (selectedId === POST_ID) {
      // Chosen with the keys (a tap on the trading post goes straight in).
      const name = document.createElement('h2');
      name.className = 'map-panel__name';
      name.textContent = 'Trading post';
      panel.appendChild(name);
      const visit = document.createElement('button');
      visit.type = 'button';
      visit.className = 'ui-btn ui-btn--primary';
      visit.textContent = 'Visit';
      visit.appendChild(keyHint('Enter'));
      visit.addEventListener('click', () => go(opts.onShop));
      panel.appendChild(visit);
      return;
    }
    const level = levelById(selectedId);
    if (level === undefined) return;
    const name = document.createElement('h2');
    name.className = 'map-panel__name';
    name.textContent = level.name;
    panel.appendChild(name);

    const goal = document.createElement('p');
    goal.className = 'map-panel__goal';
    goal.textContent = goalText(level);
    panel.appendChild(goal);

    const id = selectedId;
    const march = document.createElement('button');
    march.type = 'button';
    march.className = 'ui-btn ui-btn--primary';
    march.textContent = 'March';
    march.appendChild(keyHint('Enter'));
    march.addEventListener('click', () => go(() => opts.onLevel(id)));
    panel.appendChild(march);
  }

  /**
   * Selects a place: the ring round it, its panel, and the column
   * scrolled to keep it in view. Null lets go.
   * @param {string|null} id
   */
  function select(id) {
    const place = id === null ? undefined : places.find((p) => p.id === id);
    selectedId = place === undefined ? null : place.id;
    for (const [placeId, name] of nameOf) name.classList.toggle('map-label--chosen', placeId === selectedId);
    if (place === undefined) {
      selGlow.setAttribute('visibility', 'hidden');
    } else {
      // The trading post's picture is larger, with more room round it.
      selGlow.setAttribute('r', String(u(place.id === POST_ID ? PLACE_SIZE * 0.72 : MARKER_SIZE * 0.72)));
      selGlow.setAttribute('cx', String(u(place.x)));
      selGlow.setAttribute('cy', String(u(place.y)));
      selGlow.setAttribute('visibility', 'visible');
    }
    renderPanel();
    if (place !== undefined) keepInView(place.y);
  }

  /**
   * Leaves the map, once: to a level or the trading post.
   * @param {() => void} then
   */
  function go(then) {
    if (left) return;
    left = true;
    stopKeys();
    then();
  }

  /**
   * A button over a place, the size of its marker and at least 44px.
   * @param {number} x
   * @param {number} y
   * @param {number} size
   * @param {string} name
   * @param {() => void} onClick
   * @returns {HTMLButtonElement}
   */
  function tapTarget(x, y, size, name, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-node-btn';
    btn.style.left = `${x}%`;
    btn.style.top = pctY(y);
    btn.style.width = `${size}%`;
    btn.setAttribute('aria-label', name);
    btn.addEventListener('click', onClick);
    column.appendChild(btn);
    return btn;
  }

  /** Each place's button, by place id, for the keyboard. @type {Map<string, HTMLButtonElement>} */
  const placeButtons = new Map();
  for (const n of layout.nodes) {
    const level = levelById(n.levelId);
    const btn = tapTarget(n.x, n.y, MARKER_SIZE, level !== undefined ? level.name : n.levelId, () => select(n.levelId));
    // After className, which would wipe it.
    if (n.levelId === layout.next) btn.classList.add('is-next');
    placeButtons.set(n.levelId, btn);
  }
  placeButtons.set(POST_ID, tapTarget(layout.post.x, layout.post.y, PLACE_SIZE, 'Trading post', () => go(opts.onShop)));

  renderPanel();

  // Open on the level to play next.
  scrollToY(scrollFocusY(layout));

  // The keys (js/ui/keys.js, mapKey). The selection starts on the level
  // to play next: shown at once when the player came by keyboard, else at
  // the first key. The arrows move it the way they point (stepToward);
  // Enter marches, or goes into the trading post; T goes straight there.
  /** @type {HTMLElement|null} */
  let keysBox = null;
  const toggleKeys = () => {
    if (keysBox !== null) {
      keysBox.remove();
      keysBox = null;
      return;
    }
    keysBox = keyListBox(MAP_KEY_LIST, { screen: true, onClose: toggleKeys });
    screen.appendChild(keysBox);
  };
  const doc = /** @type {Document|undefined} */ (globalThis.document);
  /** @returns {string|undefined} the place whose button has the focus (reached with Tab) */
  const focusedPlace = () => [...placeButtons].find(([, btn]) => btn === doc?.activeElement)?.[0];
  const stopKeys = takeKeys((evt) => {
    if (left) return;
    // A level reached with Tab: Enter on it selects it (the button's own
    // press), and once it is selected, marches, as Enter does anywhere.
    const tabbed = focusedPlace();
    const plain = evt.ctrlKey !== true && evt.metaKey !== true && evt.altKey !== true;
    if (evt.key === 'Enter' && plain && tabbed !== undefined && tabbed !== POST_ID && tabbed === selectedId) {
      evt.preventDefault();
      if (evt.repeat !== true) go(() => opts.onLevel(tabbed));
      return;
    }
    const command = mapKey(evt, { focus: focusKind(doc?.activeElement) });
    if (command === null) return;
    evt.preventDefault();
    if (command === 'help') {
      toggleKeys();
    } else if (command === 'back') {
      if (keysBox !== null) toggleKeys();
      else select(null);
    } else if (command === 'shop') {
      go(opts.onShop);
    } else if (selectedId === null) {
      // The first key shows where the selection starts.
      select(mapStartPlace(layout));
    } else if (command === 'main') {
      const id = selectedId;
      if (id === POST_ID) go(opts.onShop);
      else go(() => opts.onLevel(id));
    } else {
      const at = places.findIndex((p) => p.id === selectedId);
      const to = stepToward(places, at, command);
      if (to !== null) {
        select(places[to].id);
        // A focus ring on a place (from Tab) moves with the selection, so
        // only one place is ever ringed.
        if (tabbed !== undefined) focusOn(placeButtons.get(places[to].id));
      }
    }
  });
  if (cameByKey()) select(mapStartPlace(layout));

  /**
   * Scrolls so the column's height `y` (map units) sits a little below
   * the middle of the view.
   * @param {number} y
   */
  function scrollToY(y) {
    const columnPx = column.offsetHeight;
    const viewPx = scroll.clientHeight;
    if (!(columnPx > 0) || !(viewPx > 0)) return;
    scroll.scrollTop = scrollTopFor(y, H, columnPx, viewPx);
  }

  /**
   * After the panel grows, keeps the chosen place on screen.
   * @param {number} y
   */
  function keepInView(y) {
    const columnPx = column.offsetHeight;
    const viewPx = scroll.clientHeight;
    if (!(columnPx > 0) || !(viewPx > 0)) return;
    const at = (y / H) * columnPx - scroll.scrollTop;
    const margin = (MARKER_SIZE / 100) * column.offsetWidth;
    if (at < margin || at > viewPx - margin) scrollToY(y);
  }
}
