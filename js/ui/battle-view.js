import { badgeSvg, tileSizePx } from './board.js';

/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').Band} Band */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('../engine/types.js').Level} Level */
/** @typedef {import('../campaign/progress.js').BotSpeed} BotSpeed */
/** @typedef {import('./motion-player.js').SoundLike} SoundLike */
/** @typedef {import('../engine/types.js').Reward} Reward */
/** @typedef {{botSpeed: BotSpeed, soundOn: boolean}} BattleSettings */
/** @typedef {import('../story/types.js').Moment} Moment */
/** @typedef {import('../story/types.js').Pointer} Pointer */
/** @typedef {{x: number, y: number, width: number, height: number}} Rect */

import { applyMove, countForest, countHabitats } from '../engine/battle.js';
import { bandById, occupantAt, reachable } from '../engine/band.js';
import { actionTargets, findAction } from '../engine/actions.js';
import { BAND_TYPES, actionsFor, tierFor } from '../engine/units.js';
import { DIRS, add, dirBetween, eq, inBounds, key } from '../engine/grid.js';
import { renderBoard, tileFromEvent, raiseBands } from './board.js';
import { struckHabitats } from './plans.js';
import { battleMoments } from '../story/moments.js';
import { animSteps, bannerSpan } from './anim-steps.js';
import { bannerText, bannerStyle, bannerFrames, BANNER_MS, BANNER_LINE_MS } from './turn-banner.js';
import { motionTracks, soundCues, tileKindOf, createSequencer } from './motion.js';
import { playMotion, playAfter } from './motion-player.js';
import { describeIntent, describeEvents, goalText, habitatCount, defeatText } from './text.js';
import { stakeTracks, isLastTurn } from './stakes.js';
import {
  victorySteps, victoryMotion, regrown, defeatSummary, defeatSteps, countUp,
  ribbonFor, unfurlFrames, wordFrames, RIBBON_WORD_AT,
} from './finale.js';
import { soundForOutcome } from './sound.js';
import { setIconText } from './icons.js';
import { BOT_SPEEDS } from '../campaign/progress.js';
import { bandsWaiting, endTurnAsks, endTurnReady, turnStates } from './turn-state.js';
import { focusKind, keyHint, keyListBox, takeKeys } from './keys.js';
import { emblem } from './ui-kit.js';
import { focusInfo, phoneStrip, STRIP_H, STRIP_LOG_H, STRIP_ROOM } from './battle-focus.js';
import { portraitSpec, portraitFor, portraitSvg, headCrop, headCropStyle } from './portraits.js';

/**
 * @param {BattleState} state
 * @param {string|null} selected
 * @param {Pos} tapped
 * @returns {{selected: string|null, info: string|null}}
 */
export function nextSelection(state, selected, tapped) {
  if (state.outcome !== null) return { selected: null, info: null };
  const band = occupantAt(state, tapped);
  if (band === undefined) return { selected: null, info: null };
  if (band.side === 'bots') {
    return { selected: null, info: describeIntent(state, band) };
  }
  if (band.trapped) {
    return { selected: null, info: `${BAND_TYPES[band.type].name} ${band.cells.length}/${band.maxLen}` };
  }
  if (band.acted) {
    return { selected, info: `${BAND_TYPES[band.type].name} ${band.cells.length}/${band.maxLen}` };
  }
  return { selected: band.id, info: null };
}

/**
 * @param {BattleState} state
 * @param {boolean} busy
 * @returns {boolean}
 */
export function inputAllowed(state, busy) {
  return state.outcome === null && !busy;
}

/**
 * Something that happened on the battle screen that the story may have a
 * scene for: the board first drawn, a band selected (`asked`: firstSelect
 * was already asked for in this battle), or a move's or a bots' turn's
 * animation finished.
 * @typedef {{kind: 'start', state: BattleState}
 *   | {kind: 'select', state: BattleState, band: Band|undefined, asked: boolean}
 *   | {kind: 'settled', before: BattleState, after: BattleState}} BattleBeat
 */

/**
 * The story moments the battle screen hands to `onMoment`, in order, each
 * with the level (opening-act plan, Task 7). Pure.
 * - `start`: `start`, then `denMarked` if a plan already strikes a den,
 *   since battleMoments reports a den only when it becomes marked.
 * - `select`: `firstSelect` the first time one of our bands is selected.
 * - `settled`: battleMoments(before, after), but never `won` or `lost`
 *   (the result screen plays those) and no `turn` when the battle ended
 *   in it, as no turn starts.
 * Nothing at all once the battle was already over.
 * @param {string} level
 * @param {BattleBeat} beat
 * @returns {Moment[]}
 */
export function battleSceneMoments(level, beat) {
  if (beat.kind === 'start') {
    if (beat.state.outcome !== null) return [];
    /** @type {Moment[]} */
    const out = [{ when: 'start', level }];
    const marked = struckHabitats(beat.state)[0];
    if (marked !== undefined) {
      const [x, y] = marked.split(',').map(Number);
      out.push({ when: 'denMarked', level, at: [x, y] });
    }
    return out;
  }
  if (beat.kind === 'select') {
    const { state, band, asked } = beat;
    if (state.outcome !== null || asked || band === undefined || band.side !== 'us') return [];
    return [{ when: 'firstSelect', level }];
  }
  if (beat.before.outcome !== null) return [];
  const ended = beat.after.outcome !== null;
  return battleMoments(beat.before, beat.after)
    .filter((m) => m.when !== 'won' && m.when !== 'lost' && !(ended && m.when === 'turn'))
    .map((m) => ({ ...m, level }));
}

/**
 * Merge identical sentences into one "S ×N" entry, keeping
 * first-occurrence order and counting every occurrence.
 * @param {string[]} sentences
 * @returns {string[]}
 */
export function coalesceSentences(sentences) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const sentence of sentences) {
    counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
  }
  return [...counts.entries()].map(([sentence, count]) => (
    count > 1 ? `${sentence} ×${count}` : sentence
  ));
}

/**
 * True when End turn should ask for a second tap: some band of the
 * player's has done nothing at all this turn (see js/ui/turn-state.js).
 * A band that moved but did not act never asks.
 * @param {BattleState} state
 * @returns {boolean}
 */
export function endTurnNeedsConfirm(state) {
  return endTurnAsks(state);
}

// --- Keys ---

/**
 * What a key does. `action1` to `action9` choose the selected band's
 * 1st to 9th action as the pop-up lists them; `up`, `down`, `left` and
 * `right` move the tile cursor and `act` does on its tile what a tap
 * there would; `next` and `prev` select the next or previous band with
 * something left to do; `help` shows or hides the list of keys;
 * `continue` presses Continue once the battle is over.
 * @typedef {'endTurn'|'undo'|'clear'|'skip'|'next'|'prev'|'help'|'act'|'continue'|'up'|'down'|'left'|'right'
 *   |'action1'|'action2'|'action3'|'action4'|'action5'|'action6'|'action7'|'action8'|'action9'} KeyCommand
 */
/** @typedef {import('./keys.js').FocusKind} FocusKind */

/**
 * The keys, as the "?" list shows them: the keys, then what they do.
 * @type {ReadonlyArray<{keys: string, does: string}>}
 */
export const KEY_LIST = Object.freeze([
  { keys: 'Tab / Shift+Tab', does: 'Next / previous band' },
  { keys: '1 – 9', does: 'Choose an action' },
  { keys: 'Arrows, W A S D', does: 'Move the cursor' },
  { keys: 'Space', does: 'Tap the cursor’s tile' },
  { keys: 'Enter', does: 'End turn' },
  { keys: 'Z, U, Backspace', does: 'Undo' },
  { keys: 'Esc', does: 'Let go of the band' },
  { keys: '?', does: 'Show or hide these keys' },
]);

/**
 * The list of keys as the "?" card shows it now: the line for 1 to 9
 * names the actions they choose, with their emblems: the selected band's,
 * in their numbers' order, or, with no band selected, every action our
 * bands on the field have.
 * @param {BattleState} state
 * @param {SelectionView|null} view
 * @returns {Array<import('./keys.js').KeyListEntry>}
 */
export function keyList(state, view) {
  /** @type {Array<{id: string, label: string}>} */
  let actions = [];
  if (view !== null && view.options.length > 0) {
    actions = view.options.slice(0, 9).map((o, i) => ({ id: o.id, label: `${i + 1} ${o.label}` }));
  } else {
    for (const band of state.bands) {
      if (band.side !== 'us') continue;
      for (const def of actionsFor(band.type, band.maxLen)) {
        if (!actions.some((a) => a.id === def.id)) actions.push({ id: def.id, label: def.label });
      }
    }
  }
  return KEY_LIST.map((entry) => (entry.keys === '1 – 9' ? { ...entry, actions } : entry));
}

/** Arrow keys and W A S D, to the way the cursor moves. */
const CURSOR_KEYS = /** @type {Record<string, 'up'|'down'|'left'|'right'>} */ ({
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
});

/**
 * What a key press does on the battle screen.
 *
 * - Enter ends the turn (with the End turn button's own rule, so it asks
 *   only for an untouched band); Z, U or Backspace is Undo; Escape lets
 *   go of the band.
 * - Tab and Shift+Tab select the next and previous band with something
 *   left to do; 1 to 9 choose an action; the arrows and W A S D move the
 *   tile cursor and Space taps its tile; ? shows the list of keys.
 * - Nothing while a text field or a dialog has focus, nothing with Ctrl,
 *   Cmd or Alt held. Enter and Space are left to a focused button.
 * - `blocked` (the settings panel or the "Leave battle?" bar is open):
 *   only Escape, which closes it.
 * - A held key repeats only the cursor and Tab: never an action, Undo or
 *   the end of a turn.
 * - During the bots' turn only Enter, Z, Backspace and Escape do
 *   anything, and they only skip to its end, as a tap does; but not a key
 *   that is still held down from before (the Enter that ended the turn,
 *   repeating), or holding Enter a moment too long would hide the bots'
 *   turn.
 * - `ended` (the battle is won or lost, the Continue button is up): Enter
 *   or Space presses Continue, once per press (mountBattle lets the end of
 *   the battle finish playing first); ? and Escape still show and close
 *   the keys; nothing else.
 * @param {{key: string, repeat?: boolean, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} evt
 * @param {{focus: FocusKind, phase: 'player'|'bots', blocked?: boolean, ended?: boolean}} ctx
 * @returns {KeyCommand|null}
 */
export function keyCommand(evt, ctx) {
  if (evt.ctrlKey === true || evt.metaKey === true || evt.altKey === true) return null;
  if (ctx.focus === 'text' || ctx.focus === 'dialog') return null;
  const key = evt.key;
  const held = evt.repeat === true;
  if (ctx.ended === true && ctx.phase !== 'bots') {
    if (held) return null;
    if (key === 'Escape') return 'clear';
    if (key === '?') return 'help';
    const press = key === 'Enter' || key === ' ' || key === 'Spacebar';
    return press && ctx.focus !== 'button' ? 'continue' : null;
  }
  if (ctx.phase === 'bots') {
    const skips = key === 'Enter' || key === 'z' || key === 'Z' || key === 'Backspace' || key === 'Escape';
    return skips && !held ? 'skip' : null;
  }
  if (key === 'Escape') return held ? null : 'clear';
  if (ctx.blocked === true) return null;
  if (key === 'Tab') return evt.shiftKey === true ? 'prev' : 'next';
  const way = CURSOR_KEYS[key];
  if (way !== undefined) return way;
  if (held) return null;
  if (key === 'Enter') return ctx.focus === 'button' ? null : 'endTurn';
  if (key === ' ' || key === 'Spacebar') return ctx.focus === 'button' ? null : 'act';
  if (key === 'z' || key === 'Z' || key === 'u' || key === 'U' || key === 'Backspace') return 'undo';
  if (key === '?') return 'help';
  if (/^[1-9]$/.test(key)) return /** @type {KeyCommand} */ (`action${key}`);
  return null;
}

