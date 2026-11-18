// The campaign map's layout, as pure functions (look-and-motion spec,
// "The map"). The map is a tall column of painted regions stacked from
// the bottom (home) up; data/campaign.js puts each place in its
// region's plate (x 0-100 right, y 0-150 down). These functions stack
// the regions, turn places into column units (x 0-100 across the
// column, y 0 at its top), decide what is revealed, which marker each
// place shows, where the path dots and names go and where the column
// scrolls to. js/ui/map-view.js scales it all and draws it.

/** @typedef {import('../engine/types.js').Progress} Progress */
/** @typedef {import('../campaign/campaign.js').CampaignNode} CampaignNode */
/** @typedef {import('../campaign/campaign.js').MapRegion} MapRegion */
/** @typedef {import('../campaign/campaign.js').MapPlace} MapPlace */
/** @typedef {'cleared'|'next'|'open'|'locked'} NodeState */
/** @typedef {{x: number, y: number}} Point */
/** @typedef {{x: number, y: number, anchor: 'start'|'middle'|'end'}} LabelAt */
/** @typedef {{x0: number, y0: number, x1: number, y1: number}} Box */
/** @typedef {{id: string, name: string, plate: string, index: number, top: number, bottom: number}} StackedRegion */
/** @typedef {{regions: StackedRegion[], height: number}} Stack */
/** @typedef {{from: string, to: string, lit: boolean, dots: Point[]}} Edge */
/** @typedef {{image: string|null, badge: string|null}} Marker */

import { unlockedLevels } from '../campaign/campaign.js';

/** The smallest tap target, in CSS pixels. */
export const TAP_MIN_PX = 44;
/** A region's plate, in map units: as wide as the column, 2:3. */
export const PLATE_W = 100;
export const PLATE_H = 150;
/** How far each plate overlaps the one below it: 12% of its height. */
export const REGION_OVERLAP = 18;
/** The square a level's marker is drawn in, in map units. */
export const MARKER_SIZE = 18;
/** The square the trading post and home are drawn in. */
export const PLACE_SIZE = 21;
/** Radius of the greened ground round a cleared level, in map units. */
export const PATCH_RADIUS = 13;
/** Gap between path dots, and the clearance kept round each end. */
export const DOT_SPACING = 3.6;
export const DOT_MARGIN = 9.5;
/** A path dot's radius. */
export const DOT_RADIUS = 0.9;
/** The clearance kept round a level's marker. */
export const NODE_CLEARANCE = MARKER_SIZE / 2 + 0.5;

/** A name's lettering, in map units: size, room per letter, plate padding, and its plate above and below the baseline. */
export const LABEL_FONT = 3.6;
export const LABEL_CHAR_W = 1.75;
export const LABEL_PAD_X = 1.2;
export const LABEL_ASCENT = 3.6;
export const LABEL_DESCENT = 1.8;
/** The gap between a marker and its name. */
const LABEL_GAP = 0.6;

// --- the column ---

/**
 * Stacks the regions into one column, the first at the bottom. Each
 * plate overlaps the one below it by REGION_OVERLAP.
 * @param {ReadonlyArray<MapRegion>} regions bottom first
 * @returns {Stack}
 */
export function stackRegions(regions) {
  const n = regions.length;
  const height = n === 0 ? 0 : PLATE_H + (n - 1) * (PLATE_H - REGION_OVERLAP);
  return {
    height,
    regions: regions.map((r, index) => {
      const top = height - PLATE_H - index * (PLATE_H - REGION_OVERLAP);
      return { id: r.id, name: r.name, plate: r.plate, index, top, bottom: top + PLATE_H };
    }),
  };
}

/**
 * A place in its region's plate as a point in the column.
 * @param {Stack} stack
 * @param {{region: string, x: number, y: number}} place
 * @returns {Point}
 */
export function toColumn(stack, place) {
  const region = stack.regions.find((r) => r.id === place.region);
  if (region === undefined) throw new Error(`No map region "${place.region}"`);
  return { x: place.x, y: region.top + place.y };
}

/**
 * The regions shown: those with any level open. The rest lie under mist.
 * @param {ReadonlyArray<MapRegion>} regions
 * @param {readonly CampaignNode[]} nodes
 * @param {Progress} progress
 * @returns {Set<string>}
 */
