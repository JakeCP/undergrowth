import test from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS } from '../data/levels/index.js';
import { CAMPAIGN_NODES, TRADING_POST, HOME_CAMP, REGIONS } from '../data/campaign.js';
import { createBattle, applyMove, rewardFor } from '../js/engine/battle.js';
import { parseGrid } from '../js/engine/battle.js';
import { BAND_TYPES, STARTER_TYPES, recruitCost } from '../js/engine/units.js';
import { LEGEND, TERRAIN, canEnter } from '../js/engine/terrain.js';
import { reachable } from '../js/engine/band.js';
import { actionTargets } from '../js/engine/actions.js';
import { unlockedLevels } from '../js/campaign/campaign.js';
import { newProgress } from '../js/campaign/progress.js';
import { guaranteedRoster } from '../js/story/story.js';
import { battleMoments } from '../js/story/moments.js';
import { SCENES } from '../data/story/index.js';

/** @typedef {import('../js/engine/types.js').Level} Level */
/** @typedef {import('../js/engine/types.js').Solution} Solution */
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */

/**
 * The bands the story has surely given by this level, whichever route the
 * player took (opening-act spec, "Winnable with what the story has given you").
 * @param {string} levelId
 * @returns {string[]}
 */
function roster(levelId) {
  return guaranteedRoster(levelId, CAMPAIGN_NODES, SCENES, STARTER_TYPES);
}

/**
 * The save a line is played from: a new game, the level's roster at its
 * starting sizes, any shop band the line deploys at its starting size,
 * then the level's `assumes`.
 * @param {Level} level
 * @param {Solution} [solution]
 */
function progressFor(level, solution = level.solution) {
  const p = newProgress();
  for (const type of [...roster(level.id), ...solution.deploy.map((d) => d.type)]) {
    if (p.bands[type] === undefined) p.bands[type] = { maxLen: BAND_TYPES[type].startLen };
  }
  for (const [type, n] of Object.entries(level.assumes)) p.bands[type] = { maxLen: n };
  return p;
}

/**
 * Every state of a line, the start first.
 * @param {Level} level
 * @param {Solution} [solution]
 * @returns {BattleState[]}
 */
function states(level, solution = level.solution) {
  let state = createBattle(level, solution.deploy, progressFor(level, solution));
  const out = [state];
  for (const move of solution.moves) {
    assert.equal(state.outcome, null, `${level.id}: moves continue after the battle ended`);
    state = applyMove(state, move);
    out.push(state);
  }
  return out;
}

/**
 * @param {Level} level
 * @param {Solution} [solution]
 */
function replay(level, solution = level.solution) {
  const all = states(level, solution);
  return all[all.length - 1];
}

/**
 * The cells our bands lost over a line.
 * @param {Level} level
 * @param {Solution} [solution]
 * @returns {number}
 */
function damageTaken(level, solution = level.solution) {
  let total = 0;
  for (const state of states(level, solution)) {
    for (const e of state.events) {
      if (e.kind !== 'damage') continue;
      const band = state.bands.find((b) => b.id === e.band);
      const side = band?.side ?? BAND_TYPES[e.band]?.side;
      if (side === 'us') total += e.amount;
    }
  }
  return total;
}

/**
 * @param {string} id
 * @returns {Level}
 */
function levelOf(id) {
  const level = LEVELS.find((l) => l.id === id);
  assert.ok(level, id);
  return level;
}

const TABLE = {
  o01: { goal: 'capture', maxBands: 2, seeds: 10, habitats: 0, bots: ['harvester'] },
  o02: { goal: 'clear', maxBands: 2, seeds: 15, habitats: 1, bots: ['harvester'] },
  l01: { goal: 'capture', maxBands: 2, seeds: 20, habitats: 1, bots: ['harvester'] },
  l02: { goal: 'capture', maxBands: 3, seeds: 25, habitats: 2, bots: ['harvester', 'saw'] },
  l03: { goal: 'capture', maxBands: 3, seeds: 30, habitats: 2, bots: ['saw', 'planter'] },
  l04: { goal: 'rescue', maxBands: 3, seeds: 35, habitats: 2, bots: ['saw', 'harvester', 'harvester'] },
  l05: { goal: 'clear', maxBands: 3, seeds: 40, habitats: 3, bots: ['harvester', 'harvester', 'saw', 'planter'] },
};