/**
 * The band Tab (dir 1) or Shift+Tab (dir -1) selects: the next or
 * previous of the player's bands, in the order the state lists them,
 * that still has something to do (js/ui/turn-state.js: ready, or can
 * still act), wrapping round and skipping bands that are done. The
 * selected band itself only when it is the only one left. Null when no
 * band has anything left to do.
 * @param {BattleState} state
 * @param {string|null} selected
 * @param {1|-1} dir
 * @returns {string|null}
 */
export function cycleBand(state, selected, dir) {
  const turns = turnStates(state);
  const order = state.bands.filter((band) => turns.has(band.id)).map((band) => band.id);
  const live = order.filter((id) => turns.get(id) !== 'done');
  if (live.length === 0) return null;
  const at = selected === null ? -1 : order.indexOf(selected);
  if (at < 0) return dir === 1 ? live[0] : live[live.length - 1];
  for (let i = 1; i <= order.length; i += 1) {
    const id = order[(((at + dir * i) % order.length) + order.length) % order.length];
    if (live.includes(id)) return id;
  }
  return null;
}

/**
 * Where the tile cursor first shows: on the selected band's head, else
 * on the head of the first band that is ready (or else can still act),
 * else on the first of the player's bands, else the top-left tile.
 * @param {BattleState} state
 * @param {string|null} selected
 * @returns {Pos}
 */
export function cursorStart(state, selected) {
  const sel = selected !== null ? bandById(state, selected) : undefined;
  if (sel !== undefined && sel.cells.length > 0) return [sel.cells[0][0], sel.cells[0][1]];
  const turns = turnStates(state);
  for (const want of ['ready', 'canAct', 'done']) {
    const band = state.bands.find((b) => turns.get(b.id) === want && b.cells.length > 0);
    if (band !== undefined) return [band.cells[0][0], band.cells[0][1]];
  }
  return [0, 0];
}

/**
 * The cursor moved one tile, stopping at the board's edge.
 * @param {BattleState} state
 * @param {Pos} at
 * @param {'up'|'down'|'left'|'right'} way
 * @returns {Pos}
 */
export function stepCursor(state, at, way) {
  const [dx, dy] = way === 'up' ? [0, -1] : way === 'down' ? [0, 1] : way === 'left' ? [-1, 0] : [1, 0];
  return [clamp(at[0] + dx, 0, state.width - 1), clamp(at[1] + dy, 0, state.height - 1)];
}

/**
 * The action offered to a band that has moved: the first of its actions,
 * in its own order, that can hit an enemy band from where it now stands,
 * so one tap attacks. Never an action that would not hit an enemy (a dig,
 * a build, a sting into empty ground): a tap acts at once and there is no
 * Confirm. Null for a band that has not moved, has acted, or has nothing
 * to hit.
 * @param {BattleState} state
 * @param {string} bandId
 * @returns {string|null}
 */
export function offeredAction(state, bandId) {
  if (state.outcome !== null) return null;
  const band = bandById(state, bandId);
  if (band === undefined || band.side !== 'us' || band.trapped || !band.moved || band.acted) return null;
  if (band.cells.length === 0) return null;
  for (const def of actionsFor(band.type, band.maxLen)) {
    if (def.effect !== 'attack') continue;
    const hits = actionTargets(state, bandId, def.id).some((target) => strikeArea(state, bandId, def.id, target)
      .some((at) => {
        const other = occupantAt(state, at);
        return other !== undefined && other.side !== band.side;
      }));
    if (hits) return def.id;
  }
  return null;
}

// --- Targets, outcome badges and the action pop-up ---
//
// A tap on a highlighted target performs the action at once; there is
// no confirm step, and Undo is the safety net. So everything a player
// needs to judge a tap has to be on the board before it. These pure
// functions work that out; mountBattle only draws.

/** @typedef {import('../engine/types.js').Move} Move */
/** @typedef {import('./board.js').BadgeIcon} BadgeIcon */
/**
 * One tile an action strikes, with the badges for the band struck there.
 * @typedef {{at: Pos, badges: BadgeIcon[]}} Strike
 */
/**
 * One target of an action. `at` is the tile a tap aims at; `strikes` is
 * every tile the action hits from there, starting with `at` (three in a
 * line for the bees' sting, `at` alone otherwise), each with the badges
 * for the band on it. `badges` is all of them together, for the key.
 * @typedef {{at: Pos, badges: BadgeIcon[], strikes: Strike[], text: string, ghost: BattleState}} TargetPreview
 */
/** @typedef {{id: string, label: string, enabled: boolean, chosen: boolean}} ActionOption */
/**
 * What a selected band offers.
 * - mode 'direct': the band has one action and no target doubles as a
 *   move tile, so moves and targets show together and a tap does it.
 * - mode 'menu': the band must choose, in the pop-up, before targets
 *   show. `popup` is false while no action has anything to aim at.
 * `moves` and `targets` are what is tappable right now. `avoid` (every
 * target of every action) and `reach` (every move tile) do not change
 * when an action is chosen, so the pop-up placed from them stays put.
 * `friends` is every tile one of the player's other bands stands on: a
 * tap there, further down a sting's line, picks that band (see tapAction).
 * @typedef {{bandId: string, mode: 'direct'|'menu', popup: boolean, options: ActionOption[], actionId: string|null, moves: Map<string, Pos[]>, targets: TargetPreview[], avoid: Pos[], reach: Pos[], friends: Pos[]}} SelectionView
 */
/** @typedef {{x: number, y: number, side: 'N'|'E'|'S'|'W', outside: boolean, arrow: number|null}} PopupPlace */

/** What each badge means, for the key shown with the targets. */
export const BADGE_TEXT = /** @type {Record<BadgeIcon, string>} */ ({
  wipe: 'wiped out',
  water: 'into the water',
  hole: 'into a hole',
  bump: 'bumps',
  own: 'hurts your own band',
});

/** @type {BadgeIcon[]} */
const BADGE_ORDER = ['wipe', 'water', 'hole', 'bump', 'own'];

/**
 * The one-line message for a state's latest events, ending with the
 * verdict when the battle is over. Empty when nothing worth saying
 * happened (a plain move).
 * @param {BattleState} state
 * @returns {string}
 */
