/** @typedef {import('../engine/types.js').Level} Level */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('../engine/types.js').Reward} Reward */
/** @typedef {import('../engine/types.js').Pos} Pos */

/** @typedef {import('./icons.js').IconName} IconName */
/** @typedef {import('./finale.js').Ribbon} Ribbon */

import { defeatText } from './text.js';
import { setIconText, icon } from './icons.js';
import { isHabitat } from '../engine/terrain.js';
import { BAND_TYPES } from '../engine/units.js';
import { countForest, countHabitats } from '../engine/battle.js';
import { resultKey, focusKind, keyHint, keyListBox, takeKeys, RESULT_KEY_LIST } from './keys.js';
import { ribbonFor, countUp, unfurlFrames, wordFrames, RIBBON_MS, RIBBON_WORD_AT } from './finale.js';
import { UI_ASSETS } from './ui-assets.js';
import { prefersReducedMotion } from './blink.js';

/**
 * Where a den stands, in words, among the level's dens: "" when it is the
 * only one, else the side of the board it is on ("west", "north-east"),
 * told apart from the others as little as needed.
 * @param {Pos} at
 * @param {Pos[]} dens  every den of the level
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function denPlace(at, dens, width, height) {
  if (dens.length <= 1) return '';
  /** @param {Pos} p */
  const ew = (p) => (p[0] < width / 2 ? 'west' : 'east');
  /** @param {Pos} p */
  const ns = (p) => (p[1] < height / 2 ? 'north' : 'south');
  const others = dens.filter((d) => d[0] !== at[0] || d[1] !== at[1]);
  if (others.every((d) => ew(d) !== ew(at))) return ew(at);
  if (others.every((d) => ns(d) !== ns(at))) return ns(at);
  return `${ns(at)}-${ew(at)}`;
}

/**
 * @param {Level} level
 * @returns {string}  the trapped animal's name, in lower case
 */
function trappedName(level) {
  const first = level.trapped[0];
  const def = first !== undefined ? BAND_TYPES[first.type] : undefined;
  return def !== undefined ? def.name.toLowerCase() : 'animal';
}

/**
 * What happened, in one line, for the result card. A win says the goal
 * was met; a loss says what was lost: which den, that every band was
 * wiped out, that the turns ran out, or that the trapped animal was lost.
 * @param {Level} level
 * @param {BattleState} final
 * @returns {string}
 */
export function resultLine(level, final) {
  if (final.outcome === 'won') {
    if (level.goal === 'clear') return 'Every bot is driven off the field';
    if (level.goal === 'rescue') return `The trapped ${trappedName(level)} is free`;
    const stakes = level.grid.join('').split('').filter((c) => c === 'K').length;
    if (stakes === 0) return 'The forged permit is captured';
    return stakes === 1 ? 'The survey stake is captured' : 'The survey stakes are captured';
  }
  if (final.lostReason === 'habitat') {
    /** @type {Pos[]} */
    const dens = [];
    level.grid.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'H') dens.push([x, y]); }));
    const lost = dens.find(([x, y]) => {
      const tile = final.tiles[y] !== undefined ? final.tiles[y][x] : undefined;
      return tile === undefined || !isHabitat(tile);
    });
    const place = lost !== undefined ? denPlace(lost, dens, final.width, final.height) : '';
    return place === '' ? 'The den was destroyed' : `The ${place} den was destroyed`;
  }
  if (final.lostReason === 'turns' && final.turnLimit !== null) {
    return `Out of turns: the bots held on past turn ${final.turnLimit}`;
  }
  if (final.lostReason === 'rescue') return `The trapped ${trappedName(level)} was lost`;
  const why = defeatText(final);
  return why !== '' ? why : 'The bots held the field';
}

/**
 * @typedef {{label: string, value: number}} TallyRow
 * @typedef {{icon: IconName, have: number, of: number, label: string}} StandingRow
 * @typedef {{start: number, duration: number}} Span
 * @typedef {{
 *   ribbon: Span, name: Span, panel: Span, standing: Span[], rows: Span[], actions: Span, end: number,
 * }} EntranceSteps
 */