export function revealedRegions(regions, nodes, progress) {
  const open = unlockedLevels(progress, /** @type {CampaignNode[]} */ (nodes));
  const lit = new Set(nodes.filter((n) => open.has(n.levelId)).map((n) => n.region));
  return new Set(regions.filter((r) => lit.has(r.id)).map((r) => r.id));
}

/**
 * The river's course through the whole column, bottom to top.
 * @param {Stack} stack
 * @param {ReadonlyArray<MapRegion>} regions
 * @returns {Point[]}
 */
export function riverPoints(stack, regions) {
  return regions.flatMap((r) => r.river.map(([x, y]) => toColumn(stack, { region: r.id, x, y })));
}

/** @param {number} v */
function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * A smooth SVG path through the points (Catmull-Rom as cubic Béziers),
 * scaled by `scale`.
 * @param {readonly Point[]} points
 * @param {number} scale
 * @returns {string}
 */
export function smoothPath(points, scale) {
  if (points.length === 0) return '';
  const p = points.map((q) => ({ x: q.x * scale, y: q.y * scale }));
  /** @param {Point} q */
  const xy = (q) => `${round1(q.x)} ${round1(q.y)}`;
  let d = `M${xy(p[0])}`;
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[Math.max(0, i - 1)];
    const b = p[i];
    const c = p[i + 1];
    const e = p[Math.min(p.length - 1, i + 2)];
    const c1 = { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 };
    const c2 = { x: c.x - (e.x - b.x) / 6, y: c.y - (e.y - b.y) / 6 };
    d += ` C${xy(c1)} ${xy(c2)} ${xy(c)}`;
  }
  return d;
}

/**
 * The river as a closed band along its course, for a fill: the same
 * curve smoothPath draws, widened to `halfWidth` either side, the width
 * swelling and narrowing gently along the way so the banks wander like
 * a brook's and never run parallel like a road's. The same every time.
 * @param {readonly Point[]} points the river's course, in map units
 * @param {number} scale
 * @param {number} halfWidth in map units
 * @param {{wobble?: number, phase?: number}} [opts]
 *   wobble: how far the width strays, as a share of `halfWidth`;
 *   phase: shifts the swelling along the river
 * @returns {string}
 */
export function riverRibbon(points, scale, halfWidth, opts = {}) {
  if (points.length < 2) return '';
  const wobble = opts.wobble ?? 0.24;
  const phase = opts.phase ?? 0;
  const STEPS = 10;
  /** @type {Point[]} */
  const line = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[i];
    const c = points[i + 1];
    const e = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 };
    const c2 = { x: c.x - (e.x - b.x) / 6, y: c.y - (e.y - b.y) / 6 };
    for (let k = i === 0 ? 0 : 1; k <= STEPS; k += 1) {
      const t = k / STEPS;
      const m = 1 - t;
      line.push({
        x: m * m * m * b.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * c.x,
        y: m * m * m * b.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * c.y,
      });
    }
  }
  /** @type {Point[]} */
  const left = [];
  /** @type {Point[]} */
  const right = [];
  let along = 0;
  for (let i = 0; i < line.length; i += 1) {
    const before = line[Math.max(0, i - 1)];
    const after = line[Math.min(line.length - 1, i + 1)];
    if (i > 0) along += Math.hypot(line[i].x - before.x, line[i].y - before.y);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const len = Math.hypot(dx, dy) || 1;
    const swell = 0.6 * Math.sin(along / 6.5 + 1.3 + phase) + 0.4 * Math.sin(along / 2.9 + 4.1 + phase * 1.7);
    // The two banks stray a little differently, so the brook is not a
    // mirror image of itself.
    const lean = 0.5 * Math.sin(along / 4.3 + 0.7 + phase);
    const wl = halfWidth * (1 + wobble * (swell + lean));
    const wr = halfWidth * (1 + wobble * (swell - lean));
    left.push({ x: line[i].x - (dy / len) * wl, y: line[i].y + (dx / len) * wl });
    right.push({ x: line[i].x + (dy / len) * wr, y: line[i].y - (dx / len) * wr });
  }
  const loop = [...left, ...right.reverse()];
  /** @param {Point} q */
  const xy = (q) => `${round1(q.x * scale)} ${round1(q.y * scale)}`;
  /** @param {Point} p @param {Point} q */
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  // A closed curve through the midpoints, each point the bend between.
  let d = `M${xy(mid(loop[loop.length - 1], loop[0]))}`;
  for (let i = 0; i < loop.length; i += 1) {
    d += ` Q${xy(loop[i])} ${xy(mid(loop[i], loop[(i + 1) % loop.length]))}`;
  }
  return `${d} Z`;
}

