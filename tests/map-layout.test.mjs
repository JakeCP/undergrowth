import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextLevelId, nodeStates, patches, pathDots, labelPlacement, buildMapLayout, TAP_MIN_PX,
  placeLabels, labelBox, placeBox, LABEL_CHAR_W, LABEL_PAD_X, LABEL_ASCENT, LABEL_DESCENT, NODE_CLEARANCE, DOT_RADIUS,
  PLATE_H, REGION_OVERLAP, MARKER_SIZE, stackRegions, toColumn, revealedRegions, markerFor, riverPoints, riverGlints, riverRibbon, smoothPath,
  scrollFocusY, scrollTopFor, mapEdges,
} from '../js/ui/map-layout.js';
import { REGIONS, CAMPAIGN_NODES, TRADING_POST, HOME_CAMP } from '../data/campaign.js';
import { LEVELS } from '../data/levels/index.js';
import { MAP_ASSETS } from '../js/ui/map-assets.js';

const prog = (...ids) => ({
  version: 1, seeds: 0, bands: {}, cleared: Object.fromEntries(ids.map((i) => [i, true])),
});
const MAP = { regions: REGIONS, nodes: CAMPAIGN_NODES, post: TRADING_POST, home: HOME_CAMP };
const NAMES = Object.fromEntries(LEVELS.map((l) => [l.id, l.name]));
const ALL = CAMPAIGN_NODES.map((n) => n.levelId);
const build = (progress, markers = MAP_ASSETS.markers) => buildMapLayout(MAP, progress, NAMES, markers);

/** A test map of three regions, one level in each of the first two. */
const R3 = [
  { id: 'a', name: 'A', plate: 'pa', river: [[10, 150], [20, 0]] },
  { id: 'b', name: 'B', plate: 'pb', river: [[20, 150], [30, 0]] },
  { id: 'c', name: 'C', plate: 'pc', river: [[30, 150], [40, 0]] },
];
const N3 = [
  { levelId: 'x', region: 'a', x: 40, y: 80, unlocks: ['y'] },
  { levelId: 'y', region: 'b', x: 60, y: 70, unlocks: [] },
];

// --- the column of regions ---

test('stackRegions: plates stack bottom first, overlapping by 12% of a plate', () => {
  assert.equal(REGION_OVERLAP, PLATE_H * 0.12);
  const s = stackRegions(R3);
  assert.equal(s.height, 3 * PLATE_H - 2 * REGION_OVERLAP);
  assert.deepEqual(s.regions.map((r) => [r.id, r.top]), [
    ['a', 2 * (PLATE_H - REGION_OVERLAP)], ['b', PLATE_H - REGION_OVERLAP], ['c', 0],
  ]);
  assert.equal(s.regions[0].top + PLATE_H, s.height, 'the first region is at the bottom');
  for (const r of s.regions) assert.equal(r.bottom, r.top + PLATE_H);
  assert.equal(stackRegions([]).height, 0);
  const real = stackRegions(REGIONS);
  assert.equal(real.height, 2 * PLATE_H - REGION_OVERLAP);
  assert.deepEqual(real.regions.map((r) => r.id), ['home-wood', 'cut-valley']);
});

test('toColumn: a place in its region becomes a point in the column', () => {
  const s = stackRegions(R3);
  assert.deepEqual(toColumn(s, { region: 'a', x: 40, y: 80 }), { x: 40, y: 2 * (PLATE_H - REGION_OVERLAP) + 80 });
  assert.deepEqual(toColumn(s, { region: 'c', x: 5, y: 10 }), { x: 5, y: 10 });
  assert.throws(() => toColumn(s, { region: 'nowhere', x: 0, y: 0 }), /nowhere/);
});

test('revealedRegions: a region shows once any of its levels is open', () => {
  assert.deepEqual([...revealedRegions(R3, N3, prog())], ['a']);
  assert.deepEqual([...revealedRegions(R3, N3, prog('x'))], ['a', 'b']);
  assert.deepEqual([...revealedRegions(REGIONS, CAMPAIGN_NODES, prog())], ['home-wood']);
  assert.deepEqual([...revealedRegions(REGIONS, CAMPAIGN_NODES, prog('o01'))], ['home-wood']);
  assert.deepEqual([...revealedRegions(REGIONS, CAMPAIGN_NODES, prog('o01', 'o02'))], ['home-wood', 'cut-valley']);
});