test('levels are in campaign order and match the brief table', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['o01', 'o02', 'l01', 'l02', 'l03', 'l04', 'l05']);
  for (const level of LEVELS) {
    const row = TABLE[level.id];
    assert.equal(level.goal, row.goal, level.id);
    assert.equal(level.maxBands, row.maxBands, level.id);
    assert.equal(level.firstClearSeeds, row.seeds, level.id);
    assert.deepEqual(level.bots.map((b) => b.type).sort(), [...row.bots].sort(), level.id);
    const habitats = parseGrid(level.grid).tiles.flat().filter((t) => t.kind === 'habitat').length;
    assert.equal(habitats, row.habitats, `${level.id} habitats`);
    assert.ok(level.name.length > 0 && level.blurb.length > 0, level.id);
  }
});

for (const level of LEVELS) {
  test(`${level.id}: grid, goal and placements are well formed`, () => {
    assert.equal(level.grid.length, 8);
    for (const row of level.grid) {
      assert.equal(row.length, 8);
      for (const ch of row) assert.ok(ch in LEGEND, `unknown char ${ch}`);
    }
    const parsed = parseGrid(level.grid);
    assert.ok(parsed.deployTiles.length >= level.maxBands, 'enough deploy tiles');

    if (level.goal === 'capture') assert.ok(parsed.objectives.length >= 1);
    if (level.goal === 'rescue') assert.ok(level.trapped.length >= 1);
    if (level.goal === 'clear') assert.ok(level.bots.length >= 1);

    /** @type {Set<string>} */
    const used = new Set();
    const groups = [
      [level.bots, 'bots'],
      [level.trapped, 'us'],
    ];
    for (const [placements, side] of groups) {
      for (const placement of placements) {
        const type = BAND_TYPES[placement.type];
        assert.ok(type, `type ${placement.type} exists`);
        assert.equal(type.side, side, `${placement.type} is on side ${side}`);
        placement.cells.forEach((cell, i) => {
          const key = cell.join(',');
          assert.ok(!used.has(key), `cell ${key} used twice`);
          used.add(key);
          if (i > 0) {
            const prev = placement.cells[i - 1];
            assert.equal(Math.abs(prev[0] - cell[0]) + Math.abs(prev[1] - cell[1]), 1, `contiguous at ${key}`);
          }
          const tile = parsed.tiles[cell[1]]?.[cell[0]];
          assert.ok(tile, `cell ${key} on the map`);
          assert.ok(canEnter(tile, type.side, type.flies), `${placement.type} can stand on ${key}`);
        });
      }
    }
  });

  test(`${level.id}: assumes only names bands the player can have, within their size range`, () => {
    for (const [type, n] of Object.entries(level.assumes)) {
      const def = BAND_TYPES[type];
      assert.ok(def && def.side === 'us', `${type} is an animal`);
      assert.ok(roster(level.id).includes(type) || def.price !== null, `${type} is in the roster or sold in the shop`);
      assert.ok(Number.isInteger(n));
      assert.ok(n >= def.startLen && n <= def.maxLenCap, `${type} size ${n}`);
    }
  });

  test(`${level.id}: the recorded solution uses only the guaranteed roster, and wins`, () => {
    for (const d of level.solution.deploy) assert.ok(roster(level.id).includes(d.type), d.type);
    const state = replay(level);
    assert.equal(state.outcome, 'won');
  });

  test(`${level.id}: every recorded second approach wins too, and differs from the first`, () => {
    const first = JSON.stringify(level.solution);
    for (const [i, solution] of (level.alternatives ?? []).entries()) {
      for (const d of solution.deploy) {
        assert.ok(roster(level.id).includes(d.type) || BAND_TYPES[d.type].price !== null, `alternative ${i + 1}: ${d.type} is neither in the roster nor sold`);
      }
      assert.notEqual(JSON.stringify(solution), first, `alternative ${i + 1} repeats the solution`);
      const state = replay(level, solution);
      assert.equal(state.outcome, 'won', `alternative ${i + 1}`);
    }
  });

  test(`${level.id}: records a second approach`, () => {
    assert.ok((level.alternatives ?? []).length >= 1);
  });

  test(`${level.id}: doing nothing does not win`, () => {
    let state = createBattle(level, level.solution.deploy, progressFor(level));
    for (let i = 0; i < 12 && state.outcome === null; i += 1) {
      state = applyMove(state, { kind: 'end' });
    }
    assert.notEqual(state.outcome, 'won');
  });
}

