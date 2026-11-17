#!/usr/bin/env node
// The lazy player: a check on a level, not a solver. A dev tool, not
// shipped and not run in CI.
//
//   node scripts/lazy.mjs              every level in the campaign
//   node scripts/lazy.mjs l03 l04      just these
//   node scripts/lazy.mjs --chase      walk at the nearest bot instead of the goal
//
// Each turn, every band (in deploy order) walks as far as it can along the
// shortest route to its goal, then bites (or uses its first attack) on any
// bot next to it, and the turn ends. It never reads a plan. The goal is the
// nearest stake or permit not yet taken on a capture level, the nearest
// snared band on a rescue level, and the nearest bot on a clear level (or
// always the nearest bot, with --chase). It deploys the level's recorded
// solution's bands on their tiles, at the sizes the level test plays them.
//
// The design rule from the 2026-11-16 gameplay review: a level the lazy
// player wins with every den standing is not finished, because the lesson
// can be skipped.

/** @typedef {import('../js/engine/types.js').Pos} Pos */
/** @typedef {import('../js/engine/types.js').Level} Level */
/** @typedef {import('../js/engine/types.js').BattleState} BattleState */

import { pathToFileURL } from 'node:url';
import { LEVELS } from '../data/levels/index.js';
import { createBattle, applyMove, countHabitats } from '../js/engine/battle.js';
import { reachable } from '../js/engine/band.js';
import { actionTargets } from '../js/engine/actions.js';
import { actionsFor } from '../js/engine/units.js';
import { canEnter } from '../js/engine/terrain.js';
import { key, neighbours } from '../js/engine/grid.js';
import { progressFor } from './solve.mjs';

const MAX_TURNS = 20;

/**
 * Walking steps for an animal from every tile to the nearest of `goals`,
 * over ground it can walk, ignoring other bands.
 * @param {BattleState} s
 * @param {Pos[]} goals
 * @returns {Map<string, number>}
 */
function distances(s, goals) {
  /** @type {Map<string, number>} */
  const dist = new Map();
  /** @type {Pos[]} */
  const queue = [];
  for (const g of goals) {
    if (dist.has(key(g))) continue;
    dist.set(key(g), 0);
    queue.push(g);
  }
  for (let i = 0; i < queue.length; i += 1) {
    const here = queue[i];
    const d = /** @type {number} */ (dist.get(key(here)));
    for (const next of neighbours(s, here)) {
      if (dist.has(key(next))) continue;
      if (!canEnter(s.tiles[next[1]][next[0]], 'us', false)) continue;
      dist.set(key(next), d + 1);
      queue.push(next);
    }
  }
  return dist;
}

/**
 * Where the lazy player wants to be.
 * @param {BattleState} s
 * @param {boolean} chase
 * @returns {Pos[]}
 */
function goalsOf(s, chase) {
  const bots = s.bands.filter((b) => b.side === 'bots').flatMap((b) => b.cells);
  if (chase || s.goal === 'clear') return bots.flatMap((c) => neighbours(s, c));
  if (s.goal === 'rescue') {
    return s.bands.filter((b) => b.trapped).flatMap((b) => b.cells).flatMap((c) => neighbours(s, c));
  }
  return s.objectives.filter((o) => !o.captured).map((o) => o.at);
}

/**
 * @param {Level} level
 * @param {boolean} chase
 * @returns {{outcome: string, turn: number, dens: string}}
 */
export function playLazy(level, chase) {
  const deploy = level.solution.deploy;
  const extra = deploy.map((d) => d.type);
  let s = createBattle(level, deploy, progressFor(level, undefined, extra));
  while (s.outcome === null && s.turn <= MAX_TURNS) {
    for (const { type: id } of deploy) {
      if (s.outcome !== null) break;
      const band = s.bands.find((b) => b.id === id);
      if (band === undefined) continue;
      const dist = distances(s, goalsOf(s, chase));
      const far = (/** @type {Pos} */ p) => dist.get(key(p)) ?? Infinity;
      /** @type {Pos[]|null} */
      let best = null;
      for (const path of reachable(s, id).values()) {
        const end = path[path.length - 1];
        if (best === null || far(end) < far(best[best.length - 1])) best = path;
      }
      if (best !== null && far(best[best.length - 1]) < far(band.cells[0])) {
        s = applyMove(s, { kind: 'move', band: id, path: best });
      }
      if (s.outcome !== null) break;
      const now = s.bands.find((b) => b.id === id);
      if (now === undefined) continue;
      const attack = actionsFor(now.type, now.maxLen).find((a) => a.effect === 'attack');
      if (attack === undefined) continue;
      const bots = s.bands.filter((b) => b.side === 'bots').flatMap((b) => b.cells);
      const target = actionTargets(s, id, attack.id).find((t) => bots.some((c) => c[0] === t[0] && c[1] === t[1]));
      if (target !== undefined) s = applyMove(s, { kind: 'act', band: id, action: attack.id, target });
    }
    if (s.outcome === null) s = applyMove(s, { kind: 'end' });
  }
  const standing = countHabitats(s);
  const intact = s.tiles.flat().filter((t) => t.kind === 'habitat').length;
  const dens = s.habitatStart === 0 ? 'no den' : `${intact} of ${s.habitatStart} untouched, ${standing} standing`;
  return { outcome: s.outcome === 'lost' ? `lost (${s.lostReason})` : s.outcome ?? 'unfinished', turn: s.turn, dens };
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const chase = args.includes('--chase');
  const ids = args.filter((a) => !a.startsWith('--'));
  const levels = ids.length === 0 ? LEVELS : LEVELS.filter((l) => ids.includes(l.id));
  let flagged = 0;
  for (const level of levels) {
    const r = playLazy(level, chase);
    const allWhole = r.outcome === 'won' && (r.dens === 'no den' || /^(\d+) of \1 /.test(r.dens));
    if (allWhole) flagged += 1;
    const deploy = level.solution.deploy.map((d) => d.type).join(' + ');
    // A won battle has lost no den, so a win that is not clean hurt one.
    const mark = allWhole ? '  <- the lazy line wins clean' : r.outcome === 'won' ? '  <- wins, a den hurt' : '';
    console.log(`${level.id.padEnd(4)} ${deploy.padEnd(22)} ${r.outcome.padEnd(16)} turn ${String(r.turn).padEnd(3)} ${r.dens}${mark}`);
  }
  console.log(`\n${flagged} of ${levels.length} levels are won by the lazy player with every den whole.`);
}