export function resultMessage(state) {
  const text = coalesceSentences(describeEvents(state, state.events)).join('. ');
  if (state.outcome === null) return text;
  const why = defeatText(state);
  const verdict = state.outcome === 'won' ? 'You won' : why !== '' ? `You lost: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : 'You lost';
  return text === '' ? verdict : `${text}. ${verdict}`;
}

/**
 * The badges for one previewed action: what it does to the enemy
 * (falls into water or a hole, is wiped out, or bumps; the worst one
 * only), plus 'own' when one of the player's bands is hurt by it.
 * Event kinds it does not know are ignored.
 * @param {BattleState} before  The state the action is taken in.
 * @param {BattleState} after  The state applyMove returned for it.
 * @param {string|null} [only]  Count only what happens to this band.
 * @returns {BadgeIcon[]}
 */
export function outcomeBadges(before, after, only = null) {
  /** @param {string} id */
  const isOwn = (id) => before.bands.some((band) => band.id === id && band.side === 'us');
  /** @param {string} id */
  const counts = (id) => only === null || id === only;
  /** @type {'water'|'hole'|null} */
  let fall = null;
  let wiped = false;
  let bumped = false;
  let own = false;
  for (const event of after.events) {
    if (event.kind === 'damage') {
      if (!counts(event.band)) continue;
      if (isOwn(event.band)) own = true;
      else if (event.wiped) wiped = true;
    } else if (event.kind === 'push') {
      const outcome = event.outcome;
      if (!counts(outcome.band) || isOwn(outcome.band)) continue;
      if (outcome.kind === 'falls') {
        const row = after.tiles[outcome.at[1]];
        const tile = row !== undefined ? row[outcome.at[0]] : undefined;
        fall = tile !== undefined && tile.kind === 'hole' ? 'hole' : 'water';
      } else if (outcome.kind === 'bumped') {
        bumped = true;
      }
    }
  }
  /** @type {BadgeIcon[]} */
  const badges = [];
  if (fall !== null) badges.push(fall);
  else if (wiped) badges.push('wipe');
  else if (bumped) badges.push('bump');
  if (own) badges.push('own');
  return badges;
}

/**
 * Every tile an action aimed at `at` strikes, in order from `at`. The
 * bees' sting ('line3') hits `at` and the two tiles beyond it, going away
 * from the head, as js/engine/actions.js resolves it; the board edge cuts
 * the line short. Any other action strikes `at` alone.
 * @param {BattleState} state
 * @param {string} bandId
 * @param {string} actionId
 * @param {Pos} at
 * @returns {Pos[]}
 */
export function strikeArea(state, bandId, actionId, at) {
  /** @type {Pos[]} */
  const area = [[at[0], at[1]]];
  const band = bandById(state, bandId);
  if (band === undefined || band.cells.length === 0) return area;
  const action = findAction(band, actionId);
  if (action === undefined || action.pattern !== 'line3') return area;
  const dir = dirBetween(band.cells[0], at);
  if (dir === null) return area;
  let pos = at;
  for (let i = 1; i < 3; i += 1) {
    pos = add(pos, DIRS[dir]);
    if (!inBounds(state, pos)) break;
    area.push([pos[0], pos[1]]);
  }
  return area;
}

/**
 * The badges for each tile an action strikes: each band struck gets its
 * badges on the first of those tiles it stands on.
 * @param {BattleState} before
 * @param {BattleState} after
 * @param {Pos[]} area
 * @returns {Strike[]}
 */
function strikeBadges(before, after, area) {
  if (area.length === 1) return [{ at: [area[0][0], area[0][1]], badges: outcomeBadges(before, after) }];
  /** @type {Set<string>} */
  const seen = new Set();
  return area.map((at) => {
    const band = occupantAt(before, at);
    /** @type {BadgeIcon[]} */
    let badges = [];
    if (band !== undefined && !seen.has(band.id)) {
      seen.add(band.id);
      badges = outcomeBadges(before, after, band.id);
    }
    return { at: [at[0], at[1]], badges };
  });
}

/**
 * Every legal target of an action with what happens there: the
 * resulting state (the hover preview's ghost), its one-line
 * description and its badges. One source for hover and touch.
 * @param {BattleState} state
 * @param {string} bandId
 * @param {string} actionId
 * @returns {TargetPreview[]}
 */
export function previewTargets(state, bandId, actionId) {
  /** @type {TargetPreview[]} */
  const previews = [];
  for (const at of actionTargets(state, bandId, actionId)) {
    /** @type {BattleState} */
    let ghost;
    try {
      ghost = applyMove(state, { kind: 'act', band: bandId, action: actionId, target: [at[0], at[1]] });
    } catch {
      continue;
    }
    previews.push({
      at: [at[0], at[1]],
      badges: outcomeBadges(state, ghost),
      strikes: strikeBadges(state, ghost, strikeArea(state, bandId, actionId, at)),
      text: resultMessage(ghost),
      ghost,
    });
  }
  return previews;
}

/**
 * The badges that appear on these targets, each with its meaning, in
 * a fixed order.
 * @param {TargetPreview[]} targets
 * @returns {Array<{icon: BadgeIcon, text: string}>}
 */
export function badgeLegend(targets) {
  return BADGE_ORDER
    .filter((icon) => targets.some((target) => target.badges.includes(icon)))
    .map((icon) => ({ icon, text: BADGE_TEXT[icon] }));
}

/**
 * @param {BattleState} state
 * @param {string} bandId
 * @param {string|null} chosen  The action picked in the pop-up, if any.
 * @returns {SelectionView|null}  null when the band cannot be used.
 */
export function selectionView(state, bandId, chosen) {
  if (state.outcome !== null) return null;
  const band = bandById(state, bandId);
  if (band === undefined || band.side !== 'us' || band.trapped || band.acted) return null;
  if (band.cells.length === 0) return null;

  /** @type {Map<string, Pos[]>} */
  const paths = band.moved ? new Map() : reachable(state, bandId);
  const reach = [...paths.values()].map((path) => path[path.length - 1]);

  const defs = actionsFor(band.type, band.maxLen);
  const targetsOf = defs.map((def) => actionTargets(state, bandId, def.id));
  /** @type {Map<string, Pos>} */
  const avoid = new Map();
  // The pop-up keeps clear of every tile an action would strike, the
  // whole of a sting's line included.
  defs.forEach((def, index) => {
    for (const target of targetsOf[index]) {
      for (const at of strikeArea(state, bandId, def.id, target)) avoid.set(key(at), at);
    }
  });

  // No pop-up only when there is nothing to choose: one action, and
  // no tile where a tap could mean either "move here" or "act here".
  const direct = defs.length === 1 && !targetsOf[0].some((target) => paths.has(key(target)));
  /** @type {string|null} */
  let actionId = null;
  if (direct) {
    actionId = defs[0].id;
  } else {
    const index = defs.findIndex((def) => def.id === chosen);
    if (index >= 0 && targetsOf[index].length > 0) actionId = defs[index].id;
  }

  const options = defs.map((def, index) => ({
    id: def.id,
    label: def.label,
    enabled: targetsOf[index].length > 0,
    chosen: !direct && def.id === actionId,
  }));

  return {
    bandId,
    mode: direct ? 'direct' : 'menu',
    popup: !direct && options.some((option) => option.enabled),
    options,
    actionId,
    moves: direct || actionId === null ? paths : new Map(),
    targets: actionId === null ? [] : previewTargets(state, bandId, actionId),
    avoid: [...avoid.values()],
    reach,
    friends: state.bands
      .filter((other) => other.side === 'us' && other.id !== bandId)
      .flatMap((other) => other.cells.map((cell) => /** @type {Pos} */ ([cell[0], cell[1]]))),
  };
}

/**
 * The target whose strike covers this tile: the one aimed at it, else
 * the one whose line runs over it.
 * @param {TargetPreview[]} targets
 * @param {Pos} pos
 * @returns {TargetPreview|undefined}
 */
export function targetAt(targets, pos) {
  return targets.find((target) => eq(target.at, pos))
    ?? targets.find((target) => target.strikes.some((strike) => eq(strike.at, pos)));
}

/**
 * What a tap on a tile does for the selected band: the action on a
 * target, the move to a move tile, the action along a line that runs over
 * the tile (the bees' sting), or nothing (null).
 *
 * A line reaches three tiles out, so it often lies over one of the
 * player's own bands. A tap on that band, beyond the aimed tile, is not a
 * sting: it is nothing here, so the tap picks the band, as a tap on
 * another band always has. Only the aimed tile stings a friend.
 * @param {SelectionView} view
 * @param {Pos} pos
 * @returns {Move|null}
 */
export function tapAction(view, pos) {
  if (view.actionId !== null && view.targets.some((target) => eq(target.at, pos))) {
    return { kind: 'act', band: view.bandId, action: view.actionId, target: [pos[0], pos[1]] };
  }
  const path = view.moves.get(key(pos));
  if (path !== undefined) return { kind: 'move', band: view.bandId, path };
  if (view.friends.some((cell) => eq(cell, pos))) return null;
  const along = view.actionId !== null ? targetAt(view.targets, pos) : undefined;
  if (view.actionId !== null && along !== undefined) {
    return { kind: 'act', band: view.bandId, action: view.actionId, target: [along.at[0], along.at[1]] };
  }
  return null;
}

/**
 * The line shown while a band is selected: who it is and, when a tap
 * on a target would act, which action that is.
 * @param {BattleState} state
 * @param {SelectionView} view
 * @returns {string|null}
 */
export function selectionNote(state, view) {
  const band = bandById(state, view.bandId);
  if (band === undefined) return null;
  const who = `${tierFor(band.type, band.maxLen).name} ${band.cells.length}/${band.maxLen}`;
  const option = view.options.find((o) => o.id === view.actionId);
  if (option === undefined || view.targets.length === 0) return who;
  const hint = `${option.label}: tap a target`;
  return view.mode === 'direct' ? `${who}. ${hint}` : hint;
}

/**
 * How much of a one-tile square the rectangle covers (0 to 1).
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {Pos} tile
 * @returns {number}
 */
function coveredArea(x, y, w, h, tile) {
  const across = Math.min(x + w, tile[0] + 1) - Math.max(x, tile[0]);
  const down = Math.min(y + h, tile[1] + 1) - Math.max(y, tile[1]);
  if (across <= 1e-6 || down <= 1e-6) return 0;
  return across * down;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Where the action pop-up goes. Everything is in tile units, with the
 * board's top-left corner at 0,0; x and y are the pop-up's top-left.
 *
 * The pop-up must never sit over a tile a tap there would act on: a tap
 * on it would press a pop-up button instead, and with no Confirm that is
 * an accidental action. So a place fits only when it covers none of the
 * head, `avoid` (every target of every action the band has) and `moves`
 * (every tile the band could move to).
 *
 * It tries the four sides of the head and then the four corners, each
 * slid back onto the board; then, if none of those fits, any place on the
 * board within `near` tiles of the head (1.5 by default), nearest first.
 * Among the places that fit it takes the one covering the least of
 * `soft` (tiles it would rather leave clear, such as other bands); ties
 * go to the earlier one (above first, where a thumb does not hide it).
 * If none fits, `outside` is true: the caller shows the pop-up off the
 * board (in the side panel or the message box). x and y then say where
 * it would sit just outside the top or bottom edge nearer the band.
 *
 * `arrow` is how far along the pop-up's facing edge the head's centre
 * is, or null when the head is not alongside that edge.
 * @param {{cols: number, rows: number, head: Pos, avoid: Pos[], moves: Pos[], soft?: Pos[], w: number, h: number, gap?: number, near?: number}} input
 * @returns {PopupPlace}
 */
export function placePopup(input) {
  const { cols, rows, head, avoid, moves, w, h } = input;
  const soft = input.soft ?? [];
  const gap = input.gap !== undefined ? input.gap : 0.1;
  const near = input.near !== undefined ? input.near : 1.5;
  const [hx, hy] = head;
  const midX = hx + 0.5 - w / 2;
  const midY = hy + 0.5 - h / 2;
  const left = hx - gap - w;
  const right = hx + 1 + gap;
  const above = hy - gap - h;
  const below = hy + 1 + gap;
  const hard = [head, ...avoid, ...moves];

  /**
   * @param {'N'|'E'|'S'|'W'} side
   * @param {number} x
   * @param {number} y
   * @param {boolean} outside
   * @returns {PopupPlace}
   */
  const place = (side, x, y, outside) => {
    const upright = side === 'N' || side === 'S';
    const along = upright ? hx + 0.5 - x : hy + 0.5 - y;
    const edge = upright ? w : h;
    const margin = 0.3;
    return { x, y, side, outside, arrow: along >= margin && along <= edge - margin ? along : null };
  };

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number}  the soft tiles covered, or Infinity when it does not fit
   */
  const cost = (x, y) => {
    if (hard.some((tile) => coveredArea(x, y, w, h, tile) > 0)) return Infinity;
    let total = 0;
    for (const tile of soft) total += coveredArea(x, y, w, h, tile);
    return total;
  };

  /** @type {Array<{side: 'N'|'E'|'S'|'W', x: number, y: number}>} */
  const candidates = [
    { side: 'N', x: midX, y: above },
    { side: 'E', x: right, y: midY },
    { side: 'W', x: left, y: midY },
    { side: 'S', x: midX, y: below },
    { side: 'N', x: right, y: above },
    { side: 'N', x: left, y: above },
    { side: 'S', x: right, y: below },
    { side: 'S', x: left, y: below },
  ];

  if (w <= cols && h <= rows) {
    /** @type {PopupPlace|null} */
    let best = null;
    let bestCost = Infinity;
    for (const candidate of candidates) {
      const x = clamp(candidate.x, 0, cols - w);
      const y = clamp(candidate.y, 0, rows - h);
      const c = cost(x, y);
      if (c < bestCost - 1e-9) {
        best = place(candidate.side, x, y, false);
        bestCost = c;
      }
    }
    if (best !== null) return best;

    // Anywhere near the head, on a half-tile grid, nearest first.
    let bestDist = Infinity;
    const step = 0.5;
    for (let y = 0; y <= rows - h + 1e-9; y += step) {
      for (let x = 0; x <= cols - w + 1e-9; x += step) {
        const apartX = Math.max(0, x - (hx + 1), hx - (x + w));
        const apartY = Math.max(0, y - (hy + 1), hy - (y + h));
        if (Math.max(apartX, apartY) > near + 1e-9) continue;
        const c = cost(x, y);
        if (c === Infinity) continue;
        const dist = Math.hypot(x + w / 2 - (hx + 0.5), y + h / 2 - (hy + 0.5));
        if (c < bestCost - 1e-9 || (Math.abs(c - bestCost) <= 1e-9 && dist < bestDist - 1e-9)) {
          /** @type {'N'|'E'|'S'|'W'} */
          const side = y + h <= hy + 1e-9 ? 'N' : y >= hy + 1 - 1e-9 ? 'S' : x >= hx + 1 - 1e-9 ? 'E' : 'W';
          best = place(side, x, y, false);
          bestCost = c;
          bestDist = dist;
        }
      }
    }
    if (best !== null) return best;
  }

  const top = hy <= rows - 1 - hy;
  const x = w >= cols ? (cols - w) / 2 : clamp(midX, 0, cols - w);
  return place(top ? 'N' : 'S', x, top ? -gap - h : rows + gap, true);
}

/**
 * @param {BattleState} state
 * @returns {boolean}
 */
function hasDamagedDen(state) {
  return state.tiles.some((row) => row.some((tile) => tile.kind === 'habitatDamaged'));
}

/** How many past messages the side panel keeps in view. */
const LOG_LINES = 5;

/**
 * @param {unknown} e
 * @returns {string}
 */
function errText(e) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function html(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {string} label
 * @param {() => void} onClick
 * @param {string} [className]
 * @returns {HTMLButtonElement}
 */
function button(label, onClick, className = '') {
  const btn = html('button', className, label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

/** The board with nothing selected, as drawn under an animation. */
const PLAIN = Object.freeze({ selected: null, highlights: [], highlightKind: null, ghost: null });

/**
 * @returns {boolean}
 */
function prefersReducedMotion() {
  try {
    const match = globalThis.matchMedia;
    return typeof match === 'function' && match('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The words on the bot speed buttons. */
const SPEED_LABEL = /** @type {Record<BotSpeed, string>} */ ({ normal: 'Normal', fast: 'Fast', instant: 'Instant' });

/** How often the seed count moves on, in ms. */
const COUNT_TICK_MS = 40;

/**
 * Plays keyframes on an element of the HTML overlay, when the browser can.
 * Effects start hidden ('both'), so they wait for their moment.
 * @param {Element} node
 * @param {Keyframe[]} keyframes
 * @param {number} delay
 * @param {number} duration
 * @returns {void}
 */
function animateHtml(node, keyframes, delay, duration) {
  if (duration <= 0) return;
  const target = /** @type {{animate?: unknown}} */ (/** @type {unknown} */ (node));
  if (typeof target.animate !== 'function') return;
  node.animate(keyframes, { delay, duration, fill: 'both', easing: 'ease-out' });
}

/**
 * A small drawn icon (the settings gear, the turn's hourglass): an empty
 * span that css/game.css paints with an SVG mask in the text colour, so
 * the board stays the only <svg> on the battle screen.
 * @param {'gear'|'turn'} name
 * @returns {HTMLElement}
 */
function drawnIcon(name) {
  const span = html('span', `icon icon--${name}`);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

// --- the focus card (js/ui/battle-focus.js) ---

/** @typedef {import('./battle-focus.js').FocusInfo} FocusInfo */
/** @typedef {import('./battle-focus.js').Marks} Marks */

/**
 * The pictures of a band type for the focus card: the whole cut-out, for
 * the side panel, and its head in a round window, for the phone's strip
 * (css/game.css shows one of them). The band's stamp where there is no
 * image, or when the image fails to load.
 * @param {string} typeId
 * @returns {HTMLElement}
 */
function focusFigure(typeId) {
  const wrap = html('div', 'battle-focus__figure');
  wrap.setAttribute('aria-hidden', 'true');
  const spec = portraitSpec(typeId);
  const stamp = () => /** @type {HTMLElement} */ (/** @type {unknown} */ (
    portraitSvg(spec.kind === 'stamp' ? spec : portraitFor(typeId, undefined, []), 'battle-focus__stamp')));
  if (spec.kind !== 'image') {
    wrap.appendChild(stamp());
    return wrap;
  }
  const art = html('img', 'battle-focus__art');
  art.alt = '';
  art.decoding = 'async';
  art.src = spec.href;
  const head = html('span', 'battle-focus__head');
  const face = html('img', 'battle-focus__face');
  face.alt = '';
  face.decoding = 'async';
  const place = headCropStyle(headCrop(typeId));
  face.style.width = place.width;
  face.style.left = place.left;
  face.style.top = place.top;
  face.src = spec.href;
  head.appendChild(face);
  art.addEventListener('error', () => wrap.replaceChildren(stamp()));
  wrap.append(art, head);
  return wrap;
}

/**
 * A row of pips: a small-caps label, then dots, filled for what there is.
 * @param {string} label
 * @param {Marks} marks
 * @param {'pips'|'chain'} kind  pips stand apart; a chain's dots are linked
 * @returns {HTMLElement}
 */
function focusMarks(label, marks, kind) {
  const row = html('span', `battle-focus__mark battle-focus__mark--${kind}`);
  row.appendChild(html('span', 'battle-focus__mark-label', label));
  const dots = html('span', `battle-focus__dots battle-focus__dots--${kind}`);
  for (let i = 0; i < marks.filled + marks.hollow; i += 1) {
    dots.appendChild(html('span', `battle-focus__dot${i < marks.filled ? ' is-filled' : ''}`));
  }
  row.appendChild(dots);
  return row;
}

/**
 * The focus card: who is in focus and, for one of the player's bands,
 * its actions. A band's actions are buttons that do what the pop-up's do
 * (`onChoose`) while it is selected and has more than one to choose
 * from; otherwise a plain list. With nothing in focus, the quiet prompt.
 * @param {FocusInfo} info
 * @param {Map<string, HTMLElement>} figures  pictures kept between renders, by band type
 * @param {(actionId: string) => void} onChoose
 * @returns {HTMLElement[]}
 */
function focusCard(info, figures, onChoose) {
  if (info.kind === 'none') {
    if (info.text === '') return [];
    const prompt = html('p', 'battle-focus__prompt', info.text);
    prompt.appendChild(html('span', 'battle-log__keys', ' Press ? for the keys.'));
    return [prompt];
  }
  const card = html('div', `battle-focus__card battle-focus__card--${info.kind} ui-panel--wood`);
  card.dataset.unit = info.typeId;
  let figure = figures.get(info.typeId);
  if (figure === undefined) {
    figure = focusFigure(info.typeId);
    figures.set(info.typeId, figure);
  }
  card.appendChild(figure);

  const who = html('div', 'battle-focus__who');
  card.appendChild(who);
  const name = html('h2', 'battle-focus__name', info.name);
  name.appendChild(html('span', 'battle-focus__length', info.lengthText));
  who.appendChild(name);
  const marks = html('p', 'battle-focus__marks');
  const drawn = html('span', 'battle-focus__marks-drawn');
  drawn.setAttribute('aria-hidden', 'true');
  if (info.kind === 'band') drawn.appendChild(focusMarks('Speed', info.speed, 'pips'));
  drawn.appendChild(focusMarks('Length', info.length, 'chain'));
  marks.appendChild(drawn);
  const said = info.kind === 'band'
    ? `Speed ${info.speed.filled}, length ${info.lengthText}`
    : `Length ${info.lengthText}`;
  marks.appendChild(html('span', 'visually-hidden', said));
  who.appendChild(marks);

  if (info.kind === 'bot') {
    const plan = html('p', 'battle-focus__plan');
    plan.append(html('span', 'battle-focus__plan-label', 'Plan'), ' ', info.plan);
    card.appendChild(plan);
    return [card];
  }

  const status = html('p', 'battle-focus__status', info.statusText);
  status.dataset.status = info.status;
  card.appendChild(status);
  if (info.actions.length > 0) {
    const list = html('ul', 'battle-focus__actions');
    list.setAttribute('aria-label', `${info.name} actions`);
    for (const action of info.actions) {
      const item = html('li', 'battle-focus__action');
      item.dataset.action = action.id;
      if (info.choosable) {
        // The pop-up's button, in the panel: the chosen one in the main
        // button's green, the others plain wood.
        const look = action.active ? 'ui-btn--primary' : 'ui-btn--secondary';
        const btn = button(action.label, () => onChoose(action.id), `ui-btn ${look} ui-btn--small battle-focus__choose`);
        const picture = emblem(action.id);
        if (picture !== null) btn.appendChild(picture);
        btn.disabled = !action.enabled;
        btn.setAttribute('aria-pressed', action.active ? 'true' : 'false');
        if (action.key !== null) btn.appendChild(keyHint(action.key));
        item.appendChild(btn);
      } else {
        item.classList.add('is-plain');
        if (action.active) item.classList.add('is-active');
        const picture = emblem(action.id);
        if (picture !== null) item.appendChild(picture);
        item.append(action.label);
      }
      list.appendChild(item);
    }
    card.appendChild(list);
  }
  if (info.hint !== null) card.appendChild(html('p', 'battle-focus__hint', info.hint));
  return [card];
}

/**
 * The battle screen. One set of elements serves both layouts (see
 * css/game.css): on a phone the goal line is above the board and the
 * messages and the Undo / End turn bar are below it; on a wide screen
 * the board is on the left and the rest is a side panel on the right.
 *
 * Motion (look-and-motion spec): every move, action and bots' turn
 * animates on the drawing of the state before it, and the board swaps to
 * the new state when the sequence ends (Builder's call 3). A player
 * animation never locks input: a tap, Undo or End turn finishes it at
 * once and then does what it does. During the bots' turn input waits,
 * but a tap anywhere jumps to the end of that turn.
 *
 * Story (opening-act plan, Task 7): the screen hands each moment of
 * battleSceneMoments to `onMoment`, one at a time, awaiting each, with a
 * `resolve` that turns a line's pointer into a rectangle on the screen.
 * It asks once the board is first drawn, at the first selection of one of
 * our bands, and after a move's or a bots' turn's animation has finished;
 * never while the settings panel or the "Leave battle?" bar is open (the
 * moments wait for them to close). Until every scene is over the board
 * takes no input, and what would come next waits too: the "Your turn"
 * banner, or the victory or defeat.
 * @param {HTMLElement} root
 * `botSpeed` is the saved bot turn speed, and `sound` plays the effects
 * (it is silent unless the player turned it on). `soundOn` is the saved
 * sound setting; the settings control calls `onSettings` with both
 * settings whenever one changes, from inside the tap, so the caller can
 * save them and switch the sound on. `rewardOf` gives the seed reward of
 * a won battle, which counts up over the board.
 * @param {{level: Level, state: BattleState, onFinish: (final: BattleState) => void, onQuit: () => void, botSpeed?: BotSpeed, sound?: SoundLike|null, soundOn?: boolean, onSettings?: (settings: BattleSettings) => void, rewardOf?: (final: BattleState) => Reward|null, onMoment?: (moment: Moment, resolve: (p: Pointer) => Rect|null) => Promise<void>}} opts
 * @returns {void}
 */
export function mountBattle(root, opts) {
  const { level } = opts;
  let state = opts.state;
  /**
   * One entry per move or action this turn. Undo puts back the state
   * and what the player was looking at just before it.
   * @type {Array<{state: BattleState, logLength: number, selected: string|null, chosen: string|null}>}
   */
  const undoStack = [];
  /** Result sentences, oldest first. @type {string[]} */
  const log = [];
  /** @type {string|null} */
  let selected = null;
  /** The action picked in the pop-up. @type {string|null} */
  let chosen = null;
  /** @type {SelectionView|null} */
  let view = null;
  /** The player tapped the band again to get the pop-up out of the way. */
  let popupHidden = false;
  /** @type {HTMLElement|null} */
  let popup = null;
  /** The target under the mouse, on devices that hover. @type {TargetPreview|null} */
  let hover = null;
  /** @type {string|null} */
  let hoverKey = null;
  let busy = false;
  let finished = false;
  let endTurnArmed = false;
  let quitConfirm = false;
  /** A passing line: who is selected, what a bot plans, an error. @type {string|null} */
  let note = null;
  /** The animation on screen, if any, and what a tap does meanwhile. */
  const motion = createSequencer();
  /** The screen has been left: nothing more is drawn. */
  let gone = false;
  /** The tap that skipped the bots' turn must not also click a button. */
  let swallowClick = false;
  /** The saved settings, as the settings control last left them. */
  let botSpeed = opts.botSpeed ?? 'normal';
  let soundOn = opts.soundOn === true;
  let settingsOpen = false;
  /** Story moments are due or a scene is open: the board takes no input. */
  let talking = false;
  /** Moments waiting for the settings panel or the leave bar to close, and what comes after them. @type {{moments: Moment[], then: () => void}|null} */
  let heldStory = null;
  /** onMoment is being awaited. */
  let storyRunning = false;
  /** firstSelect has been asked for in this battle. */
  let selectAsked = false;
  /** After a victory, the board is drawn regrown. @type {BattleState|null} */
  let picture = null;
  let finaleShown = false;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let countTimer = null;
  /** Overlays over the board. @type {HTMLElement|null} */
  let settingsBox = null;
  /** The bar's buttons, for a line that points at one. @type {{undo: HTMLButtonElement|null, endTurn: HTMLButtonElement|null}} */
  const barButtons = { undo: null, endTurn: null };
  /** The turn banner on screen, if any, and the timer that takes it away. @type {HTMLElement|null} */
  let bannerBox = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let bannerTimer = null;
  /** The pop-up's size over the board, in px, once measured. @type {{w: number, h: number}|null} */
  let popupSize = null;
  /** The keyboard's tile cursor, or null while it is hidden. @type {Pos|null} */
  let cursor = null;
  /** The list of keys ("?"), when open. @type {HTMLElement|null} */
  let keysBox = null;
  /**
   * The band last tapped that could not be selected (a bot, or one of the
   * player's bands that has acted or is trapped), shown on the focus card
   * until the next tap. @type {string|null}
   */
  let peek = null;
  /** The note says what the focus card says (who is selected, a bot's plan). */
  let noteIsFocus = false;
  /** The focus card's pictures, by band type, kept between renders. @type {Map<string, HTMLElement>} */
  const figures = new Map();
  /** The focus card is on screen: always on a wide screen, in the strip on a tall phone. */
  let focusShown = false;
  /** The phone's strip is showing. */
  let stripOn = false;

  root.replaceChildren();

  const screen = html('div', 'battle');
  root.appendChild(screen);

  // The level's name, with the settings and Quit as small round buttons.
  const head = html('header', 'battle-head');
  screen.appendChild(head);
  head.appendChild(html('h1', 'battle-head__title', level.name));
  const tools = html('div', 'battle-head__tools');
  head.appendChild(tools);
  // The settings: bot speed and sound. A small control in the header,
  // whose panel opens over the top of the board.
  const gearBtn = button('', () => {
    if (talking && !settingsOpen) return;
    settingsOpen = !settingsOpen;
    renderSettings();
  }, 'ui-btn-round settings-btn');
  gearBtn.appendChild(drawnIcon('gear'));
  gearBtn.setAttribute('aria-label', 'Settings');
  gearBtn.setAttribute('aria-expanded', 'false');
  tools.appendChild(gearBtn);
  const quitBtn = button('Quit', () => {
    if (busy || talking || state.outcome !== null) return;
    endTurnArmed = false;
    quitConfirm = true;
    renderBar();
  }, 'ui-btn ui-btn--secondary ui-btn--small quit-btn');
  tools.appendChild(quitBtn);

  // The objective on its own card of cream paper, then the counts as
  // chips: dens standing, forest left, the turn. The goal line above the
  // board on a phone; the top of the side panel on a wide screen.
  const goal = html('div', 'battle-goal');
  screen.appendChild(goal);
  const goalCard = html('p', 'battle-goal__card ui-panel--parchment');
  goal.appendChild(goalCard);
  goalCard.appendChild(html('span', 'battle-goal__label', 'Goal'));
  goalCard.appendChild(html('span', 'battle-goal__text', goalText(level)));
  const chips = html('div', 'battle-goal__chips');
  goal.appendChild(chips);
  // The dens left: the den icon and "2/3", set in renderStatus. Its chip
  // is hidden on a level without dens.
  const habitatChip = html('span', 'battle-chip battle-chip--den');
  const habitatLabel = html('span', 'battle-goal__habitats');
  habitatLabel.dataset.slot = 'habitat-count';
  habitatChip.appendChild(habitatLabel);
  chips.appendChild(habitatChip);
  const forestChip = html('span', 'battle-chip battle-chip--forest');
  const forestLabel = html('span', 'forest-label');
  forestChip.appendChild(forestLabel);
  chips.appendChild(forestChip);
  const turnChip = html('span', 'battle-chip battle-chip--turn');
  turnChip.appendChild(drawnIcon('turn'));
  const turnLabel = html('span', 'turn-label');
  turnChip.appendChild(turnLabel);
  chips.appendChild(turnChip);

  // The board's grid cell. On a phone it takes the height the column
  // leaves, and the board is the largest square that fits in it (CSS
  // container units), so the whole screen fits without scrolling.
  const boardArea = html('div', 'board-area');
  screen.appendChild(boardArea);
  const wrap = html('div', 'board-wrap');
  boardArea.appendChild(wrap);
  const svg = /** @type {SVGSVGElement} */ (
    document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  );
  svg.setAttribute('viewBox', '0 0 320 320');
  wrap.appendChild(svg);
  // The keyboard's tile cursor, over the board (hidden until an arrow key).
  const cursorBox = html('div', 'board-cursor');
  cursorBox.setAttribute('aria-hidden', 'true');
  cursorBox.hidden = true;
  wrap.appendChild(cursorBox);

  // The band in focus (js/ui/battle-focus.js): the middle of the side
  // panel on a wide screen; on a tall phone a strip under the board, which
  // collapses into the message line on a shorter one (css/game.css).
  const focusBox = html('section', 'battle-focus');
  focusBox.setAttribute('aria-label', 'In focus');
  boardArea.appendChild(focusBox);

  // Messages: the latest results, then the passing note. A phone shows
  // them in a small box right under the board (so it sits in the board's
  // cell); a wide screen in the side panel, just above the buttons
  // (css/game.css).
  const logBox = html('div', 'battle-log');
  logBox.setAttribute('aria-live', 'polite');
  boardArea.appendChild(logBox);
  const logList = html('ol', 'battle-log__list');
  logBox.appendChild(logList);
  const noteLine = html('p', 'battle-log__note');
  logBox.appendChild(noteLine);
  // Before anything has happened: how to start, and where the keys are.
  const startLine = html('p', 'battle-log__start');
  startLine.append('Pick one of your bands to begin.', html('span', 'battle-log__keys', ' Press ? for the keys.'));
  logBox.appendChild(startLine);

  // Where the action pop-up goes when no place beside the band leaves
  // every tile it could tap clear: the side panel, or the message box on
  // a phone (css/game.css).
  const dock = html('div', 'battle-dock');
  boardArea.appendChild(dock);

  const bar = html('div', 'battle-bar');
  screen.appendChild(bar);

  // Keeps the pop-up beside its band when the board is resized, or
  // when the pop-up itself changes size (a late web font).
  /** @type {ResizeObserver|null} */
  let sizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    sizeObserver = new ResizeObserver(() => positionPopup());
    sizeObserver.observe(wrap);
  }

  // The phone's strip comes and goes with the room the board's cell has
  // (phoneStrip); the side panel's card is there whenever the screen is
  // wide. Either way the note stops repeating what the card says.
  const wideQuery = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(min-width: 720px)') : null;
  function fitFocus() {
    if (gone) return;
    const wide = wideQuery !== null && wideQuery.matches;
    const strip = phoneStrip({ wide, width: boardArea.clientWidth, height: boardArea.clientHeight });
    if (strip !== stripOn) {
      stripOn = strip;
      screen.classList.toggle('has-strip', strip);
      if (strip) {
        screen.style.setProperty('--strip-h', `${STRIP_H}px`);
        screen.style.setProperty('--log-h', `${STRIP_LOG_H}px`);
        screen.style.setProperty('--log-room', `${STRIP_ROOM}px`);
      } else {
        for (const name of ['--strip-h', '--log-h', '--log-room']) screen.style.removeProperty(name);
      }
    }
    const shown = wide || strip;
    if (shown !== focusShown) {
      focusShown = shown;
      renderLog();
    }
  }
  /** @type {ResizeObserver|null} */
  let areaObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    areaObserver = new ResizeObserver(() => fitFocus());
    areaObserver.observe(boardArea);
  }

  // The keys (see keyCommand and KEY_LIST).
  const doc = /** @type {Document|undefined} */ (globalThis.document);
  /** @param {KeyboardEvent} evt */
  const onKey = (evt) => {
    // While a scene is open its overlay owns the keys.
    if (gone || talking) return;
    const command = keyCommand(evt, {
      focus: focusKind(doc?.activeElement),
      phase: motion.kind() === 'bots' ? 'bots' : 'player',
      blocked: settingsOpen || quitConfirm,
      ended: state.outcome !== null,
    });
    if (command === null) return;
    evt.preventDefault();
    if (command === 'skip') motion.tap();
    else if (command === 'continue') {
      // A key first lets the end of the battle play out to its last
      // frame (the winning move, the victory or the defeat), as a tap on
      // the board does; the next press is Continue.
      if (motion.kind() !== null) motion.finish();
      else pressContinue();
    }
    else if (command === 'endTurn') endTurn();
    else if (command === 'undo') undo();
    else if (command === 'clear') onEscape();
    else if (command === 'next' || command === 'prev') tabTo(command === 'next' ? 1 : -1);
    else if (command === 'help') toggleKeys();
    else if (command === 'act') actAtCursor();
    else if (command === 'up' || command === 'down' || command === 'left' || command === 'right') moveCursor(command);
    else chooseByNumber(Number(command.slice('action'.length)));
  };
  // Taking the keys lets go of the deploy screen's.
  const stopKeys = takeKeys(onKey);

  function leave() {
    gone = true;
    heldStory = null;
    motion.finish();
    stopCount();
    dropBanner();
    sizeObserver?.disconnect();
    areaObserver?.disconnect();
    stopKeys();
  }

  // A tap anywhere during the bots' turn jumps to the end of that turn,
  // and does nothing else.
  screen.addEventListener('pointerdown', () => { swallowClick = false; }, true);
  screen.addEventListener('pointerup', (evt) => {
    if (motion.kind() !== 'bots') return;
    motion.tap();
    swallowClick = true;
    // A tap on a disabled button makes no click; do not eat a later one.
    setTimeout(() => { swallowClick = false; }, 500);
    evt.stopPropagation();
  }, true);
  screen.addEventListener('click', (evt) => {
    if (!swallowClick) return;
    swallowClick = false;
    evt.stopPropagation();
    evt.preventDefault();
  }, true);

  svg.addEventListener('pointerup', (evt) => {
    const pos = tileFromEvent(svg, evt);
    // A pointer is in use: the keyboard's cursor gets out of the way.
    hideCursor();
    if (pos !== null) handleTap(pos);
  });
  // Hover preview, for devices that have hover: a mouse over a target
  // shows the faded result and its description. Touch never gets here;
  // it reads the badges instead.
  svg.addEventListener('pointermove', (evt) => {
    if (evt.pointerType !== 'mouse') return;
    setHover(tileFromEvent(svg, evt));
  });
  svg.addEventListener('pointerleave', () => setHover(null));

  function disarmConfirmations() {
    endTurnArmed = false;
    quitConfirm = false;
  }

  /** Recompute what the selected band offers; drop a selection that is no longer usable. */
  function refreshView() {
    view = selected !== null ? selectionView(state, selected, chosen) : null;
    if (view === null) {
      selected = null;
      chosen = null;
    } else {
      chosen = view.mode === 'menu' ? view.actionId : null;
    }
    hover = null;
    hoverKey = null;
  }

  /**
   * @param {Pos|null} pos
   * @returns {void}
   */
  function setHover(pos) {
    if (!idle() || motion.kind() !== null) return;
    const k = pos !== null ? key(pos) : null;
    if (k === hoverKey) return;
    hoverKey = k;
    // A tile anywhere on a sting's line previews that sting, unless a
    // tap there would move the band instead.
    const found = pos !== null && view !== null && !view.moves.has(key(pos))
      ? targetAt(view.targets, pos)
      : undefined;
    const next = found !== undefined ? found : null;
    if (next === hover) return;
    hover = next;
    drawBoard();
    renderLog();
  }

  function renderStatus() {
    turnLabel.textContent = state.turnLimit === null
      ? `Turn ${state.turn}`
      : `Turn ${state.turn} of ${state.turnLimit}`;
    // The last turn of a turn-limited level: the count turns to the warning colour.
    turnLabel.classList.toggle('is-last', isLastTurn(state));
    setIconText(forestLabel, 'forest', `${countForest(state)}/${state.forestStart}`);
    forestLabel.setAttribute('aria-label', `Forest left: ${countForest(state)} of ${state.forestStart}`);
    const dens = habitatCount(state);
    if (dens === '') habitatLabel.replaceChildren();
    else setIconText(habitatLabel, 'den', dens);
    habitatChip.hidden = dens === '';
    const left = countHabitats(state);
    if (dens !== '') habitatLabel.setAttribute('aria-label', `Dens standing: ${left} of ${state.habitatStart}`);
    // A den lost or damaged: the count turns to the warning colour.
    const down = left < state.habitatStart || hasDamagedDen(state);
    habitatLabel.classList.toggle('is-down', down);
    habitatChip.classList.toggle('is-down', down);
    turnChip.classList.toggle('is-last', isLastTurn(state));
    quitBtn.disabled = busy || talking || state.outcome !== null;
  }

  function renderLog() {
    logList.replaceChildren(
      ...log.slice(-LOG_LINES).map((text) => html('li', 'battle-log__entry', text)),
    );
    noteLine.replaceChildren();
    // The card already says who is selected and what a bot plans.
    const own = focusShown && noteIsFocus ? null : note;
    const text = hover !== null && hover.text !== '' ? hover.text : own;
    if (text !== null && text !== '') noteLine.append(noteLine.childNodes.length > 0 ? ' ' : '', text);
    if (hover === null && view !== null) {
      // A key for the badges on the board, so a touch player can read them.
      for (const entry of badgeLegend(view.targets)) {
        const item = html('span', 'badge-key');
        item.append(badgeSvg(entry.icon), entry.text);
        noteLine.append(' ', item);
      }
    }
    logBox.classList.toggle('has-note', noteLine.childNodes.length > 0);
    // With the card on screen, its prompt says how to begin.
    startLine.hidden = focusShown || log.length > 0 || noteLine.childNodes.length > 0 || state.turn > 1;
  }

  /** The focus card, from what is selected or was last tapped. */
  function renderFocus() {
    const info = focusInfo(state, view, peek);
    focusBox.dataset.kind = info.kind;
    focusBox.replaceChildren(...focusCard(info, figures, (id) => chooseAction(id)));
    // Once the battle is over the card is put away: the ribbon on the
    // board says it, and on a phone the strip's room goes to the message
    // box's verdict, right under the board (css/game.css).
    focusBox.classList.toggle('is-over', state.outcome !== null);
  }

  function drawBoard() {
    // An animation is drawing the board; the swap at its end redraws it.
    if (motion.kind() !== null) return;
    if (state.outcome !== null || view === null) {
      renderBoard(svg, state.outcome !== null && picture !== null ? picture : state, PLAIN);
      return;
    }
    renderBoard(svg, state, {
      selected,
      highlights: [...view.moves.values()].map((path) => path[path.length - 1]),
      highlightKind: 'move',
      ghost: hover !== null ? hover.ghost : null,
      targets: view.targets.map((target) => ({ at: target.at, badges: target.badges, strikes: target.strikes })),
    });
  }

  /**
   * Put the pop-up beside the band, wherever placePopup says; or, when no
   * place on the board leaves every tile a tap could act on clear, in the
   * dock (the side panel, or the message box on a phone).
   */
  function positionPopup() {
    if (popup === null || view === null) return;
    const band = bandById(state, view.bandId);
    const tile = tileSizePx(svg);
    if (band === undefined || band.cells.length === 0 || tile <= 0) return;
    // Its size as it stands over the board, measured there once.
    if (popupSize === null && popup.parentElement === wrap && popup.offsetWidth > 0) {
      popupSize = { w: popup.offsetWidth, h: popup.offsetHeight };
    }
    if (popupSize === null) return;
    const spot = placePopup({
      cols: state.width,
      rows: state.height,
      head: band.cells[0],
      avoid: view.avoid,
      moves: view.reach,
      // Rather not over another band. Over its own body is fine: the
      // pop-up then sits right beside the head, its arrow on it.
      soft: state.bands.flatMap((b) => (b.id === band.id ? [] : b.cells)),
      w: popupSize.w / tile,
      h: popupSize.h / tile,
    });
    const docked = spot.outside;
    popup.classList.toggle('is-docked', docked);
    screen.classList.toggle('has-dock', docked);
    if (docked) {
      if (popup.parentElement !== dock) dock.appendChild(popup);
      popup.style.left = '';
      popup.style.top = '';
      popup.classList.remove('has-arrow');
      return;
    }
    if (popup.parentElement !== wrap) wrap.appendChild(popup);
    popup.style.left = `${Math.round(spot.x * tile)}px`;
    popup.style.top = `${Math.round(spot.y * tile)}px`;
    popup.dataset.side = spot.side;
    popup.classList.toggle('has-arrow', spot.arrow !== null);
    if (spot.arrow !== null) popup.style.setProperty('--arrow', `${Math.round(spot.arrow * tile)}px`);
  }

  function renderPopup() {
    if (popup !== null) {
      sizeObserver?.unobserve(popup);
      popup.remove();
    }
    popup = null;
    popupSize = null;
    screen.classList.remove('has-dock');
    if (view === null || !view.popup || popupHidden || !idle()) return;
    if (motion.kind() !== null) return;
    const band = bandById(state, view.bandId);
    if (band === undefined) return;
    const box = html('div', 'action-popup ui-panel--parchment');
    box.setAttribute('role', 'group');
    const name = tierFor(band.type, band.maxLen).name;
    box.setAttribute('aria-label', `${name} actions`);
    // Named only when docked off the board, away from the band.
    box.appendChild(html('span', 'action-popup__who', name));
    view.options.forEach((option, index) => {
      // The chosen action in the main button's green, the others plain;
      // each with its painted emblem before its name.
      const look = option.chosen ? 'ui-btn--primary' : 'ui-btn--secondary';
      const btn = button(option.label, () => chooseAction(option.id), `ui-btn ${look} ui-btn--small`);
      // (Drawn before the name: css/ui.css orders it first in the button.)
      const picture = emblem(option.id);
      if (picture !== null) btn.appendChild(picture);
      btn.disabled = !option.enabled;
      btn.setAttribute('aria-pressed', option.chosen ? 'true' : 'false');
      if (index < 9) btn.appendChild(keyHint(String(index + 1)));
      box.appendChild(btn);
    });
    box.appendChild(html('span', 'action-popup__arrow'));
    wrap.appendChild(box);
    popup = box;
    positionPopup();
    sizeObserver?.observe(box);
  }

  function renderBar() {
    bar.replaceChildren();
    barButtons.undo = null;
    barButtons.endTurn = null;
    const locked = !idle();

    if (state.outcome !== null) {
      const continueBtn = button('Continue', () => pressContinue(), 'end-btn is-ready ui-btn ui-btn--primary');
      continueBtn.appendChild(keyHint('Enter'));
      continueBtn.disabled = busy || talking || finished;
      bar.appendChild(continueBtn);
      return;
    }

    if (quitConfirm) {
      bar.appendChild(html('span', 'battle-bar__label', 'Leave battle?'));
      const leaveBtn = button('Leave', () => {
        if (busy || state.outcome !== null) return;
        leave();
        opts.onQuit();
      }, 'ui-btn ui-btn--secondary');
      // A scene waiting on this question must not stop the player leaving.
      leaveBtn.disabled = !inputAllowed(state, busy);
      bar.appendChild(leaveBtn);
      bar.appendChild(button('Stay', () => {
        quitConfirm = false;
        renderBar();
        releaseStory();
      }, 'ui-btn ui-btn--secondary'));
      return;
    }

    const undoBtn = button('Undo', () => undo(), 'undo-btn ui-btn ui-btn--secondary');
    undoBtn.appendChild(keyHint('Z'));
    undoBtn.disabled = locked || undoStack.length === 0;
    bar.appendChild(undoBtn);
    barButtons.undo = undoBtn;

    // The kit's green main button whenever one tap ends the turn (once
    // armed, the next tap does, and it asks in hazard yellow); plain wood
    // only while a tap would ask first.
    const endBtn = button(
      endTurnArmed ? 'End turn? Tap again' : 'End turn',
      () => endTurn(),
      endTurnArmed
        ? 'end-btn is-ready is-asking ui-btn ui-btn--primary'
        : endTurnReady(state) ? 'end-btn is-ready ui-btn ui-btn--primary' : 'end-btn ui-btn ui-btn--secondary',
    );
    endBtn.appendChild(keyHint('Enter'));
    // While a tap would ask, or is asking, a badge counts the bands that
    // have done nothing yet, in the board's ready-ring colours.
    const waiting = bandsWaiting(state);
    if (waiting > 0) {
      endBtn.dataset.waiting = String(waiting);
      endBtn.setAttribute('aria-label', `${endTurnArmed ? 'End turn? Tap again' : 'End turn'}: ${waiting} ${waiting === 1 ? 'band has' : 'bands have'} not moved yet`);
    }
    endBtn.disabled = locked;
    bar.appendChild(endBtn);
    barButtons.endTurn = endBtn;
  }

  /**
   * @param {Partial<BattleSettings>} patch
   * @returns {void}
   */
  function changeSettings(patch) {
    if (patch.botSpeed !== undefined) botSpeed = patch.botSpeed;
    if (patch.soundOn !== undefined) soundOn = patch.soundOn;
    opts.onSettings?.({ botSpeed, soundOn });
    renderSettings();
  }

  /** The settings panel: bot speed (normal / fast / instant) and sound. */
  function renderSettings() {
    settingsBox?.remove();
    settingsBox = null;
    gearBtn.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
    if (!settingsOpen) {
      releaseStory();
      return;
    }
    const box = html('div', 'battle-settings ui-panel--wood');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Settings');
    box.appendChild(html('p', 'battle-settings__label', 'Bot turn speed'));
    const speeds = html('div', 'battle-settings__row');
    for (const speed of BOT_SPEEDS) {
      const look = botSpeed === speed ? 'ui-btn--primary' : 'ui-btn--secondary';
      const btn = button(SPEED_LABEL[speed], () => changeSettings({ botSpeed: speed }), `ui-btn ${look} ui-btn--small`);
      btn.setAttribute('aria-pressed', botSpeed === speed ? 'true' : 'false');
      speeds.appendChild(btn);
    }
    box.appendChild(speeds);
    const row = html('div', 'battle-settings__row');
    const soundBtn = button(soundOn ? 'Sound: on' : 'Sound: off', () => changeSettings({ soundOn: !soundOn }), 'ui-btn ui-btn--secondary ui-btn--small');
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    row.appendChild(soundBtn);
    row.appendChild(button('Done', () => {
      settingsOpen = false;
      renderSettings();
    }, 'ui-btn ui-btn--secondary ui-btn--small'));
    box.appendChild(row);
    wrap.appendChild(box);
    settingsBox = box;
  }

  function dropBanner() {
    if (bannerTimer !== null) clearTimeout(bannerTimer);
    bannerTimer = null;
    bannerBox?.remove();
    bannerBox = null;
  }

  /**
   * The turn banner over the top of the board: "Turn 3 · Your turn". A
   * flash, or a plain line under reduced motion or at instant bot speed.
   * It never takes a tap (css/game.css), and a new one replaces the old.
   * On the kit's ribbon: green for our turn, rust for the bots'.
   * @param {string} text
   * @param {'flash'|'line'} style
   * @param {number} duration  how long a flash shows, in ms
   * @param {'us'|'bots'} side
   * @returns {void}
   */
  function showBanner(text, style, duration, side) {
    dropBanner();
    if (gone) return;
    const box = html('div', style === 'line' ? 'turn-banner turn-banner--line' : 'turn-banner');
    box.setAttribute('aria-hidden', 'true');
    box.appendChild(html('span', `turn-banner__text ui-ribbon ui-ribbon--${side === 'us' ? 'green' : 'rust'}`, text));
    wrap.appendChild(box);
    bannerBox = box;
    const shown = style === 'line' ? BANNER_LINE_MS : duration;
    if (style === 'flash') animateHtml(box, bannerFrames(), 0, shown);
    bannerTimer = setTimeout(() => {
      bannerTimer = null;
      if (bannerBox === box) dropBanner();
    }, shown);
  }

  /** "Turn N · Your turn", unless the battle is over. */
  function playerBanner() {
    if (state.outcome !== null) return;
    const style = bannerStyle({ speed: botSpeed, reducedMotion: prefersReducedMotion() });
    showBanner(bannerText(state.turn, 'us'), style, BANNER_MS, 'us');
  }

  function stopCount() {
    if (countTimer !== null) clearTimeout(countTimer);
    countTimer = null;
  }

  /**
   * The end of the battle, once its last move has settled: the victory
   * (hops, regrowth, the seed count) or the defeat (dim, what was lost).
   * Either way the kit's ribbon unfurls across the board with the word on
   * it, green for a win and rust for a loss (js/ui/finale.js, ribbonFor);
   * under it hangs the seed count on a parchment tag, or the defeat's
   * words. Under reduced motion it is simply there.
   * @param {BattleState} before  the state before the move that ended it
   * @returns {void}
   */
  function startFinale(before) {
    if (finaleShown || gone || state.outcome === null) return;
    finaleShown = true;
    const reducedMotion = prefersReducedMotion();
    const won = state.outcome === 'won';
    const box = html('div', won ? 'board-finale board-finale--won' : 'board-finale board-finale--lost');
    wrap.appendChild(box);
    const banner = html('div', 'board-banner');
    const look = ribbonFor(state.outcome, { exclaim: true });
    const ribbon = html('div', `board-banner__ribbon ui-ribbon ui-ribbon--${look.tone}`);
    const word = html('span', 'board-banner__title', look.word);
    ribbon.appendChild(word);
    banner.appendChild(ribbon);
    /**
     * @param {{start: number, duration: number}} span
     * @returns {void}
     */
    const unfurl = (span) => {
      animateHtml(ribbon, unfurlFrames(), span.start, span.duration);
      animateHtml(word, wordFrames(), Math.round(span.start + span.duration * RIBBON_WORD_AT), Math.round(span.duration * 0.6));
    };

    if (won) {
      const final = state;
      const steps = victorySteps(final, { reducedMotion });
      const reward = opts.rewardOf !== undefined ? opts.rewardOf(final) : null;
      const total = reward !== null ? reward.total : 0;
      /** @type {HTMLElement|null} */
      const seeds = reward !== null ? html('p', 'board-banner__seeds ui-panel--parchment') : null;
      if (seeds !== null) setIconText(seeds, 'seed', '+0');
      if (seeds !== null) banner.appendChild(seeds);
      box.appendChild(banner);
      unfurl(steps.ribbon);
      if (seeds !== null) animateHtml(seeds, wordFrames(), steps.count.start, reducedMotion ? 0 : 260);
      /** @param {number} n */
      const setCount = (n) => {
        if (seeds !== null) setIconText(seeds, 'seed', `+${n}`);
      };
      if (steps.count.duration <= 0) {
        setCount(total);
      } else {
        let elapsed = 0;
        const tick = () => {
          elapsed += COUNT_TICK_MS;
          setCount(countUp(total, elapsed, steps.count.duration));
          countTimer = elapsed < steps.count.duration ? setTimeout(tick, COUNT_TICK_MS) : null;
        };
        countTimer = setTimeout(tick, steps.count.start);
      }
      const cue = soundForOutcome('won');
      const tracks = victoryMotion(steps, final, { reducedMotion });
      motion.run('player', (done) => playMotion(svg, wrap, tracks, {
        onEnd: done, sound: opts.sound ?? null, cues: cue !== null ? [{ at: 0, name: cue }] : [],
      }), () => {
        stopCount();
        setCount(total);
        if (gone) return;
        picture = regrown(final);
        drawBoard();
      });
      return;
    }

    const summary = defeatSummary(before, state);
    const steps = defeatSteps(summary, { reducedMotion });
    const dim = html('div', 'board-dim');
    box.appendChild(dim);
    animateHtml(dim, [{ opacity: 0 }, { opacity: 1 }], steps.dim.start, steps.dim.duration);
    for (const mark of steps.marks) {
      const ring = html('div', 'board-mark');
      ring.style.left = `${(mark.at[0] * 100) / state.width}%`;
      ring.style.top = `${(mark.at[1] * 100) / state.height}%`;
      ring.style.width = `${100 / state.width}%`;
      ring.style.height = `${100 / state.height}%`;
      box.appendChild(ring);
      animateHtml(ring, reducedMotion
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: 'scale(1.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      mark.start, reducedMotion ? 120 : 360);
    }
    const why = summary.text !== '' ? html('p', 'board-banner__text', summary.text) : null;
    if (why !== null) banner.appendChild(why);
    box.appendChild(banner);
    unfurl(steps.banner);
    if (why !== null) animateHtml(why, wordFrames(), steps.words.start, steps.banner.duration > 0 ? 320 : 0);
  }

  /** Continue, by tap or key: once, when the battle is over and nothing is still to be told. */
  function pressContinue() {
    if (finished || gone || state.outcome === null || busy || talking) return;
    finished = true;
    leave();
    opts.onFinish(state);
  }

  function render() {
    if (gone) return;
    renderStatus();
    drawBoard();
    renderFocus();
    renderLog();
    renderPopup();
    renderBar();
    drawCursor();
  }

  /** The board takes input: the battle is on, the bots are not moving, no scene is due. */
  function idle() {
    return inputAllowed(state, busy || talking);
  }

  /**
   * The rectangle on screen of a tile, from the board's size now.
   * @param {Pos} at
   * @returns {Rect|null}
   */
  function tileRect(at) {
    const box = svg.getBoundingClientRect();
    const tile = tileSizePx(svg);
    if (tile <= 0) return null;
    return { x: box.left + at[0] * tile, y: box.top + at[1] * tile, width: tile, height: tile };
  }

  /**
   * What a line of a scene at `moment` points at, as a rectangle on
   * screen: a tile; the den in the moment (or the first one a plan
   * strikes); the head of our band of that type; Undo or End turn.
   * @param {Moment} moment
   * @returns {(p: Pointer) => Rect|null}
   */
  function resolverFor(moment) {
    return (p) => {
      if (gone) return null;
      if (p.kind === 'tile') return tileRect(p.at);
      if (p.kind === 'den') {
        if (moment.at !== undefined) return tileRect(moment.at);
        const den = struckHabitats(state)[0];
        if (den === undefined) return null;
        const [x, y] = den.split(',').map(Number);
        return tileRect([x, y]);
      }
      if (p.kind === 'band') {
        const band = state.bands.find((b) => b.side === 'us' && b.type === p.type && b.cells.length > 0);
        return band !== undefined ? tileRect(band.cells[0]) : null;
      }
      const btn = p.id === 'undo' ? barButtons.undo : barButtons.endTurn;
      if (btn === null) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };
  }

  /**
   * Hands `moments` to onMoment one at a time, then runs `then`. Until
   * then the board takes no input. With nothing to hand over, `then` runs
   * at once. The moments wait while the settings panel or the leave bar
   * is open, so a scene never opens over either.
   * @param {Moment[]} moments
   * @param {() => void} then
   * @returns {void}
   */
  function tell(moments, then) {
    const onMoment = opts.onMoment;
    if (gone || onMoment === undefined || moments.length === 0) {
      then();
      return;
    }
    if (heldStory !== null) {
      // Input waits while moments are due, so this should not happen;
      // if it does, both are kept, in order.
      const earlier = heldStory;
      heldStory = { moments: [...earlier.moments, ...moments], then: () => { earlier.then(); then(); } };
    } else {
      heldStory = { moments, then };
    }
    if (!talking) {
      talking = true;
      hover = null;
      hoverKey = null;
      renderStatus();
      renderPopup();
      renderBar();
    }
    releaseStory();
  }

  /** Starts the moments held by tell, unless the settings or the leave bar are open. */
  function releaseStory() {
    const onMoment = opts.onMoment;
    const held = heldStory;
    if (held === null || onMoment === undefined || gone || storyRunning || settingsOpen || quitConfirm) return;
    heldStory = null;
    storyRunning = true;
    void (async () => {
      for (const moment of held.moments) {
        if (gone) return;
        try {
          await onMoment(moment, resolverFor(moment));
        } catch (err) {
          // A scene that fails must never stop the battle.
          console.error(err);
        }
      }
      storyRunning = false;
      talking = false;
      if (gone) return;
      // Anything told while these played goes next. (A cast: tsc keeps
      // the null set above, not seeing tell run in between.)
      const more = /** @type {{moments: Moment[], then: () => void}|null} */ (heldStory);
      heldStory = null;
      render();
      held.then();
      if (more !== null) tell(more.moments, more.then);
    })();
  }

  /** Show the selected band's line, unless there is something else to say. */
  function noteSelection() {
    note = view !== null ? selectionNote(state, view) : null;
    noteIsFocus = note !== null;
  }

  /**
   * A pop-up button: choose that action, or let go of it if it is
   * already chosen (back to the move tiles).
   * @param {string} actionId
   * @returns {void}
   */
  function chooseAction(actionId) {
    if (!idle() || selected === null) return;
    motion.finish();
    if (talking) return;
    disarmConfirmations();
    chosen = chosen === actionId ? null : actionId;
    refreshView();
    noteSelection();
    render();
  }

  /**
   * Do a move or an action at once. Undo is the safety net.
   * @param {Move} move
   * @returns {void}
   */
  function perform(move) {
    motion.finish();
    if (talking) return;
    /** @type {BattleState} */
    let next;
    try {
      next = applyMove(state, move);
    } catch (e) {
      note = errText(e);
      noteIsFocus = false;
      render();
      return;
    }
    const before = state;
    undoStack.push({ state, logLength: log.length, selected, chosen });
    state = next;
    const text = resultMessage(next);
    if (text !== '') log.push(text);
    // Acting ends the band's turn, so let go of it. After a move it
    // stays selected, ready to act, with the attack that can hit an enemy
    // from where it now stands already chosen: one tap attacks.
    if (move.kind === 'act') selected = null;
    chosen = move.kind === 'move' ? offeredAction(next, move.band) : null;
    popupHidden = false;
    peek = null;
    refreshView();
    if (text !== '') {
      note = null;
      noteIsFocus = false;
    } else noteSelection();
    // The words and the buttons are the new state's at once; the board
    // catches up when the animation ends (or at the next tap).
    renderStatus();
    renderFocus();
    renderLog();
    renderBar();
    play('player', before, next, () => {});
  }

  /**
   * Animates the events that took `before` to `after` on the drawing of
   * `before`, then swaps the board to the current state. `onSettle` runs
   * just before the swap, however the sequence ended.
   * @param {'player'|'bots'} turn
   * @param {BattleState} before
   * @param {BattleState} after
   * @param {() => void} onSettle
   * @returns {void}
   */
  function play(turn, before, after, onSettle) {
    const reducedMotion = prefersReducedMotion();
    const tileKind = tileKindOf(before);
    const timing = { turn, speed: botSpeed, reducedMotion, tileKind, banner: turn === 'bots' };
    const steps = animSteps(after.events, timing);
    const moved = motionTracks(steps, before, { reducedMotion });
    // The bots' turn opens with its banner, inside their time budget; a
    // turn with nothing else to show still gives the banner its moment.
    const span = bannerSpan(after.events, timing);
    const own = span !== null ? { ...moved, end: Math.max(moved.end, span.duration) } : moved;
    if (turn === 'bots') {
      const style = bannerStyle({ speed: botSpeed, reducedMotion });
      // The flash fades out while the first bot sets off.
      showBanner(bannerText(before.turn, 'bots'), style, span !== null ? span.duration * 2 : 0, 'bots');
    }
    // The stakes: a bot that became engaged flashes its plan line, and
    // "Last turn!" comes when the last turn starts.
    const stakes = stakeTracks(before, after, own.end, { reducedMotion });
    const tracks = {
      ...own,
      after: [...own.after, ...stakes.after],
      detached: [...own.detached, ...stakes.detached],
    };
    const cues = soundCues(after.events, steps, tileKind);
    // A walking band is drawn over the others, so bees that slip through
    // a band pass over it, not under it.
    const walkers = [...new Set(steps.flatMap((step) => (step.kind === 'glide' ? [step.band] : [])))];
    motion.run(turn, (done) => {
      if (tracks.end > 0) {
        renderBoard(svg, before, PLAIN);
        raiseBands(svg, walkers);
        renderPopup();
      }
      return playMotion(svg, wrap, tracks, { onEnd: done, sound: opts.sound ?? null, cues });
    }, () => {
      if (gone) return;
      onSettle();
      render();
      playAfter(svg, tracks.after);
      // The story's moments come once the board has settled; the "Your
      // turn" banner, or the end of the battle, once they are over.
      tell(battleSceneMoments(level.id, { kind: 'settled', before, after }), () => {
        if (after.outcome !== null) startFinale(before);
        else if (turn === 'bots') playerBanner();
      });
    });
  }

  function undo() {
    if (!idle()) return;
    // Undo never waits on an animation; but if finishing it asks for a
    // scene, that comes first and the Undo does nothing.
    motion.finish();
    if (talking) return;
    disarmConfirmations();
    const prev = undoStack.pop();
    if (prev === undefined) {
      renderBar();
      return;
    }
    state = prev.state;
    log.length = prev.logLength;
    selected = prev.selected;
    chosen = prev.chosen;
    popupHidden = false;
    peek = null;
    refreshView();
    noteSelection();
    render();
  }

  /** Escape: let go of the selected band and close its pop-up. */
  function clearSelection() {
    if (!idle()) return;
    motion.finish();
    if (talking) return;
    disarmConfirmations();
    selected = null;
    chosen = null;
    popupHidden = false;
    peek = null;
    refreshView();
    note = null;
    noteIsFocus = false;
    render();
  }

  function endTurn() {
    if (!idle()) return;
    motion.finish();
    if (talking) return;
    quitConfirm = false;
    if (!endTurnArmed && endTurnNeedsConfirm(state)) {
      endTurnArmed = true;
      renderBar();
      return;
    }
    endTurnArmed = false;
    /** @type {BattleState} */
    let next;
    try {
      next = applyMove(state, { kind: 'end' });
    } catch (e) {
      note = errText(e);
      noteIsFocus = false;
      render();
      return;
    }
    const before = state;
    busy = true;
    undoStack.length = 0;
    selected = null;
    chosen = null;
    popupHidden = false;
    peek = null;
    refreshView();
    state = next;
    const text = resultMessage(next);
    if (text !== '') log.push(text);
    note = null;
    noteIsFocus = false;
    // The card lets go at once; the bots' turn plays on the board.
    renderFocus();
    // The bots go one by one on the board; the turn count, the messages
    // and the buttons wait for the end of their turn.
    renderPopup();
    renderBar();
    play('bots', before, next, () => {
      busy = false;
    });
  }

  /**
   * @param {Pos} pos
   * @returns {void}
   */
  function handleTap(pos) {
    // During a player animation the tap finishes it, then counts; during
    // the bots' turn it only jumps to the end of that turn.
    if (!motion.tap()) return;
    if (!idle()) return;
    disarmConfirmations();

    if (view !== null) {
      const move = tapAction(view, pos);
      if (move !== null) {
        perform(move);
        return;
      }
      // Tapping the selected band again: let go of the chosen action,
      // or move the pop-up out of the way of the tiles under it (and
      // bring it back on the next tap).
      const band = occupantAt(state, pos);
      if (band !== undefined && band.id === view.bandId && view.mode === 'menu') {
        if (chosen !== null) chosen = null;
        else if (view.popup) popupHidden = !popupHidden;
        refreshView();
        noteSelection();
        render();
        return;
      }
    }

    // Empty ground or another band: close the pop-up, or switch. A band
    // that cannot be selected (a bot, a band that has acted or is
    // trapped) comes into focus on the card instead.
    const result = nextSelection(state, selected, pos);
    const tapped = result.info !== null ? occupantAt(state, pos) : undefined;
    choose(result.selected, result.info, tapped !== undefined ? tapped.id : null);
  }

  /**
   * Select a band (or nothing), as a tap on it does: a band that has
   * moved gets the attack it can make offered at once.
   * @param {string|null} id
   * @param {string|null} info  a line to show instead of the band's own
   * @param {string|null} [peekId]  the band that line is about, for the focus card
   * @returns {void}
   */
  function choose(id, info, peekId = null) {
    if (id !== selected) {
      chosen = id !== null ? offeredAction(state, id) : null;
      popupHidden = false;
    }
    selected = id;
    peek = info !== null ? peekId : null;
    refreshView();
    if (info !== null) {
      note = info;
      noteIsFocus = peek !== null;
    } else noteSelection();
    render();
    // The first selection of one of our bands, once per battle.
    const band = selected !== null ? bandById(state, selected) : undefined;
    const moments = battleSceneMoments(level.id, { kind: 'select', state, band, asked: selectAsked });
    if (moments.length > 0) selectAsked = true;
    tell(moments, () => {});
  }

  // --- the keyboard ---

  /** Escape: close the key list, the settings or the leave bar; else let go of the band. */
  function onEscape() {
    if (keysBox !== null) {
      toggleKeys();
      return;
    }
    if (settingsOpen) {
      settingsOpen = false;
      renderSettings();
      return;
    }
    if (quitConfirm) {
      // As "Stay" does.
      quitConfirm = false;
      renderBar();
      releaseStory();
      return;
    }
    clearSelection();
  }

  /**
   * Tab and Shift+Tab: the next or previous band with something left to do.
   * @param {1|-1} dir
   * @returns {void}
   */
  function tabTo(dir) {
    if (!idle()) return;
    motion.finish();
    if (talking) return;
    disarmConfirmations();
    const id = cycleBand(state, selected, dir);
    if (id === null) return;
    choose(id, null);
    if (cursor !== null) {
      cursor = cursorStart(state, selected);
      drawCursor();
    }
  }

  /**
   * 1 to 9: choose the selected band's nth action, as the pop-up lists them.
   * @param {number} n
   * @returns {void}
   */
  function chooseByNumber(n) {
    if (!idle() || view === null || view.mode !== 'menu') return;
    const option = view.options[n - 1];
    if (option === undefined || !option.enabled || option.chosen) return;
    chooseAction(option.id);
  }

  /**
   * The arrows and W A S D: show the cursor where it starts, then move it.
   * @param {'up'|'down'|'left'|'right'} way
   * @returns {void}
   */
  function moveCursor(way) {
    if (state.outcome !== null) return;
    cursor = cursor === null ? cursorStart(state, selected) : stepCursor(state, cursor, way);
    drawCursor();
    setHover(cursor);
  }

  /** Space: what a tap on the cursor's tile would do (shows the cursor first). */
  function actAtCursor() {
    if (cursor === null) {
      moveCursor('up');
      return;
    }
    handleTap(cursor);
    if (cursor !== null) setHover(cursor);
  }

  function hideCursor() {
    if (cursor === null) return;
    cursor = null;
    drawCursor();
  }

  /** The cursor over its tile, in percent of the board, so it follows a resize. */
  function drawCursor() {
    const show = cursor !== null && state.outcome === null && !gone;
    cursorBox.hidden = !show;
    if (!show || cursor === null) return;
    cursorBox.style.left = `${(cursor[0] * 100) / state.width}%`;
    cursorBox.style.top = `${(cursor[1] * 100) / state.height}%`;
    cursorBox.style.width = `${100 / state.width}%`;
    cursorBox.style.height = `${100 / state.height}%`;
  }

  /** "?": the list of keys, over the board. Any tap on it or Escape closes it. */
  function toggleKeys() {
    if (keysBox !== null) {
      keysBox.remove();
      keysBox = null;
      return;
    }
    const box = keyListBox(keyList(state, view), { onClose: () => toggleKeys() });
    wrap.appendChild(box);
    keysBox = box;
  }

  render();
  fitFocus();
  // The start's scenes play over the board as first drawn; the opening
  // banner and the last-turn warning come once they are over.
  tell(battleSceneMoments(level.id, { kind: 'start', state }), () => {
    playerBanner();
    // A battle that starts on its last turn says so at once.
    const opening = stakeTracks(null, state, 0, { reducedMotion: prefersReducedMotion() });
    if (opening.detached.length > 0) {
      playMotion(svg, wrap, { during: [], after: [], detached: opening.detached, end: 0 }, { onEnd: () => {} });
    }
  });
}