/**
 * @typedef {object} Glint
 * @property {number} x
 * @property {number} y  the middle of the glint, in map units
 * @property {number} angle  along the water, in degrees
 * @property {number} length  in map units
 * @property {number} width  in map units
 * @property {number} delay  seconds into its cycle at the start (0 or less)
 * @property {number} duration  one cycle, in seconds
 * @property {number} peak  its brightest opacity
 */

/**
 * Light catching the water: short soft glints scattered along the river,
 * not down its middle and not evenly spaced, each a different length and
 * each with its own slow rhythm, so the river shimmers instead of reading
 * as a road with lane markings. Where they go follows the same curve
 * smoothPath draws, and is the same on every visit (a fixed seed).
 * @param {readonly Point[]} points the river's course
 * @param {{seed?: number, every?: number, halfWidth?: number}} [opts]
 *   every: about one glint per this many map units of river;
 *   halfWidth: how far either side of the middle they may stray
 * @returns {Glint[]}
 */
export function riverGlints(points, opts = {}) {
  const every = opts.every ?? 5;
  const half = opts.halfWidth ?? 1.3;
  let state = (opts.seed ?? 0x5eed) >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** @type {Glint[]} */
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[i];
    const c = points[i + 1];
    const e = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 };
    const c2 = { x: c.x - (e.x - b.x) / 6, y: c.y - (e.y - b.y) / 6 };
    /** @param {number} t */
    const at = (t) => {
      const m = 1 - t;
      return {
        x: m * m * m * b.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * c.x,
        y: m * m * m * b.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * c.y,
      };
    };
    const span = Math.hypot(c.x - b.x, c.y - b.y);
    // Irregular: a jittered count per stretch, at jittered places along it.
    const count = Math.max(0, Math.round(span / every + (rand() - 0.5) * 1.5));
    for (let k = 0; k < count; k += 1) {
      const t = Math.min(0.98, Math.max(0.02, (k + 0.15 + rand() * 0.7) / count));
      const p = at(t);
      const q = at(Math.min(1, t + 0.01));
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const norm = Math.hypot(dx, dy) || 1;
      const off = (rand() * 2 - 1) * half;
      out.push({
        x: p.x - (dy / norm) * off,
        y: p.y + (dx / norm) * off,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        length: 1.2 + rand() * 2.4,
        width: 0.35 + rand() * 0.4,
        delay: -Math.round(rand() * 80) / 10,
        duration: Math.round(30 + rand() * 50) / 10,
        peak: Math.round((0.45 + rand() * 0.4) * 100) / 100,
      });
    }
  }
  return out;
}

// --- the levels ---

/**
 * The level to play next: the first level in campaign order that is open
 * and not yet cleared, or null when the campaign is done.
 * @param {readonly CampaignNode[]} nodes
 * @param {Progress} progress
 * @returns {string|null}
 */
export function nextLevelId(nodes, progress) {
  const open = unlockedLevels(progress, /** @type {CampaignNode[]} */ (nodes));
  for (const n of nodes) {
    if (open.has(n.levelId) && progress.cleared[n.levelId] !== true) return n.levelId;
  }
  return null;
}

/**
 * @param {readonly CampaignNode[]} nodes
 * @param {Progress} progress
 * @returns {Map<string, NodeState>}
 */
export function nodeStates(nodes, progress) {
  const open = unlockedLevels(progress, /** @type {CampaignNode[]} */ (nodes));
  const next = nextLevelId(nodes, progress);
  /** @type {Map<string, NodeState>} */
  const out = new Map();
  for (const n of nodes) {
    if (progress.cleared[n.levelId] === true) out.set(n.levelId, 'cleared');
    else if (n.levelId === next) out.set(n.levelId, 'next');
    else out.set(n.levelId, open.has(n.levelId) ? 'open' : 'locked');
  }
  return out;
}

