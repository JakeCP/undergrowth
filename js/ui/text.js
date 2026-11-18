/** @typedef {import('../engine/types.js').Band} Band */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('../engine/types.js').BattleEvent} BattleEvent */
/** @typedef {import('../engine/types.js').Level} Level */
/** @typedef {import('../engine/types.js').Pos} Pos */

import { BAND_TYPES } from '../engine/units.js';
import { answeredByBristle } from '../engine/actions.js';
import { countHabitats } from '../engine/battle.js';

/**
 * Type id behind a band id, for bands no longer in state (e.g. wiped):
 * 'harvester-0' -> 'harvester', 'trapped-bear' -> 'bear', 'ants' -> 'ants'.
 * @param {string} id
 * @returns {string}
 */
function typeFromId(id) {
  let t = id.startsWith('trapped-') ? id.slice('trapped-'.length) : id;
  t = t.replace(/-\d+$/, '');
  return t;
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @returns {string}
 */
function bandName(state, bandId) {
  const band = state.bands.find((b) => b.id === bandId);
  const type = band !== undefined ? band.type : typeFromId(bandId);
  const def = BAND_TYPES[type];
  return def !== undefined ? def.name : type;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isPlural(name) {
  return name.endsWith('s');
}

/**
 * The way from one tile to another: a diagonal when it is an exact one
 * (only a shot aims that way), else the nearer of the four.
 * @param {number} dx
 * @param {number} dy
 * @returns {'north'|'east'|'south'|'west'|'north-east'|'south-east'|'south-west'|'north-west'}
 */
function direction(dx, dy) {
  if (dx !== 0 && Math.abs(dx) === Math.abs(dy)) return `${dy > 0 ? 'south' : 'north'}-${dx > 0 ? 'east' : 'west'}`;
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'south' : 'north';
  return dx > 0 ? 'east' : 'west';
}

/**
 * @param {BattleState} state
 * @param {Pos} pos
 * @returns {Band|undefined}
 */
function bandAt(state, pos) {
  return state.bands.find((b) => b.cells.some((c) => c[0] === pos[0] && c[1] === pos[1]));
}

/**
 * The words for a terrain kind in a sentence ("the forest", "the den").
 * @param {string} kind
 * @returns {string}
 */
function terrainWord(kind) {
  if (kind === 'open') return 'ground';
  if (kind === 'habitat') return 'den';
  if (kind === 'habitatDamaged') return 'damaged den';
  if (kind === 'earthbank') return 'earth bank';
  return kind;
}

/**
 * @param {number} n
 * @returns {string}
 */
function tiles(n) {
  return n === 1 ? '1 tile' : `${n} tiles`;
}

/**
 * One line for a bot's plan: where it walks, then what it strikes.
 * @param {BattleState} state
 * @param {Band} bot
 * @returns {string}
 */
export function describeIntent(state, bot) {
  const name = BAND_TYPES[bot.type].name;
  const plan = bot.plan;
  const walked = plan !== null ? plan.path.length : 0;
  if (plan === null || plan.strike === null) {
    return walked > 0 ? `${name} will walk ${tiles(walked)}, with nothing to strike yet` : `${name} has nothing in reach`;
  }
  const target = plan.strike;
  // The bot strikes from where its walk ends.
  const from = walked > 0 ? plan.path[walked - 1] : bot.cells[0];
  const dir = direction(target[0] - from[0], target[1] - from[1]);
  const action = BAND_TYPES[bot.type].actions.find((a) => a.id === plan.actionId);
  const effect = action !== undefined ? action.effect : 'attack';

  let terrain = 'open';
  if (
    target[0] >= 0 && target[0] < state.width &&
    target[1] >= 0 && target[1] < state.height
  ) {
    terrain = state.tiles[target[1]][target[0]].kind;
  }

  const ground = terrainWord(terrain);
  const occupant = bandAt(state, target);
  /** @type {string} */
  let phrase;
  // Bristle: the plan line says what the strike costs the bot itself.
  let cost = '';
  if (occupant !== undefined) {
    phrase = `hit ${BAND_TYPES[occupant.type].name}`;
    // Only a contact strike is answered: a shot never is.
    const answered = occupant.side === 'us' && bot.side === 'bots' && answeredByBristle(effect);
    const bristle = answered ? (BAND_TYPES[occupant.type].bristle ?? 0) : 0;
    if (bristle >= bot.cells.length) cost = ', and be destroyed by its spines';
    else if (bristle > 0) cost = `, and lose ${bristle} to its spines`;
  } else if (terrain === 'habitat' || terrain === 'habitatDamaged') {
    phrase = `tear into the ${ground}`;
  } else if (effect === 'mow') {
    phrase = `mow the ${ground}`;
  } else if (effect === 'pave') {
    phrase = `pave the ${ground}`;
  } else {
    phrase = `hit the ${ground}`;
  }
  const walk = walked > 0 ? `walk ${tiles(walked)}, then ` : '';
  return `${name} will ${walk}${phrase} to the ${dir}${cost}`;
}

/**
 * Who struck the tile `at`: the actor of the latest action event before
 * index `i` aimed at it, as "The harvester", or null.
 * @param {BattleState} state
 * @param {BattleEvent[]} events
 * @param {number} i
 * @param {Pos} at
 * @returns {string|null}
 */
function strikerOf(state, events, i, at) {
  for (let j = i - 1; j >= 0; j -= 1) {
    const e = events[j];
    if (e.kind === 'action' && e.target[0] === at[0] && e.target[1] === at[1]) {
      return `The ${bandName(state, e.actor).toLowerCase()}`;
    }
  }
  return null;
}

/**
 * True when the damage event at index `i` is a bot's strike on a band
 * that stands on a den. A strike on a band hits the band only, so the
 * band shielded the den. The den's kind at the time of the strike is the
 * `from` of the next terrain event on that tile, if a later strike in
 * the same turn changed it, or else its kind in `state`.
 * @param {BattleState} state
 * @param {BattleEvent[]} events
 * @param {number} i
 * @returns {boolean}
 */
function shieldsDen(state, events, i) {
  const strike = events[i - 1];
  if (strike === undefined || strike.kind !== 'action') return false;
  const actor = state.bands.find((b) => b.id === strike.actor);
  const side = actor !== undefined ? actor.side : BAND_TYPES[typeFromId(strike.actor)]?.side;
  if (side !== 'bots') return false;
  const at = strike.target;
  if (!(at[0] >= 0 && at[0] < state.width && at[1] >= 0 && at[1] < state.height)) return false;
  let kind = state.tiles[at[1]][at[0]].kind;
  for (let j = i + 1; j < events.length; j += 1) {
    const e = events[j];
    if (e.kind === 'terrain' && e.at[0] === at[0] && e.at[1] === at[1]) {
      kind = e.from;
      break;
    }
  }
  return kind === 'habitat' || kind === 'habitatDamaged';
}

/**
 * @param {BattleState} state
 * @param {string} name
 * @param {Pos} at
 * @param {'terrain'|undefined} cause
 * @returns {string}
 */
function fallPhrase(state, name, at, cause) {
  const be = isPlural(name) ? 'are' : 'is';
  const falls = isPlural(name) ? 'fall' : 'falls';
  /** @type {string|null} */
  let kind = null;
  if (at != null && at[0] >= 0 && at[0] < state.width && at[1] >= 0 && at[1] < state.height) {
    kind = state.tiles[at[1]][at[0]].kind;
  }
  if (cause === 'terrain') {
    if (kind === 'water') return `The dam gives way: ${name} ${be} swept away`;
    return `The ground gives way: ${name} ${falls} and ${be} destroyed`;
  }
  if (kind === 'water') return `${name} ${be} pushed into the water and destroyed`;
  if (kind === 'hole') return `${name} ${be} pushed into a hole and destroyed`;
  return `${name} ${falls} and ${be} destroyed`;
}

/**
 * What a band bumped into when its push (the event at index `i`) was
 * blocked by no other band: "the forest", "the stones", "the den", or
 * "the edge" of the board. The engine's event names no tile, so this
 * reads it off the board: the push goes the way of the action before it,
 * from the band's head (for a band the bump wiped out, the last cell its
 * damage event lists). "the edge" also when that cannot be worked out.
 * @param {BattleState} state
 * @param {BattleEvent[]} events
 * @param {number} i
 * @param {string} bandId
 * @returns {string}
 */
function bumpedInto(state, events, i, bandId) {
  let j = i - 1;
  while (j >= 0 && events[j].kind !== 'action') j -= 1;
  const action = j >= 0 ? events[j] : undefined;
  if (action === undefined || action.kind !== 'action') return 'the edge';
  const dx = Math.sign(action.target[0] - action.from[0]);
  const dy = Math.sign(action.target[1] - action.from[1]);
  if ((dx === 0) === (dy === 0)) return 'the edge';
  /** @type {Pos|undefined} */
  let head = state.bands.find((b) => b.id === bandId)?.cells[0];
  for (let k = i - 1; k > j && head === undefined; k -= 1) {
    const e = events[k];
    if (e.kind === 'damage' && e.band === bandId && e.wiped && e.cells.length > 0) head = e.cells[e.cells.length - 1];
  }
  if (head === undefined) return 'the edge';
  const x = head[0] + dx;
  const y = head[1] + dy;
  if (x < 0 || x >= state.width || y < 0 || y >= state.height) return 'the edge';
  const kind = state.tiles[y][x].kind;
  if (kind === 'forest') return 'the forest';
  if (kind === 'stones') return 'the stones';
  if (kind === 'earthbank') return 'the bank';
  if (kind === 'habitat' || kind === 'habitatDamaged') return 'the den';
  return 'the edge';
}

/**
 * @param {BattleState} state
 * @param {BattleEvent[]} events
 * @returns {string[]}
 */
export function describeEvents(state, events) {
  /** @type {string[]} */
  const sentences = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.kind === 'move' && event.dash === true) {
      sentences.push(`${bandName(state, event.band)} dashes`);
    } else if (event.kind === 'action' && event.actionId === 'gnaw') {
      // The beaver's Gnaw (trial rule beaverGnaw): one sentence for the
      // whole bridge; its tiles' own terrain events say nothing more.
      sentences.push(`${bandName(state, event.actor)} gnaws through the bridge and it falls`);
    } else if (event.kind === 'move' || event.kind === 'action' || event.kind === 'plan') {
      continue;
    } else if (event.kind === 'damage') {
      const next = events[i + 1];
      if (
        event.wiped &&
        next !== undefined &&
        next.kind === 'push' &&
        next.outcome.kind === 'falls' &&
        next.outcome.band === event.band
      ) {
        continue;
      }
      const name = bandName(state, event.band);
      const lose = isPlural(name) ? 'lose' : 'loses';
      if (event.cause === 'bridge') {
        sentences.push(`${name} ${isPlural(name) ? 'are' : 'is'} cut off as the bridge falls and ${lose} ${event.amount}`);
        continue;
      }
      const base = `${name} ${lose} ${event.amount}`;
      const said = event.wiped ? `${base} and ${isPlural(name) ? 'are' : 'is'} wiped out` : base;
      sentences.push(shieldsDen(state, events, i) ? `${said}, shielding the den` : said);
    } else if (event.kind === 'terrain') {
      const wasDen = event.from === 'habitat' || event.from === 'habitatDamaged';
      if (event.to === 'habitatDamaged' || wasDen) {
        const striker = strikerOf(state, events, i, event.at);
        sentences.push(striker !== null ? `${striker} tears into the den` : 'A den is struck');
        sentences.push(event.to === 'habitatDamaged' ? "Den damaged — one more hit and it's gone" : 'The den is lost');
      } else if (event.cause === 'gnaw') continue;
      else if (event.from === 'stones') sentences.push('A stone is shoved');
      else if (event.to === 'stones') continue;
      else if (event.to === 'ford') sentences.push(`The stone fills the ${event.from === 'hole' ? 'hole' : 'water'}: a ford to walk on`);
      else if (event.from === 'earthbank') sentences.push('The earth bank is dug away');
      else if (event.from === 'hole' && event.to === 'open') sentences.push('The hole is filled in');
      else if (event.from === 'dam' && event.to === 'water') sentences.push('The dam is cut and the water flows');
      else if (event.to === 'hole') sentences.push('A hole is dug');
      else if (event.to === 'dam') sentences.push('A dam is built');
      else if (event.to === 'stubble') sentences.push('Forest is mown to stubble');
      else if (event.to === 'paving') sentences.push('The ground is paved');
      else if (event.to === 'open') sentences.push('The ground is cleared');
      else sentences.push(`The ground becomes ${terrainWord(event.to)}`);
    } else if (event.kind === 'push') {
      const outcome = event.outcome;
      const name = bandName(state, outcome.band);
      if (outcome.kind === 'falls') {
        sentences.push(fallPhrase(state, name, outcome.at, outcome.cause));
      } else if (outcome.kind === 'bumped') {
        if (outcome.other === null) {
          sentences.push(`${name} is pushed and bumps into ${bumpedInto(state, events, i, outcome.band)}`);
        } else if (outcome.other === outcome.band) {
          // Only under the trial rule snakeBodies, where its own body blocks it.
          sentences.push(`${name} is pushed and bumps into its own body`);
        } else {
          sentences.push(`${name} is pushed and bumps into ${bandName(state, outcome.other)}`);
        }
      } else {
        sentences.push(`${name} is pushed back`);
      }
    } else if (event.kind === 'capture') {
      const objective = state.objectives.find(
        (o) => o.at[0] === event.at[0] && o.at[1] === event.at[1],
      );
      if (objective !== undefined && objective.kind === 'permit') {
        sentences.push('The permit is captured');
      } else if (objective !== undefined && objective.kind === 'stake') {
        sentences.push('A survey stake is captured');
      } else {
        sentences.push('An objective is captured');
      }
    } else if (event.kind === 'pickup') {
      sentences.push('Seeds picked up');
    } else if (event.kind === 'freed') {
      sentences.push(`${bandName(state, event.band)} is freed`);
    }
  }
  return sentences;
}