test('assumed growth and shop bands are affordable from earlier levels', () => {
  // What the earlier levels give: each first clear, and three replays of
  // its recorded line. A shop band costs its price plus the recruits to
  // the size the level assumes; growth of a band already owned costs its
  // recruits. Each recorded line is checked on its own.
  /** @type {number} */
  let budget = 0;
  for (const level of LEVELS) {
    let growth = 0;
    for (const [type, n] of Object.entries(level.assumes)) {
      if (!roster(level.id).includes(type)) continue;
      for (let size = BAND_TYPES[type].startLen; size < n; size += 1) growth += recruitCost(type, size);
    }
    for (const [i, solution] of [level.solution, ...(level.alternatives ?? [])].entries()) {
      let cost = growth;
      for (const type of new Set([...solution.deploy.map((d) => d.type), ...Object.keys(level.assumes)])) {
        if (roster(level.id).includes(type)) continue;
        const def = BAND_TYPES[type];
        if (!solution.deploy.some((d) => d.type === type)) continue;
        cost += /** @type {number} */ (def.price);
        const n = level.assumes[type] ?? def.startLen;
        for (let size = def.startLen; size < n; size += 1) cost += recruitCost(type, size);
      }
      assert.ok(cost <= budget, `${level.id} line ${i + 1}: needs ${cost} seeds but earlier levels give ${budget}`);
    }

    const state = replay(level);
    const noFirstClear = progressFor(level);
    noFirstClear.cleared[level.id] = true;
    const reward = rewardFor(state, level, noFirstClear);
    assert.equal(reward.firstClear, 0);
    budget += level.firstClearSeeds + 3 * reward.total;
  }
});

test('the guaranteed roster follows the story: fox and hedgehog first, then the ants, beaver and badger', () => {
  const r = (/** @type {string} */ id) => [...roster(id)].sort();
  assert.deepEqual(r('o01'), ['fox', 'hedgehog']);
  assert.deepEqual(r('o02'), ['fox', 'hedgehog']);
  assert.deepEqual(r('l01'), ['ants', 'fox', 'hedgehog']);
  assert.deepEqual(r('l02'), ['ants', 'beaver', 'fox', 'hedgehog']);
  assert.deepEqual(r('l03'), ['ants', 'fox', 'hedgehog']);
  assert.deepEqual(r('l04'), ['ants', 'fox', 'hedgehog']);
  assert.deepEqual(r('l05'), ['ants', 'badger', 'fox', 'hedgehog']);
});

test('campaign nodes', () => {
  const ids = new Set(LEVELS.map((l) => l.id));
  assert.equal(CAMPAIGN_NODES.length, 7);
  assert.equal(CAMPAIGN_NODES.length, LEVELS.length);
  for (const node of CAMPAIGN_NODES) {
    assert.ok(ids.has(node.levelId), node.levelId);
    for (const u of node.unlocks) assert.ok(ids.has(u), u);
    // x and y are in the node's region's plate: 100 wide, 150 tall.
    assert.ok(REGIONS.some((r) => r.id === node.region), `${node.levelId} is in a region`);
    assert.ok(node.x >= 0 && node.x <= 100 && node.y >= 0 && node.y <= 150, node.levelId);
  }
  for (const place of [TRADING_POST, HOME_CAMP]) {
    assert.ok(REGIONS.some((r) => r.id === place.region));
    assert.ok(place.x >= 0 && place.x <= 100 && place.y >= 0 && place.y <= 150);
  }
  assert.equal(CAMPAIGN_NODES[0].levelId, LEVELS[0].id);

  const unlocks = Object.fromEntries(CAMPAIGN_NODES.map((n) => [n.levelId, [...n.unlocks].sort()]));
  assert.deepEqual(unlocks, {
    o01: ['o02'], o02: ['l01'], l01: ['l02', 'l03'], l02: ['l04'], l03: ['l04'], l04: ['l05'], l05: [],
  });

  const p = newProgress();
  assert.deepEqual([...unlockedLevels(p, CAMPAIGN_NODES)], ['o01'], 'a new game starts at o01');
  for (let i = 0; i < LEVELS.length; i += 1) {
    for (const id of unlockedLevels(p, CAMPAIGN_NODES)) p.cleared[id] = true;
  }
  assert.deepEqual([...unlockedLevels(p, CAMPAIGN_NODES)].sort(), [...ids].sort());
});