/** When the ribbon starts to unfurl over the scene. */
export const RESULT_RIBBON_LEAD_MS = 120;
/** The panel rising into place, and when. */
export const PANEL_LEAD_MS = 220;
export const PANEL_MS = 380;
/** The how-well-it-went marks, one after the other. */
export const STANDING_LEAD_MS = 560;
export const STANDING_STAGGER_MS = 110;
/** The tally: each line lands, and the total counts its seeds in. */
export const ROW_LEAD_MS = 760;
export const ROW_STAGGER_MS = 280;
export const ROW_MS = 240;
export const ROW_COUNT_MS = 320;
/** The buttons come last, once there is nothing left to count. */
export const ACTIONS_MS = 260;
/** How long the screen waits for its painted scene before it goes on without it. */
export const SCENE_WAIT_MS = 900;
/** How often the total moves on while it counts, in ms. */
const TICK_MS = 40;

/**
 * The ribbon over the result's scene: green "Victory" or rust "Defeat".
 * @param {BattleState} final
 * @returns {Ribbon}
 */
export function resultRibbon(final) {
  return ribbonFor(final.outcome === 'won' ? 'won' : 'lost');
}

/**
 * The painted scene behind the result, from the kit's list, or null when
 * it is not there (the screen then stands on the canopy backdrop alone).
 * @param {BattleState} final
 * @param {Readonly<Record<string, string>>} [assets]
 * @returns {string|null}
 */
export function resultScene(final, assets = UI_ASSETS) {
  const piece = final.outcome === 'won' ? 'result-victory' : 'result-defeat';
  return Object.prototype.hasOwnProperty.call(assets, piece) ? assets[piece] : null;
}

/**
 * The lines of a reward, in the order they were earned, each with its
 * seeds; a line worth nothing is left out. The total is the reward's own.
 * @param {Reward} reward
 * @returns {{rows: TallyRow[], total: number}}
 */
export function tallyRows(reward) {
  /** @type {TallyRow[]} */
  const all = [
    { label: 'Pickups', value: reward.pickups },
    { label: 'Objectives', value: reward.objectives },
    { label: 'Forest kept', value: reward.forest },
    { label: 'First clear', value: reward.firstClear },
  ];
  return { rows: all.filter((r) => r.value !== 0), total: reward.total };
}

/**
 * How well a won battle went, from what the game already counts: the dens
 * still standing out of the level's dens (on a level that has any), and
 * the forest kept out of the forest it started with. Nothing new is
 * scored.
 * @param {BattleState} final
 * @returns {StandingRow[]}
 */
export function standingRows(final) {
  /** @type {StandingRow[]} */
  const rows = [];
  if (final.habitatStart > 0) {
    rows.push({ icon: 'den', have: countHabitats(final), of: final.habitatStart, label: final.habitatStart === 1 ? 'den standing' : 'dens standing' });
  }
  if (final.forestStart > 0) {
    rows.push({ icon: 'forest', have: countForest(final), of: final.forestStart, label: 'forest kept' });
  }
  return rows;
}

/**
 * The result screen arriving: the ribbon unfurls over the scene, the
 * level's name comes onto it, the panel rises, the marks of how it went
 * come one by one, then each line of the tally lands and the total counts
 * its seeds in; the buttons come last. Under reduced motion everything is
 * simply there (every span is empty and the end is 0).
 * @param {{standing: number, rows: number, reducedMotion?: boolean}} what
 * @returns {EntranceSteps}
 */
export function entranceSteps(what) {
  const none = { start: 0, duration: 0 };
  if (what.reducedMotion === true) {
    return {
      ribbon: none, name: none, panel: none,
      standing: Array.from({ length: what.standing }, () => none),
      rows: Array.from({ length: what.rows }, () => none),
      actions: none, end: 0,
    };
  }
  const ribbon = { start: RESULT_RIBBON_LEAD_MS, duration: RIBBON_MS };
  const name = { start: Math.round(ribbon.start + ribbon.duration * RIBBON_WORD_AT), duration: 300 };
  const panel = { start: PANEL_LEAD_MS, duration: PANEL_MS };
  const standing = Array.from({ length: what.standing }, (_, i) => ({ start: STANDING_LEAD_MS + i * STANDING_STAGGER_MS, duration: ROW_MS }));
  const rowLead = what.standing > 0 ? ROW_LEAD_MS + (what.standing - 1) * STANDING_STAGGER_MS : ROW_LEAD_MS;
  const rows = Array.from({ length: what.rows }, (_, i) => ({ start: rowLead + i * ROW_STAGGER_MS, duration: ROW_MS }));
  let last = Math.max(ribbon.start + ribbon.duration, panel.start + panel.duration, name.start + name.duration);
  for (const s of standing) last = Math.max(last, s.start + s.duration);
  for (const r of rows) last = Math.max(last, r.start + ROW_COUNT_MS);
  const actions = { start: Math.max(panel.start + panel.duration, last - 120), duration: ACTIONS_MS };
  return { ribbon, name, panel, standing, rows, actions, end: actions.start + actions.duration };
}