test('riverPoints: one course from the bottom of the column to its top, region by region', () => {
  const s = stackRegions(R3);
  const pts = riverPoints(s, R3);
  assert.equal(pts.length, 6);
  assert.deepEqual(pts[0], { x: 10, y: s.height });
  assert.deepEqual(pts[pts.length - 1], { x: 40, y: 0 });
  const real = riverPoints(stackRegions(REGIONS), REGIONS);
  assert.equal(real[0].y, stackRegions(REGIONS).height, 'it enters at the foot of the map');
  assert.equal(real[real.length - 1].y, 0, 'and leaves at the top');
  for (let i = 1; i < real.length; i += 1) {
    assert.ok(Math.hypot(real[i].x - real[i - 1].x, real[i].y - real[i - 1].y) < 50, `no jump at point ${i}`);
    assert.ok(real[i].y < real[i - 1].y, `it never runs back down, at point ${i}`);
  }
});

test('smoothPath: a curve through every point, scaled', () => {
  const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], 2);
  assert.match(d, /^M0 0 C/);
  assert.equal((d.match(/C/g) ?? []).length, 2);
  assert.ok(d.endsWith('40 0'));
  assert.equal(smoothPath([], 1), '');
});

// --- the places ---

test('nextLevelId: first level at the start, then the first open uncleared level', () => {
  assert.equal(nextLevelId(CAMPAIGN_NODES, prog()), 'o01');
  assert.equal(nextLevelId(CAMPAIGN_NODES, prog('o01')), 'o02');
  assert.equal(nextLevelId(CAMPAIGN_NODES, prog('o01', 'o02')), 'l01');
  assert.equal(nextLevelId(CAMPAIGN_NODES, prog('o01', 'o02', 'l01')), 'l02');
  assert.equal(nextLevelId(CAMPAIGN_NODES, prog('o01', 'o02', 'l01', 'l02')), 'l03');
  assert.equal(nextLevelId(CAMPAIGN_NODES, prog('o01', 'o02', 'l01', 'l02', 'l03')), 'l04');
  assert.equal(nextLevelId(CAMPAIGN_NODES, prog(...ALL)), null);
});

test('nodeStates: cleared, next, open and locked', () => {
  const s = nodeStates(CAMPAIGN_NODES, prog('o01', 'o02', 'l01'));
  assert.deepEqual(Object.fromEntries(s), {
    o01: 'cleared', o02: 'cleared', l01: 'cleared', l02: 'next', l03: 'open', l04: 'locked', l05: 'locked',
  });
});

test('a locked level is not on the map at all: no place, no name, no path to it', () => {
  const fresh = build(prog());
  assert.deepEqual(fresh.nodes.map((n) => n.levelId), ['o01']);
  assert.ok(fresh.edges.every((e) => e.to !== 'o02'), 'no path to o02 yet');
  const mid = build(prog('o01', 'o02', 'l01'));
  assert.deepEqual(mid.nodes.map((n) => n.levelId), ['o01', 'o02', 'l01', 'l02', 'l03']);
  for (const e of mid.edges) {
    for (const end of [e.from, e.to]) {
      assert.ok(['home', 'post', 'o01', 'o02', 'l01', 'l02', 'l03'].includes(end), `${e.from}-${e.to}`);
    }
  }
  assert.equal(build(prog(...ALL)).nodes.length, CAMPAIGN_NODES.length);
});

test('a level opened by another route shows its path from the cleared level only', () => {
  // l03 cleared opens l04; l02 is open but not cleared, so its path to l04 shows too: both ends are on the map.
  const m = build(prog('o01', 'o02', 'l01', 'l03'));
  const ids = m.edges.map((e) => `${e.from}-${e.to}`);
  assert.ok(ids.includes('l03-l04') && ids.includes('l02-l04'));
  assert.equal(m.edges.find((e) => e.from === 'l03' && e.to === 'l04').lit, true);
  assert.equal(m.edges.find((e) => e.from === 'l02' && e.to === 'l04').lit, false);
  assert.ok(!ids.some((id) => id.endsWith('-l05')));
});