/**
 * The goal of a level in one line. A level with dens adds that they must
 * stand: losing one loses the battle.
 * @param {Level} level
 * @returns {string}
 */
export function goalText(level) {
  const goal = baseGoal(level);
  let dens = 0;
  for (const c of level.grid.join('')) {
    if (c === 'H') dens += 1;
  }
  if (dens === 0) return goal;
  return dens === 1 ? `${goal} and keep the den standing` : `${goal} and keep the ${dens} dens standing`;
}

/**
 * The habitats still standing out of the level's start count, as
 * "2/3" (the view sets the den icon before it), or '' on a level
 * without any.
 * @param {BattleState} state
 * @returns {string}
 */
export function habitatCount(state) {
  if (state.habitatStart === 0) return '';
  return `${countHabitats(state)}/${state.habitatStart}`;
}

/**
 * Why a lost battle was lost, or '' when it was not lost (or the reason
 * is unknown).
 * @param {BattleState} state
 * @returns {string}
 */
export function defeatText(state) {
  if (state.outcome !== 'lost') return '';
  if (state.lostReason === 'habitat') return 'A den was destroyed';
  if (state.lostReason === 'wiped') return 'Every band was wiped out';
  if (state.lostReason === 'turns') return 'Out of turns';
  if (state.lostReason === 'rescue') return 'The trapped animal was lost';
  return '';
}

/**
 * @param {Level} level
 * @returns {string}
 */
function baseGoal(level) {
  if (level.goal === 'clear') return 'Drive out every bot';
  if (level.goal === 'rescue') {
    const first = level.trapped[0];
    if (first === undefined) return 'Rescue the trapped animal';
    const def = BAND_TYPES[first.type];
    const name = (def !== undefined ? def.name : first.type).toLowerCase();
    return `Rescue the trapped ${name}`;
  }
  // capture: count objectives in the grid (see LEGEND in js/engine/terrain.js:
  // 'P' is a permit, 'K' is a survey stake, '*' is a pickup).
  const grid = level.grid.join('');
  let permits = 0;
  let stakes = 0;
  for (const c of grid) {
    if (c === 'P') permits += 1;
    else if (c === 'K') stakes += 1;
  }
  if (permits > 0) return 'Capture the forged permit';
  if (stakes >= 2) return 'Capture both survey stakes';
  if (stakes === 1) return 'Capture the survey stake';
  return 'Capture the objective';
}