/**
 * The recorded solution with every act of the given action removed must no longer win
 * (either a later move becomes illegal or the outcome isn't 'won').
 * @param {string} levelId
 * @param {string} actionId
 */
function winsWithout(levelId, actionId) {
  const level = LEVELS.find((l) => l.id === levelId);
  assert.ok(level);
  assert.ok(level.solution.moves.some((m) => m.kind === 'act' && m.action === actionId), `${levelId} uses ${actionId}`);
  try {
    let state = createBattle(level, level.solution.deploy, progressFor(level));
    for (const move of level.solution.moves) {
      if (move.kind === 'act' && move.action === actionId) continue;
      if (state.outcome !== null) break;
      state = applyMove(state, move);
    }
    return state.outcome === 'won';
  } catch {
    return false;
  }
}

test('l01: ants running straight for the permit win, with the den struck once and left damaged', () => {
  const level = LEVELS.find((l) => l.id === 'l01');
  assert.ok(level);
  const straight = {
    deploy: [{ type: 'ants', at: [0, 7] }],
    moves: [
      { kind: 'move', band: 'ants', path: [[0, 6], [0, 5], [0, 4]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[0, 3], [0, 2], [0, 1]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[0, 0], [1, 0], [2, 0]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[3, 0], [4, 0], [5, 0]] },
      { kind: 'end' },
      { kind: 'move', band: 'ants', path: [[6, 0], [7, 0]] },
    ],
  };
  let state = createBattle(level, straight.deploy, progressFor(level));
  let strikes = 0;
  for (const move of straight.moves) {
    assert.equal(state.outcome, null);
    state = applyMove(state, move);
    strikes += state.events.filter((e) => e.kind === 'terrain' && (e.from === 'habitat' || e.from === 'habitatDamaged')).length;
  }
  assert.equal(state.outcome, 'won');
  assert.equal(state.turn, 5);
  assert.equal(strikes, 1, 'the den is struck once');
  assert.deepEqual(parseGrid(level.grid).tiles[7][6].kind, 'habitat');
  assert.equal(state.tiles[7][6].kind, 'habitatDamaged');
});

test('l01: both recorded lines keep the den untouched', () => {
  const level = LEVELS.find((l) => l.id === 'l01');
  assert.ok(level);
  for (const solution of [level.solution, ...(level.alternatives ?? [])]) {
    const state = replay(level, solution);
    assert.equal(state.outcome, 'won');
    assert.equal(state.tiles[7][6].kind, 'habitat');
  }
});

test('o01: the taught line takes no damage and the straight line does', () => {
  const o01 = levelOf('o01');
  assert.ok(o01.naive, 'o01 records the straight line');
  assert.equal(damageTaken(o01), 0);
  assert.equal(replay(o01).outcome, 'won');
  assert.ok(damageTaken(o01, o01.naive) >= 1);
});

/**
 * A beginner's game: each turn every band walks as near as it can to
 * where `goalOf` says, bites a bot if one is beside it, and the turn
 * ends. Deterministic. Gives the state when the battle ends or after
 * `maxTurns`.
 * @param {Level} level
 * @param {import('../js/engine/types.js').Deployment[]} deploy
 * @param {(s: BattleState) => import('../js/engine/types.js').Pos} goalOf
 * @param {number} [maxTurns]
 * @returns {BattleState}
 */
