import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../data/levels/index.js';
import { HABITAT_LEVELS, BRISTLE } from './fixtures/habitat-levels.mjs';
import { createBattle, applyMove, parseGrid, countHabitats } from '../js/engine/battle.js';
import { bandById, reachable } from '../js/engine/band.js';
import { actionTargets } from '../js/engine/actions.js';
import { actionsFor, BAND_TYPES } from '../js/engine/units.js';
import { canEnter, isHabitat } from '../js/engine/terrain.js';
import { isEngaged, bandInReach, botOrder, runBot, planBots, runBotPhase } from '../js/engine/bots.js';
import { newProgress } from '../js/campaign/progress.js';
import { describeEvents, describeIntent } from '../js/ui/text.js';

// Seeded PRNG, defined in this test only (the engine stays deterministic).
let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
function shuffle(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function legalMoves(s) {
  const out = [{ kind: 'end' }];
  for (const b of s.bands) {
    if (b.side !== 'us' || b.trapped) continue;
    if (!b.moved && !b.acted) {
      for (const p of reachable(s, b.id).values()) out.push({ kind: 'move', band: b.id, path: p });
    }
    if (!b.acted) {
      for (const a of actionsFor(b.type, b.maxLen)) {
        for (const t of actionTargets(s, b.id, a.id)) {
          out.push({ kind: 'act', band: b.id, action: a.id, target: t });
        }
      }
    }
  }
  return out;
}

// How often the interesting cases came up, so the invariants below are
// known not to pass by never being asked.
const seen = {
  habitatLost: 0,
  habitatDamaged: 0,
  inReachStrikes: 0,
  walkThenStrike: 0,
  freed: 0,
  won: 0,
  sawHitsTrapped: 0,
  harvesterMowsForest: 0,
  planterHitsHabitat: 0,
  bandShieldsHabitat: 0,
  bandHoldsDam: 0,
  turnStoppedByHabitat: 0,
  planterHitsBandOnPaving: 0,
  wonByClearing: 0,
  beesPassThrough: 0,
  bristleHurts: 0,
  bristleDestroys: 0,
};

// The cases the bristle games must reach: counted by every game, asserted
// only by the bristle test.
const BRISTLE_SEEN = ['bristleHurts', 'bristleDestroys'];

function checkInvariants(s, ctx) {
  const cells = new Map();
  for (const b of s.bands) {
    assert.ok(b.cells.length > 0, `${ctx}: empty band ${b.id}`);
    assert.ok(b.cells.length <= b.maxLen, `${ctx}: ${b.id} over maxLen`);
    const def = BAND_TYPES[b.type];
    b.cells.forEach((c, i) => {
      const k = c.join(',');
      assert.ok(!cells.has(k), `${ctx}: overlap at ${k} (${cells.get(k)}/${b.id})`);
      cells.set(k, b.id);
      const tile = s.tiles[c[1]][c[0]];
      assert.ok(
        canEnter(tile, b.side, def.flies),
        `${ctx}: ${b.id} cell ${i} on ${tile.kind} at ${k}`,
      );
      // No bot ever stands on a habitat.
      if (b.side === 'bots') assert.ok(!isHabitat(tile), `${ctx}: bot ${b.id} on a habitat at ${k}`);
      if (i > 0) {
        assert.ok(
          b.cells.slice(0, i).some(
            (p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) === 1,
          ),
          `${ctx}: ${b.id} cell ${i} has no earlier orthogonally adjacent cell`,
        );
      }
    });
    if (b.side === 'bots') describeIntent(s, b);
  }
  describeEvents(s, s.events);

  // A destroyed habitat always produces outcome lost, reason habitat.
  const destroyed = countHabitats(s) < s.habitatStart;
  if (destroyed) {
    assert.equal(s.outcome, 'lost', `${ctx}: habitat destroyed but outcome ${s.outcome}`);
    assert.equal(s.lostReason, 'habitat', `${ctx}: habitat destroyed but reason ${s.lostReason}`);
  } else {
    assert.notEqual(s.lostReason, 'habitat', `${ctx}: reason habitat with every habitat standing`);
  }
  assert.ok(countHabitats(s) <= s.habitatStart, `${ctx}: more habitats than at the start`);
  assert.equal(s.lostReason !== null, s.outcome === 'lost', `${ctx}: lostReason ${s.lostReason} with outcome ${s.outcome}`);

  // No bots left means the battle is won, whatever the goal, unless a
  // habitat fell; and a won field with no bots has been swept clean.
  if (!s.bands.some((b) => b.side === 'bots')) {
    if (destroyed) {
      assert.equal(s.outcome, 'lost', `${ctx}: no bots and a den lost, but outcome ${s.outcome}`);
    } else {
      assert.equal(s.outcome, 'won', `${ctx}: no bots left but outcome ${s.outcome}`);
      assert.deepEqual(s.pickups, [], `${ctx}: pickups left on a cleared field`);
      assert.ok(s.objectives.every((o) => o.captured), `${ctx}: objective left on a cleared field`);
      assert.ok(!s.bands.some((b) => b.trapped), `${ctx}: trapped band left on a cleared field`);
    }
  }

  // The stored plans equal a fresh planning run on this state. The fresh
  // run starts from a copy with no plans and no events, so a plan cannot
  // depend on either.
  const bare = structuredClone(s);
  bare.events = [];
  for (const b of bare.bands) b.plan = null;
  const fresh = planBots(bare);
  for (const b of s.bands) {
    if (b.side === 'bots') {
      assert.deepEqual(b.plan, fresh[b.id], `${ctx}: stale plan on ${b.id}`);
    } else {
      assert.equal(b.plan, null, `${ctx}: animal ${b.id} has a plan`);
    }
  }
}

/**
 * Checks one bots' turn: `s` is the state the player ended the turn on,
 * `n` is the state after it.
 */
function checkBotsTurn(s, n, ctx) {
  const order = botOrder(s);

  // The bots' turn does exactly what the plans showed: the same paths and
  // the same strikes, bot by bot in level order, each walk before its strike.
  let lastIndex = -1;
  let lastKind = 'move';
  for (const e of n.events) {
    if (e.kind !== 'move' && e.kind !== 'action') continue;
    const id = e.kind === 'move' ? e.band : e.actor;
    const index = order.indexOf(id);
    assert.ok(index >= 0, `${ctx}: ${e.kind} by ${id}, which is not a bot`);
    assert.ok(index >= lastIndex, `${ctx}: ${id} acted out of level order`);
    if (index === lastIndex) {
      assert.ok(lastKind === 'move' && e.kind === 'action', `${ctx}: ${id} did not walk once, then strike once`);
    }
    lastIndex = index;
    lastKind = e.kind;
  }
  for (const id of order) {
    const walk = n.events.find((e) => e.kind === 'move' && e.band === id);
    const strike = n.events.find((e) => e.kind === 'action' && e.actor === id);
    const did = {
      path: walk ? walk.path : [],
      strike: strike ? strike.target : null,
      actionId: strike ? strike.actionId : null,
    };
    assert.deepEqual(did, bandById(s, id).plan, `${ctx}: ${id} did not do what its plan showed`);
    if (did.path.length > 0 && did.strike !== null) seen.walkThenStrike += 1;
  }

  // The planning run is the turn: the same events, bristle damage and a bot
  // destroyed by bristle included. After them come only what a cleared
  // field sweeps up and the new plans.
  const planned = structuredClone({ ...s, events: [] });
  runBotPhase(planned);
  assert.deepEqual(n.events.slice(0, planned.events.length), planned.events, `${ctx}: the turn differs from its planning run`);
  for (const e of n.events.slice(planned.events.length)) {
    assert.ok(['pickup', 'capture', 'freed', 'plan'].includes(e.kind), `${ctx}: ${e.kind} event after the bots' turn`);
  }

  // A destroyed habitat ends the turn: its terrain event is the last one,
  // with no plan events after it either.
  if (countHabitats(n) < countHabitats(s)) {
    const last = n.events[n.events.length - 1];
    assert.ok(
      last !== undefined && last.kind === 'terrain' && last.from === 'habitatDamaged' && last.to === 'stubble',
      `${ctx}: a habitat fell but the last event is ${JSON.stringify(last)}`,
    );
  }

  // Step the same turn one bot at a time with the engine's own runBot,
  // stopping where the engine stops: the moment a habitat is destroyed.
  const sim = structuredClone(s);
  sim.events = [];
  let stoppedAt = -1;
  for (const [index, id] of order.entries()) {
    if (stoppedAt >= 0) {
      if (bandById(sim, id) !== undefined) seen.turnStoppedByHabitat += 1;
      assert.ok(
        !n.events.some((e) => (e.kind === 'move' && e.band === id) || (e.kind === 'action' && e.actor === id)),
        `${ctx}: ${id} acted after ${order[stoppedAt]} destroyed a habitat`,
      );
      continue;
    }
    const bot = bandById(sim, id);
    if (bot === undefined) continue;
    const standingBefore = countHabitats(sim);
    const inReach = bandInReach(sim, bot);
    if (!BAND_TYPES[bot.type].alwaysEngaged) {
      assert.equal(isEngaged(sim, bot), inReach, `${ctx}: ${id} engagement differs from reach`);
    } else {
      assert.equal(isEngaged(sim, bot), true, `${ctx}: ${id} should always be engaged`);
    }
    const tilesBefore = structuredClone(sim.tiles);
    const bandsBefore = structuredClone(sim.bands);
    const head = bot.cells[0];
    const eventsBefore = sim.events.length;
    const did = runBot(sim, id);
    const own = sim.events.slice(eventsBefore);

    // The walk: at most `speed` single steps over ground a bot may stand on.
    assert.ok(did.path.length <= BAND_TYPES[bot.type].speed, `${ctx}: ${id} walked too far`);
    let prev = head;
    for (const step of did.path) {
      assert.equal(Math.abs(prev[0] - step[0]) + Math.abs(prev[1] - step[1]), 1, `${ctx}: ${id} path jumps`);
      assert.ok(canEnter(tilesBefore[step[1]][step[0]], 'bots', false), `${ctx}: ${id} walks over ${tilesBefore[step[1]][step[0]].kind}`);
      prev = step;
    }
    if (did.strike !== null) {
      assert.equal(Math.abs(prev[0] - did.strike[0]) + Math.abs(prev[1] - did.strike[1]), 1, `${ctx}: ${id} strike is not adjacent to where it stands`);
    }

    // What the strike hit. Walking moves no other band and changes no tile,
    // so the board before this bot's step shows what it found there.
    const strike = did.strike;
    const struckTile = strike === null ? null : tilesBefore[strike[1]][strike[0]];
    const struckBand = strike === null ? undefined : bandsBefore.find(
      (b) => b.id !== id && b.cells.some((c) => c[0] === strike[0] && c[1] === strike[1]),
    );
    // A strike on a band hits the band only, so a habitat is hit only
    // when nobody stands on it.
    const hitHabitat = struckTile !== null && isHabitat(struckTile) && struckBand === undefined;
    const hitBand = struckBand !== undefined && struckBand.side === 'us';
    const hitBot = struckBand !== undefined && struckBand.side === 'bots';
    assert.ok(!hitBot, `${ctx}: ${id} struck the bot ${struckBand && struckBand.id}`);
    if (strike !== null && struckBand !== undefined) {
      // The tile under a struck band is untouched: a den it stands on is
      // shielded, a dam it crosses holds.
      assert.deepEqual(sim.tiles, tilesBefore, `${ctx}: ${id} struck ${struckBand.id} and changed the board`);
      if (isHabitat(struckTile)) seen.bandShieldsHabitat += 1;
      if (struckTile.kind === 'dam') seen.bandHoldsDam += 1;
    }
    // Bristle: a strike on a bristly band hurts the bot by its bristle,
    // straight after the band's own damage, and the bot is gone if that
    // wipes it out. A strike on anything else never hurts the bot.
    const bristle = hitBand ? (BAND_TYPES[struckBand.type].bristle ?? 0) : 0;
    const selfHits = own.filter((e) => e.kind === 'damage' && e.band === id);
    if (bristle > 0) {
      const at = own.findIndex((e) => e.kind === 'damage' && e.band === struckBand.id);
      assert.ok(at >= 0, `${ctx}: ${id} struck ${struckBand.id} without damage`);
      assert.deepEqual(own.slice(at + 1).map((e) => e.kind === 'damage' ? [e.band, e.amount] : e.kind), [[id, bristle]], `${ctx}: ${id} was not hurt by bristle`);
      const wiped = selfHits[0].wiped;
      assert.equal(bandById(sim, id) === undefined, wiped, `${ctx}: ${id} wiped ${wiped} but present ${bandById(sim, id) !== undefined}`);
      if (wiped) seen.bristleDestroys += 1;
      else seen.bristleHurts += 1;
    } else {
      assert.deepEqual(selfHits, [], `${ctx}: ${id} hurt itself with no bristle struck`);
      assert.ok(bandById(sim, id) !== undefined, `${ctx}: ${id} vanished on its own turn`);
    }

    if (bot.type === 'planter' && hitBand) {
      // Only forest shelters a band from a planter.
      assert.notEqual(struckTile.kind, 'forest', `${ctx}: ${id} struck a band in forest`);
      if (struckTile.kind === 'paving') seen.planterHitsBandOnPaving += 1;
    }

    // No free kiting: a bot that can walk up to a band and strike it when
    // its turn comes strikes a band or a habitat. For the first bot that is
    // the board the player ended the turn on; a later bot only differs
    // when an earlier bot changed the board.
    if (inReach) {
      assert.ok(hitBand || hitHabitat, `${ctx}: ${id} had a band in reach but struck ${JSON.stringify(did.strike)}`);
      seen.inReachStrikes += 1;
    }
    if (hitBand && struckBand.trapped && bot.type === 'saw') seen.sawHitsTrapped += 1;
    if (hitBand && struckBand.trapped) {
      assert.equal(bot.type, 'saw', `${ctx}: ${id} struck a trapped band`);
    }
    if (bot.type === 'harvester' && struckTile !== null && struckTile.kind === 'forest' && !hitBand) {
      seen.harvesterMowsForest += 1;
    }
    if (bot.type === 'planter' && hitHabitat) seen.planterHitsHabitat += 1;
    if (countHabitats(sim) < standingBefore) stoppedAt = index;
  }

  // Stepping is the same turn the engine ran.
  assert.deepEqual(sim.tiles, n.tiles, `${ctx}: stepped tiles differ from the real turn`);
  assert.deepEqual(
    sim.bands.map((b) => [b.id, b.cells]),
    n.bands.map((b) => [b.id, b.cells]),
    `${ctx}: stepped bands differ from the real turn`,
  );
}

/**
 * Every pickup taken, objective captured and band freed between `s` and
 * `n` has its own event, and nothing is taken without one; so the screen
 * can show a cleared field being swept up.
 */
function checkTakings(s, n, ctx) {
  const events = (kind) => n.events.filter((e) => e.kind === kind);
  const pickups = events('pickup');
  assert.equal(n.pickupsTaken - s.pickupsTaken, pickups.length, `${ctx}: pickups taken without events`);
  assert.equal(s.pickups.length - n.pickups.length, pickups.length, `${ctx}: pickups gone without events`);
  for (const e of pickups) {
    assert.ok(s.pickups.some((p) => p[0] === e.at[0] && p[1] === e.at[1]), `${ctx}: pickup event at ${e.at} where none was`);
  }
  const captured = (st) => st.objectives.filter((o) => o.captured).map((o) => o.at.join(','));
  const newly = captured(n).filter((k) => !captured(s).includes(k));
  assert.deepEqual(events('capture').map((e) => e.at.join(',')).sort(), newly.sort(), `${ctx}: captures and capture events differ`);
  const trapped = (st) => st.bands.filter((b) => b.trapped).map((b) => b.id);
  const freed = trapped(s).filter((id) => !trapped(n).includes(id) && bandById(n, id) !== undefined);
  assert.deepEqual(events('freed').map((e) => e.band).sort(), freed.sort(), `${ctx}: freed bands and freed events differ`);
  if (n.outcome === 'won' && !n.bands.some((b) => b.side === 'bots') && s.goal !== 'clear') {
    seen.wonByClearing += 1;
  }
}

/**
 * @param {object[]} levels
 * @param {number} gamesPerLevel
 * @param {{bands?: Record<string, number>, lead?: string[]}} [opts]
 *   `bands`: more bands the player owns, at these sizes; `lead`: types
 *   always deployed, ahead of the random pick.
 */
function playGames(levels, gamesPerLevel, opts = {}) {
  let games = 0;
  for (const level of levels) {
    for (let g = 0; g < gamesPerLevel; g += 1) {
      const progress = newProgress();
      // The bands these games were written for, whatever a new game starts with.
      progress.bands = { ants: { maxLen: 4 }, badger: { maxLen: 3 }, beaver: { maxLen: 3 } };
      for (const [t, n] of Object.entries(opts.bands ?? {})) progress.bands[t] = { maxLen: n + (g % 3 === 2 ? 1 : 0) };
      for (const [t, n] of Object.entries(level.assumes)) progress.bands[t] = { maxLen: n };
      if (g % 2) {
        progress.bands.ants.maxLen = 6 + (g % 7);
        progress.bands.bear = { maxLen: 2 };
        progress.bands.owl = { maxLen: 1 };
        progress.bands.bees = { maxLen: 2 };
      }
      const { deployTiles } = parseGrid(level.grid);
      const lead = opts.lead ?? [];
      const types = [...lead, ...shuffle(Object.keys(progress.bands).filter((t) => !lead.includes(t)))].slice(0, level.maxBands);
      const tiles = shuffle(deployTiles);
      const deps = types
        .slice(0, Math.min(types.length, tiles.length))
        .map((t, i) => ({ type: t, at: tiles[i] }));
      let s = createBattle(level, deps, progress);
      games += 1;
      checkInvariants(s, `${level.id} game ${g} start`);
      // Games alternate between hasty play and careful play, so both short
      // turns (bots left alone) and long ones (many moves a turn) come up.
      const endChance = g % 4 < 2 ? 0.2 : 0.5;
      for (let i = 0; i < 300 && s.outcome === null; i += 1) {
        const lm = legalMoves(s);
        const m = lm.length > 1 && rnd() >= endChance ? pick(lm.slice(1)) : lm[0];
        const ctx = `${level.id} game ${g} turn ${s.turn} after ${JSON.stringify(m)}`;
        const before = structuredClone(s);
        const n = applyMove(s, m);
        // Undo is the earlier state: applyMove never touches it, plans included.
        assert.deepEqual(s, before, `${ctx}: applyMove changed its input`);
        checkInvariants(n, ctx);
        checkTakings(s, n, ctx);
        if (m.kind === 'move' && bandById(s, m.band).type === 'bees') {
          // Bee walks that go through another band. Where they land is
          // checked by the no-overlap invariant above.
          const through = m.path.some((p) => s.bands.some((b) => b.id !== m.band && b.cells.some((c) => c[0] === p[0] && c[1] === p[1])));
          if (through) seen.beesPassThrough += 1;
        }
        if (m.kind === 'end') checkBotsTurn(s, n, ctx);
        // A finished battle is not re-planned out loud: nothing follows
        // the events that ended it.
        if (n.outcome !== null) {
          assert.ok(!n.events.some((e) => e.kind === 'plan'), `${ctx}: plan events after the battle ended`);
        }
        for (const e of n.events) {
          if (e.kind === 'freed') seen.freed += 1;
          if (e.kind === 'terrain' && e.to === 'habitatDamaged') seen.habitatDamaged += 1;
        }
        if (n.lostReason === 'habitat') seen.habitatLost += 1;
        if (n.outcome === 'won') seen.won += 1;
        s = n;
      }
    }
  }
  return games;
}

test('seeded random play keeps engine invariants across all levels', () => {
  seed = 12345;
  assert.equal(playGames(LEVELS, 40, { bands: { fox: 2, hedgehog: 2 } }), LEVELS.length * 40);
});

test('seeded random play keeps the habitat and plan invariants on levels with habitats', () => {
  seed = 54321;
  for (const k of Object.keys(seen)) seen[k] = 0;
  assert.equal(playGames(HABITAT_LEVELS, 60), 300);
  // The cases the invariants are about did come up.
  for (const [k, count] of Object.entries(seen)) {
    if (BRISTLE_SEEN.includes(k)) continue;
    assert.ok(count > 0, `the fixture games never reached: ${k} (${JSON.stringify(seen)})`);
  }
});

test('seeded random play with the hedgehog: a bot hurt or destroyed by bristle did what its plan showed', () => {
  seed = 777;
  for (const k of Object.keys(seen)) seen[k] = 0;
  const games = playGames([BRISTLE, ...HABITAT_LEVELS], 30, { bands: { fox: 2, hedgehog: 2 }, lead: ['hedgehog'] });
  assert.equal(games, (HABITAT_LEVELS.length + 1) * 30);
  for (const k of BRISTLE_SEEN) {
    assert.ok(seen[k] > 0, `the bristle games never reached: ${k} (${JSON.stringify(seen)})`);
  }
});