/**
 * The marker a level shows: its own landmark, or the stake when it has
 * none; once cleared, the sapling, as a badge on the landmark or in the
 * stake's place. `image` is null when there is no art at all (the view
 * then draws a disc).
 * @param {{levelId: string, landmark?: string}} node
 * @param {NodeState} state
 * @param {Readonly<Record<string, string>>} markers the marker images that exist
 * @returns {Marker}
 */
export function markerFor(node, state, markers) {
  const cleared = state === 'cleared';
  const has = (/** @type {string} */ key) => Object.prototype.hasOwnProperty.call(markers, key);
  if (node.landmark !== undefined && has(node.landmark)) {
    return { image: node.landmark, badge: cleared && has('sapling') ? 'sapling' : null };
  }
  if (cleared && has('sapling')) return { image: 'sapling', badge: null };
  if (has('stake')) return { image: 'stake', badge: null };
  return { image: null, badge: null };
}

/**
 * The ground greened round each cleared level.
 * @param {ReadonlyArray<{levelId: string, x: number, y: number}>} nodes
 * @param {Progress} progress
 * @returns {{levelId: string, x: number, y: number, r: number}[]}
 */
export function patches(nodes, progress) {
  return nodes
    .filter((n) => progress.cleared[n.levelId] === true)
    .map((n) => ({ levelId: n.levelId, x: n.x, y: n.y, r: PATCH_RADIUS }));
}

/**
 * Dots along the straight line a to b, evenly spaced, none closer than
 * `margin` to either end.
 * @param {Point} a
 * @param {Point} b
 * @param {number} [spacing]
 * @param {number} [margin]
 * @returns {Point[]}
 */
export function pathDots(a, b, spacing = DOT_SPACING, margin = DOT_MARGIN) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const room = len - 2 * margin;
  if (room < 0) return [];
  const count = Math.floor(room / spacing) + 1;
  const step = count > 1 ? room / (count - 1) : 0;
  /** @type {Point[]} */
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = (margin + (count > 1 ? i * step : room / 2)) / len;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/**
 * Every path on the whole map, in column units: from home to the first
 * level, one per unlock, and from the first level to the trading post.
 * A path is lit once the level it leaves is cleared (the one from home
 * always is).
 * @param {Stack} stack
 * @param {readonly CampaignNode[]} nodes
 * @param {MapPlace} home
 * @param {MapPlace} post
 * @param {Progress} progress
 * @returns {Edge[]}
 */
export function mapEdges(stack, nodes, home, post, progress) {
  const at = new Map(nodes.map((n) => [n.levelId, toColumn(stack, n)]));
  /** @type {Edge[]} */
  const out = [];
  if (nodes.length === 0) return out;
  const first = nodes[0].levelId;
  const firstAt = /** @type {Point} */ (at.get(first));
  out.push({ from: 'home', to: first, lit: true, dots: pathDots(toColumn(stack, home), firstAt, DOT_SPACING, PLACE_SIZE / 2) });
  for (const n of nodes) {
    for (const id of n.unlocks) {
      const to = at.get(id);
      if (to === undefined) continue;
      out.push({ from: n.levelId, to: id, lit: progress.cleared[n.levelId] === true, dots: pathDots(/** @type {Point} */ (at.get(n.levelId)), to) });
    }
  }
  out.push({ from: first, to: 'post', lit: true, dots: pathDots(firstAt, toColumn(stack, post), DOT_SPACING, PLACE_SIZE / 2) });
  return out;
}

// --- names ---

/**
 * The cream plate a name fills when written at `at`: `at.x` is the
 * plate's left edge ('start'), centre ('middle') or right edge ('end');
 * `at.y` is the baseline.
 * @param {string} text
 * @param {LabelAt} at
 * @returns {Box}
 */
export function labelBox(text, at) {
  const w = text.length * LABEL_CHAR_W + 2 * LABEL_PAD_X;
  const x0 = at.anchor === 'start' ? at.x : at.anchor === 'end' ? at.x - w : at.x - w / 2;
  return { x0, y0: at.y - LABEL_ASCENT, x1: x0 + w, y1: at.y + LABEL_DESCENT };
}

/**
 * The box the trading post's or home's marker fills.
 * @param {Point} p
 * @returns {Box}
 */
export function placeBox(p) {
  const h = PLACE_SIZE / 2 - 1;
  return { x0: p.x - h, y0: p.y - h, x1: p.x + h, y1: p.y + h };
}