test('the path starts at home, and the trading post hangs off the first level', () => {
  const m = build(prog());
  const start = m.edges.find((e) => e.from === 'home');
  assert.equal(start.to, 'o01');
  assert.equal(start.lit, true);
  assert.ok(start.dots.length > 0);
  const post = m.edges.find((e) => e.to === 'post');
  assert.equal(post.from, 'o01');
  assert.ok(post.dots.length > 0);
  assert.deepEqual({ x: m.home.x, y: m.home.y }, toColumn(stackRegions(REGIONS), HOME_CAMP));
  assert.deepEqual({ x: m.post.x, y: m.post.y }, toColumn(stackRegions(REGIONS), TRADING_POST));
});

test('regions carry their plate, place in the column and whether they are revealed', () => {
  const fresh = build(prog());
  assert.equal(fresh.height, stackRegions(REGIONS).height);
  assert.deepEqual(fresh.regions.map((r) => [r.id, r.plate, r.revealed]), [
    ['home-wood', 'map-01-home-wood', true], ['cut-valley', 'map-02-cut-valley', false],
  ]);
  assert.equal(build(prog('o01', 'o02')).regions[1].revealed, true);
});

test('markerFor: its own landmark, else the stake; a cleared level gets the sapling', () => {
  const all = { stake: 's', sapling: 'p', 'o01-mown-strip': 'm' };
  const node = { levelId: 'o01', landmark: 'o01-mown-strip' };
  const bare = { levelId: 'l09', landmark: 'l09-not-painted' };
  assert.deepEqual(markerFor(node, 'next', all), { image: 'o01-mown-strip', badge: null });
  assert.deepEqual(markerFor(node, 'cleared', all), { image: 'o01-mown-strip', badge: 'sapling' });
  assert.deepEqual(markerFor(bare, 'open', all), { image: 'stake', badge: null });
  assert.deepEqual(markerFor(bare, 'cleared', all), { image: 'sapling', badge: null }, 'the sapling replaces the stake');
  assert.deepEqual(markerFor({ levelId: 'l09' }, 'open', all), { image: 'stake', badge: null });
  assert.deepEqual(markerFor(node, 'cleared', {}), { image: null, badge: null }, 'no art: the drawn disc');
  assert.deepEqual(markerFor(node, 'cleared', { 'o01-mown-strip': 'm' }), { image: 'o01-mown-strip', badge: null });
});

test('every shipped level shows its own landmark', () => {
  const m = build(prog(...ALL));
  for (const n of m.nodes) assert.equal(n.marker.image, CAMPAIGN_NODES.find((c) => c.levelId === n.levelId).landmark, n.levelId);
  assert.ok(m.nodes.every((n) => n.marker.badge === 'sapling'));
});

test('patches: the ground greens round each cleared level on the map', () => {
  const p = patches(CAMPAIGN_NODES, prog('l01', 'l03'));
  assert.deepEqual(p.map((x) => x.levelId), ['l01', 'l03']);
  assert.ok(p.every((x) => x.r > 0));
  const m = build(prog('o01', 'o02'));
  assert.deepEqual(m.patches.map((x) => x.levelId), ['o01', 'o02']);
  const o01 = m.nodes.find((n) => n.levelId === 'o01');
  assert.deepEqual([m.patches[0].x, m.patches[0].y], [o01.x, o01.y], 'in column units');
});

test('pathDots: evenly spread, clear of both ends, deterministic', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 30, y: 0 };
  const dots = pathDots(a, b, 5, 7);
  assert.ok(dots.length >= 3);
  for (const d of dots) {
    assert.ok(Math.hypot(d.x - a.x, d.y - a.y) >= 7 - 1e-9);
    assert.ok(Math.hypot(d.x - b.x, d.y - b.y) >= 7 - 1e-9);
  }
  assert.deepEqual(pathDots(a, b, 5, 7), dots);
  assert.deepEqual(pathDots(a, { x: 5, y: 0 }, 5, 7), []);
});