function beginner(level, deploy, goalOf, maxTurns = 30) {
  let s = createBattle(level, deploy, progressFor(level));
  while (s.outcome === null && s.turn <= maxTurns) {
    for (const { type: id } of deploy) {
      const band = s.bands.find((b) => b.id === id);
      if (s.outcome !== null || band === undefined) continue;
      const goal = goalOf(s);
      const far = (/** @type {import('../js/engine/types.js').Pos} */ p) => Math.abs(p[0] - goal[0]) + Math.abs(p[1] - goal[1]);
      /** @type {import('../js/engine/types.js').Pos[]|null} */
      let best = null;
      for (const path of reachable(s, id).values()) {
        if (best === null || far(path[path.length - 1]) < far(best[best.length - 1])) best = path;
      }
      if (best !== null && far(best[best.length - 1]) < far(band.cells[0])) s = applyMove(s, { kind: 'move', band: id, path: best });
      if (s.outcome !== null || !s.bands.some((b) => b.id === id)) continue;
      const bots = s.bands.filter((b) => b.side === 'bots').flatMap((b) => b.cells);
      const target = actionTargets(s, id, 'bite').find((t) => bots.some((c) => c[0] === t[0] && c[1] === t[1]));
      if (target !== undefined) s = applyMove(s, { kind: 'act', band: id, action: 'bite', target });
    }
    if (s.outcome === null) s = applyMove(s, { kind: 'end' });
  }
  return s;
}

/**
 * Every way to put the fox and the hedgehog on a level's deploy tiles.
 * @param {Level} level
 * @returns {import('../js/engine/types.js').Deployment[][]}
 */
function starterDeploys(level) {
  const tiles = parseGrid(level.grid).deployTiles;
  /** @type {import('../js/engine/types.js').Deployment[][]} */
  const out = [];
  for (const a of tiles) for (const b of tiles) if (a !== b) out.push([{ type: 'fox', at: a }, { type: 'hedgehog', at: b }]);
  return out;
}

/** @param {BattleState} s @returns {import('../js/engine/types.js').Pos} */
const nearestBot = (s) => (s.bands.find((b) => b.side === 'bots')?.cells[0] ?? [0, 0]);

test('o01: a beginner cannot lose it by going straight at the stake or straight at the harvester', () => {
  // The first thing a new player sees. The straight walk and the head-on
  // fight are what a beginner tries; both must win, whatever they cost.
  const o01 = levelOf('o01');
  const stake = parseGrid(o01.grid).objectives[0].at;
  for (const deploy of starterDeploys(o01)) {
    const walked = beginner(o01, deploy, () => stake);
    assert.equal(walked.outcome, 'won', `straight at the stake from ${JSON.stringify(deploy)}`);
    const fought = beginner(o01, deploy, nearestBot);
    assert.equal(fought.outcome, 'won', `straight at the harvester from ${JSON.stringify(deploy)}`);
  }
});

test('o01: a player who only ends the turn has twenty turns before anything strikes them', () => {
  // It can be lost in the end (the harvester eats its way round the wood
  // to the camp), but not by a slow start.
  const o01 = levelOf('o01');
  let state = createBattle(o01, o01.solution.deploy, progressFor(o01));
  let firstHit = null;
  for (let i = 0; i < 40 && state.outcome === null; i += 1) {
    state = applyMove(state, { kind: 'end' });
    if (firstHit === null && state.events.some((e) => e.kind === 'damage')) firstHit = state.turn;
  }
  assert.ok(firstHit !== null && firstHit > 20, `first struck on turn ${firstHit}`);
});

test('o02: a beginner who goes straight at the harvester wins with the hill standing', () => {
  // The den is marked by the bots' first turn whatever the bands did
  // (tested below), so the fox has been convinced before any such win.
  const o02 = levelOf('o02');
  for (const deploy of starterDeploys(o02)) {
    const final = beginner(o02, deploy, nearestBot);
    assert.equal(final.outcome, 'won', JSON.stringify(deploy));
    assert.ok(final.turn > 2, 'not before the bots\' first turn has marked the hill');
  }
});

test('o01: no den, and the stake is the only objective', () => {
  const parsed = parseGrid(levelOf('o01').grid);
  assert.equal(parsed.tiles.flat().filter((t) => t.kind === 'habitat').length, 0);
  assert.equal(parsed.objectives.length, 1);
  assert.equal(parsed.objectives[0].kind, 'stake');
  assert.equal(levelOf('o01').turnLimit, null);
});

test('o02: doing nothing loses the den', () => {
  const o02 = levelOf('o02');
  let state = createBattle(o02, o02.solution.deploy, progressFor(o02));
  for (let i = 0; i < 12 && state.outcome === null; i += 1) state = applyMove(state, { kind: 'end' });
  assert.equal(state.outcome, 'lost');
  assert.equal(state.lostReason, 'habitat');
});