/**
 * The total shown `elapsed` ms into the entrance: each line's seeds are
 * counted in from the moment it lands, so the total climbs line by line
 * and ends on the sum.
 * @param {EntranceSteps} steps
 * @param {TallyRow[]} rows
 * @param {number} elapsed
 * @returns {number}
 */
export function tallyAt(steps, rows, elapsed) {
  let sum = 0;
  rows.forEach((row, i) => {
    const span = steps.rows[i];
    const duration = span !== undefined && span.duration > 0 ? ROW_COUNT_MS : 0;
    sum += countUp(row.value, elapsed - (span !== undefined ? span.start : 0), duration);
  });
  return sum;
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function node(tag, className, text) {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The result screen, built around the painted scene of the win or the
 * loss (the kit's result-victory or result-defeat), with the ribbon over
 * its calm sky carrying the word and the level's name. Under it a
 * parchment panel says what happened in one line; after a win it shows
 * how well it went (dens standing, forest kept) and the seed tally, each
 * line with the painted acorn, counting up to the total. Then "Back to
 * map" as the main button (Enter) and "Play again" as the quieter one (R).
 *
 * The returned promise settles once the screen is finished and steady:
 * the scene is shown (or given up on) and the entrance has played. A
 * scene of the story that opens over this screen (js/app.js) waits for
 * it. Until then a press (a tap, Enter, Space or R) only finishes the
 * entrance at once, as on the board; the next one acts.
 * @param {HTMLElement} root
 * @param {{level: Level, final: BattleState, reward: Reward|null, onMap: () => void, onReplay: () => void, assets?: Readonly<Record<string, string>>}} opts
 * @returns {Promise<void>}
 */
export function renderResult(root, opts) {
  const { level, final, reward } = opts;
  root.replaceChildren();
  const won = final.outcome === 'won';
  const reducedMotion = prefersReducedMotion();
  const src = resultScene(final, opts.assets);

  const screen = node('div', `screen result-screen ${won ? 'result-screen--won' : 'result-screen--lost'}${src === null ? ' result-screen--bare' : ''}`);
  root.appendChild(screen);

  // The scene, with the ribbon over its sky.
  const hero = node('div', 'result-hero');
  screen.appendChild(hero);
  /** @type {HTMLImageElement|null} */
  let img = null;
  if (src !== null) {
    const figure = node('div', 'result-scene');
    img = /** @type {HTMLImageElement} */ (node('img', 'result-scene__img'));
    img.setAttribute('src', src);
    img.setAttribute('alt', '');
    img.setAttribute('draggable', 'false');
    figure.appendChild(img);
    hero.appendChild(figure);
  }
  const look = resultRibbon(final);
  const banner = node('div', 'result-banner');
  hero.appendChild(banner);
  const title = node('h1', `screen-title result-title ui-ribbon ui-ribbon--${look.tone}`);
  const word = node('span', 'result-title__word', look.word);
  title.appendChild(word);
  const name = node('span', 'result-sub', level.name);
  title.appendChild(name);
  title.setAttribute('aria-label', `${look.word}: ${level.name}`);
  banner.appendChild(title);

  const body = node('div', 'result-body');
  screen.appendChild(body);
  const card = node('div', 'result-card ui-panel--parchment');
  body.appendChild(card);

  // What happened; on a defeat, what was lost, a den above all.
  const line = node('p', final.lostReason === 'habitat' ? 'result-reason result-reason--den' : 'result-reason');
  if (final.lostReason === 'habitat') setIconText(line, 'den', resultLine(level, final), { alt: 'Den' });
  else line.textContent = resultLine(level, final);
  card.appendChild(line);

  // How well it went, after a win.
  const standing = won ? standingRows(final) : [];
  /** @type {HTMLElement[]} */
  const standingEls = [];
  if (standing.length > 0) {
    const marks = node('div', 'result-standing');
    card.appendChild(marks);
    for (const row of standing) {
      const mark = node('p', `result-stand result-stand--${row.icon}${row.have === row.of ? ' is-whole' : ''}`);
      mark.setAttribute('aria-label', `${row.have} of ${row.of} ${row.label}`);
      const count = node('span', 'result-stand__count');
      count.append(icon(row.icon), ` ${row.have}/${row.of}`);
      mark.appendChild(count);
      mark.appendChild(node('span', 'result-stand__label', row.label));
      marks.appendChild(mark);
      standingEls.push(mark);
    }
  }

  // The seed tally, after a win: each line with the painted acorn, and the
  // total counting up as the lines land.
  const tally = won && reward !== null ? tallyRows(reward) : null;
  /** @type {HTMLElement[]} */
  const rowEls = [];
  /** @type {HTMLElement|null} */
  let sum = null;
  if (tally !== null) {
    const list = node('div', 'reward-list');
    card.appendChild(list);
    for (const { label, value } of tally.rows) {
      const row = node('div', 'reward-row');
      list.appendChild(row);
      row.appendChild(node('span', 'reward-row__label', label));
      const v = node('span', 'reward-row__value');
      setIconText(v, 'seed', value);
      row.appendChild(v);
      rowEls.push(row);
    }
    const total = node('div', 'reward-row reward-row--total');
    total.setAttribute('aria-label', `Seeds: ${tally.total} more`);
    total.appendChild(node('span', 'reward-row__label', 'Seeds'));
    sum = node('span', 'reward-row__value');
    total.appendChild(sum);
    list.appendChild(total);
  }
  /** @param {number} n */
  const showTotal = (n) => {
    if (sum !== null) sum.replaceChildren(icon('seed'), ` +${n}`);
  };

  // The default is the map (play-feel spec, "Changed after Jake's
  // playtest of the full build"): "Back to map" is the main button and
  // has the focus, so Enter takes it; "Play again" is a second, quieter
  // one. Nothing replays unless the player asks.
  const actions = node('div', 'screen-actions result-actions');
  body.appendChild(actions);

  // The screen is left once, however the press arrives (a key, then the
  // focused button the same key reaches).
  let left = false;
  /** @param {() => void} go */
  const leave = (go) => {
    if (left || !steady) return;
    left = true;
    stopKeys();
    go();
  };

  const mapBtn = /** @type {HTMLButtonElement} */ (node('button', 'ui-btn ui-btn--primary', 'Back to map'));
  mapBtn.type = 'button';
  mapBtn.appendChild(keyHint('Enter'));
  mapBtn.addEventListener('click', () => leave(opts.onMap));
  actions.appendChild(mapBtn);

  const replayBtn = /** @type {HTMLButtonElement} */ (node('button', 'ui-btn ui-btn--secondary', 'Play again'));
  replayBtn.type = 'button';
  replayBtn.appendChild(keyHint('R'));
  replayBtn.addEventListener('click', () => leave(opts.onReplay));
  actions.appendChild(replayBtn);

  // --- the entrance ---

  const steps = entranceSteps({ standing: standingEls.length, rows: rowEls.length, reducedMotion });
  /** @type {Animation[]} */
  const playing = [];
  /** @type {ReturnType<typeof setTimeout>[]} */
  const timers = [];
  let steady = false;
  let begun = false;
  /** @type {() => void} */
  let settle = () => {};
  /** @type {Promise<void>} */
  const settled = new Promise((resolve) => { settle = resolve; });

  /**
   * @param {Element} el
   * @param {Keyframe[]} frames
   * @param {Span} span
   * @param {string} [easing]
   */
  const play = (el, frames, span, easing = 'ease-out') => {
    if (span.duration <= 0) return;
    const target = /** @type {{animate?: unknown}} */ (/** @type {unknown} */ (el));
    if (typeof target.animate !== 'function') return;
    playing.push(el.animate(frames, { delay: span.start, duration: span.duration, fill: 'both', easing }));
  };
  const rise = [{ transform: 'translate(0px, 14px)', opacity: 0 }, { transform: 'translate(0px, 0px)', opacity: 1 }];
  const land = [{ transform: 'translate(0px, 6px)', opacity: 0 }, { transform: 'translate(0px, 0px)', opacity: 1 }];

  /** Everything in its final place, the total whole: the screen is steady. */
  const finish = () => {
    if (steady) return;
    steady = true;
    begun = true;
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    for (const a of playing) a.cancel();
    playing.length = 0;
    screen.classList.remove('is-waiting');
    if (tally !== null) showTotal(tally.total);
    settle();
  };

  const begin = () => {
    if (begun) return;
    begun = true;
    screen.classList.remove('is-waiting');
    if (steps.end <= 0) {
      finish();
      return;
    }
    play(title, unfurlFrames(), steps.ribbon, 'cubic-bezier(0.25, 0.8, 0.35, 1)');
    play(word, wordFrames(), { start: steps.name.start, duration: steps.name.duration });
    play(name, wordFrames(), { start: steps.name.start + 80, duration: steps.name.duration });
    play(card, rise, steps.panel);
    standingEls.forEach((el, i) => play(el, land, steps.standing[i]));
    rowEls.forEach((el, i) => play(el, land, steps.rows[i]));
    play(actions, land, steps.actions);
    if (tally !== null) {
      // Every step of the count is set going at once, each at its own
      // moment, so the total never runs late behind a slow frame.
      const rows = tally.rows;
      for (let at = TICK_MS; at < steps.end; at += TICK_MS) {
        timers.push(setTimeout(() => showTotal(tallyAt(steps, rows, at)), at));
      }
    }
    timers.push(setTimeout(finish, steps.end));
  };

  if (tally !== null) showTotal(reducedMotion ? tally.total : 0);

  // The painted scene is shown before anything moves over it; one that
  // cannot be shown leaves the screen on the canopy alone.
  const decode = img !== null && typeof img.decode === 'function' ? img.decode() : null;
  if (decode === null) {
    begin();
  } else {
    screen.classList.add('is-waiting');
    const wait = setTimeout(begin, SCENE_WAIT_MS);
    timers.push(wait);
    decode.then(() => {
      clearTimeout(wait);
      begin();
    }, () => {
      clearTimeout(wait);
      img?.parentElement?.remove();
      screen.classList.add('result-screen--bare');
      begin();
    });
  }

  // A tap while the screen is still arriving finishes it, and does no
  // more: the buttons answer once it is steady.
  screen.addEventListener('click', (evt) => {
    if (steady) return;
    evt.stopPropagation();
    evt.preventDefault();
    finish();
  }, true);

  // The keys (js/ui/keys.js, resultKey): Enter is Back to map, R is Play
  // again, ? shows the keys and Escape closes them. While the screen is
  // still arriving, Enter or R only finishes it. A scene over this screen
  // (a won or lost moment) has the keys while it is open.
  /** @type {HTMLElement|null} */
  let keysBox = null;
  const toggleKeys = () => {
    if (keysBox !== null) {
      keysBox.remove();
      keysBox = null;
      return;
    }
    keysBox = keyListBox(RESULT_KEY_LIST, { screen: true, onClose: toggleKeys });
    screen.appendChild(keysBox);
  };
  const doc = /** @type {Document|undefined} */ (globalThis.document);
  const stopKeys = takeKeys((evt) => {
    const command = resultKey(evt, { focus: focusKind(doc?.activeElement) });
    if (command === null) {
      // Space or Enter on the focused button would click it: hold it back
      // until the screen is steady.
      if (!steady && (evt.key === 'Enter' || evt.key === ' ') && evt.repeat !== true) {
        evt.preventDefault();
        finish();
      }
      return;
    }
    evt.preventDefault();
    if ((command === 'main' || command === 'replay') && !steady) finish();
    else if (command === 'main') leave(opts.onMap);
    else if (command === 'replay') leave(opts.onReplay);
    else if (command === 'help') toggleKeys();
    else if (keysBox !== null) toggleKeys();
  });

  if (typeof mapBtn.focus === 'function') mapBtn.focus();
  return settled;
}