test('mapEdges: one per unlock, the start and the trading post, each with dots', () => {
  const s = stackRegions(REGIONS);
  const e = mapEdges(s, CAMPAIGN_NODES, HOME_CAMP, TRADING_POST, prog('o01', 'o02', 'l01'));
  assert.equal(e.length, 1 + 1 + 1 + 2 + 1 + 1 + 1 + 1);
  assert.ok(e.every((x) => x.dots.length > 0), 'no two places so close that their path has no dots');
  assert.equal(e.find((x) => x.from === 'l01' && x.to === 'l02').lit, true);
  assert.equal(e.find((x) => x.from === 'l02' && x.to === 'l04').lit, false);
});

// --- scrolling ---

test('scrollFocusY: the next level, or the highest place once all are cleared', () => {
  const fresh = build(prog());
  assert.equal(scrollFocusY(fresh), fresh.nodes[0].y);
  const mid = build(prog('o01', 'o02', 'l01'));
  assert.equal(scrollFocusY(mid), mid.nodes.find((n) => n.levelId === 'l02').y);
  const done = build(prog(...ALL));
  assert.equal(scrollFocusY(done), Math.min(...done.nodes.map((n) => n.y)));
});

test('scrollTopFor: the focus a little below the middle of the view, never past either end', () => {
  // A 1000 px column of 250 units in a 400 px view.
  assert.equal(scrollTopFor(125, 250, 1000, 400), 500 - 220);
  assert.equal(scrollTopFor(10, 250, 1000, 400), 0, 'not above the top');
  assert.equal(scrollTopFor(245, 250, 1000, 400), 600, 'not below the bottom');
  assert.equal(scrollTopFor(100, 250, 300, 400), 0, 'a column shorter than the view does not scroll');
  // A new game opens on the first level, at the foot of the map.
  const fresh = build(prog());
  const px = fresh.height * 3.9;
  const top = scrollTopFor(scrollFocusY(fresh), fresh.height, px, 600);
  const y = (fresh.nodes[0].y / fresh.height) * px - top;
  assert.ok(y > 0 && y < 600, 'level 1 is in view');
});

// --- names ---

/** @param {{x0: number, y0: number, x1: number, y1: number}} a @param {{x0: number, y0: number, x1: number, y1: number}} b */
function boxesOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** @param {{x0: number, y0: number, x1: number, y1: number}} box @param {{x: number, y: number}} c @param {number} r */
function boxHitsCircle(box, c, r) {
  const dx = c.x - Math.min(Math.max(c.x, box.x0), box.x1);
  const dy = c.y - Math.min(Math.max(c.y, box.y0), box.y1);
  return dx * dx + dy * dy < r * r;
}

test('labelBox: the cream plate a name takes, from its anchor', () => {
  const w = 4 * LABEL_CHAR_W + 2 * LABEL_PAD_X;
  const near = (box, want) => {
    for (const k of ['x0', 'y0', 'x1', 'y1']) assert.ok(Math.abs(box[k] - want[k]) < 1e-9, `${k}: ${box[k]} is not ${want[k]}`);
  };
  near(labelBox('Abcd', { x: 50, y: 40, anchor: 'start' }), { x0: 50, y0: 40 - LABEL_ASCENT, x1: 50 + w, y1: 40 + LABEL_DESCENT });
  near(labelBox('Abcd', { x: 50, y: 40, anchor: 'end' }), { x0: 50 - w, y0: 40 - LABEL_ASCENT, x1: 50, y1: 40 + LABEL_DESCENT });
  near(labelBox('Abcd', { x: 50, y: 40, anchor: 'middle' }), { x0: 50 - w / 2, y0: 40 - LABEL_ASCENT, x1: 50 + w / 2, y1: 40 + LABEL_DESCENT });
});

test('placeLabels: two places side by side do not write over each other', () => {
  const nodes = [
    { levelId: 'a', x: 40, y: 50, unlocks: ['b'] },
    { levelId: 'b', x: 60, y: 50, unlocks: [] },
  ];
  const names = { a: 'The Very Long Meadow', b: 'The Other Long Meadow' };
  const post = { x: 50, y: 90 };
  const placed = placeLabels(nodes, [post], [], names, 120);
  const a = labelBox(names.a, placed.get('a'));
  const b = labelBox(names.b, placed.get('b'));
  assert.ok(!boxesOverlap(a, b), `${JSON.stringify(a)} over ${JSON.stringify(b)}`);
  for (const n of nodes) {
    assert.ok(!boxHitsCircle(a, n, NODE_CLEARANCE), `a over the marker of ${n.levelId}`);
    assert.ok(!boxHitsCircle(b, n, NODE_CLEARANCE), `b over the marker of ${n.levelId}`);
  }
});