test('o02: the main solution shows the den marked, so the fox is convinced in play', () => {
  const o02 = levelOf('o02');
  const all = states(o02);
  const marked = all.slice(1).some((after, i) => battleMoments(all[i], after).some((m) => m.when === 'denMarked'));
  assert.ok(marked, 'some step marks the den');
  assert.equal(replay(o02).tiles.flat().filter((t) => t.kind === 'habitat').length, 1, 'and the hill is never hit');
});

test('o02: whatever the bands do on the first turn, the bots\' first turn marks the den', () => {
  // The fox must be convinced in play, not only by the late scene at the
  // win: no first-turn move can reach the harvester, so its plan after the
  // bots' first turn is always the hill.
  const o02 = levelOf('o02');
  const tiles = parseGrid(o02.grid).deployTiles;
  /** @type {import('../js/engine/types.js').Deployment[][]} */
  const deploys = [];
  for (const a of tiles) {
    deploys.push([{ type: 'fox', at: a }], [{ type: 'hedgehog', at: a }]);
    for (const b of tiles) if (a !== b) deploys.push([{ type: 'fox', at: a }, { type: 'hedgehog', at: b }]);
  }
  let tried = 0;
  for (const deploy of deploys) {
    const start = createBattle(o02, deploy, progressFor(o02));
    assert.equal(battleMoments(start, start).some((m) => m.when === 'denMarked'), false);
    /** @type {BattleState[]} */
    let positions = [start];
    for (const band of deploy) {
      /** @type {BattleState[]} */
      const next = [];
      for (const s of positions) {
        next.push(s);
        for (const path of reachable(s, band.type).values()) next.push(applyMove(s, { kind: 'move', band: band.type, path }));
      }
      positions = next;
    }
    for (const s of positions) {
      tried += 1;
      const after = applyMove(s, { kind: 'end' });
      assert.ok(battleMoments(s, after).some((m) => m.when === 'denMarked'), `${JSON.stringify(deploy)}: ${JSON.stringify(s.bands.map((b) => b.cells))}`);
    }
  }
  assert.ok(tried > 100, `tried ${tried} first turns`);
});

/**
 * The one pointed tile of a scene.
 * @param {string} sceneId
 * @returns {import('../js/engine/types.js').Pos}
 */
function pointedTile(sceneId) {
  const scene = SCENES.find((x) => x.id === sceneId);
  assert.ok(scene, sceneId);
  const points = scene.lines.map((l) => l.point).filter((p) => p !== undefined);
  assert.equal(points.length, 1, `${sceneId} points once`);
  const point = points[0];
  assert.ok(point && point.kind === 'tile', `${sceneId} points at a tile`);
  return point.at;
}

test('l02-start points at the brook where the beaver dams the crossing', () => {
  const l02 = levelOf('l02');
  const [x, y] = pointedTile('l02-start');
  const tiles = parseGrid(l02.grid).tiles;
  assert.ok(y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length, 'in bounds');
  assert.equal(tiles[y][x].kind, 'water');
  assert.ok(l02.solution.moves.some((m) => m.kind === 'act' && m.action === 'build' && m.target[0] === x && m.target[1] === y), 'the main line dams it');
});

test('l05-start points at soft ground beside the western harvester', () => {
  const l05 = levelOf('l05');
  const [x, y] = pointedTile('l05-start');
  const tiles = parseGrid(l05.grid).tiles;
  assert.ok(y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length, 'in bounds');
  const tile = tiles[y][x];
  assert.equal(tile.kind, 'open');
  assert.equal(TERRAIN[tile.kind].diggable, true, 'a badger can dig it');
  // The western harvester is the first bot listed, and the most westerly.
  const west = l05.bots[0];
  assert.equal(west.type, 'harvester');
  assert.ok(l05.bots.every((b) => Math.min(...b.cells.map((c) => c[0])) >= Math.min(...west.cells.map((c) => c[0]))));
  assert.ok(west.cells.some((c) => Math.abs(c[0] - x) + Math.abs(c[1] - y) === 1), 'right beside it');
});

test('each level needs the idea it teaches', () => {
  assert.equal(winsWithout('l02', 'build'), false, 'l02 needs the dam');
  assert.equal(winsWithout('l05', 'ram'), false, 'l05 needs the ram');
  assert.equal(winsWithout('l05', 'dig'), false, 'l05 needs the dig');
});