/**
 * A centred name kept inside the column's width.
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @returns {LabelAt}
 */
function centred(text, x, y) {
  const half = (text.length * LABEL_CHAR_W) / 2 + LABEL_PAD_X + 1;
  return { x: Math.min(PLATE_W - half, Math.max(half, x)), y, anchor: 'middle' };
}

/**
 * Where the trading post's name goes: under its marker.
 * @param {Point} post
 * @returns {LabelAt}
 */
export function postLabel(post) {
  return centred('Trading post', post.x, post.y + PLACE_SIZE / 2 - 1 + LABEL_GAP + LABEL_ASCENT);
}

/**
 * A name's fallback spot: centred under its marker, kept inside the
 * column's width.
 * @param {string} name
 * @param {Point} node
 * @returns {LabelAt}
 */
export function labelPlacement(name, node) {
  return centred(name, node.x, node.y + NODE_CLEARANCE + LABEL_GAP + LABEL_ASCENT);
}

/**
 * @param {Box} a
 * @param {Box} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * @param {Box} box
 * @param {Point} c
 * @param {number} r
 * @returns {boolean}
 */
function hitsCircle(box, c, r) {
  const dx = c.x - Math.min(Math.max(c.x, box.x0), box.x1);
  const dy = c.y - Math.min(Math.max(c.y, box.y0), box.y1);
  return dx * dx + dy * dy < r * r;
}

/**
 * Where every level's name goes, by level id, in column units. Each
 * name tries below its marker, right of it, above it and left of it,
 * then below and above but running off to one side. A
 * spot is out when the name would leave the column or sit on a level's
 * marker, another place's marker or a name already put down. Of the
 * spots left it takes the one over the fewest path dots, the earlier
 * one on a tie. With no spot left it falls back to `labelPlacement`.
 * @param {ReadonlyArray<{levelId: string, x: number, y: number}>} nodes in column units
 * @param {readonly Point[]} places the other markers (trading post, home)
 * @param {ReadonlyArray<{dots: Point[]}>} paths
 * @param {Record<string, string>} names level names by id
 * @param {number} height the column's height
 * @param {Box[]} [taken] room already used (the trading post's name)
 * @returns {Map<string, LabelAt>}
 */
export function placeLabels(nodes, places, paths, names, height, taken = []) {
  /** @type {Map<string, LabelAt>} */
  const out = new Map();
  const used = [...places.map(placeBox), ...taken];
  const dots = paths.flatMap((p) => p.dots);
  const side = NODE_CLEARANCE + LABEL_GAP;
  for (const node of nodes) {
    const text = names[node.levelId] ?? node.levelId;
    const below = labelPlacement(text, node);
    const above = centred(text, node.x, node.y - side - LABEL_DESCENT);
    /** @type {LabelAt[]} */
    const spots = [
      below,
      { x: node.x + side, y: node.y + 1.2, anchor: 'start' },
      above,
      { x: node.x - side, y: node.y + 1.2, anchor: 'end' },
      // Then off to one side, below and above.
      { x: node.x - 2, y: below.y, anchor: 'start' },
      { x: node.x + 2, y: below.y, anchor: 'end' },
      { x: node.x - 2, y: above.y, anchor: 'start' },
      { x: node.x + 2, y: above.y, anchor: 'end' },
    ];
    /** @type {LabelAt|null} */
    let best = null;
    let bestCost = Infinity;
    for (const spot of spots) {
      const box = labelBox(text, spot);
      if (box.x0 < 1 || box.x1 > PLATE_W - 1 || box.y0 < 1 || box.y1 > height - 1) continue;
      if (nodes.some((n) => hitsCircle(box, n, NODE_CLEARANCE))) continue;
      if (used.some((t) => overlaps(box, t))) continue;
      const cost = dots.filter((d) => hitsCircle(box, d, DOT_RADIUS)).length;
      if (cost < bestCost) {
        best = spot;
        bestCost = cost;
      }
    }
    const at = best ?? labelPlacement(text, node);
    out.set(node.levelId, at);
    used.push(labelBox(text, at));
  }
  return out;
}

// --- scrolling ---

/**
 * The height in the column the map opens on: the next level, or the
 * highest place on the map once every level is cleared.
 * @param {{next: string|null, nodes: ReadonlyArray<{levelId: string, y: number}>, height: number}} layout
 * @returns {number}
 */