test('the real map: all seven names and the trading post clear of each other, every marker and the path', () => {
  // Names are placed on the whole map, so they never move as places are revealed.
  const whole = build(prog(...ALL));
  const boxes = [
    ...whole.nodes.map((n) => ({ id: n.levelId, box: labelBox(n.label.text, n.label) })),
    { id: 'post', box: labelBox('Trading post', whole.post.label) },
  ];
  assert.equal(boxes.length, 8);
  const dots = whole.edges.flatMap((e) => e.dots);
  const markers = [whole.post, whole.home].map((p) => ({ id: p === whole.post ? 'post' : 'home', box: placeBox(p) }));
  for (const [i, a] of boxes.entries()) {
    assert.ok(a.box.x0 >= 0 && a.box.x1 <= 100 && a.box.y0 >= 0 && a.box.y1 <= whole.height, `${a.id} is off the map: ${JSON.stringify(a.box)}`);
    for (const b of boxes.slice(i + 1)) assert.ok(!boxesOverlap(a.box, b.box), `${a.id} is written over ${b.id}`);
    for (const n of whole.nodes) assert.ok(!boxHitsCircle(a.box, n, NODE_CLEARANCE), `${a.id} is written over the place ${n.levelId}`);
    for (const m of markers) assert.ok(!boxesOverlap(a.box, m.box), `${a.id} is written over the ${m.id} marker`);
    for (const d of dots) assert.ok(!boxHitsCircle(a.box, d, DOT_RADIUS), `${a.id} is written over a path dot at ${d.x.toFixed(1)},${d.y.toFixed(1)}`);
  }
  for (const cleared of [[], ['o01'], ['o01', 'o02', 'l01']]) {
    const m = build(prog(...cleared));
    for (const n of m.nodes) {
      const w = whole.nodes.find((x) => x.levelId === n.levelId);
      assert.deepEqual(n.label, w.label, `${n.levelId}'s name stays put`);
    }
  }
});

test('placeLabels: with no free side a name falls back to labelPlacement and stays on the map', () => {
  const nodes = [
    { levelId: 'mid', x: 50, y: 50, unlocks: [] },
    { levelId: 'n', x: 50, y: 38, unlocks: [] },
    { levelId: 's', x: 50, y: 62, unlocks: [] },
  ];
  const long = 'A name that runs right across the whole of the valley';
  const placed = placeLabels(nodes, [], [], { mid: long, n: long, s: long }, 100);
  assert.equal(placed.size, 3);
  for (const n of nodes) {
    const at = placed.get(n.levelId);
    assert.ok(at.x >= 0 && at.x <= 100 && at.y >= 0 && at.y <= 100, n.levelId);
  }
  const l = labelPlacement('The Clearing Edge', { x: 95, y: 40 });
  assert.ok(labelBox('The Clearing Edge', l).x1 <= 100);
});

// --- the places as data ---

test('every place sits in its own region, clear of the blend between plates', () => {
  const s = stackRegions(REGIONS);
  const lowest = REGIONS[0].id;
  const half = MARKER_SIZE / 2;
  for (const p of [...CAMPAIGN_NODES, { ...TRADING_POST, levelId: 'post' }, { ...HOME_CAMP, levelId: 'home' }]) {
    assert.ok(s.regions.some((r) => r.id === p.region), `${p.levelId}: no region ${p.region}`);
    assert.ok(p.x - half >= 0 && p.x + half <= 100, `${p.levelId} is off the side`);
    assert.ok(p.y - half >= REGION_OVERLAP, `${p.levelId} is in the blend above it`);
    const floor = p.region === lowest ? PLATE_H : PLATE_H - REGION_OVERLAP;
    assert.ok(p.y + half <= floor, `${p.levelId} is in the blend below it`);
  }
});

test('places are far enough apart for a thumb at 360 px wide', () => {
  const m = build(prog(...ALL));
  const px = 360 / 100;
  const pts = [...m.nodes.map((n) => ({ id: n.levelId, x: n.x, y: n.y })), { id: 'post', ...m.post }, { id: 'home', ...m.home }];
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      assert.ok(d >= MARKER_SIZE + 2, `${pts[i].id} to ${pts[j].id} is ${d.toFixed(1)} units: the markers touch`);
      assert.ok(d * px >= TAP_MIN_PX, `${pts[i].id} to ${pts[j].id}`);
    }
  }
  assert.ok(MARKER_SIZE * px >= TAP_MIN_PX, 'a marker is a whole tap target');
});

// The audit: the river's shimmer was a dashed line down its middle, so it
// read as a road with lane markings. Now it is soft glints scattered
// across the water, irregular in place, length and rhythm.
test('riverRibbon: a closed band along the river whose banks wander, the same every time', () => {
  const course = [{ x: 10, y: 0 }, { x: 14, y: 30 }, { x: 8, y: 60 }, { x: 20, y: 90 }];
  const d = riverRibbon(course, 4, 2);
  assert.match(d, /^M[\d.-]+ [\d.-]+( Q[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+)+ Z$/, 'one closed curve');
  assert.equal(riverRibbon(course, 4, 2), d);
  assert.equal(riverRibbon([], 4, 2), '');
  assert.equal(riverRibbon([{ x: 1, y: 1 }], 4, 2), '');
  // Every point is near the course: within the half width and its
  // wobble (a quarter and a bit), scaled. The course runs up the page,
  // so at any height the band is to either side of it.
  const xs = [...d.matchAll(/Q([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]) / 4, Number(m[2]) / 4]);
  assert.ok(xs.length > 40, 'drawn finely enough to be smooth');
  for (const [x, y] of xs) {
    assert.ok(x > 8 - 4 && x < 20 + 4, `x ${x} strays from the river`);
    assert.ok(y > -4 && y < 94, `y ${y} strays from the river`);
  }
  // The width is not constant: a road's edges run parallel, a brook's do not.
  const widths = new Set(xs.slice(0, 20).map(([x], i) => Math.round((xs[xs.length - 1 - i][0] - x) * 10)));
  assert.ok(widths.size > 5, 'the band swells and narrows');
  // A wider band holds a narrower one's place; another phase moves the swelling.
  assert.notEqual(riverRibbon(course, 4, 3), d);
  assert.notEqual(riverRibbon(course, 4, 2, { phase: 1 }), d);
  assert.notEqual(riverRibbon(course, 4, 2, { wobble: 0 }), d);
});

test('riverGlints: scattered across the water, never evenly spaced or all down the middle, the same every visit', () => {
  const layout = build(prog(...ALL));
  const glints = riverGlints(layout.river);
  assert.ok(glints.length > 20, `${glints.length} glints`);
  assert.deepEqual(riverGlints(layout.river), glints, 'a fixed seed');
  // Each lies on the water: near the curve smoothPath draws (here, near a
  // straight run between the course's points, with room for the curve).
  const near = (g) => layout.river.some((p, i) => {
    const q = layout.river[i + 1];
    if (q === undefined) return false;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const t = Math.max(0, Math.min(1, ((g.x - p.x) * (q.x - p.x) + (g.y - p.y) * (q.y - p.y)) / (len * len)));
    return Math.hypot(p.x + t * (q.x - p.x) - g.x, p.y + t * (q.y - p.y) - g.y) < 4;
  });
  for (const g of glints) assert.ok(near(g), `${g.x},${g.y} is on the river`);
  const gaps = glints.slice(1).map((g, i) => Math.round(Math.hypot(g.x - glints[i].x, g.y - glints[i].y) * 10));
  assert.ok(new Set(gaps).size > gaps.length / 2, 'irregular spacing');
  assert.ok(new Set(glints.map((g) => Math.round(g.length * 10))).size > 10, 'different lengths');
  assert.ok(new Set(glints.map((g) => g.duration)).size > 10, 'each at its own pace');
  for (const g of glints) {
    assert.ok(g.delay <= 0 && g.duration >= 3 && g.peak > 0 && g.peak <= 1);
  }
});