export function scrollFocusY(layout) {
  const next = layout.nodes.find((n) => n.levelId === layout.next);
  if (next !== undefined) return next.y;
  if (layout.nodes.length === 0) return layout.height;
  return Math.min(...layout.nodes.map((n) => n.y));
}

/**
 * The scroll offset, in pixels, that puts `focusY` (column units) a
 * little below the middle of the view, so more of the way ahead shows
 * above it, kept within the column.
 * @param {number} focusY
 * @param {number} height the column's height in units
 * @param {number} columnPx the column's height on screen
 * @param {number} viewPx the scrolling view's height
 * @returns {number}
 */
export function scrollTopFor(focusY, height, columnPx, viewPx) {
  if (height <= 0) return 0;
  const want = (focusY / height) * columnPx - viewPx * 0.55;
  return Math.round(Math.min(Math.max(0, columnPx - viewPx), Math.max(0, want)));
}

// --- the keyboard's places ---

/** The trading post's id among the places the keyboard can select. */
export const POST_ID = 'post';

/**
 * The places the keyboard's selection moves between, in column units:
 * every level shown, in campaign order, then the trading post. Home is
 * only the start of the path, and is not one.
 * @param {{nodes: ReadonlyArray<{levelId: string, x: number, y: number}>, post: Point}} layout
 * @returns {Array<{id: string, x: number, y: number}>}
 */
export function mapPlaces(layout) {
  return [
    ...layout.nodes.map((n) => ({ id: n.levelId, x: n.x, y: n.y })),
    { id: POST_ID, x: layout.post.x, y: layout.post.y },
  ];
}

/**
 * Where the keyboard's selection starts: the level to play next, else
 * (every level cleared) the highest one on the map, else the trading post.
 * @param {{next: string|null, nodes: ReadonlyArray<{levelId: string, y: number}>}} layout
 * @returns {string}
 */
export function mapStartPlace(layout) {
  if (layout.next !== null && layout.nodes.some((n) => n.levelId === layout.next)) return layout.next;
  if (layout.nodes.length === 0) return POST_ID;
  return layout.nodes.reduce((top, n) => (n.y < top.y ? n : top)).levelId;
}

// --- the whole map ---

/**
 * @param {{regions: ReadonlyArray<MapRegion>, nodes: readonly CampaignNode[], post: MapPlace, home: MapPlace}} map
 * @param {Progress} progress
 * @param {Record<string, string>} names level names by id
 * @param {Readonly<Record<string, string>>} markers the marker images that exist
 */
export function buildMapLayout(map, progress, names, markers) {
  const stack = stackRegions(map.regions);
  const states = nodeStates(map.nodes, progress);
  const revealed = revealedRegions(map.regions, map.nodes, progress);
  const home = toColumn(stack, map.home);
  const post = toColumn(stack, map.post);
  const all = map.nodes.map((n, i) => ({ ...toColumn(stack, n), levelId: n.levelId, node: n, number: i + 1 }));
  const allEdges = mapEdges(stack, map.nodes, map.home, map.post, progress);

  // Names go down on the whole map, so they stay put as places are revealed.
  const postAt = postLabel(post);
  const labels = placeLabels(all, [post, home], allEdges, names, stack.height, [labelBox('Trading post', postAt)]);

  const shown = all.filter((n) => states.get(n.levelId) !== 'locked');
  const shownIds = new Set(['home', 'post', ...shown.map((n) => n.levelId)]);
  return {
    height: stack.height,
    regions: stack.regions.map((r) => ({ ...r, revealed: revealed.has(r.id) })),
    river: riverPoints(stack, map.regions),
    next: nextLevelId(map.nodes, progress),
    patches: patches(shown, progress),
    edges: allEdges.filter((e) => shownIds.has(e.from) && shownIds.has(e.to)),
    home: { x: home.x, y: home.y },
    post: { x: post.x, y: post.y, label: postAt },
    nodes: shown.map((n) => {
      const state = /** @type {NodeState} */ (states.get(n.levelId));
      const text = names[n.levelId] ?? n.levelId;
      return {
        levelId: n.levelId, x: n.x, y: n.y, number: n.number, state,
        marker: markerFor(n.node, state, markers),
        label: { text, .../** @type {LabelAt} */ (labels.get(n.levelId)) },
      };
    }),
  };
}
